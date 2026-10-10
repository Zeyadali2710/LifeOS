import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ProviderError } from "@/server/calendar/errors";
import { createCalendarSync } from "@/server/calendar/sync";
import { connections } from "@/server/db/schema";
import { fakeCalendarProvider } from "../helpers/fake-calendar";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");
const SECRET = "app-password-SEKRIT-9999";

type Emitted = { a: { type: string; title: string; tone?: string }; n?: { category: string; title: string; body?: string; actionUrl?: string } };
const ev: Emitted[] = [];
const emit = (async (a: Emitted["a"], n?: Emitted["n"]) => {
  ev.push({ a, n });
  return null;
}) as never;

const cal = [{ remoteId: "main", name: "Main", access: "owner" as const, kind: "primary" as const }];

describe("calendar sync auth failure", () => {
  it("pauses the failing connection, notifies once, leaves the other syncing", async () => {
    const h = t.handle();
    await h.insert(connections).values([
      { id: "google_calendar", ciphertext: "x", last4: "", login: "g@example.com" },
      { id: "icloud_calendar", ciphertext: "x", last4: "", login: "i@example.com" },
    ]);
    // The ProviderError message is fixed text; the secret only lives in the (never persisted) provider state.
    const google = fakeCalendarProvider("google", { calendars: cal, results: {}, syncError: new ProviderError("google", "auth", 401, "Access was rejected.") });
    const icloud = fakeCalendarProvider("icloud", { calendars: cal, results: { main: { upserts: [], deletes: [], cursor: "c1", reset: false } } });
    const s = createCalendarSync({ handle: h, providerFor: async (id) => (id === "google_calendar" ? google : icloud), emit, now: () => NOW });

    const r = await s.run();
    expect(r.google_calendar).toEqual({ error: "auth" });
    expect(r.icloud_calendar).toMatchObject({ ok: true });
    expect(icloud.calls.sync).toHaveLength(1);

    const rows = await h.select().from(connections);
    const g = rows.find((x) => x.id === "google_calendar")!;
    expect(g.status).toBe("error");
    expect(g.lastError).toBe("Access was rejected.");
    expect(ev).toHaveLength(1);
    expect(ev[0]!.n).toEqual({ category: "IMPORTANT", title: "Google Calendar needs attention", body: "Access was rejected. Syncing is paused.", actionUrl: "/settings?section=connections" });
    expect(ev[0]!.a.tone).toBe("red");

    // Second run: paused, nothing emitted, provider untouched.
    const calls = google.calls.list + google.calls.sync.length;
    const r2 = await s.run();
    expect(r2.google_calendar).toEqual({ skipped: "paused" });
    expect(ev).toHaveLength(1);
    expect(google.calls.list + google.calls.sync.length).toBe(calls);

    const dump = JSON.stringify([ev, rows.map((x) => [x.lastError, x.lastSyncError])]);
    expect(dump).not.toContain(SECRET);
  });

  it("iCloud auth failure from listCalendars uses the iCloud title", async () => {
    const h = t.handle();
    ev.length = 0;
    await h.delete(connections).where(eq(connections.id, "google_calendar"));
    await h.update(connections).set({ status: "connected" });
    const p = fakeCalendarProvider("icloud", { calendars: cal, results: {}, listError: new ProviderError("icloud", "auth", 401, "Access was rejected.") });
    const r = await createCalendarSync({ handle: h, providerFor: async () => p, emit, now: () => NOW }).run();
    expect(r.icloud_calendar).toEqual({ error: "auth" });
    expect(ev.filter((e) => e.n?.title === "iCloud Calendar needs attention")).toHaveLength(1);
  });
});
