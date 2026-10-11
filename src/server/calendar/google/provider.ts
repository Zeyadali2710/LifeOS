// Google Calendar adapter (ORG-01/02): list, incremental sync via syncToken, writes with sendUpdates=none + If-Match.
import { z } from "zod";
import { ProviderError } from "../errors";
import { expand, lineKeys } from "../expand";
import { carriedExdates, googleExdate, googlePlan, ruleFor } from "../recurrence-edit";
import type { CalendarProvider, CalendarRef, EventWrite, NormalizedEvent, RemoteCalendar, StoredEvent, SyncResult, SyncWindow, WriteResult, WriteScope } from "../types";
import type { createGoogle } from "./client";

const FALLBACK_TZ = "Australia/Sydney";
const Q = "?sendUpdates=none";

const when = z.object({ date: z.string().nullish(), dateTime: z.string().nullish(), timeZone: z.string().nullish() });
const eventSchema = z.object({
  id: z.string(),
  etag: z.string().nullish(),
  status: z.string().nullish(),
  htmlLink: z.string().nullish(),
  summary: z.string().nullish(),
  description: z.string().nullish(),
  location: z.string().nullish(),
  start: when.nullish(),
  end: when.nullish(),
  recurrence: z.array(z.string()).nullish(),
  recurringEventId: z.string().nullish(),
  originalStartTime: when.nullish(),
  transparency: z.string().nullish(),
  attendees: z.array(z.object({ self: z.boolean().nullish(), responseStatus: z.string().nullish() })).nullish(),
});
type GEvent = z.infer<typeof eventSchema>;

const calendarSchema = z.object({
  id: z.string(),
  summary: z.string().nullish(),
  summaryOverride: z.string().nullish(),
  accessRole: z.string().nullish(),
  primary: z.boolean().nullish(),
  deleted: z.boolean().nullish(),
});

export function normalizeGoogleEvent(e: GEvent, fallbackTz = FALLBACK_TZ): NormalizedEvent {
  const allDay = !!e.start?.date && !e.start.dateTime;
  const o = e.originalStartTime;
  return {
    remoteId: e.id,
    url: e.htmlLink ?? null,
    etag: e.etag ?? null,
    title: e.summary ?? "",
    description: e.description ?? null,
    location: e.location ?? null,
    startAt: !allDay && e.start?.dateTime ? new Date(e.start.dateTime) : null,
    endAt: !allDay && e.end?.dateTime ? new Date(e.end.dateTime) : null,
    allDay,
    startDate: allDay ? (e.start?.date ?? null) : null,
    endDate: allDay ? (e.end?.date ?? null) : null,
    tz: e.start?.timeZone ?? fallbackTz,
    recurrence: e.recurrence ?? null,
    recurringRemoteId: e.recurringEventId ?? null,
    originalStart: o ? (o.dateTime ? new Date(o.dateTime).toISOString() : (o.date ?? null)) : null,
    status: e.status ?? "confirmed",
    transparency: e.transparency ?? "opaque",
    declined: !!e.attendees?.some((a) => a.self && a.responseStatus === "declined"),
    raw: e,
  };
}

function remoteKind(c: z.infer<typeof calendarSchema>): RemoteCalendar["kind"] {
  if (c.primary) return "primary";
  if (c.id.includes("#holiday@")) return "holiday";
  if (c.id.includes("#contacts@") || c.id.includes("addressbook#contacts")) return "birthday";
  return c.accessRole === "owner" ? "owned" : "subscribed";
}

const access = (r: string | null | undefined): RemoteCalendar["access"] => (r === "owner" ? "owner" : r === "writer" ? "writer" : "reader");

const outside = (n: NormalizedEvent, w: SyncWindow) => {
  if (n.recurrence || n.recurringRemoteId) return false;
  if (n.allDay) return !!n.startDate && !!n.endDate && (n.endDate <= w.from.toISOString().slice(0, 10) || n.startDate > w.to.toISOString().slice(0, 10));
  return !!n.startAt && !!n.endAt && (n.endAt < w.from || n.startAt > w.to);
};

// patch: PATCH nulls the other field so switching all-day <-> timed does not leave the old one behind.
const timeBody = (iso: string, allDay: boolean, tz: string, patch: boolean) =>
  allDay ? { date: iso.slice(0, 10), ...(patch ? { dateTime: null } : {}) } : { dateTime: iso, timeZone: tz, ...(patch ? { date: null } : {}) };

function bodyFor(input: EventWrite, withRecurrence: boolean, patch = false) {
  const b: Record<string, unknown> = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: timeBody(input.start, input.allDay, input.timeZone, patch),
    end: timeBody(input.end, input.allDay, input.timeZone, patch),
    transparency: input.showAs === "free" ? "transparent" : "opaque",
  };
  if (input.marker) b.extendedProperties = { private: { lifeosApproval: input.marker } };
  if (withRecurrence && input.repeat !== "keep") {
    const rule = ruleFor(input.repeat, input.start, input.allDay, input.timeZone);
    b.recurrence = rule ? [`RRULE:${rule}`] : [];
  }
  return b;
}

