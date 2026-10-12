// schema.org Event JSON-LD -> RawEvent (D-05). Null when the page has no usable Event.
import { z } from "zod";
import { isSafeUrl } from "@/lib/safe-url";
import type { RawEvent } from "@/lib/outreach-types";
import { capUtf8, htmlToText } from "../text";

const arr = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = z.union([z.string(), z.number()]).transform(String);
const named = z.union([z.string(), z.object({ name: str.nullish() }).passthrough()]);
const Place = z
  .object({
    name: str.nullish(),
    url: str.nullish(),
    address: z
      .union([z.string(), z.object({ streetAddress: str.nullish(), addressLocality: str.nullish(), addressRegion: str.nullish() }).passthrough()])
      .nullish(),
    geo: z.object({ latitude: z.coerce.number().nullish(), longitude: z.coerce.number().nullish() }).passthrough().nullish(),
  })
  .passthrough();
const Offer = z.object({ price: str.nullish(), lowPrice: str.nullish() }).passthrough();
const Ev = z
  .object({
    name: str,
    startDate: str,
    endDate: str.nullish(),
    url: str.nullish(),
    description: str.nullish(),
    eventAttendanceMode: str.nullish(),
    keywords: z.union([z.string(), z.array(z.string())]).nullish(),
    category: z.union([z.string(), z.array(z.string())]).nullish(),
    location: z.union([Place, z.array(Place)]).nullish(),
    organizer: z.union([named, z.array(named)]).nullish(),
    offers: z.union([Offer, z.array(Offer)]).nullish(),
  })
  .passthrough();

const cap = (s: string | null | undefined, n = 300) => (s?.trim() ? s.trim().slice(0, n) : null);
const flatten = (n: unknown): unknown[] =>
  Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === "object" ? [n, ...flatten((n as { "@graph"?: unknown })["@graph"])] : [];
const isEvent = (n: unknown) => arr((n as { "@type"?: string | string[] })["@type"]).some((t) => typeof t === "string" && /(^|\/)(\w*Event)$/.test(t));

function price(offers: z.infer<typeof Offer>[]): string | null {
  const nums = (k: "lowPrice" | "price") => offers.flatMap((o) => (o[k] != null && o[k] !== "" && Number.isFinite(Number(o[k])) ? [Number(o[k])] : []));
  const low = nums("lowPrice")[0];
  if (low !== undefined) return low === 0 ? "Free" : `From $${low}`;
  const p = nums("price")[0];
  return p === undefined ? null : p === 0 ? "Free" : `$${p}`;
}

export function extractEvent(html: string, pageUrl: string): RawEvent | null {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(re)) {
    let json: unknown;
    try {
      json = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    for (const node of flatten(json)) {
      if (!isEvent(node)) continue;
      const p = Ev.safeParse(node);
      if (!p.success) continue;
      const e = p.data;
      const startAt = new Date(e.startDate);
      const end = e.endDate ? new Date(e.endDate) : null;
      if (Number.isNaN(startAt.getTime())) continue;
      const places = arr(e.location);
      const place = places[0];
      const addr = place?.address;
      const addrText = typeof addr === "string" ? addr : [addr?.streetAddress, addr?.addressLocality, addr?.addressRegion].filter(Boolean).join(", ");
      const online = /Online/i.test(e.eventAttendanceMode ?? "") || places.some((x) => x["@type"] === "VirtualLocation");
      const org = arr(e.organizer)[0];
      const orgName = typeof org === "string" ? org : org?.name;
      const cats = [...arr(typeof e.keywords === "string" ? e.keywords.split(",") : e.keywords), ...arr(e.category)].map((s) => s.trim()).filter(Boolean);
      const lat = place?.geo?.latitude, lng = place?.geo?.longitude;
      return {
        remoteId: pageUrl,
        title: e.name.slice(0, 200),
        startAt,
        endAt: end && !Number.isNaN(end.getTime()) ? end : null,
        allDay: false,
        timeZone: null,
        location: online && !place?.name && !addrText ? null : cap([place?.name, addrText].filter(Boolean).join(", ")),
        lat: lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? lat : null,
        lng: lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? lng : null,
        online,
        organizer: cap(orgName),
        priceText: price(arr(e.offers)),
        url: isSafeUrl(e.url) ? e.url : pageUrl,
        description: capUtf8(htmlToText(e.description ?? ""), 4000).text.slice(0, 4000),
        categories: cats.slice(0, 10).map((c) => c.slice(0, 60)),
      };
    }
  }
  return null;
}
