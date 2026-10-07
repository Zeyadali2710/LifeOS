---
phase: 02
slug: shell
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-08
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (02-01..02-13 `<threat_model>` blocks). Verified against code at HEAD d46e045 (post review-fix).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| app -> Postgres NOTIFY | payloads visible to any DB session that LISTENs | `{k,id}` only |
| hub -> SSE subscribers | rows fan out to authenticated SSE streams | activity/notification DTOs (owner data) |
| server -> Open-Meteo | untrusted external JSON | public weather numbers |
| DB action_url -> navigation | free-text column used as link target | URL string (untrusted) |
| anonymous client -> sign-in endpoint | untrusted credentials trigger hook side effects | credentials, IP/UA (audit only) |
| web process -> settings table | monitor state shared across processes | health/version JSON |
| browser -> /api/events, /api/activity, /api/notifications | session cookie required | owner activity/notifications |
| browser -> server actions | POST endpoints carrying ids/timestamps | uuid, boolean, ISO datetime |
| query string -> login redirect | `next` param attacker-controlled | path string |
| lo_nav cookie -> server layout | client-writable cookie | literal flag |
| server error -> error.tsx | error object reaches client boundary | error message/stack (must not render) |
| user prompt text -> AI panel | typed text rendered back | free text (stays in browser) |
| build-time font fetch | one-time manual download, committed | woff2 binary |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|------------------------|--------|
| T-02-01 | Information disclosure | NOTIFY payload | mitigate | `src/server/events.ts:20` payload is `JSON.stringify({k,id})`; row re-read via `loadEventRow` (`events.ts:93-124`, `hub.ts:68`) | closed |
| T-02-02 | Tampering | hub notification handler | mitigate | `src/server/hub.ts:61-66` JSON.parse try/catch, k whitelist, `typeof id === "string"`; `events.ts:98` UUID regex -> null | closed |
| T-02-03 | Denial of service | LISTEN connections | mitigate | `hub.ts:11-12,48` backoff capped 30s; `hub.ts:77` 30s `select 1` keepalive + `keepAlive: true` (`hub.ts:55`); `hub.ts:110-112` globalThis singleton | closed |
| T-02-04 | Repudiation/availability | emitActivity | mitigate | `events.ts:23-56` try/catch returns null, `log.error`; pino redaction `src/server/log.ts:7-21` | closed |
| T-02-05 | Tampering | parseWeather | mitigate | `src/server/weather.ts:20-26` zod schema (numbers only), safeParse failure -> null; unknown code -> null word | closed |
| T-02-06 | Denial of service | getSydneyWeather | mitigate | `weather.ts:31` `AbortSignal.timeout(2500)`; `weather.ts:30-36` never throws; `src/server/home.ts:7` date-only when null | closed |
| T-02-07 | Tampering/XSS | isSafePath | mitigate | `src/lib/safe-url.ts:39-42` requires leading `/`, rejects `//`, `\`, control chars (CR-01, cb7e6df); used at `login/page.tsx:12`, `shell/notification-row.tsx:52,88`; tests `tests/unit/safe-url.test.ts` | closed |
| T-02-08 | Information disclosure | weather request | accept | see Accepted Risks AR-02-01 | closed |
| T-02-09 | Tampering | committed woff2 | mitigate | `scripts/fetch-symbols.mjs:7-22` HTTPS fonts.googleapis.com only; `tests/unit/icons.test.ts:22-28` size 5KB-60KB + `wOF2` magic; CSP `font-src 'self'` at `src/proxy.ts:14` | closed |
| T-02-10 | Information disclosure | runtime font requests | mitigate | `src/app/layout.tsx:2-3` `next/font/google` (build-time self-host) + `next/font/local`; CSP `font-src 'self'` blocks runtime third-party fonts | closed |
| T-02-SC | Tampering | npm installs (plan 03) | accept | see Accepted Risks AR-02-02 | closed |
| T-02-11 | Information disclosure | auth-events activity/notification text | mitigate | `src/server/auth-events.ts:13-44` fixed copy only; `tests/db/auth-events.test.ts:34` asserts no `@`/IPv4 | closed |
| T-02-12 | Denial of service | failed sign-in notifications | mitigate | `auth-events.ts:11,21-36` 10-min throttle query; `src/server/auth.ts:25-30` rate limit `/sign-in/email` 5/60s | closed |
| T-02-13 | Denial of service | instrumentation register() | mitigate | `src/instrumentation.ts:1-6` calls `start()` only; `src/server/monitor.ts:133-139` schedules unref'd timers; `tick`/`checkVersion` wrapped in try/catch (`monitor.ts:46,101,107,120`) | closed |
| T-02-14 | Tampering/race | health.last / app.version | mitigate | `monitor.ts:29-39` CAS (`onConflictDoNothing` / `update ... where value = prev returning`); emit only if CAS wins (`monitor.ts:63,113`) | closed |
| T-02-15 | Repudiation | auth hook | mitigate | `auth-events.ts:45-47` emitAuthEvent never throws; called after audit in `auth.ts:50` | closed |
| T-02-16 | Information disclosure | GET routes + SSE | mitigate | `getSession` + 401 JSON at `src/app/api/events/route.ts:7-8`, `api/activity/route.ts:8-9`, `api/notifications/route.ts:8-9`; e2e `tests/e2e/auth.spec.ts:11-13`, `live-activity.spec.ts:12` | closed |
| T-02-17 | Elevation of privilege | server actions | mitigate | `src/server/notification-actions.ts:23,30,35,45` `await requireOwner()` first in all 4 exports; only `"use server"` file in `src/` | closed |
| T-02-18 | Tampering | action inputs | mitigate | `notification-actions.ts:10,24,36,40,46` zod uuid/boolean/iso datetime; snooze bounded `(now, now+30d]` | closed |
| T-02-19 | Tampering (CSRF) | server actions | mitigate | Next built-in Origin vs Host check; `next.config.ts` sets no `serverActions.allowedOrigins` (verified by grep) so default strict check applies | closed |
| T-02-20 | Denial of service | SSE streams | mitigate | `api/events/route.ts:13-19` enqueue error -> cleanup; `:21` 20s ping; `:22-27` 15-min close; `:33` abort listener; `:36-38` cancel; single shared hub `hub.ts:110-112` | closed |
| T-02-21 | Spoofing (stale session) | long-lived SSE | accept | see Accepted Risks AR-02-03 (ceiling enforced at `api/events/route.ts:22-27`) | closed |
| T-02-22 | Tampering (open redirect) | src/app/login/page.tsx | mitigate | `src/app/login/page.tsx:12` `isSafePath(next) ? next : "/"`; only `target` reaches `redirect` and `LoginForm` (`login-form.tsx:30`) | closed |
| T-02-23 | Tampering/XSS | primitives rendering text | mitigate | grep `dangerouslySetInnerHTML|innerHTML` across `src/` returns 0 matches | closed |
| T-02-24 | Tampering | SSE message parsing | mitigate | `src/shell/live-provider.tsx:133-139` JSON.parse try/catch; `:152,:160` `isActivity`/`isNotification` guards (WR-08, be6e0f4); `:80` `parseSnapshot`; `:106` resync items filtered | closed |
| T-02-25 | Denial of service | reconnect loop | mitigate | `src/shell/live.ts:5-7` 1s -> 30s cap; `live-provider.tsx:174-175`; single `new EventSource` (`live-provider.tsx:142`), one `LiveProvider` mount (`shell/app-shell.tsx:33`) | closed |
| T-02-26 | Spoofing (expired session) | reconnect | mitigate | `live-provider.tsx:76-78,101-103` 401 -> `/login`; `:166-173` error handler probes snapshot before reconnect (WR-03, 2080ad8); 15-min server close; e2e `live-activity.spec.ts:68-69` | closed |
| T-02-27 | Elevation of privilege | (os)/layout.tsx | mitigate | `src/app/(os)/layout.tsx:8` `await requireOwner()` first; `src/server/session.ts:8-12`; proxy comment `src/proxy.ts:27` optimistic only | closed |
| T-02-28 | Tampering | lo_nav cookie | mitigate | `(os)/layout.tsx:10` `=== "compact"` boolean only; value never rendered | closed |
| T-02-29 | Information disclosure | owner name/email in shell | accept | see Accepted Risks AR-02-04 | closed |
| T-02-30 | Tampering (keyboard hijack) | global shortcuts | mitigate | `src/shell/shortcuts.ts:17` isComposing ignored; `:23` Ctrl+Alt (AltGr) excluded; `:20,28,31` nav suppressed while typing (WR-05, 795b87f) | closed |
| T-02-31 | Information disclosure | (os)/error.tsx | mitigate | `src/app/(os)/error.tsx:6-16` and root `src/app/error.tsx:24-38` (WR-06) fixed copy; `error` prop never read | closed |
| T-02-32 | Elevation of privilege | domain pages | mitigate | all domain pages under `src/app/(os)/` (layout `requireOwner`); domain pages are static (no data access); Home also calls `requireOwner` (`(os)/page.tsx:42`); e2e `tests/e2e/shell-nav.spec.ts:22-26` | closed |
| T-02-33 | Information disclosure | AI composer | mitigate | `src/shell/ai-panel.tsx` imports no fetch/action (imports lines 3-10, no `fetch`); e2e `tests/e2e/palette.spec.ts:37-44` asserts no POST | closed |
| T-02-34 | Tampering/XSS | turn rendering | mitigate | no `dangerouslySetInnerHTML` in `src/` (grep 0 matches) | closed |
| T-02-35 | Elevation of privilege | palette "Sign out"/nav | accept | see Accepted Risks AR-02-05 | closed |
| T-02-36 | Tampering/XSS | ActivityList | mitigate | no `dangerouslySetInnerHTML` in `src/` (grep 0 matches) | closed |
| T-02-37 | Information disclosure | activity content | mitigate | fixed copy at source (`auth-events.ts`, `monitor.ts`); e2e `tests/e2e/live-activity.spec.ts:60-63` no `@`/IP | closed |
| T-02-38 | Information disclosure | /api/events | mitigate | e2e `tests/e2e/live-activity.spec.ts:12` 401 without session; code `api/events/route.ts:7-8` | closed |
| T-02-39 | Denial of service | Home render | mitigate | `weather.ts:31` 2.5s timeout + null; `(os)/page.tsx:47` `unreadImportantCount().catch(() => 0)`; layout `snapshot().catch(() => null)` (`(os)/layout.tsx:11`) | closed |
| T-02-40 | Tampering (open redirect / javascript:) | NotificationRow Open | mitigate | `src/shell/notification-row.tsx:52` guard in handler, `:88` button rendered only if `isSafePath`; e2e `tests/e2e/notifications.spec.ts:81-85` (`//evil.example` -> no Open) | closed |
| T-02-41 | Tampering/XSS | notification title/body | mitigate | rendered as React children `notification-row.tsx:74,84`; no `dangerouslySetInnerHTML` in `src/` | closed |
| T-02-42 | Elevation of privilege | mutations | mitigate | server side per T-02-17/18; client rollback `notification-row.tsx:31-41` `restoreItem` on `!ok` (WR-04, 7def112); `notifications-drawer.tsx:35-41` | closed |
| T-02-43 | Denial of service | rapid clicks | accept | see Accepted Risks AR-02-06 | closed |
| T-02-44 | Information disclosure | docs/api.md | accept | see Accepted Risks AR-02-07; grep of `docs/api.md` for secret/password/token/ts.net/LAN IP: no secrets | closed |
| T-02-45 | Tampering (CSRF via proxy host) | server actions behind Tailscale serve | transfer | see Transfer Log TR-02-01 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party / deferred deploy verification)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-08 | Weather request uses fixed public Sydney coordinates, no API key, no user data sent (`weather.ts:3-4`). | plan 02-02 threat model (owner) | 2026-10-08 |
| AR-02-02 | T-02-SC | Plan 02-03 added no npm packages; fonts fetched once by reviewed script and committed. | plan 02-03 threat model (owner) | 2026-10-08 |
| AR-02-03 | T-02-21 | Long-lived SSE may outlive a revoked session by at most 15 minutes; server closes stream at 15 min forcing re-auth on reconnect (RESEARCH Pitfall 8 ceiling). | plan 02-05 threat model (owner) | 2026-10-08 |
| AR-02-04 | T-02-29 | Owner name/email rendered in shell only after `requireOwner()`, i.e. only to the authenticated owner. | plan 02-08 threat model (owner) | 2026-10-08 |
| AR-02-05 | T-02-35 | Palette "Sign out"/nav are client-side navigation only; server guards (layout `requireOwner`, API `getSession`, action `requireOwner`) remain authoritative. | plan 02-10 threat model (owner) | 2026-10-08 |
| AR-02-06 | T-02-43 | Rapid-click mutation bursts: Next dispatches server actions sequentially per client; optimistic UI hides latency (RESEARCH Pitfall 7). Single-owner app. | plan 02-12 threat model (owner) | 2026-10-08 |
| AR-02-07 | T-02-44 | `docs/api.md` documents owner-only routes; contains no secrets or hostnames. | plan 02-13 threat model (owner) | 2026-10-08 |

