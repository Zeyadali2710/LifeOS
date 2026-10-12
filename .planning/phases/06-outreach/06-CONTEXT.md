# Phase 6: Outreach - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning
**Mode:** --auto (owner asleep). Every decision is the recommended default; see 06-DISCUSSION-LOG.md for alternatives and the research behind the API-reality decisions.

<domain>
## Phase Boundary

Outreach stops being an honest-empty page. Three things ship, in one phase built in waves:

1. **Events (OUT-01):** an `EventSourceProvider` seam that pulls Sydney events from the sources that actually allow it in 2026, normalizes and dedupes them, and gives each an explainable relevance score.
2. **Pipeline (OUT-02):** saved events move SAVED → INTERESTED → ATTENDING → ATTENDED → FOLLOW_UP. ATTENDING can put the event on the calendar and FOLLOW_UP creates tasks. Every transition is an activity event.
3. **Email (OUT-03):** Gmail connects through the existing Google OAuth client and syncs incrementally. The Outreach agent classifies, summarises, flags and extracts action items. Replies are drafted, and sending is always an APPROVE-tier action with edit-before-approve.

Not in this phase: the design's NETWORK tab (a contacts/relationship CRM), "people you know going", goal-based scoring, LLM relevance, Gmail push, Outlook, archiving or labelling inside Gmail, and any automatic sending.

</domain>

<decisions>
## Implementation Decisions

### Owner-given constraints (locked)
- **D-01:** **Gmail reuses the existing Google OAuth client from Phase 4.** The owner has already enabled the Gmail API in Google Cloud. The Gmail scopes are added to the Google authorization request, and Settings → Connections gets a **"Reconnect Google"** action on the Google row that re-runs the existing PKCE flow (`startGoogleOAuth`) to grant them.
- **D-02:** **Eventbrite and Luma API keys are entered only in Settings → Connections.** They are stored AES-256-GCM encrypted in `connections` like the GitHub token (Phase 3 D-09; reuse `TokenForm`/`ConnectionRow`), only the last 4 characters are shown, they can be rotated without a redeploy, and they never appear in `.env`, logs or chat. Validation uses constant URLs (Eventbrite `GET /v3/users/me/`, Luma `GET /v1/users/get-self` with the `x-luma-api-key` header). Until a key is entered, each source runs as a **clearly labelled MOCK provider**.
- **D-03:** **Owner-only items are logged, not blocking:** VM migrate/deploy, `scripts/vm-db-test.sh`, UAT, entering keys and feed URLs, and re-consenting Google. They go in OWNER-ACTIONS.md at execution time, using the `[BLOCKING]` owner migrate pattern from earlier phases.

