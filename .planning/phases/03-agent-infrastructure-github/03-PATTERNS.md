# Phase 3: Agent infrastructure + GitHub - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 38 new/modified
**Analogs found:** 31 / 38 (7 have no in-repo analog; use RESEARCH.md)

Note: no `CLAUDE.md` or `.claude/skills` in repo. `AGENTS.md` says Next 16 has breaking changes (route `params` is a Promise; read `node_modules/next/dist/docs/` before writing pages/routes).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/server/db/schema.ts` (+ agents, agent_runs, tool_calls, approvals, permissions, threads, messages, github_*, connections) | model | CRUD | same file (`auditLog`, `notifications`, `settings`) | exact |
| `drizzle/0001_*.sql` (+ journal/snapshot) | migration | batch | `drizzle/0000_init.sql` (`npm run db:generate`) | exact |
| `src/server/env.ts` (optional `ANTHROPIC_API_KEY`) | config | transform | same file | exact |
| `src/server/agents/registry.ts` | config | transform | none in repo (static data) | no analog |
| `src/server/agents/gateway.ts` (`callTool`, `resolvePolicy`) | service | request-response | `src/server/monitor.ts` (injectable opts, CAS, emit) | role-match |
| `src/server/agents/loop.ts` (`advance`) | service | streaming | `src/app/api/events/route.ts` (stream) + `monitor.ts` (never-throw/log) | partial |
| `src/server/agents/pricing.ts`, `spend.ts` | utility | transform | `src/server/time.ts` (pure Sydney helpers) | role-match |
| `src/server/agents/approvals.ts` (decide/CAS, expire) | service | CRUD/event-driven | `monitor.ts` `cas()` + `notifications.ts` `.returning()` updates | role-match |
| `src/server/agents/redact.ts` | utility | transform | none | no analog |
| `src/server/agents/tools/github.ts`, `tools/delegate.ts` | service | CRUD | `notifications.ts` (db-handle-param queries) | partial |
| `src/server/github/client.ts` | service | request-response | none (first external HTTP client) | no analog |
| `src/server/github/sync.ts` | service | batch | `monitor.ts` (diff -> `emitActivity`, injectable deps) | role-match |
| `src/server/github/connections.ts` | service | CRUD | `src/server/crypto.ts` + `notification-actions.ts` | role-match |
| `src/server/*-actions.ts` (approval decide/edit, connection save, spend cap, agent pause/cancel/retry) | controller (server actions) | request-response | `src/server/notification-actions.ts` | exact |
| `src/app/api/chat/route.ts` | route | streaming | `src/app/api/events/route.ts` | exact |
| `src/worker/jobs/{sync,resume,expire,sweep}.ts` + `src/worker/index.ts` | job | event-driven/batch | `src/worker/index.ts` heartbeat | exact |
| `src/shell/ai-panel.tsx` (modify: real chat, threads, trace) | component | streaming | same file | exact |
| `src/shell/live-provider.tsx`, `src/lib/live-types.ts`, `src/server/hub.ts`, `events.ts` (new NOTIFY kinds `run`, `approval`) | provider | pub-sub | same files | exact |
| `src/shell/sidebar.tsx` (APPROVALS_WAITING real), `src/app/(os)/page.tsx` (running/waiting tiles) | component | CRUD | same files; `src/server/notifications.ts` `unreadCount` | exact |
| `src/app/(os)/agents/page.tsx`, `agents/[agentId]/page.tsx`, `agents/runs/[runId]/page.tsx` | page | CRUD | `src/app/(os)/page.tsx` (server page, `requireOwner`) | role-match |
| `src/app/(os)/approvals/page.tsx`, `settings/page.tsx` | page | CRUD | `src/app/(os)/page.tsx`; current `settings/page.tsx` | role-match |
| `src/agents/*`, `src/approvals/*`, `src/settings/*` components | component | request-response | `src/shell/notification-row.tsx`, `snooze-menu.tsx`, `src/ui/*` | role-match |
| `tests/db/{gateway,approvals,idempotency,loop,spend,runs,github-sync,connections}.test.ts` | test | CRUD | `tests/db/monitor.test.ts`, `notification-actions.test.ts` | exact |
| `tests/unit/{policy,pricing}.test.ts` | test | transform | `tests/unit/crypto.test.ts`, `time.test.ts` | exact |
| `tests/e2e/{approvals,chat}.spec.ts`, `prepare-db.ts` (seed agents) | test | request-response | `tests/e2e/notifications.spec.ts`, `owner.ts` | exact |

## Pattern Assignments

### Schema additions (`src/server/db/schema.ts`)
**Analog:** same file, lines 1-6 (snake_case casing, `timestamps` spread), 69-81 (`auditLog`), 104-132 (pgEnum + table with index).
```typescript
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
const timestamps = { createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()) };
export const notifications = pgTable("notifications", {
    id: uuid().primaryKey().defaultRandom(),
    category: notificationCategory().notNull(),
    entityType: text(), entityId: text(),
    ...timestamps,
  },
  (t) => [index("notifications_inbox_idx").on(t.createdAt.desc()).where(sql`${t.dismissedAt} is null`)]);
```
Conventions: `uuid().primaryKey().defaultRandom()`, no explicit column-name strings, `jsonb().$type<...>()`, `pgEnum` for statuses, partial/unique indexes in the table callback (use for `tool_calls.idempotency_key` unique and `approvals` status/expires_at). Use `numeric({ precision: 12, scale: 6 })` for `cost_usd`. `settings` (key/jsonb) is the home for `spend_cap` and `spend_cap:{yyyy-mm}` dedupe keys. Generate migration with `npm run db:generate`; `tests/db/migrations.test.ts` exercises migrations.

### `src/server/env.ts`
**Analog:** same file lines 3-12. Add `ANTHROPIC_API_KEY: z.string().min(1).optional(),` to the zod object (must stay optional per RESEARCH). Update `.env.example` and `tests/unit/env.test.ts`.

### Server actions (approval decide/edit, connections, spend cap, agent controls)
**Analog:** `src/server/notification-actions.ts` (whole file, exact).
```typescript
"use server";
import { z } from "zod";
import { db } from "./db/client";
import { log } from "./log";
import { requireOwner } from "./session";
type Result = Promise<{ ok: boolean }>;
const id = z.uuid();
async function run(fn: () => Promise<boolean>): Result {
  try { return { ok: await fn() }; } catch (err) { log.error({ err }, "notification action failed"); return { ok: false }; }
}
export async function dismiss(rawId: string): Result {
  await requireOwner();                       // first line, always (T-02-45)
  const p = id.safeParse(rawId);
  if (!p.success) return { ok: false };       // validate with zod, no throws to client
  return run(() => dismissOne(db(), p.data)); // logic lives in non-"use server" module taking a DB handle
}
```
Keep query logic in plain modules taking `handle: DB` (see `notifications.ts` lines 42-60: `.update().set().where().returning({id})`, `r.length > 0`). Approve/edit must re-parse `edited ?? original` with the tool's zod schema. Write `audit({ actor: "owner", action: "approval.edit", target, metadata: {original, edited} })` (see `src/server/audit.ts` 14-20; never throws).

### CAS approval transitions (`approvals.ts`, spend-cap dedupe)
**Analog:** `src/server/monitor.ts` lines 28-39.
```typescript
async function cas(h: DB, key: string, prev: unknown, next: unknown): Promise<boolean> {
  if (prev === undefined) {
    const r = await h.insert(settings).values({ key, value: next }).onConflictDoNothing().returning({ key: settings.key });
    return r.length > 0;
  }
  const r = await h.execute(sql`update settings set value = ${JSON.stringify(next)}::jsonb, updated_at = now()
        where key = ${key} and value = ${JSON.stringify(prev)}::jsonb returning key`);
  return r.rows.length > 0;
}
```
For approvals use Drizzle `update(...).where(and(eq(id), eq(status,"pending"), gt(expiresAt, now))).returning()` (RESEARCH "Compare-and-set decision"). For `spend_cap:{yyyy-mm}` notify-once, reuse `onConflictDoNothing().returning()` insert on `settings`. Idempotency claim = same insert/`onConflictDoNothing` on `tool_calls.idempotency_key`.

### Gateway / sync / loop injectable-deps style
**Analog:** `src/server/monitor.ts` lines 13-19, 41-54.
```typescript
type Opts = { check?: () => Promise<Health>; handle?: DB; emit?: typeof emitActivity; now?: () => Date };
export function createMonitor(opts: Opts = {}) {
  const h = opts.handle ?? db();
  const emit = opts.emit ?? emitActivity;
  ...
  try { ... } catch (err) { log.error({ err }, "monitor tick failed"); }
}
```
Copy for `LlmClient`, GitHub `fetch`, `handle`, `emit`, `now` injection (RESEARCH Wave 0 test seam). Sync emit shape (monitor 89-100): `emit({ type: "github.ci_failed", source: "github", title, detail, tone: "red", payload }, { category: "IMPORTANT", title, body, actionUrl }, h)`; first observation silent; emit only on transitions.

### `src/app/api/chat/route.ts`
**Analog:** `src/app/api/events/route.ts` lines 1-48.
```typescript
import { auth } from "@/server/auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { /* client gone: stop writing only */ } };
      ...
    },
  });
  return new Response(stream, { headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",   // otherwise Next compression buffers
      "x-accel-buffering": "no" } });
}
```
Differences: POST + zod body (prompt <= 8k, JSON content-type, Origin check); do NOT wire `request.signal` to the run (only to stop writing); `advance()` runs inside `start`.

### Worker jobs
**Analog:** `src/worker/index.ts` lines 16-27.
```typescript
const boss = new PgBoss(env().DATABASE_URL);
boss.on("error", (err) => log.error({ err }, "pg-boss error"));
await boss.start();
await boss.createQueue(HEARTBEAT);
await boss.schedule(HEARTBEAT, "* * * * *");
await boss.work(HEARTBEAT, async () => beat());
```
For each of `github.sync` (`*/15 * * * *`), `approval.expire`, `run.sweep`: `createQueue` -> `schedule` -> `work`. `agent.resume` is `createQueue` + `work` only (enqueue with `boss.send(..., { singletonKey })`). Put each handler in `src/worker/jobs/*.ts`, register from `main()`; keep shutdown block (lines 29-40) unchanged. Web process needs a pg-boss send-only instance (none exists today; no analog for web-side enqueue, see below).

### Connections (token storage)
**Analog:** `src/server/crypto.ts` lines 11-24 (`encrypt(plaintext)` / `decrypt(payload)` using `LIFEOS_MASTER_KEY`). Store ciphertext + `last4` + `expires_at` + `status` + `last_sync_at`; export separate `readToken()` / `writeToken()` helpers so the write PAT is only imported by the execute path. Test pattern: `tests/unit/crypto.test.ts` (round trip, tamper).

### Live events (new `run` / `approval` kinds)
**Analogs:** `src/server/events.ts` lines 19, 40, 47 (`notify(k,id)` inside the tx), `loadEventRow` 90-119 (UUID guard, per-kind load), `src/server/hub.ts` line 63 (kind whitelist `p.k !== "activity" && p.k !== "notification"` must be extended), `src/lib/live-types.ts` `LiveKind`, `src/shell/live-provider.tsx` + `src/shell/live.ts` (`isActivity`/`isNotification` guards). Add DTO type + guard + load branch per new kind; update `tests/db/hub.test.ts` and `tests/unit/live.test.ts`.

### `src/shell/ai-panel.tsx` (modify)
**Analog:** same file. Replace local `turns` state (lines 13, 32, 39-44) and the not-connected `InlineError` (118-125) and header label (80). Keep: `useDialog` modal handling (37), `consumeAIPrompt` effect (46-50), `endRef` scroll (52-54), composer (132-166), `wrap()` modes. New-chat button `onClick={() => setTurns([])}` (83) becomes new-thread. Use `InlineError` props `{label, icon, title, what, why, fix, action?}` (`src/ui/inline-error.tsx`) for no-key / cap / paused states. Client reads NDJSON with `fetch` + `response.body.getReader()` (EventSource cannot POST).

### Pages (`agents`, `approvals`, `settings`)
**Analogs:** `src/app/(os)/page.tsx` (server component importing `requireOwner`, server data fns, `SectionHeader`, `StatusTile`, `EmptyState`) and current stubs `src/app/(os)/agents/page.tsx`, `settings/page.tsx`:
```typescript
import { DomainPage } from "@/shell/domain-page";
export const metadata = { title: "Agents · LifeOS" };
```
Keep `metadata` title format `"X · LifeOS"`; keep `<SignOut />` action on Settings. Dynamic routes: `params` is a `Promise` (`await params`). Use `EmptyState` for honest empty/disabled-agent states (no fake data). Wire sidebar `APPROVALS_WAITING` (`src/shell/sidebar.tsx` line 14, currently const 0 with a comment saying Phase 3) and Home "0 running"/"0 waiting" tiles to count queries modeled on `unreadCount` (`notifications.ts` 16-19: `select({ c: count() }).from(t).where(...)`, `r?.c ?? 0`).

### Pricing / Sydney month bounds
**Analog:** `src/server/time.ts` lines 1-30. Reuse `TZ`, `sydneyParts`, `sydneyInstant(y,m,d,h)` to compute month start/next-month start (DST-safe); do not hand-roll offsets. Test in `tests/unit/time.test.ts` style across Apr/Oct transitions. `PRICES` table + `costUsd` per RESEARCH "Price table and cost".

### Tests
**DB tests analog:** `tests/db/monitor.test.ts` (setupTestDb, `reset()` deleting tables, injected opts) and `tests/db/notification-actions.test.ts` (DB injection for actions):
```typescript
const t = setupTestDb();
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
vi.mock("@/server/session", () => ({ requireOwner: async () => { if (denied) throw new Error("redirect"); } }));
import { dismiss } from "@/server/notification-actions";   // import AFTER mocks
```
Assert owner-denial leaves rows unchanged; zod rejection; state change. Extend `tests/db/helpers.ts` with scripted fake Anthropic stream helper; fixtures in `tests/fixtures/github/`.
**E2E analog:** `tests/e2e/notifications.spec.ts` + `tests/e2e/owner.ts` (`signIn`, `insertNotification` direct-DB helpers; add `insertApproval`/seed helpers there). `tests/e2e/prepare-db.ts` lines 10-20: add agent-registry seed after `runMigrations`. e2e stack has no worker, so execute-after-approve needs the in-process fake (`LIFEOS_FAKE_LLM=1` test-only seam) or direct DB seeding.

## Shared Patterns

### Owner guard + zod validation
**Source:** `src/server/notification-actions.ts` 22-27. **Apply to:** every server action and `/api/chat` (session check variant from `events/route.ts` line 7-8, returns 401 JSON).

### Never-throw side channels
**Source:** `src/server/audit.ts` 14-20, `events.ts` `emitActivity` 22-54 (try/catch + `log.error`, returns null). **Apply to:** audit writes, activity/notification emission in gateway, sync, loop, jobs. Pass `handle` as 3rd arg of `emitActivity` to join a caller's tx/test DB.

### Logging
**Source:** `src/server/log.ts` (`log.error({ err }, "msg")`). pino already redacts; add `redact.ts` for tool I/O.

### Notifications
**Source:** `emitActivity(activity, { category, title, body, actionUrl })`. Categories: APPROVAL (pending, `actionUrl: "/approvals"`; validate with `isSafePath`), URGENT (cap reached), IMPORTANT (CI failed, token 401), FYI (approval expired). Activity `type` dotted (`agent.run.completed`, `github.pr.merged`); `source` = integration/agent id.

### DB handle injection
**Source:** `src/server/db/client.ts` (`db()` lazy, `type DB`). Query modules take `handle: DB = db()` (`notifications.ts`); tests pass `t.handle()`.

### Secrets
**Source:** `src/server/crypto.ts`. Anthropic key stays in env only (ADR-007); never put decrypted tokens in tool inputs/outputs/DTOs.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/server/agents/registry.ts` | config | static | No static registry exists; use docs/AGENTS.md agent list + RESEARCH structure |
| `src/server/agents/loop.ts` Anthropic stream/`advance` | service | streaming | No LLM code yet; use RESEARCH Pattern 1 and SDK README |
| `src/server/agents/redact.ts` | utility | transform | New; RESEARCH Pitfall 10 regex `/token\|authorization\|secret\|password\|key/i` |
| `src/server/github/client.ts` | service | request-response | First outbound HTTP client; RESEARCH Pattern 5 (ETag, Link, rate-limit, same-origin check on `next` URLs) |
| Web-side pg-boss `send` (approval -> `agent.resume`) | service | event-driven | Only the worker constructs `PgBoss` today; need a lazy singleton send-only instance in web (model the `globalThis.__x ??=` singleton on `hub.ts` line 109 and `monitor.ts` 128-137) |
| Markdown subset renderer + CitationChip | component | transform | No markdown code; UI-SPEC + `isSafePath`/`isSafeUrl` (`src/lib/safe-url.ts`; `isSafeUrl` mentioned in RESEARCH, only `isSafePath` verified present, add `https://github.com/` check) |
| ExecutionTrace / ResultCard / ApprovalDetail / ConnectionRow components | component | event-driven | Port from `design/*.dc.html` and UI-SPEC; follow `src/shell/notification-row.tsx` styling conventions |

## Metadata

**Analog search scope:** `src/server`, `src/app`, `src/shell`, `src/ui`, `src/lib`, `src/worker`, `tests/{db,unit,e2e}`, `drizzle/`
**Files scanned:** ~60 listed; ~25 read
**Pattern extraction date:** 2026-10-08
