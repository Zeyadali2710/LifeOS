# Phase 2: Shell - Research

**Researched:** 2026-10-08
**Domain:** Next.js 16.4 App Router shell, SSE over Postgres LISTEN/NOTIFY, notifications, self-hosted icon font
**Confidence:** HIGH (Next/pg/font/Open-Meteo verified against installed code and live calls); MEDIUM (Windows shortcut conflicts, multi-tab behaviour)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01 `design/` is the visual source of truth; content in it is placeholder, never ship placeholder names/numbers.
- D-02 Replace Phase 1 placeholder tokens in `src/app/globals.css` with the design's tokens 1:1.
- D-03 Dark only. Remove light theme / `prefers-color-scheme: light` block.
- D-04 Self-host everything; no Google Fonts at runtime. Geist + Geist Mono via `next/font` (already used); Material Symbols Outlined self-hosted (subset/variable woff2).
- D-05 Full UI shell for command bar, AI panel (empty state, chips, composer), palette "Ask LifeOS" row. Submit shows design's InlineError (orchestrator not connected). No mock flows/traces.
- D-06 Palette = Commands + Jump-to pages only. No empty scope tabs. Keep keyboard model (Tab reserved).
- D-07 Keep design's full Home layout; sections without data render EmptyState.
- D-08 Status tiles real values only: Agents 0 running, Approvals 0 waiting, System health from Phase 1.
- D-09 Open-Meteo Sydney weather, cached server-side ~30 min, fail silently to date-only. `WEDNESDAY, OCTOBER 7 · SYDNEY · 17°C CLEAR`. Australia/Sydney.
- D-10 Live activity (SSE over Postgres LISTEN/NOTIFY per ADR-005) fed by auth events (sign-in, sign-out, failed sign-in) and system events (worker started, health changes, migrations applied, deploy/version change). Notification read/snooze/dismiss are NOT activity events.
- D-11 ActivityItem + enter animation, `role=log aria-live=polite`, reduced motion honoured.
- D-12 Notifications = drawer only (right desktop, full sheet mobile). No /notifications page.
- D-13 Time grouping NOW/TODAY/EARLIER; DB category drives icon/tone/label; URGENT+IMPORTANT bold rows; compact category filter row.
- D-14 Snooze menu: 1 hour / Tonight / Tomorrow 9am in Australia/Sydney; snoozed items reappear when `snoozedUntil` passes; read/unread toggle, dismiss, mark all read, per-row actionUrl action.
- D-15 Real sources only: failed sign-in -> URGENT; worker down/health degraded -> IMPORTANT; deploy/version change -> FYI. No seed/mock notifications.
- D-16 Unread badges on bell and sidebar; new notifications arrive live over the same SSE channel.

### Claude's Discretion
Sidebar compact-state persistence (cookie vs localStorage), mobile "More" sheet contents, Windows shortcuts (Alt+1-9, Ctrl), SSE reconnection/backoff, component file structure, how domain pages render as placeholders.

### Deferred Ideas (OUT OF SCOPE)
Light theme; palette search scopes; mock AI flows; full /notifications history page.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHL-01 | Desktop rail + mobile bottom bar across all domain pages | `(os)/layout.tsx` AppShell, `cookies()` for compact state, `template.tsx`/`loading.tsx`/`error.tsx` conventions (Next 16.4 verified), 10 placeholder routes |
| SHL-02 | Command palette (Ctrl/Cmd-K) navigation + AI prompts | Keyboard section (Windows conflicts), client-only state in ShellProvider |
| SHL-03 | Home: date/time, greeting, priorities, today, activity, approvals, system status, honest empty states | Open-Meteo fetch + Sydney tz helpers, `checkHealth()`, pure `lead()` function |
| SHL-04 | Activity stream updates live (SSE) | Hub (single LISTEN client) + `/api/events` route + reconnect/resync pattern |
| SHL-05 | Notifications: 6 categories; read, snooze, dismiss | Server actions + snapshot GET route, snooze time helper, emit helper, throttle |
</phase_requirements>

## Summary

No new dependencies are needed. Everything is Next 16.4.0 + `pg` 8.23.1 (already installed) + one committed woff2 file. The three non-obvious pieces are: (1) a **single shared `pg.Client` LISTEN hub on `globalThis`** that fans out to many SSE `ReadableStream`s (the route handler runs in Next's server process; instrumentation and route bundles may hold separate module instances, so the singleton must live on `globalThis`); (2) **health/version detection must run in the web process** (`src/instrumentation.ts`), not the worker, because the worker cannot report its own death; (3) **an emit helper** (`insert activity_events [+ notifications] + pg_notify` in one transaction, payload = ids only) used identically by Better Auth hooks, the worker, the web monitor and the migrate script.

Several UI-SPEC/CONTEXT assumptions need correcting for this Next version (see "Corrections to the UI-SPEC"): `error.tsx` receives `retry` (stable in 16.3.0), not `reset`; `unstable_cache` is superseded by `use cache` but `use cache` requires `cacheComponents: true` (not enabled here, and enabling it removes `export const dynamic`), so use `fetch(..., { next: { revalidate: 1800 } })`; `Cache-Control: no-transform` is required on the SSE response or Next's built-in gzip buffers the stream (verified in Next's compiled `compression`).