### Event sources: what is real and what is mock (research-verified, see the log)
- **D-04:** **Real source 1 is iCal feeds (`ics` provider). It is the main discovery path.** The owner adds iCal subscription URLs in Settings → Connections → Event feeds, for example **Luma's Discover city feed for Sydney** (Luma documents "Add iCal Subscription" on Discover city pages, and that feed holds all upcoming approved events in the city), public Luma calendars, and Meetup group feeds when they work. Parsing uses the already-installed `ical.js` (no new dependency). Fetches are https only with an SSRF guard (no private, loopback or link-local IPs, re-checked after redirects), a 2 MB cap and a timeout. Feed URLs may contain personal tokens, so they are stored encrypted and the UI shows only the host plus the owner's label.
- **D-05:** **Real source 2 is URL import (`url` provider).** The owner pastes an event page URL (Eventbrite, Humanitix, Meetup, Luma or any other) and LifeOS reads the page's schema.org `Event` JSON-LD (`name`, `startDate`, `endDate`, `location`, `organizer`, `offers`, `url`, `description`). The same SSRF guard and size cap as D-04 apply. Imported events go straight to SAVED. When a page has no JSON-LD Event, the error is honest ("No event data found on that page") and nothing is scraped.
- **D-06:** **Eventbrite runs MOCK until a private token is entered.** Public event search was removed (closed to the public 2019-12-12, all requests denied after 2020-02-20), so a token cannot discover events. With a token, the provider lists events from **organizers the owner follows**. The owner enters organizer IDs next to the key. The planner must verify that the organizer/organization events endpoint returns public events of organizers other than the owner. If it does not, the provider declares `capabilities: { discover: false }`, lists only the owner's own events, and the UI says exactly that.
- **D-07:** **Luma API runs MOCK until a key is entered.** The API needs Luma Plus, and each key only covers the calendar it was created on, so it adds discovery value only for the owner's own Plus calendar. Real Sydney discovery from Luma comes from the iCal feeds in D-04, which need no key.
- **D-08:** **Meetup and Humanitix are MOCK classes with no key field.** Meetup's GraphQL API needs Pro, and its iCal feeds are reported to be unreliable when logged out, so the owner can try a group feed via D-04. Humanitix's API key is read-only and covers events the owner owns or that are shared with them, which is not discovery. Pages from both sites come in through URL import (D-05).
- **D-09:** **Mocks follow the existing labelling rules.** A mock provider is a real class that reads fixture data and has `isMock: true` (ADR-010). Every mock event card shows a **MOCK** badge. The events list has a "Hide mock" toggle that is **on by default once any real source exists**. Mock events **cannot be added to a real calendar** and their FOLLOW_UP creates no tasks (the button is disabled with an explanation).

### Normalization, dedup, storage, cadence
- **D-10:** **Storage uses three tables.**
  - `event_sources`: id, kind (`ics`, `eventbrite`, `luma`, `meetup_mock`, `humanitix_mock`), label, encrypted URL, enabled, lastSyncAt, lastSyncError. The keys themselves live in `connections`.
  - `outreach_events`: normalized title, start, end, timezone, venue/location text, optional lat/lng, online flag, organizer, price text, canonical url, description (capped, about 4 KB), categories[], `is_mock`, a sources jsonb array of `{sourceId, remoteId}`, raw jsonb, score, signals jsonb, why text, `stage` (null means discovered, not saved), `stage_changed_at`, `calendar_event_id` (nullable FK to `calendar_events`), `dismissed_at`.
  - `tasks` gains two nullable FKs (D-17, D-27).
- **D-11:** **Dedup happens at upsert.** The primary key is (source, remoteId). Across sources, events merge when the canonical URL matches (lower-cased, query and fragment stripped), or else when the normalized title (lower-case, punctuation and whitespace collapsed) and the start time (to the minute) both match. A merged row keeps the union of its sources, and real data beats mock when fields conflict.
- **D-12:** **Window and Sydney filter.** Events are kept from now to **60 days ahead**. An event counts as "Sydney" when its geo lies within about 60 km of the CBD, or, without geo, when its location text matches Sydney or NSW. Online events are kept and tagged Online. Events with no location are kept and tagged "Location unknown". Past, unsaved events are pruned after 30 days. Saved events are never pruned.
- **D-13:** **Sync runs every 6 hours plus a "Sync now" button.** It is a new pg-boss queue, `outreach.events.sync`, following the GitHub and calendar pattern. Per-source errors are isolated and recorded on `event_sources`, and an auth failure on a keyed source marks the connection RECONNECT. One sync emits one activity event (Outreach source, at most one per run) and only when it found new events scoring 70 or more.

### Relevance scoring
- **D-14:** **Scoring uses explainable rules with no LLM, and it costs $0.** Score 0–100 = **INTERESTS 60 + PROJECTS 20 + SCHEDULE 20**.
  - INTERESTS: matches of owner-editable interest keywords against title, categories and description. Title and categories weigh more than description. The keywords are seeded from the design's filters: Entrepreneurship, Startups, Computer Science, Cybersecurity, Engineering, AI, Fintech, Networking.
  - PROJECTS: matches of active project names, categories and context keywords (Phase 5) against the event text.
  - SCHEDULE: 100 when the event fits free time, 50 when it overlaps an optional busy event, 0 when it conflicts with a busy event. This reuses the Phase 4 conflict and free-slot code.
  - The stored `signals` (label, value, matched terms) drive the design's "WHY THIS IS RELEVANT" block, and the `why` line is templated from them, for example "Matches cybersecurity, AI · fits your Thursday evening · related to project Sentinel". The design's NETWORK and GOALS signals are left out (no contacts yet, and Goals arrive in Phase 8). Scores are recomputed on each sync and whenever interests or projects change.
