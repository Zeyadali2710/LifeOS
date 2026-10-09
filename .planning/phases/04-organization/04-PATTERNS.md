# Phase 4: Organization - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 41 (new/modified)
**Analogs found:** 36 / 41 (5 have no codebase analog, use RESEARCH.md)

All line numbers refer to the files as read on 2026-10-09. Paths are relative to repo root.

## File Classification

### Server: calendar domain (new)

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/server/calendar/types.ts` (CalendarProvider, ProviderError, NormalizedEvent) | model/types | request-response | `src/server/github/client.ts` (GithubError, kinds) | role-match |
| `src/server/calendar/google/client.ts` | service (HTTP client) | request-response | `src/server/github/client.ts` | exact |
| `src/server/calendar/google/provider.ts` | service | CRUD + batch sync | `src/server/github/sync.ts` (zod schemas + upsert) | role-match |
| `src/server/calendar/caldav/provider.ts` | service | CRUD + batch sync | `src/server/github/client.ts` (error mapping) | partial (lib is new) |
| `src/server/calendar/connections.ts` | service | CRUD (encrypted) | `src/server/github/connections.ts` | exact |
| `src/server/calendar/sync.ts` | service | batch / event-driven | `src/server/github/sync.ts` | exact |
| `src/server/calendar/expand.ts` | utility | transform | `src/server/time.ts` (pure, Sydney-aware) | partial |
| `src/server/calendar/recurrence-edit.ts` | utility | transform | none | none |
| `src/server/calendar/conflicts.ts`, `free-slots.ts`, `plan.ts` | utility (pure) | transform | `src/server/time.ts` + `tests/unit/time.test.ts` style | role-match |
| `src/server/calendar/events.ts` (owner-write: create/update/delete + audit) | service | CRUD | `src/server/github/connections.ts` (`saveToken` + `audit`) | role-match |
| `src/server/calendar-actions.ts` (server actions) | controller | request-response | `src/server/settings-actions.ts` | exact |
| `src/server/tasks.ts` (CRUD + reminder claim) | service | CRUD + batch | `src/server/agents/approvals.ts` (conditional UPDATE...RETURNING) | role-match |
| `src/server/task-actions.ts` | controller | request-response | `src/server/settings-actions.ts` | exact |
| `src/app/api/connections/google/{start,callback}/route.ts` | route handler | request-response (OAuth) | `src/app/api/threads/route.ts`, `src/app/api/health/route.ts` | partial |
| `src/server/db/schema.ts` (+ `calendars`, `calendar_events`, `tasks`) | model | CRUD | existing `github_*` tables + `connections` | exact |
| `drizzle/0003_organization.sql` (+ `meta/`) | migration | - | `drizzle/0002_model_routing.sql` | exact |

### Server: worker / queue / events

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/worker/jobs/calendar-sync.ts` | worker job | batch | `src/worker/jobs/github-sync.ts` | exact |
| `src/worker/jobs/task-reminders.ts` | worker job | batch/event-driven | `src/worker/jobs/sweep.ts` + `github-sync.ts` | role-match |
| `src/worker/index.ts` (modify) | config | scheduled | itself, lines 31-45 | exact |
| `src/server/queue.ts` (modify QUEUES) | config | - | itself, line 5 | exact |
| `src/lib/live-types.ts` / `src/shell/live.ts` (add SSE kinds `calendar.synced`, `task.changed`) | provider | pub-sub | itself (`LiveKind`) | exact |

### Server: agents / approvals (modify + new)

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/server/agents/tools/calendar.ts` (+ tasks tools) | tool | CRUD / approval | `src/server/agents/tools/github.ts` | exact |
| `src/server/agents/tools/index.ts` (modify) | config | - | itself | exact |
| `src/server/agents/registry.ts` (flip `organization` live, prompts) | config | - | `projects` entry lines 86-107 | exact |
| `src/server/agents/approvals.ts` (generalise) | service | request-response | itself (GitHub-shaped lines 3, 37, 79-82, 108-111, 124, 183-189, 235, 268-277) | modify |
| `src/server/agents/dto.ts` (`toApprovalDTO`) | utility | transform | itself lines 101-118 | modify |
| `src/server/agents/gateway.ts` (approval notification body) | service | request-response | itself lines 173-189 | modify |
| `src/server/agents/loop.ts` / `routing.ts` (taint for calendar output) | service | transform | `routing.ts` lines 90-108, `loop.ts` 205-210 | modify |
| `src/lib/agent-types.ts` (`ApprovalDTO`, `ConnectionId`, `ConnectionDTO`) | model/types | - | itself lines 59-74, 103-114 | modify |
| `src/lib/issue-payload.ts` -> sibling `src/lib/event-payload.ts` | model (zod) | validation | `src/lib/issue-payload.ts` | exact |

### UI

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/app/(os)/organization/page.tsx` (replace) | page (server component) | request-response | `src/app/(os)/settings/page.tsx` | exact |
| `src/organization/*` (header, legend, grid, month, event-block, event-detail, event-dialog, plan-card, tasks-card, task-dialog) | component | request-response | `src/settings/connections-section.tsx`, `src/ui/dialog.tsx`, `src/ui/field.tsx` | role-match |
| `src/ui/field.tsx` (add `Checkbox`, `RadioGroup`) | component | - | itself (Input/Select) | exact |
| `src/ui/icon-names.ts` + font subset | config | - | itself | exact |
| `src/settings/connections-section.tsx` + new `calendar-connection-row.tsx`, `calendar-list.tsx`, `icloud-form.tsx` | component | CRUD | `connection-row.tsx`, `token-form.tsx`, `connections-section.tsx` | exact |
| `src/approvals/approval-detail.tsx`, `approval-edit-form.tsx`, `approval-list.tsx` (generalise) | component | request-response | themselves | modify |
| `src/shell/ai/approval-card.tsx`, `result-card.tsx` (events variant) | component | - | themselves | modify |
| `src/shell/palette-items.ts`, `nav.ts`, `bottom-bar.tsx` | config | - | `palette-items.ts` lines 16-61 | exact |

