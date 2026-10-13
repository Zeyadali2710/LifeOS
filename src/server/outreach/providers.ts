// One seam for every event source (D-04, D-06..D-09). Real vs MOCK is decided by kind and key presence.
import { z } from "zod";
import { SOURCE_LABEL, type EventSourceKind, type RawEvent } from "@/lib/outreach-types";
import { decrypt } from "../crypto";
import type { DB } from "../db/client";
import type { eventSources } from "../db/schema";
import { safeGet, SafeGetError } from "../net/safe-get";
import { eventSourceKey } from "./connections";
import { FeedError, parseFeed } from "./ics";
import { mockEvents } from "./mock-events";

export interface EventSourceProvider {
  kind: EventSourceKind;
  label: string;
  isMock: boolean;
  capabilities: { discover: boolean };
  /** Set by a run when the source refused organizer listing (D-06). */
  discoverDenied?: boolean;
  list(now: Date): Promise<RawEvent[]>;
}

export class ProviderAuthError extends Error {
  constructor() {
    super("Access was rejected.");
  }
}
export class SourceError extends Error {}

export const DISCOVER_DENIED = "Eventbrite doesn't allow listing this organizer's events with a private token.";

const EVENTBRITE_HOST = "https://www.eventbriteapi.com/v3";
const LUMA_HOST = "https://public-api.luma.com";
// Luma list-events path + x-luma-api-key header cross-checked 2026-10-13 against third-party API docs (jentic, lava.so); official reference page not reachable.
const LUMA_LIST = "/v1/calendar/list-events";
const MAX = 500;

export function icsProvider(url: string, deps: { get?: typeof safeGet } = {}): EventSourceProvider {
  const get = deps.get ?? safeGet;
  return {
    kind: "ics",
    label: "iCal",
    isMock: false,
    capabilities: { discover: true },
    async list(now) {
      try {
        const r = await get(url, { maxBytes: 2_000_000, accept: "text/calendar" });
        return parseFeed(r.body, now);
      } catch (e) {
        if (e instanceof FeedError) throw new SourceError("Feed isn't valid iCal.");
        if (e instanceof SafeGetError) {
          throw new SourceError(
            e.code === "blocked" || e.code === "invalid" ? "That address isn't allowed." : e.code === "too_large" ? "Feed is larger than 2 MB." : "Couldn't reach the feed.",
          );
        }
        throw e;
      }
    },
  };
}

type F = typeof fetch;
async function getJson(f: F, url: string, headers: Record<string, string>, only401 = false): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await f(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new SourceError("Couldn't reach the service.");
  }
  if (res.status === 401 || (res.status === 403 && !only401)) throw new ProviderAuthError();
  const json = res.ok ? await res.json().catch(() => null) : null;
  return { status: res.status, json };
}

const EbEvent = z.object({
  id: z.string(),
  name: z.object({ text: z.string().nullish() }).nullish(),
  summary: z.string().nullish(),
  url: z.string().nullish(),
  start: z.object({ utc: z.string(), timezone: z.string().nullish() }),
  end: z.object({ utc: z.string() }).nullish(),
  is_free: z.boolean().nullish(),
  online_event: z.boolean().nullish(),
  venue: z
    .object({ name: z.string().nullish(), address: z.object({ localized_address_display: z.string().nullish(), latitude: z.string().nullish(), longitude: z.string().nullish() }).nullish() })
    .nullish(),
  organizer: z.object({ name: z.string().nullish() }).nullish(),
});
const EbList = z.object({ events: z.array(z.unknown()).default([]) });
const num = (s: string | null | undefined) => (s && Number.isFinite(+s) ? +s : null);

function ebRaw(e: z.infer<typeof EbEvent>): RawEvent {
  const a = e.venue?.address;
  return {
    remoteId: e.id,
    title: e.name?.text?.trim() || "Untitled event",
    startAt: new Date(e.start.utc),
    endAt: e.end ? new Date(e.end.utc) : null,
    allDay: false,
    timeZone: e.start.timezone ?? null,
    location: a?.localized_address_display ?? e.venue?.name ?? null,
    lat: num(a?.latitude),
    lng: num(a?.longitude),
    online: !!e.online_event,
    organizer: e.organizer?.name ?? null,
    priceText: e.is_free ? "Free" : null,
    url: e.url ?? null,
    description: e.summary ?? "",
    categories: [],
  };
}

function ebEvents(json: unknown): RawEvent[] {
  const list = EbList.safeParse(json ?? {});
  if (!list.success) return [];
  return list.data.events.flatMap((x) => {
    const p = EbEvent.safeParse(x);
    return p.success ? [ebRaw(p.data)] : [];
  });
}