- **D-15:** **Interests are edited in Settings → Outreach**, a small section with a chip editor stored in the `settings` key/value table (`outreach.interests`). The Outreach page's filter chips are those same interests.

### Pipeline (OUT-02)
- **D-16:** **The stage is a column on `outreach_events`.** The buttons are Save (→ SAVED), Interested, Attend (→ ATTENDING), Attended and Follow up. The owner can move forward or back one step, and Dismiss hides an event. Writes are owner UI actions that go direct and are audit-logged (Phase 4 D-06, Phase 5 D-16). **Every transition emits an activity event** (Outreach source, `travel_explore` icon, cyan) stating from and to.
- **D-17:** **ATTENDING offers "Add to calendar". It is not automatic.** The owner picks a calendar, defaulting per Phase 4 D-09, and the event is created right away through the existing `createEvent(..., { actor: "owner" })` with title, time, location and the URL in the description. `calendar_event_id` links them and the card shows "On calendar". Moving back out of ATTENDING does not delete the calendar event; the owner does that in Organization. Blocked for mock events (D-09).
- **D-18:** **Entering FOLLOW_UP opens a small dialog** pre-filled with one task, "Follow up: <event title>", due 2 days after the event ends, with priority 2. The owner can edit it or add more lines, then confirm. Tasks are created with the Phase 4 `createTask`, plus a new nullable `tasks.outreach_event_id` FK (`ON DELETE SET NULL`). The FOLLOW-UPS tab lists open tasks linked to an event or an email.
- **D-19:** **Agents get READ access to events this phase:** `outreach.list_events` (filters: stage, min score, date range) and `outreach.get_event`. Agent pipeline writes are deferred, keeping READ consistency per Phase 4 D-19 and Phase 5 D-17. Event descriptions come from third parties, so both tools join `CONTENT_TOOLS` and the 5.1 floor applies.

### Gmail connection and sync (OUT-03)
- **D-20:** **Scopes are `gmail.readonly` and `gmail.compose`.** `compose` covers creating a draft and sending it (`drafts.create`, `drafts.send`). `gmail.modify` is not requested: archive and flag are LifeOS-local (D-26), so nothing in Gmail is relabelled or moved. `gmail.send` alone is not enough, because it cannot create drafts. Both chosen scopes are **restricted**. That is acceptable for a single-user personal app: Google exempts personal use under 100 users from verification, and the app stays unverified, so the owner clicks past the "Google hasn't verified this app" screen once.
- **D-21:** **There is one Google grant, and the granted scopes are stored.** The scopes are added to `GOOGLE_SCOPES` in the auth request. The callback still **requires only the calendar scopes**. Gmail scopes are detected from the token response's `scope` and stored on the connection row (a new `scopes` jsonb column). Today `GOOGLE_SCOPES.every(...)` in `oauth.ts` checks every scope, so it must be split into requested scopes and required (calendar-only) scopes. If Google's granular consent lets the owner untick Gmail, Calendar keeps working and Email shows "Reconnect Google to allow Gmail". Disconnecting Google revokes both, and the UI warns about this.
- **D-22:** **Sync is a pg-boss queue, `mail.sync`, every 5 minutes plus Sync now** (same cadence as calendar). The first run is a full sync of the **INBOX for the last 30 days, capped at 500 messages** (`messages.list` then `messages.get format=metadata`), and it stores the latest `historyId`. After that it uses `history.list` with `startHistoryId` (messageAdded, labelAdded and labelRemoved for INBOX). A **404 triggers a full resync**. Google keeps history for at least about a week, so a VM outage longer than that falls back cleanly. There is no push or Pub/Sub, because LifeOS is reachable over Tailscale only.
- **D-23:** **Only metadata is stored, not bodies.** `mail_messages` holds gmail id, threadId, from (name and address), to and cc, subject, date, labelIds, snippet, a `bulk` flag (List-Unsubscribe header or CATEGORY_PROMOTIONS/SOCIAL), plus the triage outputs (category, importance, summary, action items, flagged, triagedAt, triage model) and the local state (archivedAt, flaggedAt). **Bodies are fetched live** when the detail view opens and when triage runs, and they are never persisted (5.1 D-04 pattern). Rows older than 90 days whose messages left INBOX are pruned.
- **D-24:** **Bodies are rendered as plain text only.** The detail view prefers the `text/plain` part. For HTML-only mail, the server strips tags to text. No HTML is rendered, no remote images or tracking pixels load, and link URLs are shown as text. Plain-text body output is capped at 16 KB on a code-point boundary (5.1 WR-05 helper).

