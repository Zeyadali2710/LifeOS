import { Client } from "pg";
import type { LiveKind } from "../lib/live-types";
import { db } from "./db/client";
import { env } from "./env";
import { CHANNEL, loadEventRow } from "./events";
import { log } from "./log";

export type HubEvent = { k: LiveKind; json: string };
export type Hub = { subscribe(fn: (e: HubEvent) => void): () => void; stop(): Promise<void> };

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;

// One dedicated LISTEN connection (never a Pool: LISTEN is per-session). Fans out to all subscribers.
export function createHub(url: string, load: (p: { k: string; id: string }) => Promise<unknown>): Hub {
  const subs = new Set<(e: HubEvent) => void>();
  let client: Client | null = null;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = MIN_BACKOFF;
  let stopped = false;

  const emit = (e: HubEvent) => {
    for (const fn of subs) {
      try {
        fn(e);
      } catch (err) {
        log.warn({ err }, "hub subscriber threw");
      }
    }
  };

  const drop = (c: Client) => {
    c.removeAllListeners();
    c.on("error", () => {}); // late errors on a dead client must not crash the process
    c.end().catch(() => {});
  };

  function lost(c: Client) {
    if (client !== c) return; // already handled
    client = null;
    clearInterval(keepalive);
    drop(c);
    if (stopped) return;
    log.warn({ inMs: backoff }, "hub connection lost, reconnecting");
    retry = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  }

  async function connect() {
    if (stopped) return;
    const c = new Client({ connectionString: url, keepAlive: true, application_name: "lifeos-hub" });
    client = c;
    c.on("error", () => lost(c));
    c.on("end", () => lost(c));
    c.on("notification", async (m) => {
      let p: { k?: unknown; id?: unknown };
      try {
        p = JSON.parse(m.payload ?? "");
      } catch {
        return;
      }
      if ((p.k !== "activity" && p.k !== "notification") || typeof p.id !== "string") return;
      const row = await load({ k: p.k, id: p.id }).catch(() => null);
      if (row) emit({ k: p.k, json: JSON.stringify(row) });
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${CHANNEL}`);
    } catch {
      lost(c);
      return;
    }
    if (stopped || client !== c) return;
    backoff = MIN_BACKOFF;
    keepalive = setInterval(() => c.query("select 1").catch(() => lost(c)), 30_000);
    emit({ k: "resync", json: "{}" });
  }

  void connect();

  return {
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    async stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(keepalive);
      const c = client;
      client = null;
      if (c) {
        c.removeAllListeners();
        c.on("error", () => {});
        await c.end().catch(() => {});
      }
      subs.clear();
    },
  };
}

declare global {
  var __lifeosHub: Hub | undefined;
}

// globalThis singleton: Next may bundle this module more than once (route handlers vs. instrumentation).
export function getHub(): Hub {
  return (globalThis.__lifeosHub ??= createHub(env().DATABASE_URL, (p) => loadEventRow(db(), p)));
}