export function eventbriteProvider(token: string, organizerIds: string[], deps: { fetch?: F } = {}): EventSourceProvider {
  const f = deps.fetch ?? fetch;
  const headers = { Authorization: `Bearer ${token}` };
  const p: EventSourceProvider = {
    kind: "eventbrite",
    label: "Eventbrite",
    isMock: false,
    capabilities: { discover: true },
    async list() {
      const out: RawEvent[] = [];
      const orgs = await getJson(f, `${EVENTBRITE_HOST}/users/me/organizations/`, headers);
      const own = z.object({ organizations: z.array(z.object({ id: z.string() })).default([]) }).safeParse(orgs.json ?? {});
      if (orgs.status !== 200 || !own.success) throw new SourceError("Couldn't reach Eventbrite.");
      for (const o of own.data.organizations) {
        const r = await getJson(f, `${EVENTBRITE_HOST}/organizations/${encodeURIComponent(o.id)}/events/?status=live&order_by=start_asc&expand=venue,organizer`, headers);
        if (r.status === 200) out.push(...ebEvents(r.json));
      }
      // [ASSUMED A1] organizer listing may be refused for private tokens; that is recorded, not an error.
      p.discoverDenied = false;
      for (const id of organizerIds) {
        const r = await getJson(f, `${EVENTBRITE_HOST}/organizers/${encodeURIComponent(id)}/events/?status=live&order_by=start_asc&expand=venue`, headers, true);
        if (r.status === 403 || r.status === 404) p.discoverDenied = true;
        else if (r.status === 200) out.push(...ebEvents(r.json));
      }
      return out.slice(0, MAX);
    },
  };
  return p;
}

const LumaList = z.object({
  entries: z
    .array(
      z.object({
        event: z.object({
          api_id: z.string(),
          name: z.string().nullish(),
          description: z.string().nullish(),
          start_at: z.string(),
          end_at: z.string().nullish(),
          timezone: z.string().nullish(),
          url: z.string().nullish(),
          geo_address_json: z.object({ full_address: z.string().nullish() }).nullish(),
          geo_latitude: z.string().nullish(),
          geo_longitude: z.string().nullish(),
        }),
      }),
    )
    .default([]),
});

export function lumaProvider(key: string, deps: { fetch?: F } = {}): EventSourceProvider {
  const f = deps.fetch ?? fetch;
  return {
    kind: "luma",
    label: "Luma",
    isMock: false,
    capabilities: { discover: false }, // own calendar only (D-07)
    async list() {
      const r = await getJson(f, `${LUMA_HOST}${LUMA_LIST}`, { "x-luma-api-key": key });
      const p = LumaList.safeParse(r.json ?? {});
      if (r.status !== 200 || !p.success) throw new SourceError("Couldn't reach Luma.");
      return p.data.entries.slice(0, MAX).map(({ event: e }) => ({
        remoteId: e.api_id,
        title: e.name?.trim() || "Untitled event",
        startAt: new Date(e.start_at),
        endAt: e.end_at ? new Date(e.end_at) : null,
        allDay: false,
        timeZone: e.timezone ?? null,
        location: e.geo_address_json?.full_address ?? null,
        lat: num(e.geo_latitude),
        lng: num(e.geo_longitude),
        online: false,
        organizer: null,
        priceText: null,
        url: e.url ?? null,
        description: e.description ?? "",
        categories: [],
      }));
    },
  };
}

export function mockProvider(kind: EventSourceKind): EventSourceProvider {
  return { kind, label: SOURCE_LABEL[kind], isMock: true, capabilities: { discover: false }, list: async (now) => mockEvents(kind, now) };
}

type Row = typeof eventSources.$inferSelect;
export async function providerForSource(h: DB, row: Row, deps: { get?: typeof safeGet; fetch?: F; key?: Buffer } = {}): Promise<EventSourceProvider> {
  const kind = row.kind as EventSourceKind;
  if (kind === "ics") {
    if (!row.urlCiphertext) throw new SourceError("Feed address is missing.");
    return icsProvider(decrypt(row.urlCiphertext, deps.key), { get: deps.get });
  }
  if (kind === "eventbrite" || kind === "luma") {
    const k = await eventSourceKey(h, kind, deps.key);
    if (k) return kind === "eventbrite" ? eventbriteProvider(k, row.config.organizerIds ?? [], deps) : lumaProvider(k, deps);
  }
  return mockProvider(kind);
}