### Tests

| File | Role | Closest Analog | Match |
|---|---|---|---|
| `tests/unit/{expand,conflicts,plan,recurrence-edit}.test.ts` | test (pure) | `tests/unit/time.test.ts` | exact |
| `tests/db/calendar-sync-{google,caldav,auth}.test.ts` | test (db) | `tests/db/github-sync.test.ts` | exact |
| `tests/db/calendar-tools.test.ts`, `calendar-privacy.test.ts` | test (db) | `tests/db/github-tools.test.ts`, `tests/db/gateway.test.ts` | exact |
| `tests/db/task-reminders.test.ts`, `tasks.test.ts`, `calendar-actions.test.ts` | test (db) | `tests/db/approvals.test.ts`, `settings-actions.test.ts` | role-match |
| `tests/helpers/fake-calendar.ts` (fake provider + fake Google fetch) | test helper | `tests/helpers/fake-github.ts`, `fake-tools.ts` | exact |
| `tests/fixtures/calendar/*` | fixture | `tests/fixtures/github/*.json` | exact |
| `tests/e2e/organization.spec.ts` | test (e2e) | `tests/e2e/settings.spec.ts` | role-match |

---

## Pattern Assignments

### `src/server/calendar/google/client.ts` (service, request-response)

**Analog:** `src/server/github/client.ts` (86 lines)

**Error class + kinds** (lines 5-17). Copy as `ProviderError` with kinds `auth | not_found | rate_limit | conflict | client | unavailable` (RESEARCH Pattern 1):
```typescript
export type GithubErrorKind = "auth" | "rate_limit" | "not_found" | "server" | "network" | "client";
export class GithubError extends Error {
  constructor(public kind: GithubErrorKind, public status: number, message: string, public retryAfterSec?: number) {
    super(message);
    this.name = "GithubError";
  }
}
```

**Factory with injectable fetch + timeout + status mapping** (lines 29-57):
```typescript
export function createGithub({ token, fetch = globalThis.fetch, timeoutMs = 15000 }: {...}) {
  async function call(url: string, init: RequestInit = {}, etag?: string): Promise<Response> {
    ...
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GithubError("network", 0, "GitHub unreachable");
    }
    if (res.ok || res.status === 304) return res;
    if (res.status === 401) throw new GithubError("auth", 401, msg);
    if ((res.status === 403 || res.status === 429) && (... "x-ratelimit-remaining" === "0" || retry)) { throw new GithubError("rate_limit", ...) }
    if (res.status === 404) throw new GithubError("not_found", 404, msg);
    if (res.status >= 500) throw new GithubError("server", res.status, msg);
    throw new GithubError("client", res.status, msg);
```
Google adds: `410` -> distinct `gone` signal to caller (full resync), `412`/`409` -> `conflict`, token-endpoint `invalid_grant` -> `auth`.

**SSRF guard on paths** (lines 25-27): `checkPath` rejects non-relative paths; keep (constant base `https://www.googleapis.com/calendar/v3`). Pagination uses a `maxPages` bound (lines 66-77). Zod-parse every response (`schema.parse(await res.json())`, line 63).

---

### `src/server/calendar/connections.ts` (service, CRUD encrypted)

**Analog:** `src/server/github/connections.ts` (123 lines)

**Imports** (lines 1-9): `eq`, `zod`, `audit`, `decrypt/encrypt` from `../crypto`, `db/type DB` from `../db/client`, `connections` from `../db/schema`.

