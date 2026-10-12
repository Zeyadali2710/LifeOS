# Phase 6: Outreach - Research

**Researched:** 2026-10-13
**Domain:** Event ingestion (ICS, schema.org JSON-LD, keyed APIs) with an SSRF-safe fetcher; rules-based relevance; pipeline on top of Phase 4 calendar and tasks; Gmail (OAuth scope split, incremental sync, metadata store, live bodies, Haiku triage, threaded reply via APPROVE)
**Confidence:** HIGH for codebase composition (read this session). MEDIUM for the Gmail API shapes (official docs fetched for sync, history.list, drafts and quota; threading rules partly from training). LOW for Eventbrite organizer listing, the Luma API endpoint paths and the Luma ICS field shapes (not verifiable this session; a web search rate limit hit mid-research).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Owner-given constraints (locked)
- **D-01:** **Gmail reuses the existing Google OAuth client from Phase 4.** The owner has already enabled the Gmail API in Google Cloud. The Gmail scopes are added to the Google authorization request, and Settings → Connections gets a **"Reconnect Google"** action on the Google row that re-runs the existing PKCE flow (`startGoogleOAuth`) to grant them.
- **D-02:** **Eventbrite and Luma API keys are entered only in Settings → Connections.** They are stored AES-256-GCM encrypted in `connections` like the GitHub token (Phase 3 D-09; reuse `TokenForm`/`ConnectionRow`), only the last 4 characters are shown, they can be rotated without a redeploy, and they never appear in `.env`, logs or chat. Validation uses constant URLs (Eventbrite `GET /v3/users/me/`, Luma `GET /v1/users/get-self` with the `x-luma-api-key` header). Until a key is entered, each source runs as a **clearly labelled MOCK provider**.
- **D-03:** **Owner-only items are logged, not blocking:** VM migrate/deploy, `scripts/vm-db-test.sh`, UAT, entering keys and feed URLs, and re-consenting Google. They go in OWNER-ACTIONS.md at execution time, using the `[BLOCKING]` owner migrate pattern from earlier phases.

#### Event sources: what is real and what is mock (research-verified, see the log)
- **D-04:** **Real source 1 is iCal feeds (`ics` provider). It is the main discovery path.** The owner adds iCal subscription URLs in Settings → Connections → Event feeds, for example **Luma's Discover city feed for Sydney** (Luma documents "Add iCal Subscription" on Discover city pages, and that feed holds all upcoming approved events in the city), public Luma calendars, and Meetup group feeds when they work. Parsing uses the already-installed `ical.js` (no new dependency). Fetches are https only with an SSRF guard (no private, loopback or link-local IPs, re-checked after redirects), a 2 MB cap and a timeout. Feed URLs may contain personal tokens, so they are stored encrypted and the UI shows only the host plus the owner's label.
- **D-05:** **Real source 2 is URL import (`url` provider).** The owner pastes an event page URL (Eventbrite, Humanitix, Meetup, Luma or any other) and LifeOS reads the page's schema.org `Event` JSON-LD (`name`, `startDate`, `endDate`, `location`, `organizer`, `offers`, `url`, `description`). The same SSRF guard and size cap as D-04 apply. Imported events go straight to SAVED. When a page has no JSON-LD Event, the error is honest ("No event data found on that page") and nothing is scraped.
- **D-06:** **Eventbrite runs MOCK until a private token is entered.** Public event search was removed (closed to the public 2019-12-12, all requests denied after 2020-02-20), so a token cannot discover events. With a token, the provider lists events from **organizers the owner follows**. The owner enters organizer IDs next to the key. The planner must verify that the organizer/organization events endpoint returns public events of organizers other than the owner. If it does not, the provider declares `capabilities: { discover: false }`, lists only the owner's own events, and the UI says exactly that.
- **D-07:** **Luma API runs MOCK until a key is entered.** The API needs Luma Plus, and each key only covers the calendar it was created on, so it adds discovery value only for the owner's own Plus calendar. Real Sydney discovery from Luma comes from the iCal feeds in D-04, which need no key.
- **D-08:** **Meetup and Humanitix are MOCK classes with no key field.** Meetup's GraphQL API needs Pro, and its iCal feeds are reported to be unreliable when logged out, so the owner can try a group feed via D-04. Humanitix's API key is read-only and covers events the owner owns or that are shared with them, which is not discovery. Pages from both sites come in through URL import (D-05).
- **D-09:** **Mocks follow the existing labelling rules.** A mock provider is a real class that reads fixture data and has `isMock: true` (ADR-010). Every mock event card shows a **MOCK** badge. The events list has a "Hide mock" toggle that is **on by default once any real source exists**. Mock events **cannot be added to a real calendar** and their FOLLOW_UP creates no tasks (the button is disabled with an explanation).

#### Normalization, dedup, storage, cadence
- **D-10:** **Storage uses three tables.**
  - `event_sources`: id, kind (`ics`, `eventbrite`, `luma`, `meetup_mock`, `humanitix_mock`), label, encrypted URL, enabled, lastSyncAt, lastSyncError. The keys themselves live in `connections`.
  - `outreach_events`: normalized title, start, end, timezone, venue/location text, optional lat/lng, online flag, organizer, price text, canonical url, description (capped, about 4 KB), categories[], `is_mock`, a sources jsonb array of `{sourceId, remoteId}`, raw jsonb, score, signals jsonb, why text, `stage` (null means discovered, not saved), `stage_changed_at`, `calendar_event_id` (nullable FK to `calendar_events`), `dismissed_at`.
  - `tasks` gains two nullable FKs (D-17, D-27).
- **D-11:** **Dedup happens at upsert.** The primary key is (source, remoteId). Across sources, events merge when the canonical URL matches (lower-cased, query and fragment stripped), or else when the normalized title (lower-case, punctuation and whitespace collapsed) and the start time (to the minute) both match. A merged row keeps the union of its sources, and real data beats mock when fields conflict.
- **D-12:** **Window and Sydney filter.** Events are kept from now to **60 days ahead**. An event counts as "Sydney" when its geo lies within about 60 km of the CBD, or, without geo, when its location text matches Sydney or NSW. Online events are kept and tagged Online. Events with no location are kept and tagged "Location unknown". Past, unsaved events are pruned after 30 days. Saved events are never pruned.
- **D-13:** **Sync runs every 6 hours plus a "Sync now" button.** It is a new pg-boss queue, `outreach.events.sync`, following the GitHub and calendar pattern. Per-source errors are isolated and recorded on `event_sources`, and an auth failure on a keyed source marks the connection RECONNECT. One sync emits one activity event (Outreach source, at most one per run) and only when it found new events scoring 70 or more.

#### Relevance scoring
- **D-14:** **Scoring uses explainable rules with no LLM, and it costs $0.** Score 0–100 = **INTERESTS 60 + PROJECTS 20 + SCHEDULE 20**.
  - INTERESTS: matches of owner-editable interest keywords against title, categories and description. Title and categories weigh more than description. The keywords are seeded from the design's filters: Entrepreneurship, Startups, Computer Science, Cybersecurity, Engineering, AI, Fintech, Networking.
  - PROJECTS: matches of active project names, categories and context keywords (Phase 5) against the event text.
  - SCHEDULE: 100 when the event fits free time, 50 when it overlaps an optional busy event, 0 when it conflicts with a busy event. This reuses the Phase 4 conflict and free-slot code.
  - The stored `signals` (label, value, matched terms) drive the design's "WHY THIS IS RELEVANT" block, and the `why` line is templated from them, for example "Matches cybersecurity, AI · fits your Thursday evening · related to project Sentinel". The design's NETWORK and GOALS signals are left out (no contacts yet, and Goals arrive in Phase 8). Scores are recomputed on each sync and whenever interests or projects change.
- **D-15:** **Interests are edited in Settings → Outreach**, a small section with a chip editor stored in the `settings` key/value table (`outreach.interests`). The Outreach page's filter chips are those same interests.

#### Pipeline (OUT-02)
- **D-16:** **The stage is a column on `outreach_events`.** The buttons are Save (→ SAVED), Interested, Attend (→ ATTENDING), Attended and Follow up. The owner can move forward or back one step, and Dismiss hides an event. Writes are owner UI actions that go direct and are audit-logged (Phase 4 D-06, Phase 5 D-16). **Every transition emits an activity event** (Outreach source, `travel_explore` icon, cyan) stating from and to.
- **D-17:** **ATTENDING offers "Add to calendar". It is not automatic.** The owner picks a calendar, defaulting per Phase 4 D-09, and the event is created right away through the existing `createEvent(..., { actor: "owner" })` with title, time, location and the URL in the description. `calendar_event_id` links them and the card shows "On calendar". Moving back out of ATTENDING does not delete the calendar event; the owner does that in Organization. Blocked for mock events (D-09).
- **D-18:** **Entering FOLLOW_UP opens a small dialog** pre-filled with one task, "Follow up: <event title>", due 2 days after the event ends, with priority 2. The owner can edit it or add more lines, then confirm. Tasks are created with the Phase 4 `createTask`, plus a new nullable `tasks.outreach_event_id` FK (`ON DELETE SET NULL`). The FOLLOW-UPS tab lists open tasks linked to an event or an email.
- **D-19:** **Agents get READ access to events this phase:** `outreach.list_events` (filters: stage, min score, date range) and `outreach.get_event`. Agent pipeline writes are deferred, keeping READ consistency per Phase 4 D-19 and Phase 5 D-17. Event descriptions come from third parties, so both tools join `CONTENT_TOOLS` and the 5.1 floor applies.

#### Gmail connection and sync (OUT-03)
- **D-20:** **Scopes are `gmail.readonly` and `gmail.compose`.** `compose` covers creating a draft and sending it (`drafts.create`, `drafts.send`). `gmail.modify` is not requested: archive and flag are LifeOS-local (D-26), so nothing in Gmail is relabelled or moved. `gmail.send` alone is not enough, because it cannot create drafts. Both chosen scopes are **restricted**. That is acceptable for a single-user personal app: Google exempts personal use under 100 users from verification, and the app stays unverified, so the owner clicks past the "Google hasn't verified this app" screen once.
- **D-21:** **There is one Google grant, and the granted scopes are stored.** The scopes are added to `GOOGLE_SCOPES` in the auth request. The callback still **requires only the calendar scopes**. Gmail scopes are detected from the token response's `scope` and stored on the connection row (a new `scopes` jsonb column). Today `GOOGLE_SCOPES.every(...)` in `oauth.ts` checks every scope, so it must be split into requested scopes and required (calendar-only) scopes. If Google's granular consent lets the owner untick Gmail, Calendar keeps working and Email shows "Reconnect Google to allow Gmail". Disconnecting Google revokes both, and the UI warns about this.
- **D-22:** **Sync is a pg-boss queue, `mail.sync`, every 5 minutes plus Sync now** (same cadence as calendar). The first run is a full sync of the **INBOX for the last 30 days, capped at 500 messages** (`messages.list` then `messages.get format=metadata`), and it stores the latest `historyId`. After that it uses `history.list` with `startHistoryId` (messageAdded, labelAdded and labelRemoved for INBOX). A **404 triggers a full resync**. Google keeps history for at least about a week, so a VM outage longer than that falls back cleanly. There is no push or Pub/Sub, because LifeOS is reachable over Tailscale only.
- **D-23:** **Only metadata is stored, not bodies.** `mail_messages` holds gmail id, threadId, from (name and address), to and cc, subject, date, labelIds, snippet, a `bulk` flag (List-Unsubscribe header or CATEGORY_PROMOTIONS/SOCIAL), plus the triage outputs (category, importance, summary, action items, flagged, triagedAt, triage model) and the local state (archivedAt, flaggedAt). **Bodies are fetched live** when the detail view opens and when triage runs, and they are never persisted (5.1 D-04 pattern). Rows older than 90 days whose messages left INBOX are pruned.
- **D-24:** **Bodies are rendered as plain text only.** The detail view prefers the `text/plain` part. For HTML-only mail, the server strips tags to text. No HTML is rendered, no remote images or tracking pixels load, and link URLs are shown as text. Plain-text body output is capped at 16 KB on a code-point boundary (5.1 WR-05 helper).

