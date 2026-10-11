// iCloud CalDAV adapter (ORG-01/02). tsdav is transport only; ICS content is edited through recurrence-edit (ical.js).
import ICAL from "ical.js";
import { createDAVClient } from "tsdav";
import { z } from "zod";
import { db, type DB } from "../../db/client";
import { log } from "../../log";
import { refreshCalendarList } from "../calendars";
import { readCalendarSecret, saveCalendarSecret } from "../connections";
import { ProviderError, type ProviderErrorKind } from "../errors";
import { icsSeries, loadZones } from "../expand";
import { icsApply, icsCreate } from "../recurrence-edit";
import type { CalendarProvider, CalendarRef, EventWrite, NormalizedEvent, RemoteCalendar, StoredEvent, SyncWindow, WriteResult, WriteScope } from "../types";

export const ICLOUD_SERVER = "https://caldav.icloud.com";
const MAX_BYTES = 256 * 1024;
const MAX_OBJECTS = 5000; // ponytail: 5000 objects per calendar per sync, page if a calendar outgrows it

export type DavCal = { url: string; name: string; components: string[]; ctag: string | null; readOnly: boolean };
export type DavObj = { url: string; etag: string | null; data: string };
/** The only tsdav surface the provider uses. Write ops resolve to the HTTP status; reads throw on failure. */
export interface DavClient {
  calendars(): Promise<DavCal[]>;
  objects(calUrl: string, w: SyncWindow): Promise<DavObj[]>;
  object(calUrl: string, url: string): Promise<DavObj | null>;
  create(calUrl: string, filename: string, ics: string): Promise<number>;
  update(o: DavObj): Promise<number>;
  remove(o: { url: string; etag: string | null }): Promise<number>;
}

const MSG: Record<string, string> = {
  auth: "Access was rejected.",
  unavailable: "iCloud didn't respond.",
  conflict: "This event changed in iCloud since you opened it.",
  not_found: "That event no longer exists in iCloud.",
  rate_limit: "iCloud is rate limiting requests.",
  client: "iCloud rejected the request.",
};

const fail = (kind: ProviderErrorKind, status: number) => new ProviderError("icloud", kind, status, MSG[kind] ?? MSG.client!);

// Only 401 pauses the connection; 403 is a forbidden resource (e.g. a shared read-only calendar), not bad credentials (CR-A03).
export function statusError(status: number): ProviderError {
  if (status === 401) return fail("auth", status);
  if (status === 403) return fail("client", status);
  if (status === 404) return fail("not_found", status);
  if (status === 412) return fail("conflict", 412);
  if (status === 429) return fail("rate_limit", 429);
  return fail(status >= 500 || status === 0 ? "unavailable" : "client", status);
}

/** Thrown transport errors: keep ours, otherwise classify without echoing provider text. */
export function transportError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const m = e instanceof Error ? e.message : "";
  if (/\b403\b|forbidden/i.test(m)) return fail("client", 403);
  return /\b401\b|unauthori|credential/i.test(m) ? fail("auth", 401) : fail("unavailable", 0);
}

export function assertIcloudUrl(u: string): URL {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw fail("client", 0);
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".icloud.com")) throw fail("client", 0);
  return url;
}

// tsdav's default calendar props plus DAV:current-user-privilege-set, so shared read-only calendars are detected.
const CAL_PROPS = {
  "c:calendar-description": {},
  "c:calendar-timezone": {},
  "d:displayname": {},
  "ca:calendar-color": {},
  "cs:getctag": {},
  "d:resourcetype": {},
  "c:supported-calendar-component-set": {},
  "d:sync-token": {},
  "d:current-user-privilege-set": {},
};

/** Read-only only when the server reported a privilege set without any write privilege; an unknown set stays writable. */
export function readOnlyFrom(projected: unknown): boolean {
  const priv = JSON.stringify((projected as { currentUserPrivilegeSet?: unknown } | undefined)?.currentUserPrivilegeSet ?? "");
  return /read/i.test(priv) && !/write|bind|"all"/i.test(priv);
}