**Primary recommendation:** Build `src/server/events.ts` (emit + hub) first; everything else (SSE route, Home activity, notifications, auth/system sources) is thin consumers of it. Use explicit `pg_notify` in the helper (no trigger, no migration), channel `lifeos_events`, id-only payloads, and a "connect SSE -> fetch snapshot -> merge by id" client protocol so reconnect gaps self-heal.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Nav/shell chrome, palette, AI panel, drawer, toasts, shortcuts | Browser/Client (ShellProvider) | Frontend Server (reads `lo_nav` cookie, version, owner name) | Pure interaction state; first paint width needs server cookie read |
| Auth gate | Frontend Server (`requireOwner`) | proxy.ts (optimistic cookie) | Existing pattern; proxy is not authoritative |
| SSE stream + hub | API/Backend (route handler, Node runtime) | Database (LISTEN/NOTIFY) | Long-lived Node process holds the one LISTEN connection |
| Event emission | API/Backend + Worker | Database | Auth hook (web), monitor (web), worker-started (worker), migrations (migrate script) |
| Health/version change detection | API/Backend (web `instrumentation.ts`) | Database (`settings` CAS) | Must survive worker death |
| Notification mutations | API/Backend (server actions, `requireOwner`) | Database | Soft state columns already in schema |
| Notification list/unread/snooze wake | API/Backend (GET route) | Browser (timer to nextWake) | Server filters, client schedules refetch |
| Weather | Frontend Server (fetch w/ revalidate) | — | No key, server-side only, silent failure |
| Time grouping, snooze presets, greeting | Pure TS (shared) | — | Sydney tz math via `Intl`, unit-testable |
| Icon font | CDN/Static (committed woff2 via next/font/local) | — | No runtime Google calls |

## Standard Stack

### Core (all already installed; no installs)
| Library | Version | Purpose | Verification |
|---------|---------|---------|--------------|
| next | 16.4.0 | App Router, route handlers, server actions, proxy, next/font/local | `node_modules/next/package.json` [VERIFIED: node_modules] |
| pg | 8.23.1 | Dedicated LISTEN `Client` (emits `'notification'`) | [VERIFIED: node_modules/pg/lib/client.js:536] |
| drizzle-orm | ^0.45.3 | Queries; `db().execute(sql\`select pg_notify(...)\`)` | existing |
| better-auth | ^1.7.7 | Existing `hooks.after` is the auth event hook point | [VERIFIED: src/server/auth.ts] |
| react / react-dom | ^19.3.0 | Client shell | existing |
| vitest 5 / @playwright/test 1.63 | existing | See Validation Architecture | existing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit `pg_notify` in helper | DB trigger on both tables | Trigger guarantees notify for raw SQL inserts but needs a migration and is invisible in code; Phase 3 agents will use the helper anyway |
| `fetch next.revalidate` | `use cache` / `unstable_cache` | `use cache` needs `cacheComponents: true` (not enabled; changes `dynamic` config, PPR rules). `unstable_cache` is documented as replaced. fetch revalidate is simplest and still supported [CITED: node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md] |
| Client timer for snooze wake | Server tick publishing wake events | Timer + refetch on `visibilitychange` is less code and cross-tab safe |
| zod for action inputs | none | zod already installed; validate `id` as uuid, `category` as enum |

**Installation:** none. **Package Legitimacy Audit:** no external packages are added in this phase; slopcheck not required. The woff2 is a Google-hosted asset committed to the repo (Apache-2.0, see Icon Font).

## Architecture Patterns

### System Architecture Diagram

```
 Sources (all call emitActivity())
 ┌─ Better Auth hooks.after (web) ── sign_in / sign_out / sign_in_failed
 ├─ web monitor (instrumentation.ts, every 30s) ── health transitions, version change
 ├─ worker main() ── worker started
 └─ migrate script ── migrations applied (count delta of drizzle.__drizzle_migrations)
          │  one tx: INSERT activity_events [+ INSERT notifications]; SELECT pg_notify('lifeos_events', '{"k":"activity","id":..}')
          ▼
     Postgres ── NOTIFY on commit ──► Hub (globalThis singleton, 1 dedicated pg.Client, LISTEN lifeos_events)
                                         │ fetch row by id once, JSON.stringify once
                                         ▼ fan out to Set<Subscriber>
 Browser ◄── GET /api/events (text/event-stream, Node runtime, session-checked) ◄─ ReadableStream per tab
   │  EventSource wrapper (manual reconnect, backoff 1s→30s)
   │  on open: GET /api/activity + GET /api/notifications → merge by id (closes the reconnect gap)
   ▼
 ShellProvider state → Home ActivityList (role=log), bell/nav badges, drawer, sidebar health row
 Notification mutations: client → server action (requireOwner + zod) → UPDATE → optimistic UI already applied
```

### Recommended Project Structure
```
src/
├── instrumentation.ts            # register(): nodejs only → import("./server/monitor")
├── server/
│   ├── events.ts                 # emitActivity(), type EventPayload, CHANNEL
│   ├── hub.ts                    # createHub(url) + getHub() (globalThis singleton)
│   ├── monitor.ts                # health/version detector (30s loop, CAS dedupe)
│   ├── notifications.ts          # queries: inbox(now), unreadCount, nextWake; mutations
│   ├── weather.ts                # getSydneyWeather() → {temp, word} | null
│   └── time.ts                   # sydney helpers (shared with client): groups, snooze presets, greeting
├── app/
│   ├── api/events/route.ts       # SSE
│   ├── api/activity/route.ts     # GET last N
│   ├── api/notifications/route.ts# GET snapshot {items, unread, nextWake}
│   ├── fonts/material-symbols-outlined.woff2
│   └── (os)/{layout,template,loading,error}.tsx + 10 domain pages
├── shell/                        # client composites (AppShell, Sidebar, Palette, Drawer, AIPanel…)
└── ui/                           # primitives; icon.tsx + icon-names.ts
```