#### Triage: classify, summarise, flag, extract
- **D-25:** **Triage is a worker batch job, `mail.triage`, enqueued after each sync that adds messages.** Rules go first:
  - `bulk` mail is classified OTHER, LOW importance, with no LLM call.
  - The rest goes to **Haiku 4.5** (the Phase 3 D-16 triage model) in batches of up to 10 messages per call, as structured output: category from the design (IMPORTANT, EVENTS, NETWORKING, OPPORTUNITIES, FOLLOW-UP, OTHER), importance (HIGH, MEDIUM, LOW), a 1–2 sentence summary, recommended action, up to 5 action items with an optional due date, and a flag boolean.
  - Each batch is recorded as an **Outreach agent run** (source `mail.triage`) so spend, the cap, the Command Centre and observability all apply.
  - **At the spend cap, triage pauses** and the Email tab says "Triage paused: monthly AI cap reached". Untriaged mail still shows with its snippet.
  - The initial backfill triages **only the last 7 days** (at most 100 messages). Older synced mail stays untriaged until the owner clicks "Triage" on it.
- **D-26:** **"Flag" has two parts.** The agent's flag is stored as `flagged`. The owner's Flag and Archive buttons are **LifeOS-local** (`flaggedAt`, `archivedAt`), which hide or pin the mail in LifeOS without touching Gmail. HIGH importance mail creates **one IMPORTANT notification per message**, deduped.
- **D-27:** **Action items reach tasks through the owner.** Each extracted item has an "Add as task" button that creates a Phase 4 task directly (owner write) with the email subject and sender in its notes, plus a new nullable `tasks.mail_message_id` FK. The agent never creates tasks by itself (READ tier, as the success criteria require). The FOLLOW-UPS tab shows these tasks next to event follow-ups.
- **D-28:** **Mail is always private and always untrusted.**
  - *Untrusted:* bodies and snippets go to the LLM inside the 5.1 envelope (`untrusted: true`), and the triage prompt says mail is data and never instructions. Triage output is zod-validated and length-capped, so a malicious email can at worst mislabel itself.
  - *Private:* mail content **never goes to free models**, and there is no toggle. Any tool that returns mail is `private: true`, so the run is tainted (`saw_private`) and the 03.1 router keeps it on Anthropic models. `redact.ts` still runs.

#### Drafting and sending
- **D-29:** **The Outreach agent goes live.** Its tools are:
  - READ: `outreach.list_events`, `outreach.get_event`, `mail.list` (searches synced metadata and triage output by category, importance, sender or text), and `mail.get_message` (live body inside the untrusted envelope).
  - APPROVE: `mail.send_reply`.

  All mail and event tools are added to `CONTENT_TOOLS`, so the 5.1 gateway floor lifts any side effect in those runs to at least APPROVE. The orchestrator delegates email and events questions to it. Drafting is `reasoning` tier (Sonnet), and the mail taint keeps the run off free models anyway.
- **D-30:** **The draft is the approval.** "Draft with agent" (in the EmailDetail and FOLLOW-UPS views, and from chat) runs the Outreach agent, which calls `mail.send_reply` with `{ messageId, threadId, to, cc, subject, body }`. That creates the pending approval, which the EmailDetail shows as the design's **"DRAFT REPLY · OUTREACH AGENT · not sent"** block with **edit-before-approve**: subject and body are editable, and `messageId`, `threadId`, `to` and `cc` are **locked**. Replies go only to the original thread's participants, so injected text cannot redirect mail. The copy reads "Reply opens an approval. Nothing sends automatically." The approval card also shows a "Drafted from email content (untrusted)" note (5.1 D-15 pattern).
- **D-31:** **"Save to Gmail drafts" on a pending reply is an owner action.** It creates a real Gmail draft (`drafts.create`, threaded) directly so the owner can finish it in Gmail, and LifeOS then rejects the approval with the reason "moved to Gmail drafts". This is how "drafting a reply creates a draft" is honoured without the agent writing to Gmail on its own.
- **D-32:** **Sending after approval is idempotent** (AGT-03). The MIME message gets a deterministic `Message-ID: <approval-{id}@lifeos.local>` plus `In-Reply-To` and `References` from the original, and is sent via `drafts.create` then `drafts.send` in the thread. On an ambiguous retry (`ctx.adopt`), the handler first searches Sent with `rfc822msgid:` and returns the existing message instead of sending again. This is the analogue of the GitHub issue marker. The new approval kind `mail_reply` in `approval-kinds.ts` gets its schema, `LOCKED` fields, summary ("Approval waiting: reply to Hannah Lee · Re: Demo night slot") and a `MailApprovalBody`. It works on the Approvals page, inline in the AI panel, and through the APPROVAL notification, and reuses the 7-day expiry.
- **D-33:** **Send failures are honest.** A missing Gmail scope raises `NOT_CONNECTED` and a "Reconnect Google" link. Auth failures mark the connection RECONNECT. Sending never falls back to anything else.

#### Outreach page (UI)
- **D-34:** **The layout follows `design/glass/Glass Outreach.dc.html` in the Glass system** (`04.1-SPACING-RUBRIC.md`). The design's placeholder data is never ported. There are three tabs, **EVENTS, EMAIL and FOLLOW-UPS**, each with real counts. The design's **NETWORK tab is omitted** (deferred).
  - **EVENTS:** interest filter chips, a "N events · Sydney · next 60 days · sorted by relevance" line, and EventCards (date block, title, time, price, score, location, organizer, category chips, WHY THIS IS RELEVANT, and Save, Interested, Attend and Calendar actions) with MOCK and source badges. A **List / Pipeline** toggle switches to a 5-column pipeline board (a static board with no drag; cards move with buttons). Event detail is a route or panel showing description, signals with values, facts, a source link and stage actions. The cover image, agenda and PEOPLE YOU KNOW GOING are omitted.
  - **EMAIL:** category chips with counts, an EmailCard list (from, flag, time, subject, summary, importance → recommended action), and EmailDetail (AI SUMMARY, ACTION ITEMS with Add as task, MESSAGE as plain text, DRAFT REPLY, and Reply/Draft with agent, Archive and Flag).
  - **FOLLOW-UPS:** open tasks linked to an event or an email, with due dates and "Draft with agent".
- **D-35:** **Honest states:**
  - Gmail not connected or missing the scope shows a CTA to Settings → Connections → Reconnect Google.
  - With no event sources, the page shows "Add an iCal feed or import an event URL" plus the mock providers' events, clearly badged.
  - Sync errors show `lastSyncError`.
  - Triage paused at the cap is shown as such.
  - Loading uses Skeleton, and mobile follows the Glass Mobile pattern (a list, then the detail as a full sheet).
- **D-36:** **Home and the palette get two cheap integrations:** the palette gains an "Events" scope (search saved and discovered events by title) and an "Import event URL" command (Phase 2 D-06). Home is untouched unless an existing section already expects outreach data (planner's call).

#### Testing
- **D-37:** **Testing strategy:**
  - Unit tests: ICS and JSON-LD parsers (fixtures for Luma ICS, a Meetup ICS and Eventbrite/Humanitix JSON-LD pages), the SSRF guard, dedup keys, scoring and why-lines, the Sydney filter, MIME building (threading headers, Message-ID), HTML-to-text, triage output schema, and the `mail_reply` locks and summary.
  - Helpers: `tests/helpers/fake-gmail.ts` (list, get, history including a 404, drafts, send, search) and `tests/fixtures/gmail/`, beside the existing `fake-google.ts`.
  - DB tests (VM, `scripts/vm-db-test.sh`, run by the owner): source sync and upsert/merge, pipeline transitions with activity events, Add to calendar (fake calendar), follow-up tasks, Gmail full then incremental sync with 404 fallback, triage batches recorded as runs, cap pause, the private taint, the content floor, and send idempotency on adopt.
  - e2e on the existing Playwright suite with the fake LLM: import URL → Save → Interested → Attend → Add to calendar → Attended → Follow up creates a task; an email fixture is triaged, then Draft with agent → approval card → edit body → approve → fake Gmail records one send.
  - Every test uses fixtures, so no test touches real Gmail, Eventbrite or Luma.

### Claude's Discretion
- Exact table and column names, indexes, and where the Gmail scope list is stored on the connection row.
- Score weights within the 60/20/20 split, keyword matching (word boundary, stemming-free), Sydney radius, and the location-text list.
- ICS recurrence handling (expand only within the 60-day window via `ical.js`) and per-feed event caps.
- Triage batch size, prompt wording, and the exact bulk heuristics.
- Event detail as a route (`/outreach/events/[id]`) versus a panel. The email detail layout on mobile.
- Whether the Eventbrite organizer list lives on the connection row or in `event_sources`.
- Wave split. Suggested: (1) schema, providers, sync and scoring; (2) pipeline, calendar and tasks; (3) Gmail connect, sync and triage; (4) Outreach agent, `mail_reply` approval and send; (5) UI; (6) tests and docs (`docs/integrations.md` Outreach section, least-privilege scopes).

### Deferred Ideas (OUT OF SCOPE)
- NETWORK tab / contacts and relationship CRM, "people you know going", and the NETWORK relevance signal (a future People phase or Socials).
- GOALS relevance signal (Phase 8 Goals).
- LLM-assisted relevance ("why" written by the model) as an optional layer on the rules.
- Gmail push notifications (Pub/Sub) instead of polling. This needs a public endpoint, which conflicts with Tailscale-only access.
- `gmail.modify`: archiving, starring or labelling in Gmail itself.
- Agent writes to the pipeline or tasks (save event, create follow-up) at PREPARE → APPROVE.
- Outlook / Microsoft Graph `MailProvider`.
- Event cover images (would need a proxy so the browser makes no third-party requests), agendas, and maps.
- Auto-sending or templates for bulk outreach (out of scope by design: sending is always APPROVE).
- Meetup Pro GraphQL and Humanitix API providers, if the owner ever gets access that grants discovery.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OUT-01 | Sydney event discovery from real sources with relevance scoring | Pattern 1 (SSRF-safe `safeGet` on `node:https` with a validating `lookup`), Pattern 2 (feed ICS parse by reusing `icsSeries`/`loadZones`/`expand` from `calendar/expand.ts`), Pattern 3 (JSON-LD extraction), Pattern 4 (upsert/merge with a fix for recurring instances), Pattern 5 (scoring that reuses `loadInstances` and the `busyOf` rules), keyed providers (Eventbrite/Luma) that fail honestly, mock providers with `isMock` |
| OUT-02 | Pipeline SAVED→INTERESTED→ATTENDING→ATTENDED→FOLLOW_UP | Pattern 6 (conditional `UPDATE … WHERE stage = from` + `emitActivity`), `createEvent(h, {calendarId, input}, {actor:"owner", providerFor, now})`, `pickDefaultCalendar`, `createTask` plus the new FK columns |
| OUT-03 | Email intelligence: classify, summarize, flag, extract actions, draft replies (send = APPROVE) | Pattern 7 (scope split in `oauth.ts`), Pattern 8 (Gmail client via a parameterized `createGoogle` base), Pattern 9 (quota-safe full and incremental sync), Pattern 10 (triage as a recorded Haiku run with a forced tool), Pattern 11 (hard mail taint that the `ai.free_private_ok` toggle cannot override), Pattern 12 (`mail.send_reply` APPROVE + `mail_reply` kind + idempotent send) |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md / memory)