export async function realDav(creds: { appleId: string; password: string }): Promise<DavClient> {
  let c: Awaited<ReturnType<typeof createDAVClient>>;
  try {
    c = await createDAVClient({
      serverUrl: ICLOUD_SERVER,
      credentials: { username: creds.appleId, password: creds.password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
  } catch (e) {
    throw transportError(e);
  }
  const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      throw transportError(e);
    }
  };
  const obj = (o: { url: string; etag?: string; data?: unknown }): DavObj => ({ url: o.url, etag: o.etag ?? null, data: typeof o.data === "string" ? o.data : "" });
  return {
    calendars: () =>
      wrap(async () =>
        (await c.fetchCalendars({ props: CAL_PROPS, projectedProps: { currentUserPrivilegeSet: true } })).map((x) => ({
          url: x.url,
          name: typeof x.displayName === "string" ? x.displayName : "Calendar",
          components: x.components ?? [],
          ctag: x.ctag ?? null,
          readOnly: readOnlyFrom(x.projectedProps),
        })),
      ),
    objects: (calUrl, w) =>
      wrap(async () =>
        (await c.fetchCalendarObjects({ calendar: { url: calUrl }, timeRange: { start: w.from.toISOString(), end: w.to.toISOString() } })).map(obj),
      ),
    object: (calUrl, url) => wrap(async () => (await c.fetchCalendarObjects({ calendar: { url: calUrl }, objectUrls: [url] })).map(obj)[0] ?? null),
    create: (calUrl, filename, ics) => wrap(async () => (await c.createCalendarObject({ calendar: { url: calUrl }, filename, iCalString: ics })).status),
    update: (o) => wrap(async () => (await c.updateCalendarObject({ calendarObject: { url: o.url, data: o.data, etag: o.etag ?? undefined } })).status),
    remove: (o) => wrap(async () => (await c.deleteCalendarObject({ calendarObject: { url: o.url, etag: o.etag ?? undefined } })).status),
  };
}

/** One VCALENDAR resource -> master-level NormalizedEvent. Throws on anything unparseable. */
export function normalizeIcs(ics: string, url: string, etag: string | null): NormalizedEvent {
  const root = new ICAL.Component(ICAL.parse(ics));
  const master = root.getAllSubcomponents("vevent").find((v) => !v.hasProperty("recurrence-id"));
  if (!master) throw new Error("no master");
  const uid = master.getFirstPropertyValue("uid") as string | null;
  if (!uid) throw new Error("no uid");
  const s = icsSeries(master, loadZones(root));
  const startAt = s.allDay ? null : s.conv(s.start);
  const startDate = s.allDay ? s.start.toString().slice(0, 10) : null;
  const endDate = startDate ? new Date(Date.parse(`${startDate}T00:00:00Z`) + s.durDays * 86400000).toISOString().slice(0, 10) : null;
  return {
    remoteId: uid, url, etag, title: s.title, description: s.description, location: s.location,
    startAt, endAt: startAt ? new Date(startAt.getTime() + s.durMs) : null,
    allDay: s.allDay, startDate, endDate, tz: s.tz,
    recurrence: s.rrule || s.lines.length ? [...(s.rrule ? [`RRULE:${s.rrule}`] : []), ...s.lines] : null,
    recurringRemoteId: null, originalStart: null, status: s.status, transparency: s.transparency, declined: false, raw: { ics },
  };
}

const icsOf = (ev: StoredEvent) => (ev.raw as { ics?: string } | null)?.ics ?? "";
const dir = (u: string) => (u.endsWith("/") ? u : `${u}/`);

export function createCaldavProvider({ dav }: { dav: DavClient }): CalendarProvider {
  const guard = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      throw transportError(e);
    }
  };
  const ok = (s: number) => {
    if (s < 200 || s >= 300) throw statusError(s);
  };
  const fetchOne = async (calUrl: string, url: string) => {
    const o = await guard(() => dav.object(calUrl, assertIcloudUrl(url).href));
    if (!o) throw fail("not_found", 404);
    return normalizeIcs(o.data, o.url, o.etag);
  };

  // If-None-Match create; a 412 on a deterministic uid means our earlier attempt landed, so adopt it.
  async function put(cal: CalendarRef, uid: string, ics: string): Promise<NormalizedEvent> {
    const calUrl = assertIcloudUrl(dir(cal.remoteId)).href;
    const filename = `${encodeURIComponent(uid)}.ics`;
    const status = await guard(() => dav.create(calUrl, filename, ics));
    if (status !== 412) ok(status);
    return fetchOne(calUrl, new URL(filename, calUrl).href);
  }

  async function write(cal: CalendarRef, ev: StoredEvent, kind: "update" | "delete", scope: WriteScope, instanceStart: string | null, input?: EventWrite): Promise<WriteResult> {
    const calUrl = assertIcloudUrl(dir(cal.remoteId)).href;
    if (!ev.url) throw fail("client", 0);
    const url = assertIcloudUrl(ev.url).href;
    // Deterministic per approval so a retried split adopts its continuation (put() treats 412 as "already there").
    const newUid = input?.marker ? `${input.marker}-f@lifeos` : `${crypto.randomUUID()}@lifeos`;
    let r: { updated: string | null; created: string | null };
    try {
      r = icsApply(icsOf(ev), { kind, scope, instanceStart, input, newUid });
    } catch {
      throw fail("client", 0);
    }
    const out: WriteResult = { upserts: [], deletes: [] };
    // Create the continuation before truncating the master: a failure in between leaves a duplicated tail, never a lost one (CR-A02).
    const made = r.created ? await put(cal, newUid, r.created) : null;
    if (made) out.upserts.push(made);
    try {
      if (r.updated === null) {
        const s = await guard(() => dav.remove({ url, etag: ev.etag }));
        if (s !== 404) ok(s);
        out.deletes.push(ev.remoteId);
      } else {
        ok(await guard(() => dav.update({ url, etag: ev.etag, data: r.updated! })));
        out.upserts.push(await fetchOne(calUrl, url));
      }
    } catch (e) {
      if (made?.url) await dav.remove({ url: made.url, etag: made.etag }).catch(() => undefined);
      throw e;
    }
    return out;
  }

  return {
    name: "icloud",
    async listCalendars(): Promise<RemoteCalendar[]> {
      const all = await guard(() => dav.calendars());
      return all
        .filter((c) => !c.components.length || c.components.includes("VEVENT")) // no component set reported = may hold events (WR-A03)
        .map((c) => ({ remoteId: assertIcloudUrl(c.url).href, name: c.name, access: c.readOnly ? ("reader" as const) : ("owner" as const), kind: "owned" as const }));
    },

    async sync(cal, window) {
      const calUrl = assertIcloudUrl(dir(cal.remoteId)).href;
      const current = (await guard(() => dav.calendars())).find((c) => dir(c.url) === calUrl);
      // The window slides daily, so an unchanged ctag only short-circuits within the same window day; syncCursor holds
      // the day of the last full fetch (CalDAV has no other use for it) (WR-A08).
      const day = window.from.toISOString().slice(0, 10);
      if (current?.ctag && current.ctag === cal.ctag && cal.syncCursor === day) return { upserts: [], deletes: [], cursor: cal.syncCursor, ctag: cal.ctag, reset: false };
      const all = await guard(() => dav.objects(calUrl, window));
      const truncated = all.length > MAX_OBJECTS;
      const upserts: NormalizedEvent[] = [];
      const keepUrls: string[] = []; // exist remotely but unreadable now: their stored rows must survive the reset (WR-A02)
      for (const o of all.slice(0, MAX_OBJECTS)) {
        try {
          assertIcloudUrl(o.url);
          if (o.data.length > MAX_BYTES) throw new Error("too large");
          upserts.push(normalizeIcs(o.data, o.url, o.etag));
        } catch {
          keepUrls.push(o.url);
        }
      }
      if (keepUrls.length || truncated) log.warn({ skipped: keepUrls.length, truncated }, "icloud resources skipped");
      // Truncated: no prune, and keep the old ctag so the next run fetches again instead of short-circuiting.
      if (truncated) return { upserts, deletes: [], cursor: cal.syncCursor, ctag: cal.ctag, reset: false };
      return { upserts, deletes: [], cursor: day, ctag: current?.ctag ?? null, reset: true, keepUrls };
    },

    async create(cal, input, opts) {
      const uid = opts?.remoteId ?? `${crypto.randomUUID()}@lifeos`;
      return { upserts: [await put(cal, uid, icsCreate(uid, input, input.marker))], deletes: [] };
    },

    update: (cal, ev, input, scope, instanceStart) => write(cal, ev, "update", scope, instanceStart, input),
    remove: (cal, ev, scope, instanceStart) => write(cal, ev, "delete", scope, instanceStart),
  };
}