**Save = validate against provider, then upsert encrypted row, then audit (only last4/id in metadata)** (lines 42-46):
```typescript
const row = { ciphertext: encrypt(token, opts.key), last4: token.slice(-4), login, expiresAt, status: "connected", lastError: null, repos };
await h.insert(connections).values({ id, ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
await audit({ actor: "owner", action: "connection.save", target: id, metadata: { id, last4: row.last4 } });
return { ok: true, ... };
```
Result type is a discriminated union with `error: "invalid" | "rejected" | "unreachable"` (line 15). Test injection via `opts: { fetch?, now?, key? }` (lines 19-24).

**Token accessor pattern** (lines 79-82) and `markConnectionError` / `recordSync` (lines 96-105). For Google, ciphertext is one encrypted JSON blob `{refresh_token, access_token, expires_at}` (RESEARCH Pattern 2); iCloud ciphertext holds `{appleId, password}`. Decrypt only inside the provider factory. Never put secrets in `lastError` (fixed strings only).

**`getConnections`** (lines 107-123) uses an `IDS` list (line 11): add `google_calendar`, `icloud_calendar` and extend `ConnectionId` in `src/lib/agent-types.ts` line 103. NOTE: `ConnectionRow` prop `id` union (connection-row.tsx line 31) and `settings-actions.ts` `removable` enum (line 14) also need the new ids.

`connections.repos` is `jsonb string[]` (schema line 324); for calendars use the new `calendars` table instead, not this column.

---

### `src/server/calendar/sync.ts` (service, batch)

**Analog:** `src/server/github/sync.ts` (252 lines)

**Factory with injected deps** (lines 79-86):
```typescript
type Opts = { handle?: DB; fetch?: typeof globalThis.fetch; emit?: typeof emitActivity; now?: () => Date };
export function createSync(opts: Opts = {}) {
  async function run(): Promise<SyncResult> {
    const h = opts.handle ?? db();
    const emit = opts.emit ?? emitActivity;
    const now = (opts.now ?? (() => new Date()))();
```
For calendar, inject `provider` factory too (fake provider in tests; ADR-010 labelled mock lives in tests only).

**Result union** (line 73): `{ skipped: "not_connected" } | { error: "auth" | "rate_limit" | "other" } | { ok: true; ... }`.

**Auth failure: pause + RECONNECT + notify once (only if previously ok)** (lines 116-128):
```typescript
if (e instanceof GithubError && e.kind === "auth") {
  const wasOk = conn?.status !== "error";
  await markConnectionError(h, "github_read", "GitHub token rejected");
  if (wasOk) {
    await emit({ type: "github.connection_error", source: "github", title: "GitHub connection needs attention", tone: "red" },
      { category: "IMPORTANT", title: "...", body: "..." }, h);
  }
  return { error: "auth" };
}
```
Calendar copy per UI-SPEC notification map ("{Google Calendar} needs attention" / "Access was rejected. Syncing is paused."), `source: "calendar"`.

**First sync is silent; upsert by natural key; emit meaningful diffs only** (lines 90, 154, 176, 239-241): `firstSync = !conn?.lastSyncAt`, `if (first) continue;`, final `if (events > 0 && !firstSync) emit("... synced", ...)`. Use `onConflictDoUpdate` on `(calendar_id, remote_id)` unique index (like `github_pull_requests` `uniqueIndex().on(repoId, number)`, schema line 367).

**Incremental cursor** (ETag helper lines 100-109): "save only after rows persisted so a mid-sync failure retries". Mirror with `calendars.sync_cursor` (Google `syncToken` / CalDAV ctag) updated after upsert; Google `410` clears events for that calendar and resets cursor.

**Failure tail** (lines 243-249): never throws; `recordSync(h, {at, error: "<fixed message>"})`, log with `log.error({ err }, ...)` for non-provider errors only.

**Activity emit shape**: `emit({ type, source, title, detail, tone }, { category, title, body, actionUrl }, h)`; UI-SPEC wants `source: "calendar"`.

---

### `src/worker/jobs/calendar-sync.ts` and `task-reminders.ts` (worker job)

**Analog:** `src/worker/jobs/github-sync.ts` (8 lines, full file)
```typescript
import { createSync } from "@/server/github/sync";
import { log } from "@/server/log";
// run() never throws; log counts only (no repo/PR data). Queue registration lives in the worker entrypoint.
export async function handleGithubSync(): Promise<void> {
  const r = await createSync({ fetch: globalThis.fetch }).run();
  log.info({ result: "ok" in r ? "ok" : "skipped" in r ? r.skipped : r.error, ... }, "github sync finished");
}
```
Log counts only, no titles. `task-reminders.ts`: call `fireDueReminders()` from `src/server/tasks.ts`; see sweep.ts for non-sync job style.

### `src/worker/index.ts` + `src/server/queue.ts` (modify)