### Pattern 1: SSE route handler (verified against Next 16.4 docs + compression source)
```ts
// src/app/api/events/route.ts — Node runtime is the default (Edge deprecated) [CITED: route-segment-config/runtime.md]
import { auth } from "@/server/auth";
import { getHub } from "@/server/hub";

export const dynamic = "force-dynamic"; // valid: cacheComponents is NOT enabled in next.config.ts

export async function GET(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 }); // proxy only checks cookie presence
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { cleanup(); } };
      const unsub = getHub().subscribe((evt) => send(`event: ${evt.k}\ndata: ${evt.json}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 20_000);
      const max = setTimeout(() => { cleanup(); controller.close(); }, 15 * 60_000); // forces re-auth on reconnect
      cleanup = () => { clearInterval(ping); clearTimeout(max); unsub(); };
      request.signal.addEventListener("abort", cleanup);
      send("retry: 3000\n: connected\n\n");
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform is REQUIRED: Next's gzip middleware skips responses with it; without it the stream is buffered
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
```
Notes: `proxy.ts` matcher already covers `/api/events`; it only adds CSP/nonce headers (harmless) and 401s cookie-less requests. CSP `connect-src 'self'` already permits EventSource. `Connection: keep-alive` is not needed (and invalid on HTTP/2).

### Pattern 2: Hub (one LISTEN client, reconnect, id-only payload)
```ts
// src/server/hub.ts
import { Client } from "pg";
export const CHANNEL = "lifeos_events";
type Out = { k: "activity" | "notification" | "resync"; json: string };
export function createHub(url: string, load: (p: {k: string; id: string}) => Promise<unknown>) {
  const subs = new Set<(e: Out) => void>();
  let client: Client | undefined, backoff = 1000, stopped = false, keep: NodeJS.Timeout;
  const emit = (e: Out) => subs.forEach((s) => s(e));
  async function connect() {
    const c = new Client({ connectionString: url, keepAlive: true });
    c.on("notification", async (m) => {
      const p = JSON.parse(m.payload ?? "{}"); const row = await load(p).catch(() => null);
      if (row) emit({ k: p.k, json: JSON.stringify(row) });   // 1 query + 1 stringify regardless of #tabs
    });
    const lost = () => { clearInterval(keep); if (!stopped && client === c) { client = undefined; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30_000); } };
    c.on("error", lost); c.on("end", lost);
    try {
      await c.connect(); await c.query(`LISTEN ${CHANNEL}`);
      client = c; backoff = 1000; emit({ k: "resync", json: "{}" }); // tell tabs to refetch snapshot
      keep = setInterval(() => c.query("select 1").catch(lost), 30_000); // detect half-dead TCP
    } catch { lost(); }
  }
  void connect();
  return { subscribe(fn: (e: Out) => void) { subs.add(fn); return () => subs.delete(fn); }, stop() { stopped = true; client?.end(); } };
}
// getHub(): const g = globalThis as { __lifeosHub?: ReturnType<typeof createHub> }; return (g.__lifeosHub ??= createHub(env().DATABASE_URL, loadRow));
```
Key facts: LISTEN must use a dedicated `Client`, never the `Pool` (a pooled connection is returned and loses the listen) [ASSUMED: standard pg practice; consistent with pg API]. `pg_notify` payload limit is 8000 bytes, so send `{k,id}` only [ASSUMED: Postgres docs, well-known]. NOTIFY inside a transaction is delivered at commit, so row-then-notify in one tx is race-free. Hub `loadRow` must filter on `dismissedAt is null` etc. is NOT needed for activity; for notifications also skip rows whose `snoozedUntil > now()`.

### Pattern 3: Emit helper (used by every source)
```ts
// src/server/events.ts — never throws (same contract as audit())
export async function emitActivity(a: {type: string; source: "auth"|"system"|string; title: string; detail?: string; tone?: "red"|"amber"|"green"; payload?: Record<string, unknown>},
                                   n?: {category: Category; title: string; body?: string; actionUrl?: string; icon?: string}) {
  try {
    await db().transaction(async (tx) => {
      const [ev] = await tx.insert(activityEvents).values({ type: a.type, source: a.source, title: a.title, payload: { detail: a.detail, tone: a.tone, ...a.payload } }).returning({ id: activityEvents.id });
      await tx.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify({ k: "activity", id: ev.id })})`);
      if (n) {
        const [nt] = await tx.insert(notifications).values({ ...n, source: a.source, activityEventId: ev.id }).returning({ id: notifications.id });
        await tx.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify({ k: "notification", id: nt.id })})`);
      }
    });
  } catch (err) { log.error({ err, type: a.type }, "emitActivity failed"); }
}
```
Store display data (`detail`, `tone`) in `payload` so the client renders generically; map `type` prefix (`auth.`/`system.`) to the source icon/colour per UI-SPEC.

### Pattern 4: Client reconnect protocol
Native `EventSource` retries only ~3s flat and **stops permanently on non-200 (e.g. 401)**, so wrap it: on `error` -> `close()`, wait backoff (1s doubling to 30s), recreate; on `open` -> reset backoff, fetch `/api/activity` + `/api/notifications`, merge by id (dedupe makes the connect-then-snapshot order safe); on `resync` event do the same; if a snapshot fetch returns 401 -> `location.assign("/login")`. Expose `connected` state for the RECONNECTING label and the polite announcement. One `EventSource` per tab (HTTP/1.1 allows 6 connections per origin; Tailscale serve is HTTPS so normally HTTP/2 [ASSUMED]) .

### Pattern 5: Sydney time without a date library (Node 24 has no `Temporal`, verified `typeof Temporal === "undefined"`)
```ts
const TZ = "Australia/Sydney";
const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((p) => [p.type, p.value]));
// Offset (ms) of Sydney at instant d: Sydney wall clock read as UTC minus the real UTC instant
export function tzOffset(d: Date) { const p = parts(d); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000; }
// Sydney wall time → instant; recheck offset once to be correct across DST edges
export function sydneyInstant(y: number, m: number, d: number, h: number, min = 0) {
  const guess = Date.UTC(y, m - 1, d, h, min); let t = guess - tzOffset(new Date(guess)); t = guess - tzOffset(new Date(t)); return new Date(t);
}
// presets: 1 hour = now+3600000; Tonight = sydneyInstant(today,18) if now < that; Tomorrow = sydneyInstant(today+1 day (use Date.UTC(y,m-1,d+1) to roll month),9)
```
Use `hourCycle: "h23"` (not `hour12:false`, which can print `24`). Verified in this session: Sydney is currently UTC+11 (AEDT) and `Intl` resolves it. Greeting/TZ-label code in `(os)/page.tsx` already uses this tz; move it into `src/server/time.ts` and add a vitest with fixed instants (including a DST-change date: first Sunday of October / April).

### Pattern 6: Web-process monitor (health + version)
```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./server/monitor")).start();
}
```
`register()` runs once at server start and must complete before ready [CITED: instrumentation.md], so `start()` must only `setInterval` (do not await DB work; wrap in try/catch). Guard with `globalThis.__lifeosMonitor` for dev HMR. Each tick: `checkHealth()`; derived key `status` (+ failing check name). Require **2 consecutive identical samples** before treating as a transition (avoids flapping at boot while the worker's first beat is pending). Persist last emitted state in `settings` key `health.last` and swap with a compare-and-set (`update settings set value=$new where key='health.last' and value<>$new returning 1`; insert-on-conflict-do-nothing for first run); only the winning process emits. Transitions: ok->degraded/down = `system.health_degraded` activity (amber/red) + IMPORTANT notification ("Worker isn't responding" when `worker==="stale"`, else "System health is degraded"); degraded->ok = `system.health_restored` (green) activity only. Also on start: compare `settings['app.version']` with `process.env.LIFEOS_VERSION ?? "dev"`; if different and a previous value existed, emit `system.version_changed` + FYI notification then store (same CAS). Include the full `Health` object in the activity `payload` so the client updates the System tile/sidebar from the stream; snapshot (`/api/health`) covers connect.
If the DB is down the monitor cannot write; the client sees SSE drop -> RECONNECTING/Unknown. That is the honest outcome.
Worker-started: in `src/worker/index.ts` after `boss.start()` and first `beat()`, `await emitActivity({type:"system.worker_started", source:"system", title:"Worker started", detail:`v${version}`})`. Migrations: in `src/scripts/migrate.ts` read `select count(*) from drizzle.__drizzle_migrations` (schema `drizzle`, table `__drizzle_migrations` verified in drizzle-orm `dialect.js`; catch "relation does not exist" -> 0) before and after `runMigrations`; if delta > 0 emit `system.migrations_applied` (`{n} new`). Skip emit on a brand-new database is unnecessary; the row simply exists after the first migration.

### Pattern 7: Failed sign-in hook (extend existing `hooks.after`)
Add `await emitActivity(...)` next to `audit(...)` in `src/server/auth.ts` (same try/catch-never-throw contract; already after the audit write). Activity text must not contain IP/email/UA (UI-SPEC). For failed sign-in also pass the URGENT notification, but **throttle**: skip creating a new notification if an undismissed `source='auth'`, `title='Failed sign-in attempt'` notification was created in the last 10 minutes (one `select 1 ... limit 1` before emit); activity event still always emitted. The existing rate limit (5/min/IP) means 429s are rejected before hooks; the throttle still protects against distributed guesses. Sign-out: the `after` hook fires for `/sign-out`; actor `owner`.

### Pattern 8: Notification queries and mutations
- Inbox: `dismissed_at is null and (snoozed_until is null or snoozed_until <= now())`, order `created_at desc`, limit ~100 (partial index `notifications_inbox_idx` already matches). Unread = same + `read_at is null`. `nextWake` = `min(snoozed_until)` where `snoozed_until > now() and dismissed_at is null`; client `setTimeout(refetch, min(wake-now+500, 2**31-1))`, plus refetch on `visibilitychange` (timers drift across sleep). Snoozed rows reappear with the `new` animation (client diff of ids).
- Server actions (`'use server'`): `markRead(id, read)`, `markAllRead()`, `snooze(id, untilIso)`, `dismiss(id)`; each begins with `await requireOwner()` and zod-validates (`z.uuid()`, `z.iso.datetime()`; reject `snooze` past/more than 30 days). Next docs: actions are public HTTP endpoints, closures are encrypted, Origin-vs-Host CSRF check applies [CITED: server-actions.md]; dispatch is **sequential per client** so rapid clicks queue (fine; optimistic UI hides latency). Do not use actions for the snapshot read (use the GET route). Do not call `refresh()` after mutations (client state is authoritative; avoids re-render churn).
- Validate `actionUrl` at render time: must start with `/` and not `//` or `/\` (reuse the login `next` check) to prevent `javascript:`/off-origin links; only server code inserts it today but the column is free text.
- Category label/icon/tone map is a client constant (UI-SPEC table).