// ---- connect ----
export type ConnectResult = { ok: true; calendars: number } | { ok: false; error: "empty" | "invalid" | "rejected" | "unreachable" };

export async function connectIcloud(
  h: DB,
  appleIdRaw: string,
  passwordRaw: string,
  opts: { davFactory?: typeof realDav; key?: Buffer } = {},
): Promise<ConnectResult> {
  const appleId = appleIdRaw.trim();
  const password = passwordRaw.trim();
  if (!password) return { ok: false, error: "empty" };
  if (password.length > 64 || !z.email().max(254).safeParse(appleId).success) return { ok: false, error: "invalid" };
  let remote: RemoteCalendar[];
  try {
    remote = await createCaldavProvider({ dav: await (opts.davFactory ?? realDav)({ appleId, password }) }).listCalendars();
  } catch (e) {
    return { ok: false, error: e instanceof ProviderError && e.kind === "auth" ? "rejected" : "unreachable" };
  }
  await saveCalendarSecret(h, "icloud_calendar", { appleId, password }, { account: appleId }, { key: opts.key });
  await refreshCalendarList(h, "icloud_calendar", remote, appleId);
  return { ok: true, calendars: remote.length };
}

export async function icloudProviderFor(h: DB = db(), opts: { davFactory?: typeof realDav; key?: Buffer } = {}): Promise<CalendarProvider | null> {
  const secret = await readCalendarSecret<{ appleId: string; password: string }>(h, "icloud_calendar", opts.key);
  return secret ? createCaldavProvider({ dav: await (opts.davFactory ?? realDav)(secret) }) : null;
}