**Queue names** (`queue.ts` line 5): `export const QUEUES = { githubSync: "github.sync", resume: ..., expire: ..., sweep: ... } as const;` add `calendarSync: "calendar.sync"`, `taskReminders: "task.reminders"`.

**Registration** (`worker/index.ts` lines 31-45):
```typescript
await boss.createQueue(QUEUES.githubSync);
await boss.schedule(QUEUES.githubSync, "*/15 * * * *", {}, { singletonKey: "github.sync" });
await boss.work(QUEUES.githubSync, async () => handleGithubSync());
// Fresh deploys should not wait 15 minutes for the first sync.
await boss.send(QUEUES.githubSync, {}, { singletonKey: "github.sync", startAfter: 10 }).catch(() => undefined);
```
Calendar: cron `*/5 * * * *`, singletonKey `calendar.sync`. Reminders: `* * * * *` (same as HEARTBEAT line 27). The web app only sends (`enqueue` in queue.ts lines 23-34; "Sync now" = `enqueue(QUEUES.calendarSync, {}, { singletonKey: "calendar.sync" })`, see `syncNowAction` below).

---

### `src/server/tasks.ts` reminder claim (service, batch)

**Analog:** `src/server/agents/approvals.ts` `executeApproved` conditional claim (lines 135-146) and `expireDue` (lines 213-216):
```typescript
const due = await h.update(approvals).set({ status: "expired", decidedAt: now })
  .where(and(inArray(approvals.status, ["pending", "failed"]), lte(approvals.expiresAt, now)))
  .returning();
for (const a of due) { ... await emitActivity({...}, { category: "FYI", ... actionUrl }, h); await live(h, a); }
```
Reminder: `UPDATE tasks SET reminded_at=now WHERE remind_at<=now AND reminded_at IS NULL AND completed_at IS NULL RETURNING`, then `emitActivity({type:"task.reminder", source:"calendar", ...}, {category:"REMINDER", ...}, h)` (RESEARCH Code Example, lines 250-257). `REMINDER` is already in the `notification_category` enum (schema lines 120-127).

Per-handle audit helper (approvals.ts lines 23-30) `aud(h, action, id, metadata)` writes `auditLog` through the caller's handle; use it (not global `audit()`) in DB tests for owner event/task writes.

---

### `src/server/calendar-actions.ts` / `src/server/task-actions.ts` (server actions)

**Analog:** `src/server/settings-actions.ts` (103 lines) and `src/server/approval-actions.ts` (47 lines)

**Pattern** (settings-actions lines 1-12, 22-37, 80-91): `"use server"`; zod schemas at top; `await requireOwner()` first line of every action; `safeParse` input; try/catch returning `{ ok: false }` / error code union; `log.error({ err }, "...")` (never log secrets); `enqueue(QUEUES.x, {}, { singletonKey })` for Sync now.
```typescript
export async function saveTokenAction(rawId: string, rawToken: string): Promise<SaveTokenResult> {
  await requireOwner();
  const i = id.safeParse(rawId);
  if (!i.success) return { ok: false, error: "invalid" };
  ...
  try { const r = await saveToken(db(), i.data, t.data); ...
  } catch (err) { log.error({ err }, "save token failed"); return { ok: false, error: "failed" }; }
}
```
Result type for approvals actions: `{ ok: boolean; approval?; errors?: FieldErrors }` (approval-actions line 10); use field-error maps for the EventDialog/TaskDialog zod validation (UI-SPEC copy strings).

`requireOwner` is `src/server/session.ts` (cached `auth().api.getSession`, redirects to /login). Route handlers for OAuth should call the same.

---

### `src/server/agents/tools/calendar.ts` (tool, CRUD + approval)

**Analog:** `src/server/agents/tools/github.ts` (277 lines) and `Tool` type in `src/server/agents/types.ts` lines 44-58.

**Imports/headers** (github.ts 1-11): `z`, `Tool/ToolContext/ToolError` from `../types`, `getConnections` etc.; `NOT_CONNECTED` string constant; `cut()` truncation (`MAX_STR = 2000`); one output envelope `listOut = { connected, message?, items: Record[] }` (line 18).

**READ tool wrapper `dbRead`** (lines 36-59): not-connected short-circuit returns `{ connected: false, message, items: [] }`; tier `"READ"`, `sideEffect: false`. Reuse for `calendar.list_events`, `calendar.find_free_slots`, `calendar.detect_conflicts`, `tasks.list` (names per UI-SPEC trace lines). These must call the single pure conflict/free-slot modules.