### Pattern 9: Next conventions that differ from training data (verified in node_modules/next/dist/docs)
- `cookies()` is async: `const nav = (await cookies()).get("lo_nav")?.value` in `(os)/layout.tsx` (makes route dynamic; already is). Client writes `document.cookie = "lo_nav=compact; path=/; max-age=31536000; samesite=lax"` on toggle (cookie is not httpOnly by design). `.set` is only valid in actions/route handlers, not layouts.
- `proxy.ts` is the renamed middleware, Node runtime by default, no `runtime` export allowed [CITED: proxy.md]. Existing file is correct.
- `template.tsx` wraps page/loading/error, remounts per navigation, does not wrap the same-segment layout: use for the 150ms opacity fade (a `"use client"`-free div with a CSS animation class is enough). Because the template remounts, any state in it resets; keep shell state in the layout-level ShellProvider.
- `error.tsx` props are `{ error, retry }` (`retry` stable since v16.3.0); `reset` still exists but only clears state without refetching [CITED: error.md]. Use `retry` for the "TRY AGAIN" button.
- `loading.tsx` in `(os)/` wraps pages in Suspense (the Skeleton page).
- `export const dynamic = "force-dynamic"` works only because `cacheComponents` is not enabled [CITED: route-segment-config/index.md v16.0.0 note]. Do not enable `cacheComponents` in this phase.
- `next/font/local`: `src` path is relative to the calling file; supports `variable`, `display`, `weight`, `preload`, `adjustFontFallback` (false or a font name for local) [CITED: components/font.md].
- Server Actions allowed origin: if the Tailscale serve proxy sends a Host that differs from Origin, actions are rejected; set `experimental.serverActions.allowedOrigins` to the tailnet hostname if needed [CITED: serverActions.md]; verify on first Proxmox deploy (add to Open Questions).