// Occurrences before the edited one, so "this and following" on a COUNT series keeps the right remaining COUNT.
function before(ev: StoredEvent, recurring: boolean, scope: WriteScope, instanceStart: string | null): number | undefined {
  if (!recurring || scope !== "following" || !instanceStart) return undefined;
  const t0 = (ev.startAt ?? new Date(`${ev.startDate}T00:00:00Z`)).getTime() - 86_400_000;
  const at = ev.allDay ? Date.parse(`${instanceStart.slice(0, 10)}T00:00:00Z`) : Date.parse(instanceStart);
  const ms = (s: string) => (ev.allDay ? Date.parse(`${s.slice(0, 10)}T00:00:00Z`) : Date.parse(s));
  return expand([ev], new Date(t0), new Date(at + 86_400_000)).filter((i) => i.instanceStart !== null && ms(i.instanceStart) < at).length;
}

const cal = (id: string) => `/calendars/${encodeURIComponent(id)}/events`;

export function createGoogleProvider({ google }: { google: ReturnType<typeof createGoogle> }): CalendarProvider {
  const one = async (method: string, path: string, opts: { body?: unknown; ifMatch?: string | null } = {}) => {
    const r = await google.call(method, path, eventSchema, opts);
    return r ? normalizeGoogleEvent(r) : null;
  };

  async function fetchAll(ref: CalendarRef, window: SyncWindow, cursor: string | null) {
    const q = cursor
      ? `?singleEvents=false&showDeleted=true&maxResults=250&syncToken=${encodeURIComponent(cursor)}`
      : "?singleEvents=false&showDeleted=true&maxResults=250";
    const { items, nextSyncToken, truncated } = await google.paginate(`${cal(ref.remoteId)}${q}`, eventSchema);
    const upserts: NormalizedEvent[] = [];
    const deletes: string[] = [];
    for (const e of items) {
      if (e.status === "cancelled" && !e.recurringEventId) deletes.push(e.id);
      else {
        const n = normalizeGoogleEvent(e);
        // Moved out of the window: drop the local row too, or an incremental sync leaves it at its old time (WR-A01).
        if (outside(n, window)) deletes.push(e.id);
        else upserts.push(n);
      }
    }
    // Truncated: never prune on a partial set, and keep the old cursor so the missed changes are fetched again (WR-A02).
    if (truncated) return { upserts, deletes, cursor, reset: false } satisfies SyncResult;
    return { upserts, deletes, cursor: nextSyncToken, reset: !cursor } satisfies SyncResult;
  }

  return {
    name: "google",

    async listCalendars() {
      const { items, truncated } = await google.paginate("/users/me/calendarList?maxResults=250", calendarSchema);
      if (truncated) throw new ProviderError("google", "unavailable", 0, "Google didn't respond."); // a partial list would prune calendars
      return items.filter((c) => !c.deleted).map((c) => ({ remoteId: c.id, name: c.summaryOverride ?? c.summary ?? c.id, access: access(c.accessRole), kind: remoteKind(c) }));
    },

    async sync(ref, window) {
      try {
        return await fetchAll(ref, window, ref.syncCursor);
      } catch (e) {
        if (e instanceof ProviderError && e.kind === "gone" && ref.syncCursor) return fetchAll(ref, window, null); // D-03: expired syncToken -> full resync
        throw e;
      }
    },

    async create(ref, input, opts) {
      const body = { ...bodyFor(input, true), ...(opts?.remoteId ? { id: opts.remoteId } : {}) };
      try {
        const n = await one("POST", `${cal(ref.remoteId)}${Q}`, { body });
        return { upserts: n ? [n] : [], deletes: [] };
      } catch (e) {
        // Retry of an approved create: adopt the event the first attempt made (AGT-03).
        if (opts?.remoteId && e instanceof ProviderError && e.kind === "conflict") {
          const n = await one("GET", `${cal(ref.remoteId)}/${encodeURIComponent(opts.remoteId)}`);
          return { upserts: n ? [n] : [], deletes: [] };
        }
        throw e;
      }
    },

    async update(ref, ev, input, scope, instanceStart) {
      return run(ref, ev, "update", scope, instanceStart, input);
    },

    async remove(ref, ev, scope, instanceStart) {
      return run(ref, ev, "delete", scope, instanceStart);
    },
  };

  // Exclusions after the split: EXDATE lines plus cancelled instances (how Google stores single deletes), rebased (WR-A04).
  async function carry(ref: CalendarRef, ev: StoredEvent, instanceStart: string, input: EventWrite): Promise<string[]> {
    const tz = ev.tz ?? FALLBACK_TZ;
    const keys = (ev.recurrence ?? []).filter((l) => /^EXDATE[;:]/i.test(l)).flatMap((l) => lineKeys(l, tz, new Map()));
    const q = `?showDeleted=true&maxResults=250&timeMin=${encodeURIComponent(new Date(Date.parse(ev.allDay ? `${instanceStart.slice(0, 10)}T00:00:00Z` : instanceStart) - 86_400_000).toISOString())}`;
    // ponytail: first 4 pages (1000 instances) only; exclusions further out are not carried
    const { items } = await google.paginate(`${cal(ref.remoteId)}/${encodeURIComponent(ev.remoteId)}/instances${q}`, eventSchema, 4);
    for (const i of items) {
      const o = i.originalStartTime;
      if (i.status === "cancelled" && o) keys.push(o.date ?? String(Date.parse(o.dateTime ?? "")));
    }
    return [...new Set(carriedExdates(keys, instanceStart, input))].map((v) => googleExdate(v, input.allDay, input.timeZone));
  }

  async function run(ref: CalendarRef, ev: StoredEvent, kind: "update" | "delete", scope: WriteScope, instanceStart: string | null, input?: EventWrite): Promise<WriteResult> {
    const recurring = !!ev.recurrence?.length;
    const first = !!instanceStart && (ev.allDay ? instanceStart.slice(0, 10) === ev.startDate : !!ev.startAt && Date.parse(instanceStart) === ev.startAt.getTime());
    const ops = googlePlan({
      kind,
      scope: recurring ? scope : "all",
      calendarRemoteId: ref.remoteId,
      master: { remoteId: ev.remoteId, recurrence: ev.recurrence ?? [], allDay: ev.allDay, first, occurrencesBefore: before(ev, recurring, scope, instanceStart) },
      instanceStart: recurring ? instanceStart : null,
      // recurrence is only rewritten when the whole series is edited
      body: input ? bodyFor(input, scope === "all" || !recurring, true) : undefined,
      newId: input?.marker ? `lifeos${input.marker.replaceAll("-", "")}f` : undefined,
      carry: kind === "update" && recurring && scope === "following" && !first && instanceStart && input && input.allDay === ev.allDay ? await carry(ref, ev, instanceStart, input) : undefined,
    });
    const upserts: NormalizedEvent[] = [];
    const deletes: string[] = [];
    const own = `/${encodeURIComponent(ev.remoteId)}?`;
    let created: string | null = null; // "following" continuation, removed again if the truncation fails (CR-A02)
    try {
      for (const op of ops) created = (await exec(op)) ?? created;
    } catch (e) {
      if (created) await google.call("DELETE", `${cal(ref.remoteId)}/${encodeURIComponent(created)}${Q}`, z.unknown()).catch(() => undefined);
      throw e;
    }
    return { upserts, deletes };

    async function exec(op: (typeof ops)[number]): Promise<string | null> {
      // If-Match only where the op targets the stored event itself (not a virtual instance id or a create).
      const ifMatch = op.method !== "POST" && op.path.includes(own) ? ev.etag : null;
      if (op.method === "DELETE") {
        try {
          await google.call("DELETE", op.path, z.unknown(), { ifMatch });
        } catch (e) {
          if (!(e instanceof ProviderError && (e.kind === "not_found" || e.kind === "gone"))) throw e; // already gone = done
        }
        if (op.path.includes(own)) deletes.push(ev.remoteId);
        else if (instanceStart) {
          const date = instanceStart.slice(0, 10);
          upserts.push(
            normalizeGoogleEvent({
              id: decodeURIComponent(op.path.split("/").pop()!.split("?")[0]!),
              status: "cancelled",
              recurringEventId: ev.remoteId,
              originalStartTime: ev.allDay ? { date } : { dateTime: instanceStart },
            }),
          );
        }
        return null;
      }
      let n: NormalizedEvent | null;
      try {
        n = await one(op.method, op.path, { body: op.body, ifMatch });
      } catch (e) {
        // Retried approved split: the continuation from the first attempt exists, adopt it.
        const id = op.method === "POST" ? op.body?.id : undefined;
        if (!(typeof id === "string" && e instanceof ProviderError && e.kind === "conflict")) throw e;
        n = await one("GET", `${cal(ref.remoteId)}/${encodeURIComponent(id)}`);
        // A compensated (deleted) earlier attempt keeps its id; never truncate the master onto a cancelled continuation.
        if (n?.status === "cancelled") throw new ProviderError("google", "client", 409, "Google rejected the change.");
      }
      if (n) upserts.push(n);
      return op.method === "POST" ? (n?.remoteId ?? null) : null;
    }
  }
}
