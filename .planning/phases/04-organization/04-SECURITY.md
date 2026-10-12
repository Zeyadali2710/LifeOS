---
phase: 04
slug: organization
status: verified
threats_total: 63
threats_closed: 63
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-10-12
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against the current code on `main` (HEAD 5f0d57c), including the 04-REVIEW-FIX changes (CR-A03, CR-A04, WR-A06, WR-A07, WR-C03..C06, IN-A02, IN-C02 and migration 0004).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry -> repo | third-party code enters production dependencies (tsdav, ical.js) | code |
| owner .env -> app | OAuth client secret enters the runtime | secret |
| owner browser -> connectIcloud / secret entry form | Apple ID and app-specific password cross into the server once | secret |
| Google -> callback route | attacker-controllable query params (code, state, error) | auth codes, state |
| server -> Google APIs / iCloud CalDAV | bearer tokens and Basic credentials leave the server to fixed hosts; writes leave LifeOS | tokens, event content |
| remote ICS / Google JSON -> parser -> DB | attacker-influenced calendar data (shared calendars, invites) | untrusted event text |
| app -> Postgres | calendar contents, task notes, encrypted provider credentials at rest | private, secret (ciphertext) |
| browser -> calendar / task / settings / palette server actions | untrusted ids, event/task input, categories, queries, credentials | owner input |
| URL params -> server page | view/date/event params | untrusted |
| browser localStorage | per-day plan skip state | low |
| DB -> page / agent DTOs, Postgres NOTIFY -> SSE | private calendar data to owner browser and agent tool output; signal frames to every owner tab | private |
| LLM -> tool gateway -> approval payload -> approval UI | model-chosen tool calls (possibly steered by prompt injection in event text) | model-authored payloads |
| private data -> free model provider | third-party free models may log prompts | private |
| provider data -> activity feed / notifications | external event titles flow into activity and notifications | private |
| repo docs -> public history | docs and commits | public |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Tampering | decide/saveEdit edited payload | mitigate | Re-parse with `payloadSchemaFor(cur.tool)` then `checkLocked` in both `decide` (src/server/agents/approvals.ts:89-93) and `saveEdit` (approvals.ts:119-123); LOCKED lists at src/lib/approval-kinds.ts:23-29; `payloadHash` computed once on the original at src/server/agents/gateway.ts:140 | closed |
| T-04-02 | Elevation of privilege | edit-before-approve retargeting | mitigate | `LOCKED.event_create/event_update` include calendarId/calendarLabel/provider (+ eventId/etag/scope/instanceStart/before); `event_delete: Object.keys(eventDeletePayload.shape)` locks every field (src/lib/approval-kinds.ts:23-29, 44-53) | closed |
| T-04-03 | Information disclosure | ProviderError text | mitigate | `ProviderError` message is caller-chosen (src/server/calendar/errors.ts:4-14); every `new ProviderError` uses `MSG[kind]` or a literal (caldav/provider.ts:39, google/client.ts:22,64,135,139, google/provider.ts:148,257, providers.ts:15) | closed |
| T-04-04 | Repudiation | approval edits | mitigate | `aud(h, "approval.edit", ...)` on every edit (approvals.ts:101, 130). Post-review WR-A06: `editMeta` (approvals.ts:25-27) keeps `{original, edited}` for issues and `{approvalId, changed:[keys]}` for event kinds. The edit is still recorded for every kind; event content was deliberately removed from audit | closed |
| T-04-60 | Tampering (XSS) | approval list/card/detail | mitigate | No `dangerouslySetInnerHTML`/`innerHTML` anywhere in src/; issue links gated by `isSafeGithubUrl` (src/approvals/approval-detail.tsx:104, src/shell/ai/approval-card.tsx:64) | closed |
| T-04-61 | Information disclosure | calendar approvals in DTO | mitigate | `toDTOs` sets `priv = null` for non-issue kinds ("calendar data is always private", approvals.ts:311-312); `toApprovalDTO` returns schema-parsed payloads only (src/server/agents/dto.ts:166-186) | closed |
| T-04-SC | Tampering | npm install tsdav, ical.js | mitigate | Owner-approved legitimacy check recorded (04-03-SUMMARY.md:21,24); exactly `ical.js` and `tsdav` added (package.json:27,34); package-lock.json tracked; CI `npm audit --omit=dev --audit-level=high` (.github/workflows/ci.yml:33) | closed |
| T-04-05 | Information disclosure | GOOGLE_CLIENT_SECRET | mitigate | Only `.env.example` is tracked (commented placeholders, .env.example:34-35); optional env (src/server/env.ts:15); pino redaction in src/server/log.ts:7-21 | closed |
| T-04-06 | Spoofing | refresh token expiry in Testing mode | mitigate | Consent screen published "In production" (04-03-SUMMARY.md:30); `invalid_grant` maps to `auth` (src/server/calendar/google/client.ts:52) -> connection paused + reconnect notice (src/server/calendar/sync.ts:115-124) | closed |
| T-04-07 | Elevation of privilege | over-scoped consent | mitigate | `GOOGLE_SCOPES` = calendarlist.readonly + calendar.events only (google/client.ts:8, 30) | closed |
| T-04-08 | Denial of service | conflicts sweep | accept | Inner loop breaks on first non-overlap (src/server/calendar/conflicts.ts:26). See Accepted Risks AR-04-01 | closed |
| T-04-09 | Tampering (XSS / scheme abuse) | event location links | mitigate | `isSafeUrl` https-only, credential-free, no control chars (src/lib/safe-url.ts:20-29); sole caller renders `rel="noopener noreferrer"`, else plain text (src/organization/event-detail.tsx:85-90) | closed |
| T-04-10 | Tampering | icon font download | accept | Committed src/app/fonts/material-symbols-outlined.woff2 via scripts/fetch-symbols.mjs; size asserted in tests/unit/icons.test.ts:22-26. See AR-04-02 | closed |
| T-04-11 | Information disclosure | calendar_events.raw / tasks.notes | accept | Credentials only as ciphertext (src/server/calendar/connections.ts:27-28). See AR-04-03 | closed |
| T-04-12 | Tampering (duplicates) | concurrent sync + owner write | mitigate | Unique (connection_id, remote_id) and (calendar_id, remote_id) in src/server/db/schema.ts:444, 477; event writers `onConflictDoUpdate` (sync.ts:101, calendar/events.ts:51). Note: `refreshCalendarList` uses select-then-insert (calendars.ts:20-28); a race fails on the unique index rather than duplicating | closed |
| T-04-13 | Tampering (ICS/CRLF injection) | icsCreate / icsApply | mitigate | Values set via `ICAL.Property`/`updatePropertyWithValue` (src/server/calendar/recurrence-edit.ts:46-57, 82-94); test asserts no injected ATTENDEE line (tests/unit/recurrence-edit.test.ts:35-39) | closed |
| T-04-14 | Denial of service | malicious RRULE / huge ICS | mitigate | `MAX_OCCURRENCES = 2000` applied to RDATE and RRULE loops, stop at `to` (src/server/calendar/expand.ts:7, 167, 183-186); per-row try/catch (expand.ts:360-361); 256 KB / 5000 caps at sync (caldav/provider.ts:15-16, 239-245) | closed |
| T-04-15 | Information disclosure | parse-error logging | mitigate | Count only: expand.ts:364; caldav/provider.ts:251 | closed |
| T-04-16 | Information disclosure | credentials at rest | mitigate | `encrypt(JSON.stringify(secret))` with AES-256-GCM (src/server/crypto.ts:13), `last4: ""` (connections.ts:27-28) | closed |
| T-04-17 | Information disclosure | CalendarConnectionDTO / audit / lastError | mitigate | DTO selects explicit columns without ciphertext (connections.ts:80-83); audit `{id, account}` (connections.ts:30); lastError fixed strings (sync.ts:116, 129) | closed |
| T-04-18 | Tampering | setDefaultCalendar / category | mitigate | `isCategory` guard (calendars.ts:52-53); default only enabled non-reader (calendars.ts:61); advisory lock + partial unique index `calendars_one_default_idx` (calendars.ts:15, schema.ts:446, drizzle/0004_one_default_calendar.sql); actions owner-guarded (calendar-settings-actions.ts:59-73) | closed |
| T-04-19 | Information disclosure | InstanceDTO / raw payloads | mitigate | `InstanceDTO` holds display fields only, no raw/credentials (src/lib/calendar-types.ts:28-53) | closed |
| T-04-20 | Denial of service | listEvents range | mitigate | `MAX_RANGE_DAYS = 62`, `Math.min(limit, 50)` (src/server/calendar/queries.ts:25, 132-137); month grid 42 days (queries.ts:44) | closed |
| T-04-21 | Elevation of privilege | task-actions | mitigate | `await requireOwner()` first in all five actions; `z.uuid()` ids; `taskInput.safeParse` in createTask/updateTask (src/server/task-actions.ts:24-58; src/server/tasks.ts:3, 31) | closed |
| T-04-22 | Tampering (duplicate reminders) | fireDueReminders | mitigate | Single conditional `UPDATE ... WHERE remindedAt IS NULL ... RETURNING` claim (src/server/tasks.ts:126-131) | closed |
| T-04-23 | Information disclosure | SSE frames / logs / audit | mitigate | `notifyLive(h, kind, id)` carries id only (src/server/events.ts:24-27); job logs `{fired}` count (src/worker/jobs/task-reminders.ts:8); task audit metadata `{id}` (tasks.ts:14-17). See residual note R-2 | closed |
| T-04-24 | Spoofing (OAuth CSRF) | callback route | mitigate | Session required on start and callback (start/route.ts:10-11, callback/route.ts:10-11); state+PKCE verifier in an encrypted cookie, HttpOnly, SameSite=Lax, maxAge 600 (start/route.ts:15), TTL check + `timingSafeEqual` (google/oauth.ts:30-34, 49); cookie deleted after use (callback/route.ts:20); S256 challenge (oauth.ts:23) | closed |
| T-04-25 | Information disclosure | refresh/access tokens | mitigate | Saved via `saveCalendarSecret` (oauth.ts:57); log writes only `err.message` (oauth.ts:64); redirects carry status codes only (callback/route.ts:19); IN-A02 revoke logs status only (connections.ts:56-70) | closed |
| T-04-26 | Elevation of privilege | OAuth scopes | mitigate | Grant rejected unless every `GOOGLE_SCOPES` entry present (oauth.ts:55) | closed |
| T-04-27 | Tampering (open redirect) | callback redirects | mitigate | All redirects are `${env().BETTER_AUTH_URL}` + fixed paths (start/route.ts:9-14, callback/route.ts:9-19); Google auth URL built from constant AUTH_URL | closed |
| T-04-28 | SSRF | Google client | mitigate | Constant hosts (google/client.ts:9-11); `checkPath` rejects non-`/`, `//`, `://` before every call (client.ts:73-79); ids `encodeURIComponent`'d (google/provider.ts:114, 169, 191, 215, 220, 255) | closed |
| T-04-29 | Repudiation / duplicate writes | agent create retries | mitigate | Deterministic id `lifeos<approvalId>` / `<approvalId>@lifeos` (src/server/calendar/events.ts:135); 409 adopt (google/provider.ts:161-171); 412 adopt (caldav/provider.ts:171-177) | closed |
| T-04-30 | Information disclosure | iCloud app password | mitigate | Encrypted at rest (caldav/provider.ts:286 -> connections.ts:28); decrypted for `realDav` only (caldav/provider.ts:89-95, 292); audit `{id, account}`; fixed lastError; form clears on submit (src/settings/icloud-form.tsx:24-25) | closed |
| T-04-31 | SSRF | DAV URLs | mitigate | `ICLOUD_SERVER` constant (caldav/provider.ts:14); `assertIcloudUrl` requires https + `.icloud.com` (provider.ts:59-67) on calendar, object and write URLs (provider.ts:166, 173, 190, 192, 228, 232, 244). Discovery inside tsdav `createDAVClient` starts from the constant | closed |
| T-04-32 | Tampering (lost update) | PUT/DELETE | mitigate | tsdav sends `If-None-Match: *` on create and `If-Match: etag` on update/delete (node_modules/tsdav/dist/tsdav.cjs:548, 561, 1062); 412 -> conflict; null etag refused unless content matches (caldav/provider.ts:180-187, IN-A03) | closed |
| T-04-33 | Denial of service | huge ICS | mitigate | `MAX_BYTES = 256 KB`, `MAX_OBJECTS = 5000`, per-resource try/catch, counts-only log (caldav/provider.ts:15-16, 238-251) | closed |
| T-04-34 | Tampering (ICS/CRLF) | CalDAV writes | mitigate | `put()` content only from `icsCreate`/`icsApply` (caldav/provider.ts:197, 204, 259) | closed |
| T-04-35 | Information disclosure | lastError, logs, notifications | mitigate | Fixed lastError strings (sync.ts:116, 129); activity detail = title + time (sync.ts:139); `log.error({err})` only for non-provider errors (sync.ts:128), which the plan permits. See residual note R-2 | closed |
| T-04-36 | Denial of service (notification spam) | activity/conflict emits | mitigate | First sync silent (sync.ts:72, 106); 7-day horizon, `MAX_EVENTS = 5` + one summary (sync.ts:18, 135-141); conflict dedupe with 3-day pruning (sync.ts:152-169) | closed |
| T-04-37 | Tampering (cursor) | cursor persistence | mitigate | Rows upserted/deleted then cursor in the same transaction, cursor last (sync.ts:96-104); truncated fetch keeps old cursor (WR-A02) | closed |
| T-04-38 | Elevation of privilege | calendar-actions | mitigate | `await requireOwner()` first in all six actions; `z.uuid()` ids (src/server/calendar-actions.ts:24, 58-145); `writable()` requires enabled, categorised, owner/writer (calendar/events.ts:35, 130, 150, 165) | closed |
| T-04-39 | Tampering (lost update) | updateEvent/deleteEvent | mitigate | `args.etag !== s.event.etag` -> "changed" before provider call (calendar/events.ts:151, 166); Google If-Match (google/provider.ts:227-250); CalDAV If-Match (T-04-32) | closed |
| T-04-40 | Repudiation | owner and agent writes | mitigate | `calendar.event.{create,update,delete}` audit with actor, ids, approvalId, no content (calendar/events.ts:37-39, 142, 157, 171) | closed |
| T-04-41 | Information disclosure | action errors / logs | mitigate | Fixed error codes (calendar-actions.ts:36-49) and fixed ProviderError messages present. **Gap (fixed):** `log.error({ err }, "calendar action failed")` (calendar-actions.ts:48) logs any non-provider error object. drizzle-orm 0.45.3 `DrizzleQueryError` puts the bound `params` in `message` and on `.params` (node_modules/drizzle-orm/errors.js:10-19), and pino's err serializer emits both. A failed insert or update of a calendar_events row would therefore write the event title, description and location to the logs  Fixed: `src/server/log.ts` `errSerializer` (pino `serializers.err`) drops `.params` and redacts the `params:` text from message/stack for every `{ err }` log site (also covers R-2); regression test tests/unit/log.test.ts | closed |
| T-04-42 | Information disclosure | iCloud password in client | mitigate | `setPassword("")` on submit (icloud-form.tsx:24-25); `type="password"`, `autoComplete="off"`, `data-1p-ignore` (icloud-form.tsx:53-57); action returns status only (calendar-settings-actions.ts:18-29) | closed |
| T-04-43 | Elevation of privilege | settings actions | mitigate | `requireOwner()` first + `z.uuid()`/`connId`/`z.boolean()` (calendar-settings-actions.ts:18-80); category `isCategory`; default writable-only (calendars.ts:52-61) | closed |
| T-04-44 | Tampering (CSRF via OAuth start) | Connect Google link | mitigate | Same-origin GET link (src/settings/calendar-connection-row.tsx:63); start requires session and issues fresh state/PKCE cookie (start/route.ts:10-15); callback verifies (oauth.ts:49) | closed |
| T-04-45 | Tampering (XSS) | event-detail / event-block | mitigate | No `dangerouslySetInnerHTML` in src/; only external link is `isSafeUrl`-gated with `rel="noopener noreferrer"` (event-detail.tsx:85-86) | closed |
| T-04-46 | Tampering | searchParams | mitigate | `requireOwner()` (src/app/(os)/organization/page.tsx:14); view enum (page.tsx:18); date regex + real-date + clamp to window (page.tsx:19-23); event id looked up in loaded data only, unknown -> toast + drop (src/organization/organization-view.tsx:151-159) | closed |
| T-04-47 | Tampering (prompt injection -> writes) | calendar write tools | mitigate | create/update `APPROVE`, delete `HIGH_RISK` (src/server/agents/tools/calendar.ts:178, 268, 340); handlers call `needApproval` (calendar.ts:146-148, 193, 298, 353); DATA_RULE + untrusted-text line (src/server/agents/registry.ts:35, 59-60); full payload, before/after diff shown (src/approvals/event-approval.tsx:146-158, 233) | closed |
| T-04-48 | Elevation of privilege | delete tier downgrade | mitigate | `resolvePolicy` floors HIGH_RISK (src/server/agents/policy.ts:3-5); test tests/unit/policy.test.ts:5-8 | closed |
| T-04-49 | Tampering | model-supplied calendarLabel/provider/etag | mitigate | `resolve` spreads `target(cal)` and DB `etag` over model input (tools/calendar.ts:131-133, 185, 274-279, 345); `checkLocked` blocks later edits (T-04-01) | closed |
| T-04-50 | Information disclosure | calendar output to free models | mitigate | Tools `private: true` (tools/calendar.ts:55, 180, 270, 342); taint + Sonnet switch (src/server/agents/loop.ts:219-221, 275-286); test tests/db/calendar-privacy.test.ts:53-58 | closed |
| T-04-51 | Information disclosure | secrets in tool output | mitigate | Tools read `connections.id` only (tools/calendar.ts:36); test tests/db/calendar-privacy.test.ts:20-21, 73 | closed |
| T-04-52 | Tampering | localStorage skip keys | accept | Parse failures ignored (src/organization/plan-skips.ts). See AR-04-04 | closed |
| T-04-53 | Tampering (XSS) | task titles/notes, plan why text | mitigate | React-escaped text (no raw HTML sinks in src/); server re-validates with `taskInput`/`eventFields` behind `requireOwner` (task-actions.ts, calendar-actions.ts:131-139) | closed |
| T-04-54 | Tampering (lost update) | edit/delete from stale page | mitigate | etag in `ids` schema for update/delete (calendar-actions.ts:24); server refuses mismatch (calendar/events.ts:151, 166); UI Reload prompt (src/organization/event-dialog.tsx:249, 351-353) | closed |
| T-04-55 | Tampering (XSS) | event fields in dialogs/toasts | mitigate | React-escaped text; `eventInput.safeParse` behind `requireOwner` (calendar-actions.ts:58-71) | closed |
| T-04-56 | Spoofing / Tampering (deceptive approval) | EventApprovalBody | mitigate | Description length + before/after diff (event-approval.tsx:146-158, 233); delete warning (event-approval.tsx:275); Reject `autoFocus` on delete (approval-detail.tsx:227); `targetChanged` disables approve (approval-detail.tsx:153, 211-216; approval-card.tsx:141); server etag refusal (calendar/events.ts:151, 166) | closed |
| T-04-57 | Tampering (open redirect / XSS) | result card links | mitigate | `dayHref` same-origin path from `YMD`/`UUID`-validated values (src/server/agents/dto.ts:46-47, 60, 79, 85, 90); approval result href regex-checked uuid (event-approval.tsx:104-105) | closed |
| T-04-58 | EoP / DoS | paletteSearchAction | mitigate | `requireOwner()` first; `z.string().trim().min(2).max(100)` (src/server/palette-actions.ts:14, 18-20); `.slice(0, 4)` per group (palette-actions.ts:34, 49); title-only match over drizzle queries | closed |
| T-04-59 | Information disclosure | docs / SUMMARY | mitigate | Scan of docs/, README.md, phase-04 SUMMARYs and the last 300 commit messages: no client secrets (`GOCSPX`), tokens (`ya29.`), client ids, Apple IDs or real app passwords | closed |
| T-04-62 | Information disclosure | docs | mitigate | Same scan; only tailnet host is the placeholder `tail1234.ts.net` (docs/deployment.md:114) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Open threat detail

