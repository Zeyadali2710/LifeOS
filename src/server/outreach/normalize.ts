// Pure outreach rules (D-11, D-12). No db/next imports.
const DAY = 86400000;

export function canonUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host}${p.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

export const canonTitle = (t: string): string =>
  t.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const minuteKey = (d: Date): string => new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString();

type Keyed = { url?: string | null; title: string; startAt: Date };

/** URL merge also needs the same start minute so weekly occurrences sharing a URL never collapse. */
export function sameEvent(a: Keyed, b: Keyed): boolean {
  if (minuteKey(a.startAt) !== minuteKey(b.startAt)) return false;
  const ua = canonUrl(a.url);
  if (ua && ua === canonUrl(b.url)) return true;
  const ta = canonTitle(a.title);
  return ta !== "" && ta === canonTitle(b.title);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const SYDNEY = { lat: -33.8688, lng: 151.2093 };
export const RADIUS_KM = 60;
// Adjustable lists. States are case-sensitive (so the words "act"/"sa" don't match), cities are not.
const ELSEWHERE_STATE = /\b(VIC|QLD|WA|SA|TAS|NT|ACT)\b/;
const ELSEWHERE_CITY = /\b(Melbourne|Brisbane|Perth|Adelaide|Hobart|Darwin|Canberra|Gold Coast)\b/i;
const HERE = /\b(Sydney|NSW)\b/i;

/** Drop only on positive evidence of elsewhere; Online and unknown locations are kept with a tag (A5). */
export function sydneyCheck(e: { lat?: number | null; lng?: number | null; location?: string | null; online?: boolean }): {
  keep: boolean;
  tag: "online" | "unknown" | null;
} {
  if (e.online) return { keep: true, tag: "online" };
  if (e.lat != null && e.lng != null) return { keep: haversineKm(SYDNEY, { lat: e.lat, lng: e.lng }) <= RADIUS_KM, tag: null };
  const loc = e.location?.trim();
  if (!loc) return { keep: true, tag: "unknown" };
  const away = ELSEWHERE_STATE.test(loc) || ELSEWHERE_CITY.test(loc);
  return { keep: !away || HERE.test(loc), tag: null };
}

export function inWindow(e: { startAt: Date; endAt: Date | null }, now: Date, days = 60): boolean {
  const s = e.startAt.getTime();
  const n = now.getTime();
  if (s > n + days * DAY) return false;
  return s >= n || (e.endAt?.getTime() ?? 0) > n;
}
