// Gmail metadata sync (D-22, D-23): resumable full backfill, then history-based incremental. Bodies are never fetched or stored.
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { GMAIL_COMPOSE, GMAIL_READ, googleTokenSource } from "../calendar/google/client";
import { markCalendarError } from "../calendar/connections";
import { ProviderError } from "../calendar/errors";
import { db, type DB } from "../db/client";
import { connections, mailMessages, settings } from "../db/schema";
import { notifyLive } from "../events";
import { log } from "../log";
import { enqueue as realEnqueue, QUEUES, type Enqueue } from "../queue";
import { createGmail, gmailAllowed, type GmailMessage } from "./client";
import { headerOf, parseAddrList } from "./text";

export const MAIL_SYNC_KEY = "mail.sync";
const MAX_GETS_PER_RUN = 200;
const HEADERS = ["From", "To", "Cc", "Subject", "Date", "List-Unsubscribe"];
const DAY = 86_400_000;

export type MailSyncState = { historyId: string | null; full: "pending" | "done"; email: string | null; lastSyncAt: string | null; lastSyncError: string | null };
const EMPTY: MailSyncState = { historyId: null, full: "pending", email: null, lastSyncAt: null, lastSyncError: null };

export async function mailSyncState(h: DB = db()): Promise<MailSyncState> {
  const [r] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, MAIL_SYNC_KEY));
  return { ...EMPTY, ...((r?.v as Partial<MailSyncState> | undefined) ?? {}) };
}
async function save(h: DB, s: MailSyncState): Promise<void> {
  await h.insert(settings).values({ key: MAIL_SYNC_KEY, value: s }).onConflictDoUpdate({ target: settings.key, set: { value: s, updatedAt: new Date() } });
}

export type MailSyncResult = { skipped: "no_scope" } | { error: "scope" | "auth" | "rate_limit" | "other" } | { ok: true; added: number; changed: boolean };

type Opts = { handle?: DB; fetch?: typeof fetch; now?: () => Date; key?: Buffer; enqueue?: Enqueue };

