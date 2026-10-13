---
phase: 06-outreach
verified: 2026-10-13T16:40:00Z
status: human_needed
score: 4/4 roadmap success criteria verified in code and local tests (live/VM confirmation pending)
overrides_applied: 0
human_verification:
  - test: "VM deploy + migrate: cd ~/lifeos && git pull && lc up -d --build; lc logs migrate | tail -5"
    expected: "0008_outreach applied, no error; worker registers outreach.events.sync, mail.sync, mail.triage schedules"
    why_human: "Migrations run only on the owner's VM ([BLOCKING] owner migrate pattern)"
  - test: "bash scripts/vm-db-test.sh with the Phase 6 file list in OWNER-ACTIONS.md (migrations, outreach-*, google-oauth, mail-*, routing-loop, gateway, approvals)"
    expected: "All pass on VM Postgres (local: 55 files / 440 tests pass)"
    why_human: "VM DB runner is owner-only over SSH"
  - test: "Google Cloud: add gmail.readonly + gmail.compose scopes, confirm In production; then Settings -> Connections -> Google -> Reconnect Google past the unverified-app screen"
    expected: "Toast 'Google reconnected · Gmail allowed'; Gmail line shows Allowed; Calendar still syncs"
    why_human: "Owner Google account / consent screen"
  - test: "Add Luma Sydney iCal feed in Settings -> Event feeds; Sync now on /outreach"
    expected: "Real Sydney events without MOCK badges, mocks hidden by default, sensible scores and WHY lines"
    why_human: "Needs a real public feed and outbound network"
  - test: "Optional: Eventbrite private token + organizer ids (A1 probe) and Luma API key (A2 path check against docs.luma.com)"
    expected: "Organizer events list, or the D-06 'doesn't allow listing' message; Luma list-events path works with the key"
    why_human: "Owner keys; LUMA_LIST path was cross-checked only against third-party docs"
  - test: "Live pipeline UAT: import an Eventbrite/Humanitix URL -> SAVED -> Interested -> Attend -> Add to calendar -> Attended -> Follow up"
    expected: "Calendar event created with URL in description; follow-up task in FOLLOW-UPS and Organization; Activity shows each transition"
    why_human: "Real Google Calendar write and real page fetch; e2e server has no outbound network"
  - test: "Live EMAIL UAT: inbox appears within ~5 min with summaries/categories; bulk is BULK; one IMPORTANT notification per HIGH mail; opening a mail shows plain text"
    expected: "Triage runs on Haiku, recorded with cost in Command Centre; no free model"
    why_human: "Needs real Gmail, Anthropic key and worker"
  - test: "Real reply send on a thread you own: Draft with agent -> edit body -> Send reply via approval; second draft -> Save to Gmail drafts"
    expected: "Exactly one reply in the same Gmail thread; second approval shows 'Moved to Gmail drafts'. Also confirm WR-S02 adopt checks (b)/(c) behave against real Gmail"
    why_human: "Live send path; idempotency proven only against fake Gmail locally"
  - test: "Visual passes on VM (plans 15-17): /outreach real feeds, pipeline horizontal scroll, event detail at 760-1099px, follow-up dialog, EMAIL category nav + mobile sheet, Open in Gmail on a long message"
    expected: "Matches Claude Design Outreach file in the Glass system"
    why_human: "Visual appearance"
  - test: "Review auto-decisions in 06-DISCUSSION-LOG.md / 06-UI-SPEC.md (NETWORK tab dropped, discovery = Luma iCal + URL import, Haiku triage, bodies never stored, Sonnet-only Outreach agent, mail-task title redaction, D-37 test split)"
    expected: "Owner accepts or requests changes"
    why_human: "Planning-time decisions taken autonomously"
---

# Phase 6: Outreach Verification Report

