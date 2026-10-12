import fixture from "../fixtures/gmail/messages.json";
import { fakeGoogle } from "./fake-google";

export type FakePart = { mimeType?: string; headers?: { name: string; value: string }[]; body?: { data?: string; size?: number } };
export type FakeMsg = { id: string; threadId: string; labelIds: string[]; snippet: string; internalDate: string; historyId: string; payload: FakePart };
export type FakeHistory = { id: string; messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[]; labelsAdded?: unknown[]; labelsRemoved?: unknown[] };

export const FIXTURE = fixture as unknown as { profile: { emailAddress: string; historyId: string }; messages: Record<string, FakeMsg>; history: FakeHistory[] };
const BASE = "/gmail/v1/users/me";
const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const err = (status: number, reason: string) => reply({ error: { code: status, errors: [{ reason }] } }, status);
const hdr = (m: FakeMsg, n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;

/** In-memory mailbox behind the Gmail REST routes; flip the switches to simulate failures. */
export function fakeGmail(init: { messages?: FakeMsg[]; historyId?: string } = {}) {
  const s = {
    mailbox: new Map<string, FakeMsg>((init.messages ?? Object.values(FIXTURE.messages)).map((m) => [m.id, m])),
    historyId: init.historyId ?? FIXTURE.profile.historyId,
    history: [] as FakeHistory[],
    historyGone: false,
    forbid: false,
    unauthorized: false,
    rateLimit: false,
    newIdOnSend: false,
    drafts: new Map<string, { id: string; raw: string; threadId: string; messageId: string }>(),
    sent: [] as { id: string; raw: string; threadId: string }[],
  };
  let seq = 0;

  const handler = async (req: Request): Promise<Response> => {
    const u = new URL(req.url);
    const p = u.pathname.slice(BASE.length);
    if (s.unauthorized) return err(401, "authError");
    if (s.rateLimit) return err(429, "rateLimitExceeded");
    if (s.forbid) return err(403, "insufficientPermissions");
    const q = u.searchParams;

    if (req.method === "GET" && p === "/profile") return reply({ emailAddress: FIXTURE.profile.emailAddress, historyId: s.historyId });

    if (req.method === "GET" && p === "/messages") {
      const query = q.get("q") ?? "";
      const id = /rfc822msgid:(\S+)/.exec(query)?.[1];
      let list = [...s.mailbox.values()];
      if (id) list = list.filter((m) => m.labelIds.includes("SENT") && hdr(m, "Message-ID") === id);
      else {
        const labels = q.getAll("labelIds");
        list = list.filter((m) => labels.every((l) => m.labelIds.includes(l)));
      }
      list.sort((a, b) => +b.internalDate - +a.internalDate || a.id.localeCompare(b.id));
      const size = Number(q.get("maxResults") ?? 100);
      const from = Number(q.get("pageToken") ?? 0);
      const page = list.slice(from, from + size).map((m) => ({ id: m.id, threadId: m.threadId }));
      return reply({ ...(page.length ? { messages: page } : {}), ...(from + size < list.length ? { nextPageToken: String(from + size) } : {}) });
    }

    const one = /^\/messages\/([^/]+)$/.exec(p);
    if (req.method === "GET" && one) {
      const m = s.mailbox.get(decodeURIComponent(one[1]!));
      if (!m) return err(404, "notFound");
      if (q.get("format") === "full") return reply(m);
      const want = q.getAll("metadataHeaders").map((x) => x.toLowerCase());
      return reply({ ...m, payload: { mimeType: m.payload.mimeType, headers: (m.payload.headers ?? []).filter((h) => !want.length || want.includes(h.name.toLowerCase())) } });
    }

    if (req.method === "GET" && p === "/history") {
      if (s.historyGone) return err(404, "notFound");
      const start = Number(q.get("startHistoryId"));
      const history = s.history.filter((h) => Number(h.id) > start);
      return reply({ ...(history.length ? { history } : {}), historyId: s.historyId });
    }

    if (req.method === "POST" && p === "/drafts") {
      const b = (await req.json()) as { message: { raw: string; threadId: string } };
      const n = ++seq;
      const d = { id: `d${n}`, raw: b.message.raw, threadId: b.message.threadId, messageId: `dm${n}` };
      s.drafts.set(d.id, d);
      return reply({ id: d.id, message: { id: d.messageId, threadId: d.threadId } });
    }
    if (req.method === "POST" && p === "/drafts/send") {
      const { id } = (await req.json()) as { id: string };
      const d = s.drafts.get(id);
      if (!d) return err(404, "notFound");
      s.drafts.delete(id);
      const mid = s.newIdOnSend ? `s${++seq}` : d.messageId;
      const raw = Buffer.from(d.raw, "base64url").toString("utf8");
      const msgId = /^Message-ID:\s*(.+)$/im.exec(raw)?.[1]?.trim();
      s.mailbox.set(mid, { id: mid, threadId: d.threadId, labelIds: ["SENT"], snippet: "", internalDate: String(Date.now()), historyId: s.historyId, payload: { headers: msgId ? [{ name: "Message-ID", value: msgId }] : [] } });
      s.sent.push({ id: mid, raw, threadId: d.threadId });
      return reply({ id: mid, threadId: d.threadId });
    }
    const dr = /^\/drafts\/([^/]+)$/.exec(p);
    if (dr) {
      const d = s.drafts.get(decodeURIComponent(dr[1]!));
      if (!d) return err(404, "notFound");
      if (req.method === "DELETE") {
        s.drafts.delete(d.id);
        return new Response(null, { status: 204 });
      }
      if (req.method === "GET") return reply({ id: d.id, message: { id: d.messageId, threadId: d.threadId } });
    }
    return err(404, "notFound");
  };

  // fakeGoogle matches routes by exact key; a proxy that claims every key sends all Gmail requests to one handler.
  const fetch = fakeGoogle(new Proxy({}, { has: () => true, get: () => handler }));
  return Object.assign(fetch, { state: s, sent: s.sent, drafts: s.drafts });
}

/** Generates n INBOX messages with distinct ids and descending dates (for quota tests). */
export function manyMessages(n: number, base: Date): FakeMsg[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `bulk-${String(i).padStart(4, "0")}`,
    threadId: `bt-${i}`,
    labelIds: ["INBOX"],
    snippet: `snippet ${i}`,
    internalDate: String(base.getTime() - i * 60_000),
    historyId: "1000",
    payload: { mimeType: "text/plain", headers: [{ name: "From", value: `Sender ${i} <s${i}@example.org>` }, { name: "Subject", value: `Subject ${i}` }] },
  }));
}