export function createMailSync(opts: Opts = {}) {
  async function run(): Promise<MailSyncResult> {
    const h = opts.handle ?? db();
    const now = (opts.now ?? (() => new Date()))();
    let state = await mailSyncState(h).catch(() => EMPTY);
    const fail = async (error: string, kind: "scope" | "auth" | "rate_limit" | "other") => {
      state = { ...state, lastSyncAt: now.toISOString(), lastSyncError: error };
      await save(h, state).catch(() => undefined);
      return { error: kind } as const;
    };
    try {
      const [conn] = await h.select().from(connections).where(eq(connections.id, "google_calendar"));
      if (!conn || !gmailAllowed(conn.scopes, "read")) return { skipped: "no_scope" };
      const gmail = createGmail({ getToken: googleTokenSource(h, { fetch: opts.fetch, now: () => now, key: opts.key }), fetch: opts.fetch });

      let added = 0;
      let changed = false;

      async function store(m: GmailMessage): Promise<void> {
        const hs = m.payload?.headers ?? [];
        const from = parseAddrList(headerOf(hs, "From"))[0];
        const labels = m.labelIds ?? [];
        const row = {
          threadId: m.threadId,
          fromName: from?.name ?? "",
          fromAddress: from?.address ?? "",
          to: parseAddrList(headerOf(hs, "To")),
          cc: parseAddrList(headerOf(hs, "Cc")),
          subject: (headerOf(hs, "Subject") ?? "").slice(0, 500),
          receivedAt: new Date(Number(m.internalDate) || now.getTime()),
          labelIds: labels,
          snippet: m.snippet ?? "",
          bulk: !!headerOf(hs, "List-Unsubscribe") || labels.includes("CATEGORY_PROMOTIONS") || labels.includes("CATEGORY_SOCIAL"),
        };
        // Metadata columns only: triage and local state (flagged, archived, summary...) survive a re-sync (T-06-38).
        await h.insert(mailMessages).values({ gmailId: m.id, ...row }).onConflictDoUpdate({ target: mailMessages.gmailId, set: { ...row, updatedAt: now } });
      }
      /** Fetches metadata for ids not stored yet (max `budget`); a message deleted meanwhile is skipped. Returns how many were stored. */
      async function fetchNew(ids: string[], budget: number): Promise<{ stored: number; left: number }> {
        const have = new Set(ids.length ? (await h.select({ g: mailMessages.gmailId }).from(mailMessages).where(inArray(mailMessages.gmailId, ids))).map((r) => r.g) : []);
        const todo = ids.filter((i) => !have.has(i));
        let stored = 0;
        for (const id of todo.slice(0, budget)) {
          try {
            await store(await gmail.getMetadata(id, HEADERS));
            stored++;
          } catch (e) {
            if (!(e instanceof ProviderError && e.kind === "not_found")) throw e;
          }
        }
        return { stored, left: Math.max(0, todo.length - budget) };
      }

      async function full(): Promise<void> {
        if (!state.historyId) {
          // Saved before listing so mail arriving during the backfill is caught by the first incremental run.
          const p = await gmail.profile();
          state = { ...state, historyId: p.historyId, email: p.emailAddress };
          await save(h, state);
        }
        const l = await gmail.listMessages({ q: "newer_than:30d", labelIds: ["INBOX"], maxResults: 100, maxPages: 5 });
        const r = await fetchNew(l.ids.map((x) => x.id), MAX_GETS_PER_RUN);
        added += r.stored;
        changed ||= r.stored > 0;
        state = { ...state, full: r.left > 0 ? "pending" : "done" };
        await save(h, state);
      }

      async function incremental(): Promise<void> {
        const r = await gmail.history(state.historyId!);
        const addIds = [...new Set(r.history.flatMap((x) => (x.messagesAdded ?? []).map((a) => a.message.id)))];
        const f = await fetchNew(addIds, MAX_GETS_PER_RUN);
        added += f.stored;
        changed ||= f.stored > 0;
        for (const item of r.history) {
          for (const [list, add] of [[item.labelsAdded, true], [item.labelsRemoved, false]] as const) {
            for (const ev of list ?? []) {
              const [cur] = await h.select({ l: mailMessages.labelIds }).from(mailMessages).where(eq(mailMessages.gmailId, ev.message.id));
              if (!cur) continue;
              const ch = ev.labelIds ?? [];
              const next = add ? [...new Set([...cur.l, ...ch])] : cur.l.filter((x) => !ch.includes(x));
              await h.update(mailMessages).set({ labelIds: next, updatedAt: now }).where(eq(mailMessages.gmailId, ev.message.id));
              changed = true;
            }
          }
        }
        // Too many adds this run: keep the old historyId so the next run replays (upserts are idempotent).
        state = { ...state, historyId: f.left > 0 ? state.historyId : r.historyId };
        await save(h, state);
      }

      if (state.historyId && state.full === "done") {
        try {
          await incremental();
        } catch (e) {
          if (!(e instanceof ProviderError && e.kind === "not_found")) throw e;
          state = { ...state, historyId: null, full: "pending" };
          await full();
        }
      } else await full();

      const old = new Date(+now - 90 * DAY);
      await h.delete(mailMessages).where(and(lt(mailMessages.receivedAt, old), sql`not ('INBOX' = any(${mailMessages.labelIds}))`));

      state = { ...state, lastSyncAt: now.toISOString(), lastSyncError: null };
      await save(h, state);
      if (added > 0) await (opts.enqueue ?? realEnqueue)(QUEUES.mailTriage, {}, { singletonKey: "mail.triage" }).catch((err) => log.error({ err }, "mail triage enqueue failed"));
      if (changed) await notifyLive(h, "outreach", "mail");
      return { ok: true, added, changed };
    } catch (e) {
      if (e instanceof ProviderError) {
        if (e.kind === "scope") {
          const [conn] = await h.select({ s: connections.scopes }).from(connections).where(eq(connections.id, "google_calendar"));
          if (conn) await h.update(connections).set({ scopes: conn.s.filter((x) => x !== GMAIL_READ && x !== GMAIL_COMPOSE) }).where(eq(connections.id, "google_calendar"));
          return fail("Gmail access was removed. Reconnect Google.", "scope");
        }
        if (e.kind === "auth") {
          await markCalendarError(h, "google_calendar", "Access was rejected.").catch(() => undefined);
          return fail("Access was rejected. Reconnect Google.", "auth");
        }
        if (e.kind === "rate_limit") return fail("Gmail rate limit reached.", "rate_limit");
      }
      log.error({ err: e }, "mail sync failed");
      return fail("Mail sync failed. Retrying in 5 minutes.", "other");
    }
  }
  return { run };
}