**Write tool (APPROVE/HIGH_RISK)** (lines 230-272):
```typescript
const createIssue: Tool<CreateInput, {...}> = {
  name: "github.create_issue", label: "Preparing a GitHub issue", description: "...",
  input: createInput, output: z.object({...}),
  tier: "APPROVE", sideEffect: true,
  async available(ctx) { return (await connection(ctx, "github_write")).status === "none" ? "..." : null; },
  async resolve(i, ctx) { await repoRow(ctx, i.repo); ...; return i; },
  toApproval({ reason, ...payload }) { return { payload, reason: reason ?? null }; },
  async handler({ ... }, ctx) {
    if (!ctx.approvalId) throw new ToolError("not_allowed", "Issue creation requires an approval.");
    ...
    const marker = `<!-- lifeos-approval:${ctx.approvalId} -->`;
    if (ctx.adopt) { /* search for earlier landed write by marker, return it */ }
```
Calendar: `calendar.create_event`/`update_event` tier `APPROVE`, `calendar.delete_event` tier `"HIGH_RISK"` (gateway floors via `resolvePolicy`, policy.ts lines 4-7, so no override can lower it). `resolve()` re-validates calendar id exists/enabled/writable and (for update/delete) loads the event, stamping its etag into the payload so approve can detect "changed since prepared". Marker for adopt: Google `extendedProperties.private.lifeosApproval`, ICS `X-LIFEOS-APPROVAL`. Payload carries `{ eventId, instanceStart, scope }` for recurring edits/deletes. Agent create is non-recurring only (UI-SPEC).

**Registration**: export `calendarTools` as `Object.fromEntries([...].map(t => [t.name, t]))` (lines 274-277) with the same `eslint-disable no-explicit-any` comment; add to `TOOLS` in `tools/index.ts` line 6: `{ ...githubTools, ...calendarTools, [delegateTool.name]: delegateTool }`.

**Registry flip** (`registry.ts`): replace line 85 `off("organization", ...)` with a full `AgentDef` modelled on `projects` (lines 86-107): `live: true, arrival: null, defaultModel: MODELS.sonnet, tools: [...], systemPrompt: ORGANIZATION_PROMPT (built from DATA_RULE line 35, like PROJECTS_PROMPT lines 47-53), routable: true, requiresTools: true`. Update `ORCHESTRATOR_PROMPT` (lines 37-45) with "Delegate calendar and task questions to the organization agent." `delegateTool` picks live agents up automatically (RESEARCH).

---

### `src/lib/event-payload.ts` + approvals generalisation (CRITICAL, Wave 1)

**Analog:** `src/lib/issue-payload.ts` (single zod source shared by client form and server `decide`). Create per-tool schemas and a lookup `payloadSchemaFor(tool: string)`.

**GitHub coupling that must be generalised (all verified in code):**