*Accepted risks do not resurface in future audit runs.*

### Transfer Log

| Transfer ID | Threat Ref | Transferred To | Documentation | Date |
|-------------|------------|----------------|---------------|------|
| TR-02-01 | T-02-45 | First Proxmox/Tailscale deploy verification (operator) | `02-RESEARCH.md:268,456` (Open Question 1), `02-VALIDATION.md:77` manual check "Server actions over Tailscale serve", `02-13-SUMMARY.md:43`. Action: if Origin and Host differ behind `tailscale serve`, set `experimental.serverActions.allowedOrigins` to the tailnet hostname. Recommendation: also add this note to `docs/deployment.md` (currently only mentions `BETTER_AUTH_URL` origin check at line 156). | 2026-10-08 |

---

## Observations (informational, not blockers)

- `next.config.ts` has an uncommitted, dev-only `allowedDevOrigins: ["*.tailf137cc.ts.net"]` (phone test). It affects only `next dev`, is not part of this phase, and does not change the production server-action Origin check (T-02-19). Do not commit it with a tailnet-specific hostname unless intended.
- T-02-06: transport failures/timeouts throw and are never cached. Non-2xx responses return `null`; whether Next's data cache stores a non-OK response under `revalidate: 1800` is framework behaviour and was not verified. Worst case is the date line without weather for up to 30 min.
- No `## Threat Flags` sections exist in any 02-*-SUMMARY.md; no unregistered flags. Review fix WR-01 (sign-out audit only with a validly signed session cookie, `src/server/auth.ts:39-40`) hardens audit integrity beyond the register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-08 | 46 | 46 | 0 | gsd-security-auditor (ASVS L1, block_on: high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-08
