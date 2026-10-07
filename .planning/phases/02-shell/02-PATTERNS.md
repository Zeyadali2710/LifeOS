# Phase 2: Shell - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** ~45 new/modified (grouped below)
**Analogs found:** 17 grouped files with a real analog / 24 groups. The codebase is small (Phase 1 only: 26 src files). Most UI has no analog; the design/ folder and UI-SPEC are the source.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/app/globals.css` (modify) | config | n/a | itself (`@theme inline`, lines 34+) | exact |
| `src/app/layout.tsx` (modify: localFont, themeColor, `symbols.variable`) | layout | n/a | itself | exact |
| `src/app/(os)/layout.tsx` (modify to AppShell host) | layout | request-response | itself (`requireOwner` + children) | exact |
| `src/app/(os)/page.tsx` (rewrite Home) | page (server) | request-response | itself (greeting/date/health) | exact |
| `src/app/(os)/{career,socials,outreach,organization,projects,knowledge,goals,agents,approvals,settings}/page.tsx` | page | request-response | `src/app/(os)/page.tsx` | role-match |
| `src/app/(os)/{template,loading,error}.tsx` | route convention | n/a | none | none |
| `src/app/api/events/route.ts` | route handler | streaming | `src/app/api/health/route.ts` (shape) + RESEARCH Pattern 1 | partial |
| `src/app/api/{activity,notifications}/route.ts` | route handler | request-response | `src/app/api/health/route.ts` | role-match |
| `src/server/events.ts` (emitActivity) | service | event-driven | `src/server/audit.ts` | exact (same never-throw contract) |
| `src/server/hub.ts` | service | pub-sub | none (RESEARCH Pattern 2) | none |
| `src/server/monitor.ts` + `src/instrumentation.ts` | service | batch/polling | `src/server/health.ts` + `src/worker/index.ts` | partial |
| `src/server/notifications.ts` (queries + `'use server'` actions) | service | CRUD | `src/server/health.ts` (drizzle select/settings) + `src/server/session.ts` | role-match |
| `src/server/weather.ts` | service | request-response | none (RESEARCH "Weather") | none |
| `src/server/time.ts` (Sydney helpers, greeting, groups, snooze presets) | utility | transform | greeting() + Intl in `src/app/(os)/page.tsx:4-9` | partial |
| `src/server/auth.ts` (modify hook) | middleware/hook | event-driven | itself lines 35-48 | exact |
| `src/worker/index.ts` (modify: worker started) | worker | event-driven | itself lines 15-25 | exact |
| `src/scripts/migrate.ts` (modify: count delta) | script | batch | itself | exact |
| `src/proxy.ts` (check only; `/api/events` is covered, no change expected) | middleware | request-response | itself | exact |
| `src/ui/button.tsx` (rewrite variants) | component | n/a | itself | exact |
| `src/ui/{icon,icon-names,badge,kbd,empty-state,inline-error,skeleton,section-header,status-tile}.tsx` | component | n/a | `src/ui/button.tsx` (props + class composition) | role-match |
| `src/shell/*` (AppShell, ShellProvider, Sidebar, NavItem, TopBar, BottomBar, MoreSheet, CommandBar, Palette, AIPanel, NotificationsDrawer, SnoozeMenu, Toast, ActivityList, live client) | client composites | event-driven | `src/app/(os)/sign-out.tsx`, `src/app/login/login-form.tsx` (client conventions) | partial |
| `src/app/(os)/sign-out.tsx` (reuse inside palette/MoreSheet) | client component | request-response | itself | exact |
| `src/app/fonts/material-symbols-outlined.woff2`, `scripts/fetch-symbols.mjs` | asset/script | file-I/O | none | none |
| `tests/unit/{time,home,palette,live,weather,icons,safe-url}.test.ts` | test | transform | `tests/unit/client-ip.test.ts` | exact |
| `tests/db/{events,hub,notifications,monitor,notification-actions}.test.ts` + `tests/db/helpers.ts` | test | CRUD/event | `tests/db/migrations.test.ts` | exact |
| `tests/e2e/{shell-nav,palette,home,live-activity,notifications,a11y-shell}.spec.ts` | test | e2e | `tests/e2e/auth.spec.ts` + `tests/e2e/owner.ts` | exact |

## Pattern Assignments

### `src/server/events.ts` (service, event-driven)

**Analog:** `src/server/audit.ts` (whole file, 20 lines). Copy the never-throw contract and import style.

```typescript
import { db } from "./db/client";
import { auditLog } from "./db/schema";
import { log } from "./log";

// Audit writes must never break the action being audited; failures are logged loudly instead.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db().insert(auditLog).values(entry);
  } catch (err) {
    log.error({ err, action: entry.action }, "audit write failed");
  }
}
```

New file: same imports with `activityEvents`, `notifications` from `./db/schema`, `sql` from `drizzle-orm`, body per RESEARCH Pattern 3 (transaction + `pg_notify`). Must not import `next/*` (worker is esbuild-bundled). Schema: `activity_events` (`type`, `source`, `title`, `payload` jsonb; `src/server/db/schema.ts:89-102`), `notifications` (`category`, `source`, `title`, `body`, `actionUrl`, `activityEventId`, `readAt`, `snoozedUntil`, `dismissedAt`; lines 113-131).

---

### `src/server/auth.ts` hook (modify)

**Analog:** itself, lines 35-48. Add `emitActivity(...)` immediately after `await audit({...})`, inside the same hook (already filtered to `/sign-in/email` and `/sign-out`; `failed = returned instanceof Error`).

```typescript
hooks: {
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-out") return;
    const ip = clientIp(ctx.request?.headers);
    const returned = ctx.context.returned;
    const failed = returned instanceof Error;
    await audit({ actor: failed ? "anonymous" : "owner", action: ctx.path === "/sign-out" ? "auth.sign_out" : failed ? "auth.sign_in_failed" : "auth.sign_in", ip, metadata: ... });
    // + await emitActivity({ type: "auth.sign_in_failed" ... }, failed ? { category: "URGENT", ... } : undefined)
  }),
},
```
No email/IP/UA in activity text. Throttle failed-sign-in notification (RESEARCH Pattern 7).

---

### `src/worker/index.ts` (modify)

**Analog:** itself. Insert after `await beat();` (line 24), before/at `log.info("worker started")`:
```typescript
  await beat();
  log.info("worker started");
```
Path-alias imports `@/server/...` and `log` usage already in file; add `import { emitActivity } from "@/server/events";`.

### `src/scripts/migrate.ts` (modify)

**Analog:** itself (12 lines). Pattern is `runMigrations(env().DATABASE_URL).then(log).catch(log.fatal + process.exit(1))`. Wrap with before/after count of `drizzle.__drizzle_migrations`, then `emitActivity` when delta > 0. Note `emitActivity` uses `db()` (env DATABASE_URL), fine after migrate.

---

### `src/server/monitor.ts` + `src/instrumentation.ts` (service, polling)

**Analog:** `src/server/health.ts` (inputs) and settings upsert from `src/worker/index.ts:10-13`:

```typescript
await db().insert(settings).values({ key: HEARTBEAT_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
```
```typescript
export async function checkHealth(now = Date.now()): Promise<Health> { ... } // Health = { status, db, worker, version }
```
Use the same `settings` table for `health.last` and `app.version` CAS (RESEARCH Pattern 6). Lazy `db()`/`env()` only inside functions (no import-time env). No analog for `instrumentation.ts` register(); follow RESEARCH Pattern 6.

---

### `src/app/api/events/route.ts`, `api/activity/route.ts`, `api/notifications/route.ts` (route handlers)

**Analog:** `src/app/api/health/route.ts` (shape), plus session check from `src/server/session.ts`:

```typescript
import { checkHealth } from "@/server/health";
export const dynamic = "force-dynamic";
export async function GET() {
  const health = await checkHealth();
  return Response.json(health, { status: ..., headers: { "cache-control": "no-store" } });
}
```
Unlike health (public), these are authenticated: `const session = await auth().api.getSession({ headers: request.headers }); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });` (matches 401 JSON shape in `src/proxy.ts:29`). Do not use `requireOwner()` in route handlers (it redirects and uses `next/headers`). SSE body per RESEARCH Pattern 1 (`no-transform` header). `/api/events` is not in `PUBLIC_PATHS` in `src/proxy.ts:5`, so proxy 401s cookie-less requests already.

---

### `src/app/(os)/layout.tsx` (modify to AppShell)

**Analog:** itself. Keep `await requireOwner()` first; add `(await cookies()).get("lo_nav")` and pass `ownerName`, version, initial counts into client `AppShell`.

```typescript
import { requireOwner } from "@/server/session";
import { SignOut } from "./sign-out";
export default async function OsLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (...<header>LIFEOS <SignOut/></header><main>{children}</main>...);
}
```
`requireOwner` is `cache()`-wrapped so layout + page share one lookup (`src/server/session.ts:8`).

### `src/app/(os)/page.tsx` Home and domain placeholder pages

**Analog:** itself. Server component, `await requireOwner()`, `checkHealth(now.getTime())`, Sydney `Intl` greeting. Reusable excerpts (move to `src/server/time.ts`):

```typescript
const TZ = "Australia/Sydney";
function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
const firstName = user.name.split(" ")[0];
```
Conflict: existing returns "Good night" for hour < 5; UI-SPEC says morning <12, afternoon <18, else evening (no "night"). Follow UI-SPEC, and pin with a unit test. The existing `Status` tone map (`ok/stale/degraded/down/unknown`) maps to StatusTile dots. Placeholder domain pages: each `await requireOwner()` is not needed (layout guards) but the existing convention is per-route; keep the layout guard and render `PageHeader` + `EmptyState`.

Existing e2e `tests/e2e/auth.spec.ts` asserts `h1` contains "Ada." and text "Database" visible; the rewrite will break the "Database" assertion (line ~33). Update that test.

---

### `src/ui/button.tsx` (rewrite) and new primitives

**Analog:** itself (17 lines). Conventions: named export, `ButtonHTMLAttributes` extended, template-literal class composition, `className` passthrough, spread `{...props}`.

```typescript
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" };
const variants = { primary: "bg-signal text-bg ...", ghost: "text-fg-muted hover:text-fg hover:bg-bg-raised" };
export function Button({ variant = "primary", className = "", ...props }: Props) {
  return <button className={`inline-flex h-10 ... ${variants[variant]} ${className}`} {...props} />;
}
```
Callers to keep compiling: `src/app/login/login-form.tsx` (`<Button type="submit" ... className="w-full">`) and `sign-out.tsx` (`variant="ghost" className="h-8 px-3"`). Legacy colour aliases (`bg-signal`, `text-fg-muted`, `border-line`, `text-danger`) are used by login-form.tsx line 9/44 and `login/page.tsx`; UI-SPEC keeps aliases in `@theme inline` until migrated.

---

### `src/app/globals.css` (modify)

**Analog:** itself. Pattern is `:root` vars + `@theme inline { --color-x: var(--x) }`. Replace lines 3-32 (including the `prefers-color-scheme: light` block, D-03) with UI-SPEC "Design Tokens" block; keep `@import "tailwindcss";` and `@theme inline`.

### `src/app/layout.tsx` (modify)

**Analog:** itself. Geist loaded via `next/font/google` with `variable`; add `localFont` for symbols the same way and append to `<html className>`:

```typescript
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
<html lang="en" className={`${sans.variable} ${mono.variable}`}>
```
`await headers()` at line 19 must remain (CSP nonce). Change `themeColor` to `#0b0c10`.

---

### Client shell composites (`src/shell/*`)

**Analog:** `src/app/(os)/sign-out.tsx` and `src/app/login/login-form.tsx` for client conventions only:

```typescript
"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";
// await authClient.signOut(); router.replace("/login"); router.refresh();
```
`@/` alias, `"use client"` first line, `useState` for pending/error, `role="alert"` + `aria-live` for errors (login-form.tsx:44). Palette "Sign out" should reuse this signOut call. No analog for ShellProvider, palette, drawer, focus trap, EventSource client; use UI-SPEC and RESEARCH Patterns 4/5.

---

### Tests

**Unit** (`tests/unit/*.test.ts`), analog `tests/unit/client-ip.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/client-ip";
describe("clientIp", () => { it("...", () => { expect(...).toBe(...); }); });
```
vitest includes only `tests/unit/**` and `tests/db/**` `*.test.ts` (`vitest.config.ts`), alias `@` to `src`.

**DB** (`tests/db/*.test.ts`), analog `tests/db/migrations.test.ts` lines 6-23: throwaway database per file; extract into `tests/db/helpers.ts`:
```typescript
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres";
const dbName = `lifeos_test_${randomBytes(4).toString("hex")}`;
const testUrl = Object.assign(new URL(ADMIN_URL), { pathname: `/${dbName}` }).toString();
async function admin(sql: string) { const client = new Client({ connectionString: ADMIN_URL }); await client.connect(); try { await client.query(sql); } finally { await client.end(); } }
beforeAll(() => admin(`create database ${dbName}`));
afterAll(() => admin(`drop database if exists ${dbName} with (force)`));
```
Note: `emitActivity`/`monitor` use `db()` which reads `env().DATABASE_URL`; DB tests need either DI of the db handle or setting `process.env.DATABASE_URL` before the lazy `db()` first call. Make `emitActivity` testable the way RESEARCH suggests (inject, or set env in test). `createHub(url, load)` is already DI.

**E2E** (`tests/e2e/*.spec.ts`), analog `tests/e2e/auth.spec.ts` + `tests/e2e/owner.ts` (`E2E_OWNER = { email, password, name: "Ada Owner" }`). Login steps (auth.spec.ts lines ~26-29): `page.goto("/login")`, `getByLabel("Email").fill`, `getByLabel("Password").fill`, `getByRole("button", { name: "Sign in" }).click()`. Unauthenticated API check: `request.get("/api/anything", { maxRedirects: 0 })` expects 401. Extract a shared `signIn(page)` into `owner.ts`; use per-test `x-forwarded-for` for the 5/min rate limit, and seed the heartbeat (RESEARCH Pitfall 5).

## Shared Patterns

### Owner guard
**Source:** `src/server/session.ts:8-12` (`requireOwner`, `cache()`, `redirect("/login")`).
**Apply to:** `(os)/layout.tsx`, every page, every `'use server'` notification action (first line `await requireOwner()`).
**Exception:** route handlers use `auth().api.getSession({ headers: request.headers })` and return `Response.json({ error: "unauthorized" }, { status: 401 })`.

### Never-throw side effects
**Source:** `src/server/audit.ts:14-20`. **Apply to:** `emitActivity`, monitor ticks, worker/migrate emit calls (wrap, `log.error({ err, ... }, "...")`).

### Lazy env/db
**Source:** `src/server/health.ts` (calls `db()` inside function), `src/server/auth.ts` (`createAuth()` memoised). **Apply to:** all new `src/server/*`: no env/db access at module import so `next build` works.

### Logging
**Source:** `import { log } from "./log"` (pino); `log.error({ err, ctx }, "message")`, `log.info("...")`, `log.fatal` in scripts.

### Imports
`@/` alias everywhere in app/worker/scripts; relative `./` within `src/server/` (audit.ts, auth.ts). Worker is esbuild-bundled: server modules it imports must not import `next/*`.

### API 401 / dynamic
**Source:** `src/proxy.ts:28-30` (cookie-only 401 for `/api/*`), `src/app/api/health/route.ts:3` (`export const dynamic = "force-dynamic"`, `cache-control: no-store`).

### Tailwind v4 token mapping
**Source:** `src/app/globals.css` `@theme inline { --color-*: var(--*) }`. New colours/radii/breakpoints go through this block; keep legacy aliases until login is migrated.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/server/hub.ts` | service | pub-sub | no LISTEN/NOTIFY code yet; use RESEARCH Pattern 2 |
| `src/app/api/events/route.ts` (streaming body) | route | streaming | no streaming route; RESEARCH Pattern 1 |
| `src/instrumentation.ts` | config | startup | none; RESEARCH Pattern 6 |
| `src/server/weather.ts` | service | request-response (external fetch) | no external HTTP client yet; RESEARCH "Weather" |
| `src/shell/*` interactive overlays, focus trap, keyboard map, EventSource client | client | event-driven | only two trivial client components exist; UI-SPEC is the source |
| `(os)/template.tsx`, `loading.tsx`, `error.tsx` | route conventions | n/a | none; use `retry` not `reset` (RESEARCH correction 1) |
| `src/app/fonts/*.woff2`, `scripts/fetch-symbols.mjs` | asset/script | file-I/O | no `scripts/` dir or local font; RESEARCH "Icon Font" |
| `src/server/time.ts` tz offset/snooze math | utility | transform | only greeting()/Intl format exists; RESEARCH Pattern 5 |

## Metadata

**Analog search scope:** `src/**`, `tests/**`, `vitest.config.ts` (all tracked files; 26 src + 8 test files).
**Files scanned:** 34.
**Pattern extraction date:** 2026-10-08.