### Anti-Patterns to Avoid
- LISTEN on a `Pool` client or one `Client` per SSE connection (connection exhaustion; max_connections).
- Detecting "worker down" inside the worker.
- Awaiting DB work inside `register()` (blocks server readiness).
- Putting the whole row in NOTIFY (8000-byte cap, and rows could exceed it).
- Relying on module-level singletons without `globalThis` (HMR and separate bundles duplicate them).
- Forgetting `no-transform` on the SSE response.
- `hour12: false` in Intl (can emit `24`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session check on SSE/actions/GET | custom cookie parsing | `auth().api.getSession({headers})` / `requireOwner()` | proxy only checks cookie presence |
| Compression bypass for SSE | custom flush logic | `Cache-Control: no-transform` | skips Next's gzip [VERIFIED: compiled compression `shouldTransform`] |
| Time zone math | manual DST tables / date lib | `Intl.DateTimeFormat` parts + offset recheck (Pattern 5) | Node 24 has no Temporal; no new dep |
| Icon subsetting | pyftsubset pipeline | Google Fonts CSS `icon_names=` download, commit woff2 | verified: 46 icons -> 14 KB, axes FILL+opsz preserved |
| Weather caching | custom TTL cache | `fetch(url, { next: { revalidate: 1800 } })` | documented, survives per-request |
| Event fan-out per tab | per-connection LISTEN | one hub client + `Set` of subscribers | 1 DB connection total |
| Focus trap / dialog semantics | custom trap | native `<dialog>` `showModal()` or a ~30-line trap util | a11y contract requires trap + return focus; `showModal` gives inert background and Esc for free (verify z-index/backdrop styling against spec) |

## Icon Font (Material Symbols Outlined subset) — verified live

Google Fonts CSS2 API with `icon_names` returns a subsetted variable woff2. Executed in this session with the UI-SPEC list (alphabetical, as required) and the design's own axis string `opsz,wght,FILL,GRAD@20..48,300,0..1,0&display=block`:
- Result: one `@font-face` with `src: url(https://fonts.gstatic.com/l/font?kit=...)`; downloaded woff2 = **14,376 bytes**; fontTools shows axes `FILL 0–1`, `opsz 20–48`, 104 glyphs (wght 300 and GRAD 0 are pinned, so `font-weight: 300` in `.msym`; `"GRAD" 0` in font-variation-settings is harmless).
- The request needs a modern desktop `User-Agent` header or Google serves a different format. The gstatic URL is session-signed; a script must fetch the CSS then the URL inside it. Recommended one-time script `scripts/fetch-symbols.mjs` (not part of build; run manually when the icon list changes; commit the woff2):
```js
const names = [...ICONS].sort().join(",");
const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300,0..1,0&icon_names=${names}&display=block`, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" } })).text();
const url = css.match(/url\((https:[^)]+)\)/)[1];
fs.writeFileSync("src/app/fonts/material-symbols-outlined.woff2", Buffer.from(await (await fetch(url)).arrayBuffer()));
```
- An invalid icon name makes the API fail (the script then fails loudly), which is the guard against typos. Add a vitest that scans `src/**/*.tsx` for `<Icon name="...">` / icon-name constants and asserts membership in `ICONS` (`src/ui/icon-names.ts`, typed union so TS also catches it).
- Load: `localFont({ src: "./fonts/material-symbols-outlined.woff2", variable: "--font-symbols", display: "block", weight: "300", adjustFontFallback: false })` in `src/app/layout.tsx`; add `symbols.variable` to `<html>` className. Existing layout uses `next/font/google` for Geist, which downloads at build time and self-hosts the files, so D-04 holds ("no Google at runtime"); build needs network once (as Phase 1 already did).
- License: Material Symbols are Apache-2.0 [CITED: fontsource.org/fonts/material-symbols-outlined/about]; committing the subset is permitted; add a one-line attribution note in `docs/`.
- Pitfall: a glyph missing from the subset renders its ligature text (e.g. "space_dashboard") overflowing the button; `display: block` hides text until load but not for missing glyphs. The vitest guard above is the mitigation. Every icon span `aria-hidden="true"`.

## Weather (Open-Meteo) — verified live
`GET https://api.open-meteo.com/v1/forecast?latitude=-33.8688&longitude=151.2093&current=temperature_2m,weather_code&timezone=Australia%2FSydney` returned HTTP 200 with `current: { temperature_2m: 14.7, weather_code: 2 }` (13 ms). No key. Implementation: `fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(2500) })`, check `res.ok`, zod-parse `current`, map WMO code with the UI-SPEC table (unknown code -> omit the word but keep temp, or omit entirely), `try/catch` -> `null` -> date-only. A thrown/failed fetch is not cached by Next, so a transient failure retries next request; the 2.5s timeout bounds Home latency (pair with `<Suspense>` around the date-line weather segment if desired so the greeting is not blocked). Terms: Open-Meteo's free API is for non-commercial use and asks for attribution (CC BY 4.0) [ASSUMED: from Open-Meteo site; personal single-user use is within it; add a small credit in Settings later]. `current.time` is already Sydney-local.