**T-04-41 (severity: low, non-blocking under `block_on: high`)**: event text can reach the logs through DB error objects.
- Expected: no event text or secrets in logs.
- Found: `src/server/calendar-actions.ts:48` logs `{ err }` for every non-ProviderError. A `DrizzleQueryError` from the event-row upsert in `src/server/calendar/events.ts:51` carries the bound values (title, description, location, raw) in both `message` and `params`.
- Trigger: DB failure during an owner write. This is uncommon, and the output stays in the owner's own VM logs.
- Fix options:
  - log `{ err: err instanceof Error ? err.name : "unknown" }`, or
  - add `err.params` / `*.params` to the pino `redact` paths and strip the `params:` tail from `message`. A serializer in `src/server/log.ts` would cover every caller at once.
- Alternative: record it as an accepted risk below.

### Residual notes (informational, no threat status change)

- **R-1:** `refreshCalendarList` inserts after a select instead of using `onConflictDoUpdate`. Concurrent list refreshes fail on the unique index instead of creating duplicates (T-04-12 still holds).
- **R-2:** The same DrizzleQueryError pattern exists outside T-04-41's component. In each case the plan's declared mitigation is present as written:
  - `src/server/task-actions.ts:18,48`: task title/notes on a DB failure, despite the "never log task contents" comment;
  - `src/server/events.ts:62`: activity/notification text;
  - `src/server/calendar/sync.ts:128`: synced event rows; T-04-35 explicitly allows err objects.

  The R-2 sites would be covered by the same `log.ts` serializer fix.
