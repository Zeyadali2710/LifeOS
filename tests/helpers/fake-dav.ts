import type { DavCal, DavClient, DavObj } from "@/server/calendar/caldav/provider";

export const CAL = "https://p01-caldav.icloud.com/123/calendars/home/";

/** In-memory iCloud: etag counters, 412 on etag mismatch or create collision, call log. */
export function fakeDav(init: { calendars?: DavCal[]; objects?: Record<string, string>; failWith?: Error } = {}) {
  const calendars: DavCal[] = init.calendars ?? [{ url: CAL, name: "Home", components: ["VEVENT"], ctag: "c1", readOnly: false }];
  const store = new Map<string, { data: string; n: number }>();
  for (const [u, d] of Object.entries(init.objects ?? {})) store.set(u, { data: d, n: 1 });
  const calls: string[] = [];
  const view = (url: string): DavObj | null => {
    const o = store.get(url);
    return o ? { url, etag: `"${o.n}"`, data: o.data } : null;
  };
  const dav: DavClient = {
    async calendars() {
      calls.push("calendars");
      if (init.failWith) throw init.failWith;
      return calendars;
    },
    async objects() {
      calls.push("objects");
      return [...store.keys()].map((u) => view(u)!);
    },
    async object(_c, url) {
      calls.push("object");
      return view(url);
    },
    async create(c, filename, ics) {
      calls.push("create");
      const url = new URL(filename, c).href;
      if (store.has(url)) return 412;
      store.set(url, { data: ics, n: 1 });
      return 201;
    },
    async update(o) {
      calls.push("update");
      const cur = store.get(o.url);
      if (!cur) return 404;
      if (o.etag !== `"${cur.n}"`) return 412;
      store.set(o.url, { data: o.data, n: cur.n + 1 });
      return 204;
    },
    async remove(o) {
      calls.push("remove");
      const cur = store.get(o.url);
      if (!cur) return 404;
      if (o.etag !== `"${cur.n}"`) return 412;
      store.delete(o.url);
      return 204;
    },
  };
  return { dav, calls, store, calendars };
}