- There is no `./CLAUDE.md` in the repo. `AGENTS.md` warns that Next.js 16 has breaking changes, so read `node_modules/next/dist/docs/` (present: `01-app`, `02-pages`, `03-architecture`) before writing route code. Verified pattern in this repo: page `params` and `searchParams` are **Promises** (`src/app/(os)/projects/[id]/page.tsx`: `{ params: Promise<{ id: string }> }`, then `await params`). The new `/outreach/events/[id]` route must follow it. Middleware is `src/proxy.ts`, not `middleware.ts`.
- Ponytail: smallest diff, reuse helpers, **no new dependencies** (none are needed, see Standard Stack).
- The owner tests only on the VM over SSH. DB tests run on the VM through `scripts/vm-db-test.sh`, and locally against Postgres :5433, which works per the orchestrator. Schema changes need a `[BLOCKING]` owner deploy + migrate line in `.planning/OWNER-ACTIONS.md`.
- Overnight autonomous mode: log owner-only blockers in OWNER-ACTIONS.md and keep going.
- UI source of truth: `06-UI-SPEC.md` (approved). It allows no new tokens and adds 4 icons (`bookmark`, `star`, `groups`, `reply`) to `src/ui/icon-names.ts` plus a subset regeneration.

## Summary

Most of this phase composes existing code. Google OAuth, token refresh, encrypted single-row connections, the pg-boss schedule pattern, the gateway with its content floor, approvals with edit, lock and adopt, `createEvent` for owner writes, `createTask`, `emitActivity`, `ical.js` expansion and the fake-fetch test helpers all exist and fit. Four places in the existing code need care because the new flow hits them for the first time:

1. **The private gate can be switched off, but D-28 says mail never can be.** `loop.ts` and `createRun` skip the free-model block when `ai.free_private_ok` is true, and STATE.md records that the owner **enabled** it. `saw_private` alone therefore does not keep mail off free models: Opus could delegate mail text to the routable organization agent, which would then run on a free model. You need a hard "mail seen" check that ignores the toggle (Pattern 11, about 10 lines, reusing `contentScope`). Also make the Outreach agent `routable: false`, so `resolveModel` always returns `defaultModel` (Sonnet).
2. **The Google callback requires every requested scope** (`GOOGLE_SCOPES.every(...)` in `oauth.ts`). Adding Gmail scopes to that one list would break Calendar for an owner who unticks Gmail on Google's granular-consent screen. Split it into `GOOGLE_SCOPES` (requested) and `CALENDAR_SCOPES` (required), and store the granted list.
3. **Gmail quota.** The limit is 6,000 units per user per minute and `messages.get` costs 20 units [CITED: developers.google.com/workspace/gmail/api/reference/quota]. A one-shot 500-message metadata backfill costs 10,000 units and would hit 429. The full sync must be resumable, with at most about 200 gets per run.
4. **Dedup by canonical URL alone collapses recurring ICS occurrences**, because every instance of a series shares the URL and title. Apply the URL-merge rule only when start minutes also match, or only to non-recurring rows (Pitfall 3).

On the external side: Gmail sync, history and quota behaviour were verified against the official docs. `include_granted_scopes` and granular consent were verified (the token response `scope` lists only what was granted). The Eventbrite organizer-events access rule **could not be confirmed**: the official reference documents `GET /organizations/{id}/events/` with an `organizer_filter`, and no source documents whether other organizers' events can be listed. D-06 already covers both outcomes, so build the documented own-organization path and treat the organizer path as a runtime probe that fails honestly. The exact Luma city-feed URL shape is undocumented. Luma's help page documents the "Add iCal Subscription" action, so the owner copies the generated link and LifeOS never constructs it.

**Primary recommendation:** Build `src/server/outreach/*` and `src/server/mail/*` as thin modules over existing helpers. There is one migration (0008), three new queues and one new approval kind, and no new packages. Use a stdlib `node:https` fetcher whose DNS `lookup` hook rejects private IPs at connect time; that pins the IP and closes the rebinding gap. Make Gmail full sync resumable. Send replies through a draft-id checkpoint, so idempotency does not depend on Gmail keeping the custom `Message-ID`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feed/page fetch with SSRF guard | API / Backend (worker + server action) | — | Outbound network is server-only; the URL is owner input |
| ICS / JSON-LD parsing, normalize, dedup, score | API / Backend (pure modules) | — | Deterministic, unit-testable, no browser exposure of raw third-party content |
| Event + mail persistence, pruning | Database | API (sync jobs) | Upserts in transactions; FKs `ON DELETE SET NULL` |
| Scheduled sync / triage | Worker (pg-boss) | — | Worker owns schedules (`src/worker/index.ts`) |
| Pipeline transitions, Add to calendar, follow-up tasks, Add as task, Archive/Flag | API (server actions, `requireOwner`) | Browser (optimistic UI) | Owner writes go direct + audit (Phase 4 D-06) |
| Gmail OAuth scopes | API (callback route) | Database (`connections.scopes`) | Token response `scope` is authoritative |
| Gmail body fetch + HTML→text | API (server action / tool) | — | Bodies never persisted; never rendered as HTML |
| Triage LLM call | Worker | Database (agent_runs/run_turns for spend) | Spend cap and observability reuse the runs tables |
| Draft/send reply | Agent gateway (APPROVE) → worker `executeApproved` | Browser (MailApprovalBody edit) | Send = APPROVE; locks enforced server-side in `decide()` |
| Free-model exclusion of mail | API (loop/createRun) | — | Policy is enforced where models are resolved, not in prompts |

## Standard Stack

No new packages. Everything below is already installed (`package.json` read this session).

### Core
| Library / API | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ical.js | 2.2.1 [VERIFIED: node_modules/ical.js/package.json] | Feed ICS parse + recurrence expansion | Already used by `calendar/expand.ts` (`icsSeries`, `loadZones`, `expand`) |
| zod | ^4.6.5 | JSON-LD Event shape, triage output, `mail_reply` payload, tool I/O | Every schema in the repo |
| drizzle-orm / drizzle-kit | ^0.45.3 / ^0.31.11 | Migration `0008_*` via `npm run db:generate` | Existing |
| pg-boss | ^12.37.0 | `outreach.events.sync`, `mail.sync`, `mail.triage` | Existing queue pattern |
| @anthropic-ai/sdk | ^0.132.1 | Haiku triage (via `getLlm()`), Sonnet drafting | Existing `LlmClient` |
| Node stdlib | Node v24.19.0 [VERIFIED: `node --version`] | `node:https` + `node:dns` `lookup` + `node:net` `BlockList` (SSRF), `Buffer` base64url (Gmail raw), `TextDecoder` | `BlockList.check()` with IPv4-mapped IPv6 verified in this session |
| Gmail REST v1 | `https://gmail.googleapis.com/gmail/v1/users/me/...` | getProfile, messages.list/get, history.list, drafts.create/send/delete | [CITED: developers.google.com/workspace/gmail/api] |