### Triage: classify, summarise, flag, extract
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

### Drafting and sending
- **D-29:** **The Outreach agent goes live.** Its tools are:
  - READ: `outreach.list_events`, `outreach.get_event`, `mail.list` (searches synced metadata and triage output by category, importance, sender or text), and `mail.get_message` (live body inside the untrusted envelope).
  - APPROVE: `mail.send_reply`.

  All mail and event tools are added to `CONTENT_TOOLS`, so the 5.1 gateway floor lifts any side effect in those runs to at least APPROVE. The orchestrator delegates email and events questions to it. Drafting is `reasoning` tier (Sonnet), and the mail taint keeps the run off free models anyway.
- **D-30:** **The draft is the approval.** "Draft with agent" (in the EmailDetail and FOLLOW-UPS views, and from chat) runs the Outreach agent, which calls `mail.send_reply` with `{ messageId, threadId, to, cc, subject, body }`. That creates the pending approval, which the EmailDetail shows as the design's **"DRAFT REPLY · OUTREACH AGENT · not sent"** block with **edit-before-approve**: subject and body are editable, and `messageId`, `threadId`, `to` and `cc` are **locked**. Replies go only to the original thread's participants, so injected text cannot redirect mail. The copy reads "Reply opens an approval. Nothing sends automatically." The approval card also shows a "Drafted from email content (untrusted)" note (5.1 D-15 pattern).
- **D-31:** **"Save to Gmail drafts" on a pending reply is an owner action.** It creates a real Gmail draft (`drafts.create`, threaded) directly so the owner can finish it in Gmail, and LifeOS then rejects the approval with the reason "moved to Gmail drafts". This is how "drafting a reply creates a draft" is honoured without the agent writing to Gmail on its own.
- **D-32:** **Sending after approval is idempotent** (AGT-03). The MIME message gets a deterministic `Message-ID: <approval-{id}@lifeos.local>` plus `In-Reply-To` and `References` from the original, and is sent via `drafts.create` then `drafts.send` in the thread. On an ambiguous retry (`ctx.adopt`), the handler first searches Sent with `rfc822msgid:` and returns the existing message instead of sending again. This is the analogue of the GitHub issue marker. The new approval kind `mail_reply` in `approval-kinds.ts` gets its schema, `LOCKED` fields, summary ("Approval waiting: reply to Hannah Lee · Re: Demo night slot") and a `MailApprovalBody`. It works on the Approvals page, inline in the AI panel, and through the APPROVAL notification, and reuses the 7-day expiry.
- **D-33:** **Send failures are honest.** A missing Gmail scope raises `NOT_CONNECTED` and a "Reconnect Google" link. Auth failures mark the connection RECONNECT. Sending never falls back to anything else.

### Outreach page (UI)
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