| Location | Coupling |
|---|---|
| `approvals.ts` line 3, 37 | `payloadOf` casts to `IssuePayload` |
| `approvals.ts` lines 79-82, 108-111 | `issuePayloadSchema.safeParse` + `repo` immutability check; replace with `payloadSchemaFor(cur.tool)` and a tool-provided `immutable(orig, next)` check (calendar: calendarId/eventId can't change) |
| `approvals.ts` line 124 | `ExecOutcome.result: { number; url }` -> `unknown` |
| `approvals.ts` lines 183-189 | only `GithubError` mapped; add `ProviderError` branch: definite = client/auth/not_found/rate_limit/conflict, else ambiguous. Message "Google/iCloud rejected it" from the tool |
| `approvals.ts` line 189, 235-236 | hard-coded "issue" strings; make tool-provided (`tool.expiryText`, `tool.failText`) per UI-SPEC "Nothing was created / changed / deleted." |
| `approvals.ts` lines 267-278 | `toDTOs` loads `githubRepos` privacy and silently drops rows on throw (log + `[]`); calendar = always private |
| `dto.ts` lines 101-118 | `issuePayloadSchema.parse` for `original`/`edited`; `repoPrivate` |
| `agent-types.ts` lines 59-74 | `original: IssuePayload`, `result: {number,url}`, `repoPrivate` -> `original: unknown` + `kind`, `preview` |
| `gateway.ts` lines 173-178 | notification body assumes `p.repo`/`p.title`; add `tool.approvalBody?(payload)` |
| `schema.ts` line 307 | `result` typed `{number,url}`; widen to `unknown` (no migration needed, jsonb) |
| `loop.ts` / `events.ts` line 131 | `loadEventRow` calls `toApprovalDTO(r)` |
| `approval-detail.tsx` lines 5, 21-39, 48-96, 100-111 | `Preview`, `same()`, `Resolved` text, `toDraft/toPayload` all issue-specific |
| `approval-edit-form.tsx` | issue draft fields |

Keep `tests/db/approvals.test.ts`, `approval-actions.test.ts`, `github-tools.test.ts` green (regression gate).

---

### Taint for calendar output (private-data gate)

**Analog:** `src/server/agents/routing.ts` lines 90-108 and `loop.ts` lines 205-210, 244, 253, 395.
```typescript
export async function sensitiveRepoNames(h) { ... githubRepos.private IS NOT FALSE ... }
export function mentionsSensitive(messages: unknown, names: string[]): boolean {
  if (names.length === 0) return false;
  const hay = JSON.stringify(messages).toLowerCase();
  return names.some((n) => hay.includes(n.toLowerCase()));
}
```
Detection is name-matching over the whole conversation. Calendar data has no stable names, so taint must be tool-based: in `loop.ts` `taint(m)` (line 206) also set `tainted = true` when any tool call in the turn has a name starting with `calendar.` or `tasks.` (`Tool` could expose `private?: boolean`). Test in `tests/db/calendar-privacy.test.ts`, modelled on `tests/db/routing-loop.test.ts`.

---

### `src/server/db/schema.ts` (+ `calendars`, `calendar_events`, `tasks`)

**Analog:** `github_*` tables (schema lines 330-421) and `connections` (315-328).

Conventions to copy:
- `casing: "snake_case"`, columns written camelCase (header line 20); `...timestamps` spread (lines 21-24); `tstz()` helper (line 151).
- Unique natural key via `uniqueIndex().on(t.repoId, t.number)` (line 367) -> `uniqueIndex().on(t.calendarId, t.remoteId)`.
- FK with cascade: `repoRef()` (line 347) -> `calendarId: uuid().notNull().references(() => calendars.id, { onDelete: "cascade" })`.
- jsonb typed with `$type<>()` (line 94, 362); raw payload jsonb for `calendar_events.raw`.
- `index().on(t.repoId, t.committedAt.desc())` style (line 398) -> `index().on(t.calendarId, t.startAt)`.
- Enums via `pgEnum` only for closed sets used widely; otherwise `text()` with comment (connections.status, line 322).

Columns (RESEARCH): `calendars(id uuid, connectionId text, remoteId, name, access, enabled, category, isDefault, syncCursor, ...)`; `calendar_events(startAt/endAt tstz, tz text, allDay bool, startDate/endDate text for all-day, rrule, recurringEventId, instanceOriginalStart, status, transparency, response, etag, raw jsonb)`; `tasks(id, title, dueAt/dueDate/dueTime, priority, notes, completedAt, remindAt, remindedAt, projectId nullable uuid)`. Editing `remindAt` resets `remindedAt` to null.

**Migration:** next file `drizzle/0003_organization.sql` (existing: `0000_init`, `0001_agents_github`, `0002_model_routing`, plus `drizzle/meta`). Generate via drizzle-kit (see `drizzle.config.ts`); `tests/db/migrations.test.ts` and `setupTestDb` (helpers.ts lines 20-34) run all migrations on a throwaway DB.

---

### `src/app/(os)/organization/page.tsx` (server page)

**Analog:** `src/app/(os)/settings/page.tsx` (74 lines)

Copy: `export const dynamic = "force-dynamic"`, `metadata`, `await requireOwner()`, `searchParams: Promise<{...}>` awaited then validated with fallbacks (line 22-23: `raw === "ai" ? "ai" : "connections"`) -> `view`, `date`, `event` clamped/defaulted per UI-SPEC; load data with `db()` in parallel (`Promise.all`, line 29); pass plain serialisable DTOs into client components; header markup (lines 59-67) with eyebrow `font-mono text-[11px] font-medium tracking-[0.12em]` and H1 `text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]`. Current placeholder (`DomainPage`, 15 lines) is replaced entirely. AGENTS.md: read `node_modules/next/dist/docs/` for searchParams/route handlers before coding.

---

### `src/settings/*` (Connections: Google + iCloud rows, calendar list)

**Analog:** `src/settings/connection-row.tsx` (124 lines), `token-form.tsx` (96), `connections-section.tsx` (182)

- Row shell (connection-row.tsx 57-82): tile `grid size-9 ... rounded-9 bg-fill-2 font-mono text-[11px] font-semibold`, `StatusDot`, status maps (lines 12-16: `LABEL`, `DOT`, `COLOR`; RowStatus has no SYNCING, add or pass via detail). Error border `border-[rgba(240,122,110,.3)]`.
- Prefer extending `ConnectionRow` (generalise `id` union, button label "Replace" -> "Disconnect" semantics via UI-SPEC) rather than duplicating; the expanded children slot (line 83) holds the calendar list Disclosure.
- Detail + footer line with `Sync now` (connections-section.tsx 58-72, 102-116): `Disclosure summary`, `Button variant="secondary" size="xs" loading`, `Last synced ${formatHM(last)} · next about ${formatHM(new Date(last.getTime() + SYNC_MS))}` (SYNC_MS = 5 * 60_000 for calendar), red `Last sync failed ...`.
- Secret entry form (token-form.tsx 47-95): clear state immediately (`setToken("")`, line 50), `type="password" autoComplete="off" spellCheck={false} autoCapitalize="off" data-1p-ignore`, `ERRORS` map keyed by action result, `role="alert"` error `<p>`, submit `Button loading` with "Verifying…". iCloud form = two fields (Apple ID `Input`, password) in this pattern.
- Native checkbox/switch styling precedent: connections-section.tsx 148-155 (`<input type="checkbox" role="switch" className="mt-1 size-4 shrink-0">`); basis for the new `Checkbox`.
- Remove confirmation (connection-row 104-121): `Dialog` with `initialFocus={() => document.getElementById("...-cancel")}`, secondary Cancel + `variant="destructive"` -> Disconnect dialog.
- Settings page data load (settings/page.tsx 42-54) passes `getConnections(h)` result; add calendars list query there.
- Toast via `useShell().toast(msg, "error" | "success")`; `router.refresh()` after changes.

---

### `src/organization/*` components (Dialog/forms/cards)

**Analogs:** `src/ui/dialog.tsx` (43 lines), `src/ui/field.tsx` (55), `src/approvals/approval-detail.tsx`

- `Dialog` props: `open, onClose, title, children, actions, initialFocus`; fixed width `w-[min(420px,94vw)]` (line 33) -> EventDialog/TaskDialog/EventDetail need a `width` (and mobile sheet) prop or a sibling; `useDialog` (src/shell/use-dialog.ts) gives trap/Esc/focus return.
- `Field` wraps one control via `cloneElement`, injecting `id`, `aria-describedby`, `aria-invalid` (field.tsx 31-55); `Input/Textarea/Select` accept native props (type="date"/"time"/"datetime-local" work unchanged). Add `Checkbox` and `RadioGroup` in the same file, same `base` class.
- Detail block helpers to reuse for approval previews: `Fact` (approval-detail 41-46), `Badge` kinds (`kind="tag" tone="neutral"`, line 30), `Resolved` banner structure (48-96) with `useRef` focus on mount.
- Safe URLs: `src/lib/safe-url.ts` (`isSafeGithubUrl`) -> add `isSafeUrl` per UI-SPEC and test like `tests/unit/safe-url.test.ts`.
- Live updates: `src/shell/live-provider.tsx` / `live.ts`; add `calendar.synced` and `task.changed` kinds (`LiveKind`, live-types.ts line 40). Server side emit via `pg_notify` in `events.ts` lines 21-30 (`notifyLive`'s `k` is typed `"run" | "approval"`; widen).
- Category colour map: single module (e.g. `src/lib/calendar-categories.ts`), no server imports (client-safe like `registry.ts` comment line 1 and `time.ts` line 1).
- Time helpers: use `sydneyInstant`, `sydneyParts`, `formatHM`, `tzLabel` from `src/server/time.ts` (pure, client-safe). Never add 24h to step days (RESEARCH Pitfall 5).

### `src/shell/palette-items.ts` / `nav.ts` (modify)

Add commands in the `commands` array (palette-items lines 17-26) with `{ type: "nav", href }`; "New event"/"New task" are nav runs to `/organization?new=event`. Events/Tasks palette scopes (Phase 2 D-06) are data-backed: follow `buildPalette` structure (groups 47-58); `tests/unit/palette.test.ts` is the test analog.

---

### Tests

**`tests/db/calendar-sync-*.test.ts`** - analog `tests/db/github-sync.test.ts`:
- Env setup lines 16-20 (`LIFEOS_MASTER_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), `const t = setupTestDb();`, `NOW` constant, `emit` spy collecting `{a, n}` (lines 24, 51-54), `world()` mutable fake server producing ETags and 304s (27-47), tests: no-connection -> skipped & zero fetch calls (60-67), first sync silent then transitions emit once (69+). Calendar equivalent: fake Google fetch with `syncToken`, 410, cancelled; fake CalDAV provider for ctag/etag.
- Use `fakeGithub` shape (`tests/helpers/fake-github.ts`: route key `"GET /path"` or with query, records `calls`) to write `tests/helpers/fake-google.ts`.

**`tests/db/calendar-tools.test.ts`** - analog `tests/db/github-tools.test.ts`:
```typescript
const key = vi.hoisted(() => Buffer.alloc(32, 7).toString("base64"));
vi.mock("@/server/env", () => ({ env: () => ({ LIFEOS_MASTER_KEY: key }) }));
vi.mock("@/server/agents/registry", () => ({ getAgent: () => ({ id: "projects", name: "Projects", live: true, tools: Object.keys(githubTools) }) }));
const call = (name, input, fetch?) => callTool({ handle: t.handle(), runId, agentId: "projects", tools: githubTools, now: () => NOW, fetch }, name, input, `tu_${Math.random()}`);
```
Assert tiers (READ count), pending approval created with no provider call before approve, delete resolves HIGH_RISK and a `permissions` override cannot lower it.

**`tests/unit/{conflicts,plan,expand}.test.ts`** - analog `tests/unit/time.test.ts` (`describe/it/expect`, literal ISO assertions incl. DST dates `2026-10-04`, `2026-04-05`: e.g. `sydneyInstant(2026,10,4,9).toISOString() === "2026-10-03T22:00:00.000Z"`).

**e2e** - `tests/e2e/settings.spec.ts` + `owner.ts` + `prepare-db.ts`; owner runs these on the VM only.

---

## Shared Patterns

### Owner guard
**Source:** `src/server/session.ts` (`requireOwner`), used at line 1 of each action in `settings-actions.ts` / `approval-actions.ts`.
**Apply to:** every server action, the Google OAuth start and callback route handlers, the organization page.

### Encrypted secrets
**Source:** `src/server/crypto.ts` (`encrypt(plain, key?)`, `decrypt(cipher, key?)`), used in `github/connections.ts` lines 5, 42, 81.
**Apply to:** Google token blob, iCloud credentials. Never return ciphertext/secrets in DTOs (`getConnections` returns only `last4`, status, login). Only `last4`/ids in audit metadata (line 45).

### Audit
**Source:** `src/server/audit.ts` `audit({ actor, action, target, metadata })` (never throws), or per-handle `aud()` in `approvals.ts` lines 24-30.
**Apply to:** owner event create/edit/delete (D-06: `calendar.event.create|update|delete`, metadata ids not bodies), task writes, connection save/remove.

### Activity + notification emit
**Source:** `src/server/events.ts` `emitActivity(a, n?, handle?)` lines 33-65 (single transaction, pg_notify, never throws).
**Apply to:** sync diffs, reminders, conflicts, auth failure. Shape: `{ type: "x.y", source: "calendar", title, detail?, tone? }` + `{ category, title, body?, actionUrl? }`.

### Error classification
**Source:** `GithubError` (client.ts 5-17) mapped in `approvals.ts` 183-189 and sync catch 244-248.
**Apply to:** `ProviderError` in all calendar paths; fixed user-facing strings, never `err.message` from provider into `lastError`.

### Zod at every boundary
**Source:** `github/sync.ts` lines 12-71 (response schemas with `.nullish()`/`.default([])`), `issue-payload.ts` (tool input), `settings-actions.ts` (action input).
**Apply to:** Google JSON, tool inputs/outputs, server action inputs, ICS size caps.

### Injectable deps for tests
**Source:** `createSync(opts)` and `saveToken(h, id, raw, { fetch, now, key })`; `ToolContext.fetch/now/handle` (types.ts 31-42).
**Apply to:** all new services (`handle`, `fetch`, `emit`, `now`, `provider`).

### Pure Sydney time
**Source:** `src/server/time.ts` (TZ, `sydneyParts`, `sydneyInstant`, `formatHM`, `tzLabel`, `relativeTime`).
**Apply to:** window bounds (D-04), waking hours 08:00-22:00, plan, labels, week Mon-Sun, DST day tests.

### Redaction / summarising
**Source:** `src/server/agents/redact.ts` (16 lines; `redact`, `summarize`), applied in gateway lines 72-73, 203-204 and `executeApproved` line 174.
**Apply to:** calendar tool input/outputs logged to `tool_calls`. Review that description/location fields are acceptable (private, not secret) and tokens never present.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/server/calendar/caldav/provider.ts` (tsdav + ical.js use) | service | CRUD/sync | No CalDAV/iCal code exists; use RESEARCH Pattern 3 (If-Match/If-None-Match PUT, edit parsed component, never regenerate). Error mapping can mirror `github/client.ts` |
| `src/server/calendar/expand.ts`, `recurrence-edit.ts` | utility | transform | No recurrence logic exists; RESEARCH Pattern 2/3 recurring-edit table, ical.js `RecurExpansion`; spike with fixtures first (A7) |
| `src/app/api/connections/google/{start,callback}/route.ts` | route handler | OAuth redirect | No OAuth-provider route exists besides better-auth (`src/app/api/auth/[...all]/route.ts`); closest structural analog is a plain route handler like `src/app/api/health/route.ts`; check `src/proxy.ts` and Next docs for cookie/redirect behaviour |
| Calendar grid/month/now-line components | component | render | Nothing comparable in `src/`; design `design/Organization.dc.html` + UI-SPEC are the source; primitives from `src/ui/*` |
| Google OAuth consent screen / `ts.net` redirect | external | - | Owner action; human-verify checkpoint (RESEARCH Pitfall 3) |

## Metadata

**Analog search scope:** `src/server/**`, `src/worker/**`, `src/settings/**`, `src/approvals/**`, `src/ui/**`, `src/shell/**`, `src/lib/**`, `src/app/(os)/**`, `tests/{unit,db,helpers,fixtures}`, `drizzle/`
**Files read in full or in relevant part:** ~30
**Pattern extraction date:** 2026-10-09