- **R-3:** CalDAV principal/home discovery inside tsdav `createDAVClient` is not checked by `assertIcloudUrl`. It starts from the constant `https://caldav.icloud.com`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-08 | Personal calendar; inputs are bounded by the display range and the D-04 sync window; the sweep's inner loop breaks on the first non-overlap (conflicts.ts:26) | plan 04-04 (owner) | 2026-10-12 |
| AR-04-02 | T-04-10 | Icon font fetched once from fonts.googleapis.com by a manual script and committed; size/magic asserted in tests/unit/icons.test.ts | plan 04-05 (owner) | 2026-10-12 |
| AR-04-03 | T-04-11 | Single-owner DB on the tailnet; nightly encrypted-at-rest backups unchanged (FND-09); secrets never stored in calendar_events.raw or tasks.notes (credentials only as ciphertext in connections) | plan 04-06 (owner) | 2026-10-12 |
| AR-04-04 | T-04-52 | localStorage skip keys only hide plan items in this browser for today; no server effect; parse failures ignored | plan 04-18 (owner) | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. Only 04-14-SUMMARY.md has a `## Threat Flags` section ("None beyond the plan's threat model"). It maps to T-04-38..41.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 63 | 62 | 1 (T-04-41, low) | gsd-security-auditor |
| 2026-10-12 | 63 | 63 | 0 | orchestrator: T-04-41 fixed (log.ts errSerializer + tests/unit/log.test.ts) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