**Phase Goal:** Outreach stops being an honest-empty page: Sydney events are discovered from real sources and scored for relevance, saved events move through a pipeline into the calendar and follow-ups, and Gmail is triaged by an agent that classifies, summarises, flags, extracts actions and drafts replies, with sending always behind approval.
**Verified:** 2026-10-13T16:40:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `EventSourceProvider` seam; real sources where access permits, others real MOCK classes; Eventbrite/Luma keys only in Settings (encrypted); dedup + explainable relevance score | VERIFIED | `src/server/outreach/providers.ts`: `EventSourceProvider {kind,isMock,capabilities.discover,list}`; `icsProvider` (real, via SSRF-safe `safeGet`, 2 MB cap), `eventbriteProvider`/`lumaProvider` real only when `eventSourceKey()` returns a key, else `mockProvider` (`isMock: true`); `providerForSource` picks per row. Keys: `outreach/connections.ts` validates against constant URLs (`/v3/users/me/`, `/v1/users/get-self`), stores `encrypt()` ciphertext + last4, audits last4 only; no EVENTBRITE/LUMA in env or `.env.example`. URL import via JSON-LD (`jsonld.ts`). Dedup: `normalize.ts` canonUrl/canonTitle + same-start-minute (`sameEvent`, WR-S07 uses stored canonicalUrl). Score: `score.ts` INTERESTS 60 / PROJECTS 20 / SCHEDULE 20 as stored `signals` with matched terms plus templated `why`. Worker: `outreach.events.sync` every 6 h singleton + startup send (`src/worker/index.ts:42,50,69`). |
| 2 | SAVED → INTERESTED → ATTENDING → ATTENDED → FOLLOW_UP; ATTENDING can add to calendar (owner write); FOLLOW_UP creates tasks; every transition is an activity event | VERIFIED | `outreach/pipeline.ts`: `moveStage` uses `canMove` (±1), optimistic `from` check ("changed"), refuses direct FOLLOW_UP, writes audit + `emitActivity("outreach.stage", "From → To")` + live notify. `addToCalendar` requires ATTENDING+ and non-mock, calls `createEvent(..., actor:"owner")` outside the tx, links `calendar_event_id`, cleans up the loser on a race. `createFollowUps` creates 1..10 Phase 4 tasks via `createTask` with `outreachEventId`, moves ATTENDED → FOLLOW_UP in one tx (rollback on any invalid line), emits activity. Server actions in `outreach-pipeline-actions.ts` (requireOwner + zod). UI: `pipeline-board.tsx`, `follow-up-dialog.tsx`, `add-to-calendar-dialog.tsx`, `use-stage.ts`. Migration `drizzle/0008_outreach.sql` present (stage CHECK constraint). |
| 3 | Gmail via existing Google OAuth + added scope + Reconnect Google; incremental sync; Outreach agent classifies/summarises/flags/extracts actions under READ; draft reply; send = APPROVE with edit-before-approve; mail untrusted (content floor) and private (free-model gate) | VERIFIED | Scopes: `google/client.ts` requests calendar + `gmail.readonly` + `gmail.compose`, `include_granted_scopes`; callback requires only calendar scopes (`oauth.ts:58`). Settings `calendar-connection-row.tsx` shows Reconnect Google + Gmail line. Sync `mail/sync.ts` (history.list incremental, 404 → full, metadata only) on `mail.sync` every 5 min. Triage `mail/triage.ts`: Haiku with forced `record_triage` (category, importance, summary, next action, up to 5 action items, flag), zod-validated, recorded as outreach agent runs with cost, cap pause, retry limit (WR-S01). Actions → tasks via `addMailTaskAction` (owner, not agent). Agent tools `tools/mail.ts`: `mail.list`/`mail.get_message` READ + private; `mail.send_reply` APPROVE, handler throws without `approvalId`; recipients/thread server-filled; `mail_reply` approval kind with locked fields (`agents/approvals.ts`). Idempotent send `mail/send.ts` (draft checkpoint, adopt checks, WR-S02/S03). Floor: all mail/outreach tools in `CONTENT_TOOLS` (`policy.ts:13-16`). Hard taint: `mailInScope` ignores `ai.free_private_ok`, used at run start and every turn (`loop.ts:64,283`). Outreach agent live, non-routable Sonnet (`registry.ts:115-125`). |
| 4 | Outreach page (events list + pipeline board, email triage) per Claude Design in Glass; e2e + VM DB tests cover providers, pipeline, Gmail sync, send approval path | VERIFIED (local) / VM + visual pending | `src/app/(os)/outreach/page.tsx` loads real events, pipeline, mail view, follow-ups; `outreach-view.tsx` tabs EVENTS / EMAIL / FOLLOW-UPS, List/Pipeline toggle; event detail route `outreach/events/[id]`. e2e `tests/e2e/outreach.spec.ts` (9 tests: pipeline Save → Follow up with task in FOLLOW-UPS, mock badge, triaged mail + Add as task, mail_reply edit/approve, /approvals render). DB tests: outreach-sync/pipeline/actions/queries/tools, google-oauth, mail-sync/triage/agent/actions/queries (fake Gmail + fixtures). VM DB run and visual review are owner items. |

