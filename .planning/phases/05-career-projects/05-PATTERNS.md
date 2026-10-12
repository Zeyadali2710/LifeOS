# Phase 5: Career + Projects - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 40 (new/modified)
**Analogs found:** 36 / 40 (4 UI-only components have only primitive-level analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/server/db/schema.ts` (add projects, milestones, task_dependencies, project_dependencies, project_links; `tasks.milestoneId` + FK; `githubRepos.languages`) | model | CRUD | same file, Phase 4 block L424-501 + Phase 3 block L331-422 | exact |
| `drizzle/0005_projects.sql` + `drizzle/meta/0005_snapshot.json` + `_journal.json` | migration | batch | `drizzle/0003_organization.sql`, `0004_one_default_calendar.sql` | exact |
| `src/server/github/sync.ts` (languages call) | service | event-driven/batch | same file L153-235 (`cond()` loop) | exact |
| `src/lib/project-types.ts` | model (client-safe consts/DTOs) | transform | `src/lib/calendar-types.ts` (`TaskDTO`, `toTaskDTO`) | exact |
| `src/lib/project-payload.ts` | utility (zod) | request-response | `src/lib/task-payload.ts` | exact |
| `src/lib/project-rules.ts` | utility (pure) | transform | `src/organization/plan-skips.ts`, `src/server/home.ts` (`lead()`), `src/lib/safe-url.ts` | role-match |
| `src/lib/task-payload.ts` (add projectId/milestoneId) | utility | request-response | itself | exact |
| `src/lib/calendar-types.ts` (`TaskDTO` + project/milestone ids) | model | transform | itself L64-114 | exact |
| `src/server/projects.ts` | service | CRUD | `src/server/tasks.ts` | exact |
| `src/server/project-actions.ts` | controller (server actions) | request-response | `src/server/task-actions.ts` | exact |
| `src/server/career.ts` | service (queries) | CRUD read | `src/server/agents/tools/github.ts` (`ciStatus`, `recentCommits` queries); `src/server/calendar/queries.ts` | role-match |
| `src/server/tasks.ts` (project/milestone write) | service | CRUD | itself | exact |
| `src/server/agents/tools/projects.ts` | service (tool) | request-response | `src/server/agents/tools/calendar.ts` `tasks.list` + `tools/github.ts` | exact |
| `src/server/agents/tools/index.ts`, `registry.ts`, `docs/agents.md` | config | n/a | themselves | exact |
| `src/server/palette-actions.ts`, `src/shell/palette-items.ts`, `src/shell/palette.tsx` | provider/utility | request-response | themselves (tasks scope) | exact |
| `src/server/home.ts` / `src/app/(os)/page.tsx` (Active projects) | page/service | CRUD read | `src/app/(os)/page.tsx` L112-125 `Section` | role-match |
| `src/app/(os)/career/page.tsx` | page (RSC) | request-response | `src/app/(os)/organization/page.tsx` | role-match |
| `src/app/(os)/career/[owner]/[repo]/page.tsx` | page (dynamic RSC) | request-response | `src/app/(os)/agents/[agentId]/page.tsx` | exact |
| `src/app/(os)/projects/page.tsx` | page (RSC + searchParams) | request-response | `src/app/(os)/organization/page.tsx` | exact |
| `src/app/(os)/projects/[id]/page.tsx` | page (dynamic RSC) | request-response | `src/app/(os)/agents/[agentId]/page.tsx` | exact |
| `src/career/*` (RepoCard, LanguageBar, Sparkline, ActivityFeed) | component | request-response | `src/agents/agent-card.tsx`, `src/shell/activity-list.tsx` | role-match |
| `src/projects/*` (ProjectCard, ProgressRing, HealthDot, TimelineStrip, BlockersList, WorkspaceCard) | component | request-response | `src/agents/agent-card.tsx`, `src/ui/progress.tsx`, `src/ui/status-dot.tsx` | role-match |
| `src/projects/*-dialog.tsx` (Project/Milestone/Link, DependencyPicker) | component (client dialog) | CRUD | `src/organization/task-dialog.tsx` | exact |
| `src/projects/status.ts` (HEALTH, PROJECT_STATUS, CI maps) | config | n/a | `src/shell/notification-meta.ts`, `src/lib/calendar-categories.ts` | role-match |
| `src/organization/task-dialog.tsx` (project/milestone selects) | component | CRUD | itself | exact |
| `src/shell/domain-page.tsx` | component | n/a | remains for other domains; Career/Projects pages stop using it | n/a |
| `src/ui/icon-names.ts` (+8 glyphs) | config | n/a | itself; `tests/unit/icons.test.ts` | exact |
| `tests/unit/project-rules.test.ts` | test | transform | `tests/unit/home.test.ts`, `tests/unit/plan-skips.test.ts` | role-match |
| `tests/db/schema-projects.test.ts` | test | CRUD | `tests/db/schema-organization.test.ts` | exact |
| `tests/db/project-dependencies.test.ts`, `project-actions.test.ts`, `project-queries.test.ts`, `career-queries.test.ts` | test | CRUD | `tests/db/tasks.test.ts` | exact |
| `tests/db/project-tools.test.ts` | test | request-response | `tests/db/github-tools.test.ts` | exact |
| `tests/db/github-sync.test.ts` (extend languages) | test | batch | itself | exact |

## Pattern Assignments

### `src/server/db/schema.ts` (model, CRUD)

**Analog:** same file. Conventions: `uuid().primaryKey().defaultRandom()`, `...timestamps` spread, Sydney dates as `text`, FK via `.references(() => x.id, { onDelete })`, partial unique index via `uniqueIndex("name").on(...).where(sql\`...\`)`.

**Existing table with the reserved column to convert to FK** (L484-501):
```ts
export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    ...
    completedAt: tstz(),
    projectId: uuid(), // nullable, no FK until Phase 5 (D-10)
    ...timestamps,
  },
  (t) => [index().on(t.completedAt, t.dueAt), index().on(t.remindAt)],
);
```
Change to `projectId: uuid().references(() => projects.id, { onDelete: "set null" })`, add `milestoneId` the same way. `projects`/`milestones` must be declared ABOVE `tasks` (or use lazy `() =>` ref, already lazy) and the generated SQL must create `projects` before `ALTER TABLE tasks ADD CONSTRAINT` (research P5).

**FK + partial unique index + composite index idiom** (L348, L443-447, L368):
```ts
const repoRef = () => bigint({ mode: "number" }).references(() => githubRepos.id, { onDelete: "cascade" });
(t) => [
  uniqueIndex().on(t.connectionId, t.remoteId),
  uniqueIndex("calendars_one_default_idx").on(t.isDefault).where(sql`${t.isDefault}`),
]
```
Use `repoRef()` for `project_links.repoId`; use the `.where(sql\`...\`)` form for `(project_id, repo_id) WHERE repo_id IS NOT NULL`. Add CHECK constraints via drizzle `check()` (import from `drizzle-orm/pg-core`); none exist yet in schema.ts, so verify drizzle-kit emits them.

**githubRepos languages** (L332-346): add `languages: jsonb().$type<Record<string, number> | null>(),` (null = not fetched). Existing jsonb idiom: `jsonb().$type<string[]>().default([])`.

---

### `drizzle/0005_projects.sql` (migration)

**Analog:** `drizzle/0003_organization.sql` (drizzle-kit output: `CREATE TABLE "x" (... "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, ... "created_at" timestamp with time zone DEFAULT now() NOT NULL)` separated by `--> statement-breakpoint`). Journal entry format (`drizzle/meta/_journal.json` tail):
```json
{ "idx": 4, "version": "7", "when": 1791769003895, "tag": "0004_one_default_calendar", "breakpoints": true }
```
Generate with `npm run db:generate`, never hand-write the snapshot. Also the `[BLOCKING]` owner VM migrate step per Phase 4 plan `04-06-PLAN.md`. Verify `tests/db/migrations.test.ts`.

---

### `src/server/github/sync.ts` languages call (service, batch)

**Analog:** same file. Insert inside `for (const r of active)` after the runs block (before L235 `}`), reusing `cond()` (L100-109) with save-after-persist (see L187, L201, L212, L234 ordering):
```ts
const pullRes = await cond(`${base}/pulls?state=all&sort=updated&per_page=50`, z.array(Pull));
...
await pullRes?.save();
```
New block (per research Pattern 3, wrapped for `not_found` so one 404 does not abort the sync; `GithubError` already imported L9):
```ts
try {
  const langRes = await cond(`${base}/languages`, z.record(z.string(), z.number().int().nonnegative()));
  if (langRes) {
    await h.update(githubRepos).set({ languages: langRes.data }).where(eq(githubRepos.id, r.id));
    await langRes.save();
  }
} catch (e) {
  if (!(e instanceof GithubError && e.kind === "not_found")) throw e;
}
```
Also raise commits `per_page=20` to `100` at L203 (sparkline). Note: the repo `row` upsert (L138-142) uses `onConflictDoUpdate set: row`; do NOT add `languages` to `row` or each sync would clobber it with undefined/null. Extend `tests/db/github-sync.test.ts` using `fakeGithub` route key `"GET /repos/o/r/languages"` (fixtures in `tests/fixtures/github/`).

---

### `src/lib/project-payload.ts` (utility, zod, client-safe)

**Analog:** `src/lib/task-payload.ts` (full file shown).
```ts
import { z } from "zod";
// Client-safe: no server imports.
export const taskInput = z
  .object({
    title: z.string().trim().min(1, "Add a title.").max(200, "Title must be 200 characters or fewer."),
    dueDate: z.iso.date("Enter a valid date.").nullable().default(null), // rejects 2026-02-31
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.dueTime && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueTime"], message: "Add a due date before choosing a time." });
  });
export type TaskInput = z.infer<typeof taskInput>;
```
Copy: first-issue-per-field message style, `z.iso.date`, `// Client-safe` header, `priority` literal union (1|2|3 matches P1-P3). Add `workspacePath` refine rejecting `"`, backtick, `$`, `\r`, `\n`; link URL refine `^https?://` (also see `isSafeUrl` in `src/lib/safe-url.ts`, https-only and credential-free). Extend `taskInput` with `projectId: z.uuid().nullable().default(null)`, `milestoneId` likewise.

---

### `src/server/projects.ts` (service, CRUD)

**Analog:** `src/server/tasks.ts`. Signature convention `(h: DB, ..., now: Date)`; audit helper with `{id}`-only metadata; `parse()` collecting `FieldErrors`; `notifyLive` after writes.

**Imports + audit + parse** (L1-42):
```ts
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { FieldErrors } from "./agents/approvals";
import type { DB } from "./db/client";
import { auditLog, tasks } from "./db/schema";
import { emitActivity, notifyLive } from "./events";
import { log } from "./log";

async function aud(h: DB, action: string, id: string) {
  try {
    await h.insert(auditLog).values({ actor: "owner", action, target: id, metadata: { id } });
  } catch (err) {
    log.error({ err, action }, "audit write failed");
  }
}
function parse(raw: unknown, now: Date, prevRemindAt?: Date | null) {
  const p = taskInput.safeParse(raw);
  const errors: FieldErrors = {};
  if (!p.success) {
    for (const i of p.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors };
  }
  ...
  return Object.keys(errors).length ? { errors } : { data: p.data, remindAt };
}
```
**Create/update/delete shape** (L44-108): `insert().values().returning()` -> `aud(...)` -> `notifyLive(h, "task", id)` -> `{ ok: true, task: toTaskDTO(row!) }`; update returns `{ ok:false, error:"not_found" }` when missing; `deleteTask` returns `{ ok: boolean }` from `.delete().returning({id})`. Result type: `export type TaskResult = { ok: true; task: TaskDTO } | { ok: false; errors: FieldErrors };`.

**Activity event** (meaningful changes only; copy emitActivity call from L134-139):
```ts
await emit({ type: "task.reminder", source: "calendar", title: "Reminder", detail: r.title }, undefined, h);
```
Use `{ type: "project.created", source: "projects", ... }` (check `ActivityInput` `source` union in `src/server/events.ts` / `src/lib/live-types.ts` and extend if `"projects"` is absent). `emitActivity` never throws.

**Cycle check** (no analog, use research Pattern 1): `h.transaction(async tx => { await tx.execute(sql\`select pg_advisory_xact_lock(hashtext('task_deps'))\`); const r = await tx.execute(sql\`WITH RECURSIVE reach(id) AS (...)\`); ... })`. Return `{ ok:false, errors:{ blockedBy:"This would create a circular dependency." } }`.

**Delete guard** (D-05/P7): count tasks/milestones/links before `delete`; return field error otherwise.

---

### `src/server/project-actions.ts` (server actions)

**Analog:** `src/server/task-actions.ts` (copy whole structure; every exported action begins with `await requireOwner()`; only async functions exported).
```ts
"use server";
import { z } from "zod";
import { db } from "./db/client";
import { log } from "./log";
import { requireOwner } from "./session";
const uuid = z.uuid();

async function run(fn: () => Promise<Result | { ok: boolean; error?: "not_found" }>): Promise<Result> {
  try {
    return (await fn()) as Result;
  } catch (err) {
    log.error({ err }, "task action failed"); // never log task contents
    return { ok: false, error: "failed" };
  }
}
export async function updateTaskAction(rawId: string, raw: unknown): Promise<Result> {
  await requireOwner();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { ok: false, error: "not_found" };
  return run(() => updateTask(db(), id.data, raw, new Date()));
}
```
Delete variant (L43-53) uses its own try/catch returning `{ ok:true } | { ok:false; error }`. Task dependency actions (`addTaskDependencyAction` etc.) live here too.

---

### `src/server/career.ts` (service, read queries)

**Analog:** query shapes in `src/server/agents/tools/github.ts`. Default-branch latest-run per repo (L157-168) is the exact SQL idiom for CI health:
```ts
const runs = await ctx.handle
  .selectDistinctOn([githubWorkflowRuns.repoId], { repoId: githubWorkflowRuns.repoId, branch: githubWorkflowRuns.branch, status: ..., conclusion: ... })
  .from(githubWorkflowRuns)
  .innerJoin(githubRepos, and(eq(githubRepos.id, githubWorkflowRuns.repoId), eq(githubRepos.defaultBranch, githubWorkflowRuns.branch)))
  .orderBy(githubWorkflowRuns.repoId, desc(githubWorkflowRuns.ghCreatedAt));
```
But Phase 5 `ciHealth` must skip in-progress/cancelled runs (P8), so fetch the latest ~5 runs per repo and let `project-rules.ts` decide rather than `selectDistinctOn`. Commits: `.orderBy(desc(githubCommits.committedAt))` (L132-137). PR/issue counts: filter `eq(githubPullRequests.state, "open")` at query time (P2). `repoNames` map helper (L61-62) for the activity feed. Repo lookup by `fullName` (L24-28):
```ts
const [r] = await ctx.handle.select().from(githubRepos).where(eq(githubRepos.fullName, repo));
```
Owner/repo param regex (L13): `/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/` (validate each segment in the page before querying). GitHub links via `isSafeGithubUrl` from `src/lib/safe-url.ts`.

---

### `src/app/(os)/projects/[id]/page.tsx` and `career/[owner]/[repo]/page.tsx` (dynamic RSC)

**Analog:** `src/app/(os)/agents/[agentId]/page.tsx` (full file):
```tsx
import { notFound } from "next/navigation";
import { AgentDetail } from "@/agents/agent-detail";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Agent · LifeOS" };

export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  await requireOwner();
  const { agentId } = await params;
  const d = await agentDetail(db(), agentId);
  if (!d) notFound();
  return <AgentDetail {...d} agent={agent} />;
}
```
Add `z.uuid().safeParse(id).success` guard before the query (P3). Add `export const dynamic = "force-dynamic";` as in organization page. Read `node_modules/next/dist/docs/01-app` first (AGENTS.md).

---

### `src/app/(os)/projects/page.tsx` and `career/page.tsx` (RSC with searchParams)

**Analog:** `src/app/(os)/organization/page.tsx`:
```tsx
export const metadata = { title: "Organization · LifeOS" };
export const dynamic = "force-dynamic";
export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; event?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const now = new Date();
  const today = sydneyYmd(now);
  const view = (VIEWS.includes(sp.view ?? "") ? sp.view : "week") as View;   // whitelist query params
  ...
  return (<div className="mx-auto max-w-[1600px]"><OrganizationView ... /></div>);
}
```
Whitelist `category`/`sort`/`milestone` params the same way; honor `?new=project` (mirrors `?new=task`; see how organization-view consumes `new=`). Container width for Phase 5 is `mx-auto max-w-[1480px]` (matches `DomainPage`). Header: `PageHeader title lead eyebrow={{ text, className }}` as in `src/shell/domain-page.tsx`. Current stubs to replace: `src/app/(os)/projects/page.tsx` (DomainPage, eyebrowClass `text-cyan`) and `career/page.tsx`.

**Sync now button** (Career): reuse `syncNowAction` (`src/server/settings-actions.ts` L80-91) with the client pattern in `src/settings/connections-section.tsx` L76 / L137.

---

### `src/projects/*-dialog.tsx` (client dialogs)

**Analog:** `src/organization/task-dialog.tsx`. Copy: `"use client"`, outer wrapper that remounts per open (`key`), `useShell().toast`, `useRouter().refresh`, client-side `safeParse` before action, error map by first issue path, `busy` guard against double-submit, dirty-check discard confirm.
```tsx
export function TaskDialog({ open, task, initialTitle = "", onClose }: {...}) {
  if (!open) return null;
  return <Form key={task?.id ?? "new"} task={task} initialTitle={initialTitle} onClose={onClose} />;
}
...
const snap = JSON.stringify([title, date, time, priority, notes, remind, custom, done]);
const [initial] = useState(snap);
const close = () => (snap !== initial ? setDiscard(true) : onClose());
const submit = async () => {
  if (busy) return; // Enter during the round-trip must not create a second task
  const parsed = taskInput.safeParse({...});
  const errs: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
```
Imports: `Button` `@/ui/button`, `Dialog` `@/ui/dialog`, `{ Checkbox, Field, Input, Select, Textarea }` `@/ui/field`. For the task dialog itself add two `Select`s (project, milestone filtered by project) and include `projectId`/`milestoneId` in the `snap` and the `taskInput.safeParse` object.

---

### `src/server/agents/tools/projects.ts` (tool, READ)

**Analog:** `src/server/agents/tools/calendar.ts` L112-126 (`tasks.list`, `calRead(...)`) and `github.ts` L9-22 (envelope/`cut`/limit):
```ts
const MAX_STR = 2000;
const cut = (s: string | null | undefined) => (s ?? "").slice(0, MAX_STR);
const limit = z.number().int().min(1).max(50).default(20);
// tool shape
{ name: "github.list_repos", label, description, input, output, tier: "READ", sideEffect: false, resolve?, handler(i, ctx) }
...
export const githubTools: Record<string, Tool<any, any>> = Object.fromEntries([...].map((t) => [t.name, t]));
```
Use `ctx.handle`, `ctx.now()`. Output must exclude `workspacePath`. Register: `src/server/agents/tools/index.ts`:
```ts
export const TOOLS = { ...githubTools, ...calendarTools, [delegateTool.name]: delegateTool };
```
add `...projectTools`. In `src/server/agents/registry.ts` append `"projects.list", "projects.get"` to the `id: "projects"` agent `tools` array (L127-135), update `PROJECTS_PROMPT` (L48-54) and the orchestrator delegation line (L40). Test: copy `tests/db/github-tools.test.ts` (L1-45: `vi.mock("@/server/agents/registry", ...)`, `callTool({ handle, runId, agentId, tools, now }, name, input, id)`); also run `tests/unit/agent-contracts.test.ts`.

---

### Palette (`src/shell/palette-items.ts`, `src/server/palette-actions.ts`, `src/shell/palette.tsx`)

**Analog:** the existing tasks scope in the same files. Edits:
```ts
export type PaletteGroup = { label: "Ask LifeOS" | "Commands" | "Jump to" | "Events" | "Tasks"; ... };  // add "Projects"
export type PaletteData = { events: PaletteHit[]; tasks: PaletteHit[] };                                // add projects
export type PaletteScope = "all" | "events" | "tasks";                                                  // add "projects"
{ id: "cmd-new-task", label: "New task", icon: "task_alt", run: { type: "nav", href: "/organization?new=task" } },  // add cmd-new-project -> /projects?new=project
const hits = (label: "Events" | "Tasks", icon, list) => ...                                             // widen label union
```
Scope filters at L64-66 (`scope !== "tasks"` etc.) must become scope-aware for three scopes. `const EMPTY: PaletteData = { events: [], tasks: [] }` in palette-actions.ts L10 gains `projects: []`. Add a parameterised `ilike` with escaped `%`/`_`, limit 4; errors logged without the query (`log.error({ err }, "palette search failed")`). Update `tests/unit/palette.test.ts`.

---

### Home Active projects (`src/app/(os)/page.tsx` L112-125, `src/server/home.ts`)

**Analog:** the existing `<Section id="h-projects" label="Active projects" ... title="No projects yet." body=...>` empty state, and the sibling agent-activity block right after it (`SectionHeader` + `<ul className="glass-card rounded-24 p-2">`). Replace `Section` with real list when `loadActiveProjects(h, now)` returns rows; keep `Section` as the empty state (update body to link to New project). Note `src/server/home.ts` currently holds pure line helpers (`dateLine`, `lead`) tested by `tests/unit/home.test.ts`; put `loadActiveProjects` in `src/server/projects.ts` instead and keep home.ts pure.

---

### Components (`src/career/*`, `src/projects/*`)

**Analogs:** `src/agents/agent-card.tsx` (glass card w/ link + status), `src/shell/activity-list.tsx` (list container `glass-card rounded-24 p-2`, row `rounded-16 px-3 py-2.5`, `lo-in` for new rows), `src/ui/progress.tsx`, `src/ui/status-dot.tsx`, `src/ui/badge.tsx`, `src/ui/empty-state.tsx`, `src/ui/section-header.tsx`, `src/ui/status-tile.tsx`. Conventions: components live in a domain folder (`src/organization/*`), no tokens beyond `glass-card`, `rounded-24/16/14`; run `bash scripts/glass-gate.sh`. Status maps in one file `src/projects/status.ts` (analog `src/shell/notification-meta.ts`). Add icon names to `src/ui/icon-names.ts` and regenerate the symbol subset (`scripts/fetch-symbols.mjs`, `tests/unit/icons.test.ts`).

## Shared Patterns

### requireOwner on every page and action
**Source:** `src/server/session.ts` (used in `task-actions.ts` L25 and `agents/[agentId]/page.tsx` L10)
**Apply to:** all new pages and every exported server action
```ts
await requireOwner();
```

### Audit (metadata is `{id}` only)
**Source:** `src/server/tasks.ts` L14-20 (`aud`)
**Apply to:** `src/server/projects.ts` mutations (`project.create|update|archive|delete`, `milestone.*`, `project_link.*`, `dependency.add|remove`)

### Action error plumbing
**Source:** `src/server/task-actions.ts` L15-22 (`run()`), L13 `uuid = z.uuid()`
**Apply to:** `project-actions.ts`; return `{ ok:false, error:"failed" | "not_found" }`, never log contents.

### Field errors
**Source:** `src/server/tasks.ts` L30-42 (`FieldErrors` from `./agents/approvals`, first issue per path key)
**Apply to:** all payload parsing in `projects.ts`.

### Sydney dates
**Source:** `src/server/calendar/free-slots.ts` L12-17 (`sydneyYmd(d)`, `addDaysYmd(ymd, n)`), `src/server/tasks.ts` `deriveDueAt`
**Apply to:** `project-rules.ts` (`today` is a param, never `new Date()` inside), sparkline buckets, overdue. `project-rules.ts` must stay client-safe, so import nothing from `src/server/*`; pass `sydneyYmd` results in as arguments, or duplicate the 5-line helper in a client-safe file if rules need `addDays`.

### Safe URLs
**Source:** `src/lib/safe-url.ts` (`isSafeGithubUrl`, `isSafeUrl`)
**Apply to:** GitHub links on RepoCard/detail/activity (`isSafeGithubUrl`), project `url` links (`isSafeUrl` + zod `^https?://`), always `rel="noopener noreferrer"`.

### Activity + live
**Source:** `src/server/events.ts` (`emitActivity(a, n?, handle?)`, `notifyLive(h, kind, id)`)
**Apply to:** project created/archived/milestone done/blocked/unblocked only.

### DB tests (VM only)
**Source:** `tests/db/tasks.test.ts` L1-12 (`setupTestDb()`, `t.handle()`, fixed `NOW`, `actions()` audit helper); `tests/db/schema-organization.test.ts` for constraint/cascade tests (`await expect(...).rejects.toThrow()`). Run via `bash scripts/vm-db-test.sh <files>`; unit tests locally with `npx vitest run tests/unit/...`.

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| Recursive-CTE cycle detection in `projects.ts` | service | CRUD | No raw `sql` recursive queries or `pg_advisory_xact_lock` exist yet; use RESEARCH Pattern 1 (drizzle `sql` template, params) |
| CHECK constraints in `schema.ts` | model | n/a | No `check()` used so far; verify drizzle-kit 0.31 output |
| `ProgressRing`, `Sparkline` (inline SVG), `LanguageBar`, `TimelineStrip` | component | transform | No SVG/chart components exist; build from CSS/inline SVG per UI-SPEC (analog only `src/ui/progress.tsx` for props/aria) |
| Clipboard copy button (`WorkspaceCard`) | component | event-driven | No `navigator.clipboard` usage found in the codebase; guard for non-secure context (RESEARCH A7) |

## Metadata

**Analog search scope:** `src/server`, `src/server/agents/tools`, `src/lib`, `src/organization`, `src/shell`, `src/app/(os)`, `src/ui`, `drizzle/`, `tests/db`, `tests/unit`
**Files scanned:** ~330 tracked files listed; 16 read in full or in excerpt
**Pattern extraction date:** 2026-10-12