### Supporting (test)
| Library | Version | Purpose |
|---------|---------|---------|
| vitest | ^5.0.3 | `tests/unit`, `tests/db` |
| @playwright/test | ^1.63.0 | `tests/e2e` (system Chrome locally) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:https` + validating `lookup` | global `fetch` + pre-resolve DNS check | `fetch` resolves again at connect, leaving a DNS-rebinding TOCTOU gap. Pinning through `fetch` needs an undici `Agent`, and `undici` is not a direct dependency (only `undici-types`). Use `node:https`. |
| `googleapis` | — | It is a huge dependency. The repo deliberately uses plain fetch (`client.ts` header comment). |
| HTML sanitizer library | regex tag strip → text | D-24 renders plain text only, so no HTML ever reaches the DOM. Stripping to text is enough. |
| Separate `outreach_event_sources` table | `sources` jsonb + GIN | D-10 locks jsonb; a GIN `jsonb_path_ops` index makes `@>` lookups cheap. |

**Installation:** none.

## Package Legitimacy Audit

This phase installs no external packages, so slopcheck was not run.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────── EVENTS (OUT-01/02) ─────────────────────────────────────────────┐
 pg-boss cron 6h / Sync now ──► outreach.events.sync (worker)
                                   │ for each enabled source (errors isolated → event_sources.lastSyncError)
                                   ├─ ics: decrypt URL → safeGet(≤2MB, https, lookup-guard, ≤3 redirects) → ICAL.parse
                                   │        → per VEVENT icsSeries → expand(now, now+60d) → RawEvent[]
                                   ├─ eventbrite/luma: key from connections → fixed-host API → RawEvent[]
                                   │        (no key → MockProvider fixtures, isMock)
                                   └─ meetup_mock / humanitix_mock → fixtures
                                   ▼
                     normalize (title/url canon, Sydney filter, online, caps)
                                   ▼
                     upsert/merge in tx (sources @> {s,r} → URL+start → title+start)
                     NEVER overwrite stage/dismissed_at/calendar_event_id
                                   ▼
                     score(all window rows): interests(settings) + projects + schedule(loadInstances)
                                   ▼
                     ≤1 activity event (new & score≥70) + notifyLive("outreach")

 Owner: Import URL (server action) ─► safeGet page ─► JSON-LD Event? ─no─► "No event data found on that page"
                                                         └─yes─► normalize → upsert (source "url") → stage SAVED
 Owner: stage button ─► UPDATE … WHERE id AND stage=from ─► audit + emitActivity(outreach, from→to)
   Attend → Add to calendar ─► createEvent(actor owner) ─► calendar_event_id   (blocked if is_mock)
   Follow up dialog ─► tx: createTask×n (+outreach_event_id) + stage FOLLOW_UP   (blocked if is_mock)
                └──────────────────────────────────────────────────────────────────────────────┘

                ┌──────────── EMAIL (OUT-03) ────────────────────────────────────────────────┐
 Settings: Reconnect Google ─► startGoogleOAuth (scopes: calendar + gmail.readonly + gmail.compose,
                                include_granted_scopes=true) ─► callback: require CALENDAR_SCOPES only,
                                store granted scopes → connections.scopes
 pg-boss */5 / Sync now ─► mail.sync (worker; skipped unless gmail.readonly granted)
     state(settings 'mail.sync'): none/partial ─► FULL: getProfile.historyId(save first) → messages.list
                                     INBOX newer_than:30d (≤500 ids) → get metadata for ids not stored (≤200/run)
                         done ─► INCREMENTAL: history.list(startHistoryId, labelId=INBOX) ─404─► reset → FULL
     upsert mail_messages (metadata+snippet, bulk flag) ─► new rows? enqueue mail.triage
 mail.triage (worker) ─► capStatus reached? → paused flag, stop
     bulk → OTHER/LOW (no LLM) ; rest: batches ≤10 → fetch bodies live (format=full → text, 4KB each)
     → Haiku, forced tool record_triage, untrusted envelope → zod → update rows
     → record agent_runs(outreach, saw_private) + run_turns(cost) ; HIGH → 1 IMPORTANT notification (claim notified_at)

 Owner "Draft with agent" ─► openAI(prompt with mail id) ─► orchestrator ─delegate(outreach, reasoning)─►
     outreach run (Sonnet, non-routable) ─► mail.get_message (private, CONTENT) ─► mail.send_reply
     ─► gateway: resolve() recomputes to/cc from stored participants; APPROVE ─► approvals(pending)
 Owner edits subject/body ─► decide(approve): zod + LOCKED[messageId,threadId,to,cc,inReplyTo] ─► resume job
 worker executeApproved ─► handler: adopt? find existing → else drafts.create(threadId, raw MIME w/ In-Reply-To,
     References, Message-ID) → checkpoint draftId → drafts.send → result {messageId, threadId}
 Owner "Save to Gmail drafts" ─► drafts.create ─► claim pending→rejected(result {gmailDraftId}) ─lost?─► drafts.delete
                └──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended file touch list

```
drizzle/0008_*.sql (+ meta)                  # event_sources, outreach_events, mail_messages, tasks.outreach_event_id/mail_message_id, connections.scopes
src/server/db/schema.ts
src/server/queue.ts                          # QUEUES.eventsSync/mailSync/mailTriage
src/worker/index.ts + src/worker/jobs/{outreach-sync,mail-sync,mail-triage}.ts
src/server/net/safe-get.ts                   # NEW: SSRF-safe GET (stdlib)
src/server/outreach/{ics,jsonld,normalize,score,providers,mock-events,sync,pipeline,queries}.ts   # NEW
src/server/outreach-actions.ts               # NEW server actions (stage, add-to-calendar, follow-up, import, dismiss, interests, sync now, feeds, keys)
src/server/mail/{client,sync,triage,text,mime,send,queries}.ts   # NEW
src/server/mail-actions.ts                   # NEW (open body, archive, flag, add as task, triage one, save to drafts, sync now)
src/server/calendar/google/{client,oauth}.ts # scope split, include_granted_scopes, createGoogle base param
src/server/calendar/connections.ts           # saveCalendarSecret(…, scopes), DTO gmail flag
src/server/calendar/caldav/provider.ts       # extract normalizeVevent() from normalizeIcs (shared with feeds)
src/server/agents/{registry,policy,loop,approvals}.ts, tools/{outreach,mail,index}.ts, types.ts (LlmClient toolChoice), llm.ts
src/server/events.ts + src/shell/live-provider.tsx   # notifyLive kind "outreach" | "mail"
src/lib/{approval-kinds,mail-payload,outreach-types,agent-types}.ts
src/shell/activity-list.tsx                  # SOURCES.outreach = travel_explore / text-cyan
src/shell/palette*.ts(x), src/server/palette-actions.ts   # Events scope + Import command
src/app/(os)/outreach/{page,loading}.tsx, src/app/(os)/outreach/events/[id]/page.tsx
src/outreach/*, src/approvals/mail-approval.tsx (+ approval-detail/list, shell/ai/approval-card one-line branches)
src/settings/{event-feeds,outreach-section}.tsx, connections-section.tsx, calendar-connection-row.tsx
tests/helpers/fake-gmail.ts, tests/fixtures/{gmail,outreach}/*
docs/{integrations,agents,permissions}.md
```

### Pattern 1: SSRF-safe GET (stdlib, IP pinned at connect)
**What:** One helper used by the ICS feed sync and the URL import. `isSafeUrl` (existing, `src/lib/safe-url.ts`) handles syntax. A custom `lookup` passed to `https.request` rejects private, loopback, link-local, CGNAT, multicast and IPv4-mapped addresses **at the moment the socket connects**, so DNS rebinding cannot slip past. Redirects are followed manually (at most 3), and each hop is re-checked with `isSafeUrl` and goes through the same lookup. The body is streamed with a byte cap and a total timeout.
```ts
// Source: Node docs (https.request lookup option, net.BlockList); verified BlockList IPv4-mapped check this session
import https from "node:https"; import dns from "node:dns"; import { BlockList, isIP } from "node:net";
const BLOCK = new BlockList();
for (const [a, p] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["224.0.0.0",4],["240.0.0.0",4]] as const) BLOCK.addSubnet(a, p, "ipv4");
for (const [a, p] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["::ffff:0:0",96]] as const) BLOCK.addSubnet(a, p, "ipv6");
const guardedLookup: typeof dns.lookup = ((host, opts, cb) =>
  dns.lookup(host, { ...(opts as object), all: true }, (err, addrs) => {
    if (err) return cb(err, "", 4);
    const list = addrs as dns.LookupAddress[];
    const bad = list.find((a) => BLOCK.check(a.address, a.family === 6 ? "ipv6" : "ipv4"));
    if (bad || !list.length) return cb(Object.assign(new Error("blocked"), { code: "EBLOCKED" }), "", 4);
    (opts as { all?: boolean }).all ? cb(null, list as never) : cb(null, list[0]!.address, list[0]!.family);
  })) as never;
// safeGet(url, { maxBytes: 2_000_000, timeoutMs: 15_000, accept, truncateOk }) → { status, contentType, body, finalUrl }
// - isSafeUrl(url) else throw "invalid"; reject literal-IP hosts via isIP()+BLOCK too (lookup isn't called for IP literals)
// - https.request(url, { lookup: guardedLookup, headers: { accept, "user-agent": "LifeOS/1 (+personal)" } })
// - 3xx: resolve Location against current URL, re-run isSafeUrl, hop ≤3
// - stream; at maxBytes: ICS → error "Feed is larger than 2 MB"; HTML → stop reading and parse what arrived (truncateOk)
```
Errors are fixed strings (for example "Couldn't reach that address.", "That address isn't allowed.", "Feed is larger than 2 MB."), never raw error text, and the URL is never logged because feed URLs can contain tokens.

### Pattern 2: Feed ICS → occurrences (reuse Phase 4 expansion)
Extract the body of `normalizeIcs` (`caldav/provider.ts:132`) into `normalizeVevent(v, zones, url, etag)`; `normalizeIcs` then calls it, with no behaviour change. For a feed: `root = new ICAL.Component(ICAL.parse(text))`, `zones = loadZones(root)`, and each `vevent` **without** `recurrence-id` → `normalizeVevent` → `StoredEvent` with fake `id`/`calendarId` → `expand(rows, now, now + 60d)`. The existing `MAX_OCCURRENCES = 2000` already bounds RRULE bombs. Add a per-feed cap of 500 kept occurrences. Override VEVENTs (`recurrence-id`) are skipped. Mark this with `ponytail:`: feeds are mostly single events, and overrides can be handled later. The occurrence remoteId is `uid` for non-recurring events and `` `${uid}@${start.toISOString()}` `` for recurring ones.
URL per event: the `URL` property if present, else the first `https://` URL in DESCRIPTION, validated with `isSafeUrl` [ASSUMED: Luma/Meetup ICS put the event link in URL or DESCRIPTION]. Geo comes from the `GEO` property if present (`lat;lng`). `ical.js` throws on malformed ICS; catch it per feed and record "Feed isn't valid iCal.".

### Pattern 3: JSON-LD Event extraction (no scraping)
Regex the `<script type="application/ld+json">…</script>` blocks (case-insensitive, non-greedy, attribute-order tolerant) and `JSON.parse` each inside try/catch. Flatten arrays and `@graph`. Pick the first node whose `@type` (string or array) is `Event` or ends with `Event` (schema.org subtypes such as `BusinessEvent`, `SocialEvent`, `EducationEvent`) [CITED: schema.org/Event]. Then zod-parse leniently:
- `name`, `startDate` required
- `endDate` optional
- `location`: `Place{name,address(string|PostalAddress),geo{latitude,longitude}}` | `VirtualLocation{url}` | array
- `organizer`: string | {name} | array
- `offers`: {price, priceCurrency, lowPrice} | array
- `eventAttendanceMode` (`OnlineEventAttendanceMode` → online)
- `url`, `description`

If nothing matches, return "No event data found on that page". JSON-LD `description` may contain HTML entities, so run it through the same `htmlToText`. The canonical URL is the JSON-LD `url` when it is `isSafeUrl`, else the final fetched URL.

### Pattern 4: Normalize, dedup, upsert
- `canonUrl(u)`: `new URL(u)` → lower-case host and path, strip query and hash, strip a trailing `/`. Keep path case? D-11 says lower-cased; follow it.
- `canonTitle(t)`: NFKD, lower-case, `[^\p{L}\p{N}]+` → single space, trim.
- Match order inside one transaction (the sync job is a singleton; the import action takes `pg_advisory_xact_lock(hashtext('outreach.upsert'))`):
  1. `sources @> '[{"s":key,"r":remoteId}]'`
  2. same `canonical_url` **and** same start minute (see Pitfall 3)
  3. same `title_key` and same `start` truncated to the minute.
- Store `title_key` as a column with an index; `canonical_url` gets an index; `sources` gets a GIN (`jsonb_path_ops`) index.
- On merge: union `sources`. Field updates come only from the incoming source, and only when `existing.is_mock` is true or the incoming source is real. `is_mock = existing.is_mock && incoming.is_mock`. **Never touch** `stage`, `stage_changed_at`, `dismissed_at`, `calendar_event_id`.
- Sydney filter (Claude's discretion; see Assumption A5): drop only on **positive evidence of elsewhere**: geo more than 60 km from (-33.8688, 151.2093) by haversine, or location text matching another state or city (`\b(VIC|QLD|WA|SA|TAS|NT|ACT|Melbourne|Brisbane|Perth|Adelaide|Hobart|Darwin|Canberra|Gold Coast)\b`) without also matching `Sydney|NSW`. Online events are kept and tagged. An empty location is kept as "Location unknown". A venue-only location ("Fishburners") is kept. This keeps the Luma Sydney city feed, whose LOCATION often has no city.
- Prune (end of each sync): `delete … where stage is null and end_at < now() - 30d`, plus events outside the window that no source returned any more and that are unsaved. Saved events are never pruned.

### Pattern 5: Scoring (pure, $0)
`score(event, ctx)` where `ctx = { interests: string[], projects: {name}[], busy: SchedItem[] }`:
- INTERESTS (max 60): for each interest build `\b<escaped>\b` with the `i` flag. A hit in title or categories scores 25; a hit in the description only scores 12; the total is capped at 60. Record the matched terms.
- PROJECTS (max 20): active (non-archived) project names of 3 or more characters, word-boundary matched in title and description, 10 points each, capped at 20. Project `context` is free Markdown; extracting keywords from it is noise. Use name only and add a `ponytail:` note (Assumption A6).
- SCHEDULE (max 20): load `loadInstances(h, now, now+60d)` **once per sync**. Overlap with an opaque, non-declined, non-cancelled, confirmed instance gives 0 (conflict). Overlap only with transparent or `tentative` instances gives 10 (the "optional busy" 50% case). Otherwise 20. With no calendar connected the value is 10, labelled "calendar not connected" (honest; Assumption A7). All-day busy items are ignored, matching `busyOf`.
- `signals = [{label:"INTERESTS", value, max:60, terms}, {label:"PROJECTS", …}, {label:"SCHEDULE", …, note:"fits Thu evening"}]`. The `why` line is templated from these signals. Recompute all window rows after each sync and inside the interests save action. Project changes recompute at the next 6-hourly sync, or call the recompute from project actions if that stays cheap (planner's call; it is a single query plus pure code).

### Pattern 6: Pipeline transition (owner write)
```ts
// conditional update = optimistic concurrency; activity + audit only when the row actually moved
const [row] = await h.update(outreachEvents).set({ stage: to, stageChangedAt: now })
  .where(and(eq(outreachEvents.id, id), from === null ? isNull(outreachEvents.stage) : eq(outreachEvents.stage, from))).returning();
if (!row) return { ok: false, error: "changed" };
await aud(h, "outreach.stage", id, { id, from, to });            // no titles in audit (T-04-40 pattern)
await emitActivity({ type: "outreach.stage", source: "outreach", title: `${LABEL[from]} → ${LABEL[to]}`, detail: row.title }, undefined, h);
await notifyLive(h, "outreach", id);
```
Allowed moves are ±1 step in `STAGE_ORDER = [null, SAVED, INTERESTED, ATTENDING, ATTENDED, FOLLOW_UP]`. `stage.ts` in `src/lib` is shared with the UI spec's `STAGE` map. Add to calendar calls `createEvent(h, { calendarId: picked ?? await pickDefaultCalendar(h), input: { title, start, end, allDay:false, location, description: url, … } }, { actor: "owner", providerFor, now })` and then sets `calendar_event_id`. It refuses when `is_mock` is true or a calendar event is already linked. The follow-up dialog runs in one transaction: each line → `createTask(tx, { title, dueDate, priority: 2, notes }, now)`, then set `tasks.outreach_event_id`, then the stage update. A `{ ok:false }` from `createTask` throws to roll back (5.1 pattern). `createTask` does not take the new FK, so either extend `taskInput` with `outreachEventId`/`mailMessageId` (nullable, default null) or update the row after insert inside the transaction. **Prefer the post-insert update:** `taskInput` is shared with the task dialog and the agent tools, and the FKs must stay owner-only.

### Pattern 7: Google scope split (D-21)
```ts
// client.ts
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events"];
export const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose";
export const GOOGLE_SCOPES = [...CALENDAR_SCOPES, GMAIL_READ, GMAIL_COMPOSE];  // requested
// googleAuthUrl: add include_granted_scopes: "true" (incremental auth; harmless with prompt=consent)
// oauth.ts: if (!CALENDAR_SCOPES.every((s) => t.scopes.includes(s))) return { ok:false, error:"scope" };
//           saveCalendarSecret(h, "google_calendar", secret, { account, scopes: t.scopes }, …)
```
Per Google's docs, the token response `scope` field holds "the scopes of access granted by the access_token", and users "may not grant your app access to all of them" [CITED: developers.google.com/identity/protocols/oauth2/web-server]. `saveCalendarSecret` overwrites the row, so pass `scopes` into its row object. Store the list as a new `connections.scopes jsonb not null default '[]'`; that is clearer than reusing `repos`. The connection DTO gains `gmail: "granted" | "missing"`. Gmail's token comes from the existing `googleTokenSource(h)`; no new secret is needed.

### Pattern 8: Gmail client = parameterized `createGoogle`
`createGoogle({ getToken, fetch, base = API_BASE })`, with `base` limited to the two constants `CAL_BASE` and `GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"`. That reuses `call` and its error mapping (401 → auth, 403 rateLimit → rate_limit, 404 → not_found, 5xx → unavailable). **Gmail-specific:** a 403 with `insufficientPermissions` from a Gmail path must **not** mark the whole Google connection as errored, because Calendar still works. Catch it in `mail/*`, then remove the Gmail scopes from `connections.scopes` and surface "Reconnect Google to allow Gmail". Only 401 or `invalid_grant` marks the connection RECONNECT (the existing `markCalendarError`). Always check `scopes` before calling Gmail so the common case never makes a request.

Endpoints [CITED: Gmail reference pages; parameter detail for list/get/drafts is ASSUMED from training where not fetched]:
- `GET /profile` → `{ emailAddress, historyId }` (1 unit)
- `GET /messages?labelIds=INBOX&q=newer_than:30d&maxResults=100&pageToken=` (5 units) → `{ messages:[{id,threadId}], nextPageToken }`
- `GET /messages/{id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe` (20 units) → `{ id, threadId, labelIds, snippet, historyId, internalDate, payload.headers[] }`
- `GET /messages/{id}?format=full` (20 units) → `payload` MIME tree (`mimeType`, `body.data` base64url, `parts[]`)
- `GET /history?startHistoryId=&labelId=INBOX&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved&maxResults=500` (2 units) [CITED: users.history/list] → 404 when the id is too old ("run a full sync")
- `POST /drafts` `{ message: { raw, threadId } }` (10 units), `POST /drafts/send` `{ id }` (100 units; "the draft is automatically deleted and a new message with an updated ID is created" [CITED: gmail/api/guides/drafts]), `DELETE /drafts/{id}`
- `GET /messages?q=rfc822msgid:<id> in:sent` (5 units) [ASSUMED operator semantics]

### Pattern 9: Quota-safe sync
Sync state lives in `settings` key `mail.sync` = `{ historyId: string|null, full: "pending"|"done", email: string }`.
- **Full** (state missing, `pending`, or after a 404):
  1. If `pending` and no `historyId` is stored yet, call `getProfile` **first** and save its `historyId`. Mail that arrives during the backfill is then caught by the next history call.
  2. List INBOX `newer_than:30d`, at most 5 pages and 500 ids.
  3. `messages.get` (metadata) only for ids **not already stored**, sequentially, **at most 200 per run** (4,000 units of the 6,000 per minute).
  4. If ids remain, stay `pending`; the next 5-minute tick continues. Otherwise set `done`.
- **Incremental:** page `history.list` until there is no `nextPageToken`.
  - `messagesAdded` → get metadata (cap 200 per run; if exceeded, keep the old `historyId` so the next run replays; upserts are idempotent).
  - `labelsAdded`/`labelsRemoved` → update `labelIds` locally. Removing INBOX means the message "left INBOX" for pruning.
  - Save the response `historyId` at the end.
- **404** → set state to `{historyId:null, full:"pending"}` and run a full sync. Existing rows stay; upserts are on `gmail_id`.
- **429 / rate_limit:** stop, record `lastSyncError` "Gmail rate limit reached.", and keep the state. The next tick resumes.
- `bulk = !!List-Unsubscribe || labelIds ∩ {CATEGORY_PROMOTIONS, CATEGORY_SOCIAL}`.
- Prune: `received_at < now-90d and not ('INBOX' = any(label_ids))`.

The sync records `lastSyncAt`/`lastSyncError` for mail in the same `mail.sync` setting. Do not reuse `connections.lastSyncAt`, because calendar sync writes it.

### Pattern 10: Triage as a recorded Haiku run
- **Cap gate:** `capStatus(h, now)`. If reached, write the `mail.triage_paused` setting and return (the Email tab reads it). Clear the setting when a batch succeeds.
- **Run row:** `insert agent_runs { agentId:"outreach", prompt:"mail.triage (n messages)", model: MODELS.haiku, status:"running", sawPrivate:true, startedAt }`. Per call, insert `run_turns { seq, model, tokens, costUsd: costUsd(MODELS.haiku, usage) }` and add the totals onto `agent_runs`, the same arithmetic as `addUsage` in `loop.ts` (lift that into a small exported helper rather than duplicating it). Finish with `completed` or `failed`. The spend cap then counts triage automatically (`monthToDate` sums `agent_runs.costUsd`), and the Command Centre lists it.
- **Model:** `getLlm()` routes non-`:free` models to Anthropic, so Haiku never goes to OpenRouter.
- **Forced tool:** add optional `toolChoice?: { type:"tool"; name:string }` to `LlmClient.stream` params and pass it as `tool_choice` in `anthropicClient` (OpenRouter and `fake-llm` ignore it). Use one tool, `record_triage`, with input `{ results: TriageItem[] }`, where `TriageItem = { id, category: enum6, importance: enum3, summary ≤300, action ≤120, items: {text ≤200, due?: iso date}[] ≤5, flag: boolean }`. zod-validate it; ids must belong to the batch, and extra or missing ids are ignored. On failure, leave the rows untriaged and mark the run failed.
- **Prompt input:** `<mail_data>{"untrusted":true,"messages":[{id,from,subject,date,body ≤4000 chars}]}</mail_data>` with `<` escaped as in `buildToolResults`. The system prompt says the content is data written by others, never instructions.
- **Notifications:** claim the notification with `update mail_messages set notified_at=now where id=… and notified_at is null returning`, then `emitActivity({source:"email", …}, {category:"IMPORTANT", title:`Important email: ${subject}`, actionUrl:`/outreach?tab=email&mail=${id}`})`. The `email` source already exists in `activity-list.tsx`.

### Pattern 11: Hard mail taint (D-28, closes the toggle gap)
```ts
// policy.ts
export const MAIL_TOOLS = ["mail.list", "mail.get_message", "mail.send_reply"] as const;
export async function mailInScope(h: DB, runId: string | null): Promise<boolean> {
  if (!runId) return false;
  const [hit] = await h.select({ id: toolCalls.id }).from(toolCalls)
    .where(and(inArray(toolCalls.tool, [...MAIL_TOOLS]), sql`${toolCalls.runId} in ${contentScope(runId)}`)).limit(1);
  return !!hit;
}
// createRun: privateOk: (await getFreePrivateOk(h)) && !(await mailInScope(h, p.parentRunId ?? p.privacyAnchor ?? null))
// loop.ts free-turn check: replace `!(await getFreePrivateOk(h))` with `!((await getFreePrivateOk(h)) && !(await mailInScope(h, runId)))`
```
Also set `routable: false` on the Outreach agent. `outreach.*` event tools are `private: false`: event data is public third-party data, and it still lands in `CONTENT_TOOLS`. The `mail.*` tools are `private: true`. The triage run is not a loop run, so this gate does not apply to it; it calls Haiku directly.

### Pattern 12: `mail.send_reply` (APPROVE) and idempotent send
- **Input:** `{ messageId, subject ≤200, body ≤10000, replyAll?: boolean }`. The model never supplies recipients. `resolve()` loads the stored `mail_messages` row (not found → `ToolError("not_found")`) and computes:
  - `threadId`
  - `to = [Reply-To || From]`
  - `cc = replyAll ? (To ∪ Cc) − owner email − to : []`
  - `inReplyTo`, `references`, by fetching `format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Reply-To` live (one 20-unit get).
  
  That fetch stores no extra columns. Injection cannot redirect mail because recipients are derived, not model input.
- **Payload schema** (`src/lib/mail-payload.ts`, client-safe): `{ messageId, threadId, to: Addr[], cc: Addr[], inReplyTo, references, subject, body, fromName? }`. Do **not** name any field with `key|token|secret|password` (`redact.ts` blanks those).
- `LOCKED.mail_reply = ["messageId","threadId","to","cc","inReplyTo","references"]`; `NOTHING.mail_reply = "Nothing was sent."`. Summary: `Approval waiting: reply to ${to[0].name || to[0].address}` and body `Re: ${subject}. Expires …`. Add a `mail_reply` branch to the expiry body in `expireDue` and a `subject` fallback to `titleOf`. `editMeta` already stores changed key names only for non-issue kinds, so the body never reaches the audit log.
- **Handler** (`ctx.approvalId` required, else `ToolError("not_allowed")`):
  1. Scope check → `ToolError("unavailable", "Gmail isn't allowed. Reconnect Google in Settings → Connections.")`.
  2. If `ctx.adopt`:
     - (a) If `approvals.result.draftId` was checkpointed: `GET /drafts/{id}`. A 200 means not yet sent → `drafts.send`. A 404 means it was sent → look up via (b).
     - (b) `messages.list q="rfc822msgid:<approval-{id}@lifeos.local>"` → if found, return it.
  3. Otherwise build the MIME, `drafts.create {message:{raw,threadId}}`, then `update approvals set result = {draftId}` (checkpoint), then `drafts.send {id}` → `{ messageId, threadId }`.
  
  `executeApproved` overwrites `result` on success. `ProviderError("google", "unavailable")` → ambiguous → Retry adopts. Other kinds are definite failures.
- **MIME** (`mail/mime.ts`, pure):
  - headers `From: me` (Gmail fills it), `To`, `Cc`, `Subject` (RFC 2047 `=?UTF-8?B?…?=` when non-ASCII), `In-Reply-To`, `References: <refs> <inReplyTo>`, `Message-ID: <approval-{id}@lifeos.local>`, `MIME-Version: 1.0`, `Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: base64`
  - CRLF line endings; the body is base64 wrapped at 76 characters; the whole message is `Buffer.from(mime).toString("base64url")`
  - **Strip CR/LF from every header value** (header injection)
  - Subject: prefix `Re: ` unless it already starts with `re:`. Gmail threads only when the Subject matches and References/In-Reply-To are RFC 2822 compliant [CITED: gmail/api/guides/sending].
- **Save to Gmail drafts (owner action):** `drafts.create` (same MIME without the deterministic Message-ID), then `update approvals set status='rejected', decidedAt, result={gmailDraftId} where id and status='pending'`. If 0 rows were updated, `drafts.delete` and return `not_pending`. Then audit `approval.reject {movedToDrafts:true}`, `cancelRun`, and `live`. The UI reads `result.gmailDraftId` to show "Moved to Gmail drafts". `approvals` has no reason column, so use `result` (Assumption A9).

### Anti-Patterns to Avoid
- **Global `fetch` for owner-supplied URLs:** a DNS rebinding TOCTOU. Use `safeGet`.
- **Overwriting `stage`/`dismissed_at`/`calendar_event_id` on re-sync:** saved events would vanish or dismissed ones come back.
- **Passing recipients from the model into `mail.send_reply`:** injection could redirect mail. Derive them in `resolve()`.
- **Marking the Google connection errored on a Gmail 403:** Calendar sync would pause for a Gmail-only problem.
- **Rendering mail or event descriptions as HTML or Markdown:** plain text only, links as text.
- **Storing bodies in `tool_calls.output` beyond the cap:** `mail.get_message` output is capped at 16 KB (the 5.1 WR-05 code-point helper), and that row is the only copy.
- **Adding the FKs to `taskInput`:** agents could then set them. Use a post-insert update.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RRULE expansion / timezones | own recurrence code | `icsSeries` + `expand` (`calendar/expand.ts`) | DST, EXDATE/RDATE and occurrence caps are already solved and tested |
| Busy/conflict logic | new overlap rules | `loadInstances` + `busyOf` semantics | Same definition of "busy" as Organization |
| Google token refresh | second token store | `googleTokenSource(h)` | One grant (D-21); refresh is persisted |
| Approval lifecycle | custom draft state | gateway + `approvals` + `executeApproved` | Locks, edit, expiry, adopt and notifications all exist |
| Spend accounting | separate mail budget | `agent_runs` + `run_turns` + `costUsd` | The cap and Command Centre read these |
| Activity/notification dedupe | ad-hoc flags | `emitActivity` + `notified_at` claim (same idea as `fireDueReminders`) | Never throws; claim-then-emit |
| Encryption of keys/feed URLs | new crypto | `encrypt`/`decrypt` (`src/server/crypto.ts`) | AES-256-GCM with the master key |
| Fake HTTP in tests | nock or msw (new deps) | `fakeGoogle`-style router (`tests/helpers/fake-google.ts`) | Add `gmail.googleapis.com` to its `HOSTS` and build `fake-gmail.ts` on it |

**Key insight:** the dangerous parts are the trust boundaries (owner URLs, third-party HTML/ICS, inbound mail, outbound mail). Each one already has a pattern in the codebase except the network-level SSRF guard, which is the only genuinely new security primitive in this phase.

## Runtime State Inventory

Not a rename phase. There is one relevant runtime item: the **existing Google grant has calendar scopes only**. After deploy, Gmail stays "Not allowed" until the owner clicks Reconnect Google, which is an OWNER-ACTIONS item. Stored data, OS registrations, secrets/env and build artifacts: none affected. No new env vars; keys go in `connections`.

## Common Pitfalls

### Pitfall 1: The free-model toggle bypasses the mail taint
**What goes wrong:** with `ai.free_private_ok = true` (the owner's setting), `saw_private` does not block free models, so mail delegated to the organization agent reaches Nemotron.
**How to avoid:** Pattern 11, plus a DB test where the toggle is on, an outreach run calls `mail.get_message`, and a sibling organization run resolves to Sonnet.
**Warning signs:** a `routeEvents` entry `routed → …:free` in a thread containing `mail.*` tool calls.

### Pitfall 2: The Gmail quota during backfill
500 × `messages.get` (20 units) = 10,000 units, against a limit of 6,000 per minute per user [CITED: Gmail quota page]. Use resumable full sync with at most 200 gets per run (Pattern 9). Triage body fetches are at most 100 × 20 = 2,000 units, in a separate job.

### Pitfall 3: URL-merge collapses recurring occurrences
Every occurrence of an ICS series (and often consecutive Meetup instances in a feed) shares the URL and title. Under D-11's "canonical URL matches" rule, a 6-week series collapses into one row. Fix this within D-11's intent: URL match merges only when the start minute is also equal (or when neither side is a recurring occurrence). Unit test it with a weekly RRULE fixture.

### Pitfall 4: Gmail may rewrite the custom Message-ID
There are community reports that Gmail replaces a client-set `Message-ID` on send [ASSUMED; not verified this session]. If it does, the `rfc822msgid:` adopt lookup silently misses and a retry sends twice. Use the draft-id checkpoint as the primary adopt path, with `rfc822msgid:` as a secondary check (Pattern 12).

### Pitfall 5: The callback still requires every scope
Leaving `GOOGLE_SCOPES.every` in place means unticking Gmail fails the whole connect with `scope`, and Calendar is lost. Split the scopes (Pattern 7) and test both cases (`tests/db/google-oauth.test.ts` already exists to extend).

### Pitfall 6: Re-sync clobbers owner state
The upsert `set` must list only source-derived columns (Pattern 4). Test: save an event, re-sync the same fixture, and confirm the stage is unchanged. Also dismiss an event, re-sync, and confirm it stays dismissed.

### Pitfall 7: `redact()` blanks keys named `*key*`
Any payload or output field named `key`, `apiKey`, `organizerKey` and so on becomes `[redacted]` in `tool_calls`. Use `messageId`, `ref` and similar names.

### Pitfall 8: Large HTML pages and bot walls
Eventbrite and Meetup pages can be large or sit behind bot protection [ASSUMED]. JSON-LD is usually in `<head>`, so for HTML, read up to 2 MB and parse what arrived (`truncateOk`). A 403 or captcha page gives "No event data found on that page", or "That site refused the request." for 4xx. That is honest, with no retry storm.

### Pitfall 9: e2e has no worker, no LLM and no outbound network
`playwright.config.ts` runs `next start` only. URL import, Add to calendar (a Google write) and the actual Gmail send cannot run in e2e. D-37's e2e flow must be split (see Validation Architecture): e2e covers the UI on seeded rows, and DB tests cover the network and worker halves with fakes.

### Pitfall 10: notifyLive kinds are a closed union
`notifyLive(h, k: "run"|"approval"|"calendar"|"task")` and `live-provider.tsx` `LiveEvent.kind` must gain `"outreach"` (one kind is enough for events and mail; the UI calls `router.refresh()`).

### Pitfall 11: Unknown approval tools default to the "issue" kind
`approvalKind()` falls back to `"issue"`, which audits original and edited payloads in full and would leak mail bodies into `audit_log`. Add `"mail.send_reply": "mail_reply"` to `KINDS` in the same plan that adds the tool.

## Code Examples

### History 404 → full resync
```ts
// Source: developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list ("If you get a 404, run a full sync")
try { await incremental(state); }
catch (e) {
  if (e instanceof ProviderError && e.kind === "not_found") { await setState(h, { ...state, historyId: null, full: "pending" }); return full(); }
  throw e;
}
```

### HTML → text (D-24), no dependency
```ts
export function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
} // decodeEntities: &amp; &lt; &gt; &quot; &#39; &nbsp; &#NNN; &#xHH; only. ponytail: named-entity table if mail looks wrong
```
Body part selection: walk `payload.parts` depth-first, prefer `text/plain`, else `text/html` → `htmlToText`. Decode with `Buffer.from(data, "base64url").toString("utf8")`. Ignore parts that only carry `attachmentId`. Cap with the 5.1 code-point cut helper (find it with `grep -rn "code point\|codePoint" src/server/agents/tools/github.ts`).

### Eventbrite (keyed) — honest capability
```ts
// Documented: GET /v3/organizations/{organization_id}/events/ (organizer_filter param)  [CITED: eventbrite.com/platform/api]
// Own orgs: GET /v3/users/me/organizations/  [ASSUMED path]
// Followed organizers: GET /v3/organizers/{id}/events/?status=live&order_by=start_asc&expand=venue  [ASSUMED; probe]
//   403/404 → record per-organizer error "Eventbrite doesn't allow listing this organizer's events with a private token."
//   and set event_sources.config.discover=false so the UI shows the D-06 wording.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Eventbrite `/v3/events/search/` | Removed; by-id / by-venue / by-organization only | 2019-12-12 / 2020-02-20 | No keyed discovery (D-06) |
| All-or-nothing Google consent | Granular consent; check the `scope` field | — | Scope split required (Pattern 7) [CITED] |
| Gmail polling of `messages.list` | `history.list` incremental; push needs Pub/Sub | — | Polling history every 5 minutes (D-22) |

**Deprecated/outdated:** `lu.ma` is now `luma.com` (the help pages use both). Never hard-code Luma ICS URLs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Eventbrite `GET /v3/organizers/{id}/events/` exists and may or may not return other organizers' public events with a private token | Code Examples | Low: D-06 fallback (`discover:false`, own org events) is built either way |
| A2 | Luma API list-events endpoint path under `https://public-api.luma.com/v1/…` (only `users/get-self` cited) | Keyed providers | Medium: the planner must open docs.luma.com/reference before coding the Luma provider; the MOCK fallback stays |
| A3 | Luma and Meetup ICS put the event link in `URL` or DESCRIPTION and sometimes include `GEO` | Pattern 2 | Low: falls back to no URL or geo; test fixtures are hand-authored |
| A4 | Unverified In-production app: the project owner can click through the warning for restricted Gmail scopes, refresh tokens stay long-lived, and each grant counts toward the lifetime 100-user cap | Pattern 7 | Medium: if Google blocks, the owner must set the app to Testing (7-day tokens) or verify. Log in OWNER-ACTIONS |
| A5 | Sydney filter by positive evidence of elsewhere (not by requiring "Sydney" text) | Pattern 4 | Low: owner-visible; adjustable list |
| A6 | PROJECTS signal uses project names only (not context keywords) | Pattern 5 | Low: slightly fewer matches; D-14 mentions categories and context, so note the simplification |
| A7 | SCHEDULE = 10/20 with "calendar not connected" when no calendar is connected | Pattern 5 | Low |
| A8 | Gmail may overwrite a client `Message-ID`; `rfc822msgid:` search semantics | Pattern 12 / Pitfall 4 | Medium: mitigated by the draft-id checkpoint |
| A9 | "Moved to Gmail drafts" recorded as `approvals.result.gmailDraftId` (no reason column) | Pattern 12 | Low |
| A10 | `messages.get`/`list`/`drafts` parameter names (`metadataHeaders`, `labelIds`, `q`, `message.threadId`) | Pattern 8 | Low: standard v1 API; the fake-gmail fixtures encode them |
| A11 | Gmail threading requires `message.threadId` on `drafts.create` in addition to the headers | Pattern 12 | Low: sending both is harmless |
| A12 | Eventbrite/Meetup pages embed JSON-LD Event and may serve bot walls | Pitfall 8 | Low: honest error |

## Open Questions (RESOLVED)

1. **Does Eventbrite list other organizers' events with a private token?**
   - Known: the official reference documents `GET /organizations/{id}/events/` (+ `organizer_filter`). Access rules for non-owned organizations were not found.
   - RESOLVED: Build the own-organization path (documented) plus a per-organizer probe that records an honest error and flips `config.discover=false`. The owner verifies with a real token (OWNER-ACTIONS). No plan blocks on it.
2. **Exact Luma Sydney iCal URL?**
   - RESOLVED: Not needed. The owner copies the generated link from luma.com/sydney → "Add iCal Subscription" [CITED: help.luma.com/p/ical-syncing]. LifeOS accepts any https feed through `safeGet`. Settings copy explains the steps.
3. **Unverified app plus restricted scopes for the owner?**
   - RESOLVED (MEDIUM): Proceed per D-20. Add `include_granted_scopes=true`, keep `prompt=consent`, and log the click-through plus the 100-user lifetime cap in OWNER-ACTIONS. If Google blocks, the documented fallback is Testing mode (7-day refresh tokens), and Calendar keeps working because only Calendar scopes are required.
4. **How does "Draft with agent" start a run?**
   - RESOLVED: `useShell().openAI(prompt)` (existing) with a prompt carrying the mail id, for example "Draft a reply to email {id}". The orchestrator delegates to `outreach` with tier `reasoning` (add a prompt line). EmailDetail finds the pending approval by `tool='mail.send_reply' and original_payload->>'messageId' = id`. No new server route.
5. **Is the e2e with "fake LLM" and "fake Gmail records one send" feasible?**
   - RESOLVED: No, not in Playwright (Pitfall 9). The scripted flow (`scriptedLlm` → `mail.send_reply` → approve → `executeApproved` with `fake-gmail` → exactly one `drafts/send` call, plus adopt → zero more) is a **DB test**. The e2e seeds a triaged mail row plus a pending `mail_reply` approval, edits the body, approves, and asserts status `approved` and the edited payload (mirrors `project-approval.spec.ts`).
6. **Where does the Eventbrite organizer list live?**
   - RESOLVED: in `event_sources` (`kind='eventbrite'`, a `config jsonb` column `{organizerIds:string[], discover?:boolean}`). The key stays in `connections` (`id='eventbrite'`; Luma `id='luma'`). Extend `ConnectionId`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | ✓ | v24.19.0 | — |
| Postgres (local :5433) | DB tests | ✓ (per orchestrator) | — | VM `scripts/vm-db-test.sh` |
| Chrome (system) | e2e local | ✓ (per orchestrator) | — | CI Chromium |
| Gmail API enabled in GCP | real Gmail | ✓ (owner, D-01) | — | — |
| Owner Google re-consent | real Gmail | ✗ until owner acts | — | Email tab shows the Reconnect CTA (honest) |
| Eventbrite / Luma keys | keyed providers | ✗ until owner enters | — | MOCK providers (D-02) |
| Luma Sydney feed URL | real discovery | ✗ until owner adds | — | URL import + mocks |

**Missing with no fallback:** none. Everything owner-side degrades honestly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^5.0.3 (unit + DB), @playwright/test ^1.63.0 (e2e) |
| Config file | `vitest.config.ts` (includes `tests/unit/**`, `tests/db/**`), `playwright.config.ts` |
| Quick run command | `npx vitest run tests/unit` |
| Full suite command | `npx vitest run tests/unit tests/db && npx playwright test` (VM: `bash scripts/vm-db-test.sh`) |

### Phase Requirements → Test Map
| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-01 / SC1 | SSRF guard: private/loopback/link-local/mapped IPs, literal IPs, http, redirects to private, size cap | unit | `npx vitest run tests/unit/safe-get.test.ts` | ❌ Wave 0 |
| OUT-01 / SC1 | Feed ICS → occurrences in window (Luma-like, Meetup-like, weekly RRULE, malformed) | unit | `npx vitest run tests/unit/outreach-ics.test.ts` | ❌ |
| OUT-01 / SC1 | JSON-LD Event extraction (Eventbrite-like, Humanitix-like, @graph, array @type, none → honest error) | unit | `npx vitest run tests/unit/outreach-jsonld.test.ts` | ❌ |
| OUT-01 / SC1 | canonUrl/canonTitle, merge rules incl. recurring no-collapse, Sydney filter, scoring + why line | unit | `npx vitest run tests/unit/outreach-normalize.test.ts tests/unit/outreach-score.test.ts` | ❌ |
| OUT-01 / SC1 | Sync: per-source error isolation, upsert/merge, real beats mock, stage preserved on re-sync, prune, ≤1 activity (score ≥70), keyed auth → RECONNECT, mock fallback without key | DB | `npx vitest run tests/db/outreach-sync.test.ts` | ❌ |
| OUT-01 / SC1 | Eventbrite/Luma key save: constant URL, last4 only, rejected/unreachable | DB | `npx vitest run tests/db/connections.test.ts` (extend) | ✅ extend |
| OUT-02 / SC2 | Transitions ±1 with activity + audit; stale `from` refused; dismiss/restore | DB | `npx vitest run tests/db/outreach-pipeline.test.ts` | ❌ |
| OUT-02 / SC2 | Add to calendar via fake Google (owner actor, calendar_event_id set, mock refused); follow-up tx creates tasks with FK, rollback on invalid line | DB | same file | ❌ |
| OUT-02 / SC2,4 | UI: seeded event → Save → Interested → Attend → Attended → Follow up dialog → task appears in FOLLOW-UPS; MOCK badge and disabled calendar on mock | e2e | `npx playwright test tests/e2e/outreach.spec.ts` | ❌ |
| OUT-03 / SC3 | Scope split: calendar-only grant succeeds with gmail missing; full grant stores scopes | DB | `npx vitest run tests/db/google-oauth.test.ts` (extend) | ✅ extend |
| OUT-03 / SC3 | Mail sync: full (resumable at 200), incremental via history, 404 → full, labelRemoved → left INBOX, bulk flag, prune, Gmail 403 doesn't error calendar | DB | `npx vitest run tests/db/mail-sync.test.ts` | ❌ |
| OUT-03 / SC3 | Triage: bulk skips LLM; batches ≤10 recorded as outreach runs with cost; cap → paused flag; invalid output leaves untriaged; HIGH → one notification | DB | `npx vitest run tests/db/mail-triage.test.ts` | ❌ |
| OUT-03 / SC3 | MIME (threading headers, Message-ID, RFC 2047, CRLF strip), htmlToText, body part pick, triage zod schema | unit | `npx vitest run tests/unit/mail-mime.test.ts tests/unit/mail-text.test.ts` | ❌ |
| OUT-03 / SC3 | `mail_reply` kind: LOCKED, summary, nothing text, payload schema | unit | `npx vitest run tests/unit/approval-kinds.test.ts` (extend) | ✅ extend |
| OUT-03 / SC3 | Agent: scripted outreach run → `mail.send_reply` creates pending approval with derived recipients; edit locked field rejected; approve → executeApproved sends exactly once (fake-gmail drafts/send count 1); ambiguous retry adopts (count stays 1); missing scope → NOT_CONNECTED copy | DB | `npx vitest run tests/db/mail-agent.test.ts` | ❌ |
| OUT-03 / SC3 | Hard mail taint with `ai.free_private_ok=true`; content floor on a side-effect tool after `mail.get_message`; outreach agent non-routable | DB | `npx vitest run tests/db/routing-loop.test.ts tests/db/gateway.test.ts` (extend) | ✅ extend |
| OUT-03 / SC4 | UI: seeded triaged mail shows summary + action items; Add as task creates linked task; seeded `mail_reply` approval → edit body → Send reply → approval approved with edited body; recipients read-only | e2e | `npx playwright test tests/e2e/outreach.spec.ts` | ❌ |
| SC4 | Migration applies cleanly | DB | `npx vitest run tests/db/migrations.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit` plus the touched `tests/db/<file>`
- **Per wave merge:** `npx vitest run tests/unit tests/db`
- **Phase gate:** full unit + DB + `npx playwright test`, plus the owner VM run `bash scripts/vm-db-test.sh` (OWNER-ACTIONS)

### Wave 0 Gaps
- [ ] `tests/helpers/fake-gmail.ts`: routes for `/profile`, `/messages` (list and `q=rfc822msgid:`), `/messages/{id}` (metadata and full), `/history` (page plus 404), `POST /drafts`, `GET/DELETE /drafts/{id}`, `POST /drafts/send`. Built on `fakeGoogle` with `gmail.googleapis.com` added to `HOSTS`.
- [ ] `tests/fixtures/gmail/`: `profile.json`, `list-inbox.json`, `msg-*.json` (plain, HTML-only, bulk with List-Unsubscribe, injection attempt), `history.json`
- [ ] `tests/fixtures/outreach/`: `luma-sydney.ics`, `meetup-group.ics` (weekly RRULE), `eventbrite-page.html`, `humanitix-page.html`, `no-jsonld.html`
- [ ] `safeGet` needs an injectable `lookup` and `request` for unit tests (no real DNS). A DB test for ICS sync injects the fetcher at the provider seam (the `fetch`-like param pattern).
- [ ] e2e helpers in `tests/e2e/owner.ts`: `insertOutreachEvent`, `insertMailMessage`, `insertMailApproval`, cleanup functions

## Recommended wave / plan breakdown (each plan ≤3 tasks, file-disjoint within a wave)

| Wave | Plan | Scope | Key files |
|---|---|---|---|
| 1 | 06-01 Schema | Migration 0008: `event_sources`, `outreach_events`, `mail_messages`, `tasks.outreach_event_id`/`mail_message_id` (SET NULL), `connections.scopes`; QUEUES constants; types in `src/lib/outreach-types.ts`; `[BLOCKING]` owner migrate line | schema.ts, drizzle/0008, queue.ts, src/lib/outreach-types.ts |
| 1 | 06-02 Pure libs | `safe-get.ts`, `outreach/{ics,jsonld,normalize,score}.ts` (+ `normalizeVevent` extraction), `mail/{mime,text}.ts`, `src/lib/stage.ts` + unit tests + fixtures | src/server/net, src/server/outreach/{pure}, src/server/mail/{mime,text}, caldav/provider.ts |
| 2 | 06-03 Event providers + sync | providers (ics, url, eventbrite, luma, mocks), `sync.ts` upsert/merge/prune/score, worker job + registration, key save (Eventbrite/Luma), feed CRUD + import URL actions | src/server/outreach/{providers,mock-events,sync}.ts, outreach-actions.ts (sources/import part), worker/jobs/outreach-sync.ts, worker/index.ts, github/connections.ts or new outreach/connections.ts, agent-types ConnectionId |
| 2 | 06-04 Google scopes + Gmail client + mail sync | scope split, `include_granted_scopes`, `createGoogle` base param, `mail/{client,sync}.ts`, fake-gmail + fixtures, DB tests (no worker registration here) | calendar/google/{client,oauth}.ts, calendar/connections.ts, src/server/mail/{client,sync}.ts, tests/helpers/fake-gmail.ts |
| 3 | 06-05 Pipeline server | stage transitions, dismiss, Add to calendar, follow-up tx, Add-as-task, interests setting + recompute, notifyLive "outreach" | src/server/outreach/pipeline.ts, outreach-actions.ts (pipeline part; separate file `outreach-pipeline-actions.ts` to stay disjoint from 06-03), events.ts, live-provider.tsx |
| 3 | 06-06 Triage + mail worker | `mail/triage.ts` (recorded runs, cap pause, notifications), `LlmClient.toolChoice`, worker registration for mail.sync + mail.triage, mail-actions (body, archive, flag, triage one, sync now) | src/server/mail/{triage,queries}.ts, agents/{types,llm}.ts, worker/index.ts, worker/jobs/mail-*.ts, mail-actions.ts |
| 4 | 06-07 Outreach agent + send | tools `outreach.*`, `mail.*`, `mail.send_reply` + send/adopt, `mail_reply` kind + payload, CONTENT_TOOLS/MAIL_TOOLS, hard taint (loop/createRun), registry live + prompts, approvals.ts tweaks, Save-to-Gmail-drafts action | agents/{registry,policy,loop,approvals}.ts, tools/{outreach,mail,index}.ts, src/lib/{approval-kinds,mail-payload}.ts, mail/send.ts |
| 4 | 06-08 Settings UI | Reconnect Google + Gmail status, Eventbrite/Luma TokenForm rows, Event feeds, Settings → Outreach interests | src/settings/* |
| 5 | 06-09 Outreach EVENTS UI | page + tabs shell, event list/cards/pipeline board, detail route, dialogs (calendar, follow-up, import), palette Events scope + command, activity SOURCES, icons | src/app/(os)/outreach/**, src/outreach/{outreach-view,event-*,pipeline-board,why-block,*-dialog}.tsx, src/shell/palette*, activity-list.tsx, icon-names |
| 5 | 06-10 EMAIL + FOLLOW-UPS + mail approval UI | email-view/card/detail/draft-reply, follow-ups, `mail-approval.tsx` + one-line branches in approval-detail/list/AI card | src/outreach/{email-*,draft-reply,follow-ups}.tsx, src/approvals/*, src/shell/ai/approval-card.tsx |
| 6 | 06-11 e2e + docs + owner actions | `tests/e2e/outreach.spec.ts` + owner.ts seeds, docs (integrations Outreach section with least-privilege scopes, agents, permissions), OWNER-ACTIONS (migrate, vm-db-test, re-consent, keys, Luma feed, Eventbrite probe, UAT) | tests/e2e/*, docs/*, .planning/OWNER-ACTIONS.md |

Conflicts to watch: `worker/index.ts` is touched in 06-03 (wave 2) and 06-06 (wave 3), so they are sequential. `outreach-actions.ts` is split into two files so 06-03 and 06-05 never share one. 06-09 and 06-10 share only `outreach-view.tsx`: 06-09 owns it and renders the EMAIL/FOLLOW-UPS tabs through components that 06-10 creates. Either sequence them or have 06-09 create stubs.

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Better Auth owner session |
| V3 Session Management | no | existing |
| V4 Access Control | yes | `requireOwner()` on every new server action; the `/api/connections/google/*` session check exists |
| V5 Input Validation | yes | zod for every action, tool input, JSON-LD, triage output and approval payload; `isSafeUrl`; header CR/LF stripping |
| V6 Cryptography | yes | `encrypt`/`decrypt` (AES-256-GCM) for keys and feed URLs; never hand-roll |
| V7 Error/Logging | yes | fixed error strings; never log URLs, tokens, subjects or bodies; audit metadata ids only |
| V12 Files/Resources (SSRF) | yes | `safeGet` with a connect-time IP guard, redirect re-check, size and time caps |
| V13 API | yes | fixed-host clients (Google, Eventbrite, Luma constants) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via feed or import URL (incl. DNS rebinding, redirects) | Info disclosure / EoP | `safeGet` lookup guard + `isSafeUrl` per hop |
| Prompt injection in email/event text → unwanted send | Tampering / EoP | CONTENT_TOOLS floor; send is APPROVE; recipients derived and LOCKED; untrusted envelope; zod output |
| Mail exfiltration to a third-party model | Info disclosure | hard mail taint (Pattern 11) + non-routable outreach agent |
| MIME header injection | Tampering | strip `\r\n` from header values; RFC 2047 for the subject |
| Stored XSS from third-party HTML | Tampering | plain-text rendering only; links as text; `isSafeUrl` before any `href` |
| ICS/RRULE or huge-page DoS | DoS | 2 MB cap, timeout, `MAX_OCCURRENCES`, 500/feed cap |
| Token or feed-URL leakage | Info disclosure | encrypted at rest; host + label only in DTOs; `redact` key names |
| Duplicate send on retry | Repudiation / Tampering | draft-id checkpoint + `rfc822msgid:` adopt |
| Mail bodies in audit log | Info disclosure | `mail_reply` kind registered (Pitfall 11) so `editMeta` stores key names only |

## Sources

### Primary (HIGH confidence)
- Codebase, read this session: `calendar/google/{client,oauth}.ts`, `calendar/{connections,expand,queries,conflicts,free-slots,events}.ts`, `caldav/provider.ts`, `agents/{gateway,policy,routing,registry,loop,approvals,spend,llm,pricing,redact,types}.ts`, `lib/{approval-kinds,safe-url,task-payload}.ts`, `tasks.ts`, `events.ts`, `queue.ts`, `worker/index.ts`, `github/connections.ts`, `db/schema.ts`, test helpers, `playwright.config.ts`, `scripts/vm-db-test.sh`
- https://developers.google.com/workspace/gmail/api/guides/sync — full or partial sync, 404 → full sync, history retention
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list — params, historyTypes, response, scopes
- https://developers.google.com/workspace/gmail/api/reference/quota — 6,000 units/min/user; method costs
- https://developers.google.com/workspace/gmail/api/guides/drafts — drafts.send deletes the draft and creates a new message id
- https://developers.google.com/workspace/gmail/api/guides/sending — threading needs a matching Subject plus RFC 2822 References/In-Reply-To
- https://developers.google.com/identity/protocols/oauth2/web-server — include_granted_scopes, granular consent, the `scope` field

### Secondary (MEDIUM confidence)
- https://help.luma.com/p/ical-syncing — "Add iCal Subscription" on Discover city pages
- https://www.eventbrite.com/platform/api — `GET /organizations/{id}/events/` + `organizer_filter`
- https://www.unipile.com/google-oauth-refresh-token/ and https://developer.nylas.com/docs/cookbook/use-cases/build/fix-google-access-denied/ — unverified-app warning, 100-user lifetime cap, Testing 7-day tokens

### Tertiary (LOW confidence)
- https://apify.com/benthepythondev/luma-calendar-events-scraper — `api.lu.ma/ics/get?entity=calendar&id=…` form (do not construct)
- https://docs.slingdata.io/connections/api-connections/eventbrite — private token is account-scoped
- 06-DISCUSSION-LOG research notes (Luma API Plus requirement, Humanitix, Meetup ICS reliability)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Nothing new; versions read from package.json and node_modules.
- Architecture: HIGH. Every reuse point was read; the four integration hazards were found in code.
- Gmail API: MEDIUM-HIGH. Sync, history, quota, drafts and threading came from official docs; some parameter names are from training.
- Event sources (Eventbrite organizer path, Luma API paths, ICS field shapes): LOW. D-06/D-07 fallbacks make that safe.
- Pitfalls: HIGH for the code-derived ones, MEDIUM for Message-ID rewriting and bot walls.

**Research date:** 2026-10-13
**Valid until:** 2026-11-12 (Google and Eventbrite policies move; re-check A1, A2 and A4 at execution)

## RESEARCH COMPLETE