**Score:** 4/4 truths verified in code and local tests; live confirmation pending (human items).

### Plan must-haves (spot-checked)

| Plan | Key must-have | Status |
|------|---------------|--------|
| 01 | Migration 0008, stage CHECK, QUEUES eventsSync/mailSync/mailTriage | VERIFIED (`drizzle/0008_outreach.sql`, worker createQueue lines 42-44) |
| 02 | safeGet SSRF guards, bodyText, buildReplyMime | VERIFIED via unit `safe-get`, `safe-url`, `mail-text`, `mail-mime` tests (pass) |
| 03/04 | ICS + JSON-LD parse; normalize/dedup; Sydney filter; 60/20/20 score | VERIFIED (code + unit tests) |
| 05 | Scope split, gmail granted/missing, 403 scope ≠ auth | VERIFIED (`oauth.ts`, `gmail-client.test.ts`) |
| 06 | Transitions + activity, calendar, follow-ups | VERIFIED (`pipeline.ts`) |
| 07 | Provider seam, merge rules, error isolation, 6-hourly worker | VERIFIED |
| 08 | Incremental Gmail sync, metadata only, 404 fallback | VERIFIED (`mail/sync.ts`, mail-sync DB tests) |
| 09 | Feeds, keys encrypted + last4, URL import, interests, Sync now | VERIFIED |
| 10 | READ tools in CONTENT_TOOLS, live body capped, hard mail taint, agent live | VERIFIED |
| 11 | Bulk rules, Haiku batches, recorded runs, cap pause, schedules | VERIFIED |
| 12 | mail.send_reply APPROVE + mail_reply kind, locked fields, idempotent send | VERIFIED |
| 13-17 | Settings, mail actions, /outreach UI, pipeline board, EMAIL/FOLLOW-UPS | VERIFIED in code; visual pending |
| 18 | e2e outreach spec + docs | VERIFIED (spec present; reported passing) |
| 19 | Local gates green; OWNER-ACTIONS lists Phase 6 steps; owner VM migrate + UAT | Local + OWNER-ACTIONS VERIFIED; VM/UAT pending (human) |

### Behavioral Spot-Checks (run by verifier)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Unit suite | `npx vitest run tests/unit` | 50 files, 455 tests passed | PASS |
| DB suite (Postgres :5433) | `npx vitest run tests/db` | 55 files, 440 tests passed | PASS |
| e2e | not re-run (needs dev server) | reported 27 passed / 1 skipped after fixes | SKIP (orchestrator evidence) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared for this phase. SKIPPED.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| OUT-01 | Sydney event discovery from real sources with relevance scoring | SATISFIED (live feed pending) | SC1 |
| OUT-02 | Pipeline SAVED→…→FOLLOW_UP | SATISFIED | SC2 |
| OUT-03 | Email intelligence; send = APPROVE | SATISFIED (live Gmail pending) | SC3 |

No orphaned requirements. Note: REQUIREMENTS.md still shows OUT-01..03 as `[ ]`; tick them at phase close.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| Phase 6 source dirs | TBD / FIXME / XXX | none found | — |
| `src/server/mail/send.ts` | `ponytail:` trade-off (owner's own Gmail reply in the window counts as sent) | Info | Deliberate; chosen over double send |
| `src/server/outreach/providers.ts` | `[ASSUMED A1]`, Luma path from third-party docs | Info | Owner probes A1/A2 listed |
| `scripts/glass-gate.sh` | also scans stale `.claude/worktrees/*/design/*.html` | Info | Noise from leftover agent worktrees; consider excluding/cleaning |

### Gaps Summary

No code gaps. All four success criteria are implemented and wired, and local typecheck, unit and DB suites pass when the verifier re-runs them. What remains is owner-only: VM migrate 0008 + VM DB run, Google re-consent with Gmail scopes, real feeds/keys, a live send, and the visual pass. Until those keys are entered, live providers run as labelled MOCKs by decision (D-02, D-06..D-09).

---

_Verified: 2026-10-13T16:40:00Z_
_Verifier: Claude (gsd-verifier)_