## Keyboard (Windows) conflicts [ASSUMED unless noted; verify manually in Chrome and Edge]
- Ctrl+K (Chrome/Edge focus omnibox search) and Ctrl+J (Downloads) are page-overridable with `preventDefault()` on `keydown` (not in the browser's reserved set Ctrl+N/T/W/Shift+N/T/W/Tab). Firefox Ctrl+K/J also overridable. Fallback: all actions remain reachable by buttons (UI-SPEC already states this).
- Alt+1..9: no default tab binding on Windows Chrome/Edge (Linux Chrome uses it). Use `e.code === "Digit1".."Digit9"` with `e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey`. **AltGr on Windows is reported as Ctrl+Alt**: the `!e.ctrlKey` guard avoids hijacking AltGr+digit characters on non-US layouts. Conversely Ctrl+K/J/\\/, handlers must require `!e.altKey` for the same reason.
- Ctrl+\\ and Ctrl+, are unbound in Chrome/Edge. Alt+digit may trigger the menu bar highlight in some Windows browsers when Alt is released alone; `preventDefault` on the digit keydown prevents the digit action only, acceptable.
- Match `e.key.toLowerCase()` for letters, `e.code` for digits/backslash/comma. Skip when `e.isComposing` or `e.repeat` (toggle shortcuts). Register one `keydown` listener on `window` in ShellProvider.
- Playwright: `page.keyboard.press("Control+k")` / `"Alt+2"` work on Chrome desktop for tests.

## Common Pitfalls

### Pitfall 1: Singleton duplication
**What goes wrong:** two hubs/monitors (dev HMR, instrumentation vs route bundle) → double LISTEN, double events. **Avoid:** `globalThis` keys; monitor uses DB CAS so double-start is still safe. **Detect:** duplicated activity rows.

### Pitfall 2: SSE buffered by gzip or proxy
**Avoid:** `no-transform` header + `x-accel-buffering: no`; e2e asserts first event arrives in < 2s on `next start` (production build; dev may differ).

### Pitfall 3: Missed events during reconnect
**Avoid:** snapshot-on-open + `resync` event after the hub reconnects; ids dedupe.

### Pitfall 4: Boot-time health false alarm
Worker's first heartbeat can lag web start; `unknown` worker is "degraded" per `checkHealth()`. **Avoid:** 2-consecutive-sample debounce; on first run with no `health.last`, store baseline silently if the state is the *first* observation and `ok`, emit if not ok after debounce.

### Pitfall 5: e2e environment has no worker
`tests/e2e/prepare-db.ts` runs before a multi-minute `next build`, so any heartbeat inserted there is stale (>3 min) by test time. In e2e the monitor will therefore (correctly) emit "degraded" + an IMPORTANT notification ~60s after server start. **Avoid:** e2e `beforeAll` should upsert `settings['worker.heartbeat']` to `now()` via `pg` (and refresh it in a 60s interval for long runs), or tests must tolerate Degraded. Do not assert exact unread counts without controlling this.

### Pitfall 6: Hydration mismatch
Clock, Kbd glyphs (Ctrl vs ⌘), `Intl` times: render after mount (UI-SPEC already says so). Sidebar width from cookie is server-known, so no jump.

### Pitfall 7: Server action storms / ordering
Sequential dispatch means "Mark all read" followed by a snooze queues; optimistic updates must reconcile with the SSE/snapshot (dedupe by id; ignore a stale snapshot older than the last local mutation, or just refetch after the action settles).

### Pitfall 8: Session expiry on a live stream
A stream authorised at connect lives until closed. 15-minute max lifetime (Pattern 1) bounds this; sign-out in another tab is honoured within 15 min worst case [accepted ponytail ceiling; lower the number if it matters].

### Pitfall 9: Failed-sign-in notification flood
Throttle as in Pattern 7.

## Corrections to the UI-SPEC / CONTEXT (for the planner)
1. `error.tsx`: use `retry()` (Next 16.3+), spec says `reset`.
2. Weather cache: `fetch ... next.revalidate`, not `use cache`/`unstable_cache` (cacheComponents off).
3. Health-change detector lives in the web process (`instrumentation.ts`), not the worker loop (CONTEXT code_context hints at worker for "worker-started/heartbeat-derived"). Worker only emits "worker started".
4. Add `Cache-Control: no-transform` to SSE.
5. Sign-in "Someone entered the wrong credentials at {HH:mm}" copy is fine; do not include email/IP even though `audit_log` stores them.

## Runtime State Inventory
Not a rename/migration phase. Only noteworthy state: new `settings` keys `health.last` and `app.version` (created on first monitor tick; no migration needed); no schema migration required (tables/enum/indexes exist). Optional: none.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | ✓ | 24.19.0 | — |
| Postgres dev DB (docker `lifeos-dev-db-1`, 127.0.0.1:5433) | LISTEN/NOTIFY tests, db tests | ✓ (healthy) | pg17 | — |
| Docker | dev DB | ✓ | — | — |
| Chrome (Playwright `channel: "chrome"`) | e2e | ✓ per Phase 1 | — | bundled Chromium in CI |
| Python + fonttools + brotli | optional woff2 inspection only | ✓ (brotli pip-installed this session) | — | not needed for build |
| Network to fonts.googleapis.com / open-meteo | one-time icon fetch; weather runtime | ✓ (verified from this machine) | — | weather fails silently |

No blocking gaps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^5.0.3 (unit + db), @playwright/test ^1.63 (e2e desktop + mobile projects) |
| Config | `vitest.config.ts` (include `tests/unit/**`, `tests/db/**`, alias `@`); `playwright.config.ts` (port 3100, prod build, DB `lifeos_e2e`) |
| Quick run | `npx vitest run tests/unit` |
| Full suite | `npm run typecheck && npm run lint && npm test && npm run e2e` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Automated Command | Exists? |
|-----|----------|------|-------------------|---------|
| SHL-01 | All 10 domain routes render inside shell; sidebar on desktop, bottom bar on mobile; `aria-current`; compact cookie persists | e2e (desktop+mobile projects) | `npx playwright test shell-nav` | ❌ Wave 0 `tests/e2e/shell-nav.spec.ts` |
| SHL-01 | Icon names ⊆ subset list | unit | `npx vitest run tests/unit/icons.test.ts` | ❌ Wave 0 |
| SHL-02 | Ctrl+K opens palette, filter, Enter navigates; Alt+2 navigates; Ctrl+J opens AI panel; submit shows "LifeOS can't answer yet." | e2e (desktop) | `npx playwright test palette` | ❌ Wave 0 |
| SHL-02 | palette filtering / grouping pure fn | unit | `npx vitest run tests/unit/palette.test.ts` | ❌ Wave 0 |
| SHL-03 | Home date line/greeting/lead; tiles show `0 running`, `0 waiting`, health; EmptyStates present | e2e | `npx playwright test home` | ❌ Wave 0 |
| SHL-03 | `lead()` cases, greeting hour boundaries, weather code map, date line with/without weather | unit | `npx vitest run tests/unit/home.test.ts` | ❌ Wave 0 |
| SHL-03 | weather parser tolerates failure/garbage → null | unit (mock fetch) | `npx vitest run tests/unit/weather.test.ts` | ❌ Wave 0 |
| SHL-04 | emit → NOTIFY → hub subscriber receives row; hub reconnects after `pg_terminate_backend`, emits `resync` | db integration (throwaway DB like `migrations.test.ts`) | `npx vitest run tests/db/hub.test.ts` | ❌ Wave 0 |
| SHL-04 | `emitActivity` writes row (+notification) atomically; never throws on DB error | db | `npx vitest run tests/db/events.test.ts` | ❌ Wave 0 |
| SHL-04 | Open Home signed in; second context posts a wrong password (distinct `x-forwarded-for`); new "Failed sign-in attempt" item appears in `role=log` without reload; also bell badge increments live; SSE first frame < 2s on prod build; 401 without session | e2e | `npx playwright test live-activity` | ❌ Wave 0 |
| SHL-04 | sse frame formatting, backoff sequence (1,2,4…30s), merge-by-id dedupe | unit | `npx vitest run tests/unit/live.test.ts` | ❌ Wave 0 |
| SHL-05 | inbox query excludes dismissed and future-snoozed; unread count; `nextWake`; snooze reappears after time passes (set `snoozed_until` to past) | db | `npx vitest run tests/db/notifications.test.ts` | ❌ Wave 0 |
| SHL-05 | snooze presets & grouping NOW/TODAY/EARLIER across AEDT/AEST and DST boundary; Tonight omitted ≥18:00 | unit (fixed `Date`) | `npx vitest run tests/unit/time.test.ts` | ❌ Wave 0 |
| SHL-05 | drawer: read/unread toggle, snooze menu keyboard, dismiss, mark all read (insert row via pg in test, then UI) ; `actionUrl` validator rejects `//x`, `javascript:` | e2e + unit | `npx playwright test notifications`; `npx vitest run tests/unit/safe-url.test.ts` | ❌ Wave 0 |
| SHL-05 | server actions reject without session / bad uuid | unit/db | `npx vitest run tests/db/notification-actions.test.ts` | ❌ Wave 0 |
| D-10/15 | monitor: 2-sample debounce, CAS dedupe emits once, degraded→notification, restored→activity only; version change emits once | db (inject `checkHealth` stub + fake clock) | `npx vitest run tests/db/monitor.test.ts` | ❌ Wave 0 |
| A11y | axe-free landmarks/roles smoke: skip link first focus, `role=log`, dialog focus trap + return | e2e | `npx playwright test a11y-shell` | ❌ Wave 0 |

Testing notes: to test LISTEN without a browser, `createHub(url, load)` takes the URL and loader (dependency-injected) so db tests run against the throwaway database exactly like `tests/db/migrations.test.ts` (admin URL `postgres://lifeos:lifeos@localhost:5433/postgres`). Trigger events from Playwright through the real sign-in endpoint (no test-only backdoor) or by inserting through `pg` + `select pg_notify` using the same helper. Existing e2e logs in per test; add a shared `signIn(page)` helper in `tests/e2e/owner.ts`. Beware the 5/min sign-in rate limit: use per-test `x-forwarded-for` values as `auth.spec.ts` already does, and seed the heartbeat (Pitfall 5).

### Sampling Rate
- Per task commit: `npx vitest run tests/unit` (+ the specific db file touched)
- Per wave merge: `npm run typecheck && npm run lint && npm test`
- Phase gate: full suite incl. `npm run e2e` green, plus manual visual check at 3 widths (<720, 720–1100, ≥1100) against `design/shots/home.jpg`.

### Wave 0 Gaps
All test files above; shared fixtures (`signIn`, `seedHeartbeat`, `insertNotification` helpers in `tests/e2e/` and `tests/db/helpers.ts` extracting the throwaway-DB setup from `migrations.test.ts`). No framework install needed.

## Security Domain

### Applicable ASVS Categories (level 1)
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | existing Better Auth; do not log credentials into events |
| V3 Session Management | yes | SSE re-auths on each connect + 15 min max lifetime; sign-out event emitted |
| V4 Access Control | yes | `requireOwner()` / `getSession` in every new route, action, page; proxy is only optimistic |
| V5 Input Validation | yes | zod on all server-action inputs; `actionUrl` same-origin path validator; category filter enum |
| V6 Cryptography | no | none added |
| V8/V13 Data/API | yes | activity/notification text excludes IP/email/UA; SSE sends only owner-safe rows |
| V14 Config | yes | CSP unchanged (`connect-src 'self'` covers SSE; `font-src 'self'` covers icon font); no new origins |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Unauthenticated SSE subscription | Info disclosure | session check in route; 401 JSON |
| Server action CSRF | Tampering | Next Origin/Host check; set `allowedOrigins` if proxy host differs |
| Open redirect / `javascript:` via `actionUrl` | Tampering/XSS | render only paths starting with `/` and not `//`, `/\`; use `next/link` |
| XSS via notification/activity text | Tampering | render as React text only, never `dangerouslySetInnerHTML` |
| Notification flood from failed logins (DoS on owner attention/DB) | DoS | 10-min throttle + existing 5/min rate limit |
| Info leak in audit-like events | Info disclosure | no IP/email in activity payload; keep those in `audit_log` only |
| Unbounded SSE connections/memory | DoS | per-stream cleanup on abort/cancel/enqueue error, 15-min lifetime, ping interval |

## State of the Art
| Old | Current (this install) | Impact |
|-----|------------------------|--------|
| `middleware.ts` | `proxy.ts`, Node runtime | already done in Phase 1 |
| `unstable_cache` | `use cache` (needs `cacheComponents`) | stay on fetch revalidate this phase |
| error.tsx `reset` | `retry` (16.3+) | use `retry` |
| sync `cookies()` | async only (sync shim deprecated) | `await cookies()` |
| Edge runtime for streaming | deprecated; Node default | leave `runtime` unset |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ctrl+K / Ctrl+J are overridable by `preventDefault` in Chrome/Edge/Firefox on Windows; Alt+1–9 unbound on Windows | Keyboard | Shortcut silently ignored; buttons remain, so low |
| A2 | NOTIFY payload limit 8000 bytes; LISTEN needs dedicated non-pooled client | Pattern 2 | Design already avoids both risks |
| A3 | Tailscale serve gives HTTP/2 so 6-connection SSE limit is not hit | Pattern 4 | Many tabs could starve; low (single owner) |
| A4 | Open-Meteo free tier terms (non-commercial, attribution) | Weather | Minor; personal use |
| A5 | Tailscale Host/Origin match for server actions | Pattern 9 | Actions rejected on deploy; fix via `allowedOrigins` |
| A6 | `dialog.showModal()` styling meets spec (backdrop, focus return) | Don't Hand-Roll | Planner may choose a small custom trap instead |

## Open Questions (RESOLVED)

1. **Does `serverActions.allowedOrigins` need the tailnet host?** Unknown until Tailscale deploy; plan a verification note (Phase 1 already flags Tailscale as unverified). Recommend leaving unset now. — DEFERRED to Proxmox deploy check (02-VALIDATION manual item).
2. **Should notification mutations sync across open tabs?** Out of scope (D-10 excludes mutation events); refetch on `visibilitychange` suffices. — OUT OF SCOPE.
3. **Single web instance assumption:** monitor CAS makes multi-instance safe, hub is per-instance by design; fine for the Proxmox single-host deployment. — ACCEPTED.

## Project Constraints (from AGENTS.md; no CLAUDE.md in repo)
- This Next.js has breaking changes: read `node_modules/next/dist/docs/` before Next code (done for every API above).
- AGENTS.md block is re-added by `next dev`; commit it if it appears in a diff.
- Phase 1 conventions to keep: lazy `db()`/`env()` (no env access at import so `next build` works), pino `log`, `requireOwner()` per page, never throw from audit-like side effects, `@/` alias, worker bundled by esbuild (so `events.ts` must not import `next/*`).

## Sources

### Primary (HIGH)
- `node_modules/next/dist/docs/01-app/...`: route.md, runtime.md, error.md, template.md, proxy.md, cookies.md, instrumentation.md, font.md, fetch.md, unstable_cache.md, server-actions.md, serverActions.md (allowedOrigins), caching-without-cache-components.md, self-hosting.md (streaming/proxy buffering)
- `node_modules/next/dist/compiled/compression/index.js` (`no-transform` skip), `server/lib/router-server.js` (compress enabled by default)
- `node_modules/pg/lib/client.js` (`notification` event), `drizzle-orm/pg-core/dialect.js` (migrations table name)
- Live calls this session: Google Fonts CSS2 `icon_names` download + fontTools inspection; Open-Meteo forecast response; `Intl` Sydney offset; `typeof Temporal`
- Repo files: src/server/{auth,audit,health,session,db/*}.ts, src/worker/index.ts, src/proxy.ts, tests/*, playwright/vitest configs, docs/decisions/ADR-005

### Secondary (MEDIUM)
- fontsource.org Material Symbols page (Apache-2.0)

### Tertiary (LOW)
- Browser shortcut behaviour (A1) from general knowledge; verify manually

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH (nothing new, versions read from node_modules)
- Architecture: HIGH for hub/emit/SSE (matches verified APIs); MEDIUM for monitor placement tuning (debounce values)
- Pitfalls: HIGH (e2e/worker staleness derived from actual config and `STALE_AFTER_MS`)

**Research date:** 2026-10-08
**Valid until:** 2026-11-07 (Next 16.x moves quickly; re-check docs if upgrading)