### Testing
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/calendar/google/oauth.ts` + `client.ts`: PKCE flow, `GOOGLE_SCOPES`, `exchangeCode` (already returns granted `scopes`), the token refresh path, and the plain-fetch Google client with fixed hosts. Gmail calls can reuse the token and refresh logic (`readCalendarSecret`/`updateCalendarSecret` for `google_calendar`).
- `src/server/calendar/connections.ts`: `saveCalendarSecret`, `markCalendarError`, `recordCalendarSync`, `revokeGoogle`.
- `src/server/github/connections.ts`: `saveToken`/`saveOpenRouterKey` pattern for the Eventbrite and Luma keys (constant validation URL, last4, audit).
- `src/settings/`: `connection-row.tsx`, `token-form.tsx`, `calendar-connection-row.tsx`, `connections-section.tsx` for the Reconnect Google, Eventbrite, Luma and Event feeds rows.
- `src/server/calendar/events.ts` `createEvent` (owner actor) for "Add to calendar". `conflicts.ts`/`free-slots.ts` for the SCHEDULE signal.
- `src/server/tasks.ts` `createTask` for follow-up and action-item tasks. `src/server/projects.ts` for project keywords.
- `src/server/events.ts` `emitActivity`/`notifyLive`. `src/server/notifications.ts`.
- `src/server/agents/policy.ts` `CONTENT_TOOLS` + `withContentFloor`. `routing.ts` taint and the private gate. `redact.ts`. `registry.ts` (the Outreach agent is registered as `off(... "Phase 6")` and goes live).
- `src/lib/approval-kinds.ts` and `src/approvals/*-approval.tsx` for the `mail_reply` kind and `MailApprovalBody`.
- `ical.js` (already a dependency) for ICS. `zod` for JSON-LD and triage schemas. No new dependencies are expected.
- `tests/helpers/fake-google.ts`, `fake-llm.ts`, `fake-calendar.ts` and `tests/fixtures/` for the new fake-gmail and fixtures.

### Established Patterns
- Capability providers with `isMock` and MOCK badges (ADR-010, `docs/integrations.md`).
- pg-boss schedules plus Sync now (`src/server/queue.ts` `QUEUES`). The worker owns scheduling.
- Encrypted single-row connections. Auth failure means RECONNECT and paused sync. Errors are fixed strings, never provider output.
- Owner UI writes go direct and are audit-logged. Agent side effects go PREPARE → APPROVE with edit-before-approve, `LOCKED` fields and zod re-validation on approve.
- Untrusted-content envelope plus the gateway floor (5.1 D-06). The private taint routes to Anthropic models (03.1 D-09).

### Integration Points
- `src/app/(os)/outreach/page.tsx` (currently a `DomainPage` empty state) is replaced.
- The Google callback route `/api/connections/google/callback` handles the scope detection and storage.
- `src/server/db/schema.ts` plus a migration (owner VM migrate).
- `registry.ts` gets the Outreach agent's tools and prompt, and the orchestrator prompt gets a delegation line.
- New queues in `QUEUES`: `outreach.events.sync`, `mail.sync`, `mail.triage`. Worker schedules.
- Settings → Connections (Google Reconnect plus Gmail status, Eventbrite, Luma, Event feeds) and Settings → Outreach (interests).

</code_context>

<specifics>
## Specific Ideas

- The design's copy to keep: "WHY THIS IS RELEVANT · NN/100", "DRAFT REPLY · OUTREACH AGENT · not sent", "Reply opens an approval. Nothing sends automatically.", and the empty state "No events match these filters."
- Luma's Discover Sydney iCal feed is the most valuable real source. The setup instructions should tell the owner to open luma.com/sydney → "Add iCal Subscription" → copy the link → Settings → Event feeds.
- The owner is a UNSW CS student. Seed interests: Entrepreneurship, Startups, Computer Science, Cybersecurity, Engineering, AI, Fintech, Networking.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

---

*Phase: 06-outreach*
*Context gathered: 2026-10-13*
