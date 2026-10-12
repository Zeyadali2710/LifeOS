# Phase 6: Outreach - Discussion Log

> Audit trail only. Decisions live in 06-CONTEXT.md.

**Date:** 2026-10-13
**Mode:** --auto (owner asleep, overnight run 2026-10-13). Every choice below is the recommended default; review and override in CONTEXT.md.

[--auto] Selected all gray areas: Event sources & honesty, Relevance scoring, Dedup & storage & cadence, Pipeline & calendar/task integration, Gmail scopes & sync & storage, Triage (classify/summarise/flag/extract), Drafting & sending, Outreach page layout, Mock labelling, Testing, Phase split.

**Locked by the owner before discussion:** Gmail reuses the Phase 4 Google OAuth client (Gmail API already enabled) and gets a "Reconnect Google" step. Eventbrite and Luma keys go only in Settings → Connections, encrypted, with MOCK providers until the keys are entered. Owner-only steps are logged and do not block.

| Area | Question | Auto-selected (recommended) | Alternatives considered |
|---|---|---|---|
| Event sources | What actually discovers Sydney events? | iCal feeds (Luma Discover Sydney city feed, Luma calendars, Meetup group feeds where they work) plus schema.org JSON-LD URL import (D-04/05) | Scraping Eventbrite/Meetup search pages (ToS, brittle); third-party scrapers (Apify) |
| Event sources | Eventbrite with a private token? | MOCK until a token is entered; with one, list events from followed organizers, and declare `discover:false` if that endpoint only returns the owner's own events (D-06) | Skip Eventbrite entirely; URL import only |
| Event sources | Luma API? | MOCK until a key is entered; it adds only the owner's own Luma Plus calendar, and discovery comes via iCal (D-07) | Require a Luma key for any Luma data |
| Event sources | Meetup / Humanitix? | MOCK classes with no key field; real pages through URL import (D-08) | Humanitix key provider (own/shared events only); Meetup Pro GraphQL |
| Feed URL storage | Plain or encrypted? | Encrypted (they may hold personal tokens); show host plus label only | Plain text in settings |
| Relevance | Rules or LLM? | Explainable rules, INTERESTS 60 + PROJECTS 20 + SCHEDULE 20, templated why line, $0 (D-14) | Haiku scoring per event; hybrid now |
| Relevance | Where do interests come from? | An owner-editable chip list in Settings → Outreach, seeded from the design filters (D-15) | Derived from GitHub languages/projects only |
| Relevance | NETWORK / GOALS signals | Omitted (no contacts; Goals arrive in Phase 8) | Fake placeholder values (rejected: no fake data) |
| Dedup | Strategy | Source+remoteId upsert, then cross-source merge by canonical URL or by normalized title plus start minute (D-11) | Fuzzy title similarity; LLM dedup |
| Storage | Pipeline model | A `stage` column on `outreach_events` (D-10/16) | A separate pipeline table with history (activity events already give history) |
| Cadence | Event sync | Every 6 h plus Sync now, pg-boss (D-13) | Hourly; daily |
| Window | How far ahead | 60 days; Sydney geo radius or location-text match; Online tagged (D-12) | 14 days as in the design header; 90 days |
| Pipeline | ATTENDING → calendar | An "Add to calendar" button, owner write via `createEvent` (D-17) | Automatic on Attend; agent approval |
| Pipeline | FOLLOW_UP → tasks | A dialog pre-filled with "Follow up: X" due 2 days after; Phase 4 tasks plus an `outreach_event_id` FK (D-18) | Auto-create without a dialog; separate follow-up entity |
| Pipeline | Agent pipeline writes | READ only this phase (D-19) | PREPARE → APPROVE save/move |
| Gmail scopes | Which scopes | `gmail.readonly` + `gmail.compose` (D-20) | `gmail.modify` (wider, enables archive/label); `gmail.readonly` + `gmail.send` (cannot create drafts) |
| Gmail grant | One grant or two | One Google grant, Gmail scopes optional and detected, calendar still required (D-21) | A separate `google_mail` connection with its own refresh token |
| Gmail sync | How | Full sync of 30 days of INBOX (≤500), then `history.list` every 5 min, full resync on 404 (D-22) | Pub/Sub push (needs a public endpoint); polling `messages.list` |
| Gmail storage | Store bodies? | Metadata, snippet and triage output only; bodies fetched live and never persisted (D-23) | Store full bodies (more PII at rest); metadata only with no snippet |
| Gmail rendering | HTML mail | Plain text only, tags stripped server-side, no remote images (D-24) | Sanitized HTML in a sandboxed iframe |
| Triage | Who and when | A worker batch job after sync; rules skip bulk mail; Haiku 4.5 in batches of 10, recorded as Outreach agent runs (D-25) | On-demand only when a mail is opened; Sonnet; free model (rejected: private) |
| Triage | Cost bound | Backfill only 7 days (≤100); pause at the spend cap with an honest banner | Triage all 30 days; a separate mail budget |
| Flag / archive | Gmail or local? | LifeOS-local; HIGH importance creates one IMPORTANT notification (D-26) | Star/archive in Gmail (needs `modify`) |
| Actions → tasks | Who creates tasks | Owner clicks "Add as task" (direct write, `mail_message_id` FK) (D-27) | Agent auto-creates tasks; agent PREPARE → APPROVE tasks |
| Privacy | Free models | Mail never goes to free models, no toggle; tools are `private: true` (D-28) | Reuse the 03.1 opt-in toggle for mail |
| Untrusted | Injection defence | Untrusted envelope, CONTENT_TOOLS floor, locked recipients (D-28/29/30) | Prompt instruction only |
| Drafting | What is "a draft" | The pending `mail_reply` approval is the draft (editable); "Save to Gmail drafts" is an owner action that creates a real Gmail draft (D-30/31) | Agent creates a Gmail draft at PREPARE (floored to APPROVE anyway by D-06 of 5.1) |
| Sending | Tier and edit | APPROVE, edit subject/body, recipients and thread locked (D-30) | HIGH_RISK; editable recipients |
| Sending | Idempotency | Deterministic Message-ID; on adopt search `rfc822msgid:` in Sent before sending (D-32) | Store draft id only |
| UI | Tabs | EVENTS / EMAIL / FOLLOW-UPS; NETWORK tab omitted; List/Pipeline toggle on EVENTS (D-34) | Separate pipeline page; keep NETWORK as an empty stub |
| UI | Design extras | Drop cover image, agenda, people going, map | Port them with placeholders (rejected) |
| Mock labelling | Rules | MOCK badge, "Hide mock" on once a real source exists, mock events can't reach calendar/tasks (D-09) | Hide mocks entirely |
| Testing | Strategy | Fixtures + fake-gmail; unit + VM DB tests + Playwright e2e with fake LLM; no live APIs (D-37) | Live sandbox accounts |
| Phase split | One phase or sub-phases | One phase in ~6 waves (events → pipeline → Gmail → agent/send → UI → tests/docs) | 6a Events / 6b Email |

## Claude's Discretion
Table and column names, score weights within 60/20/20, Sydney radius and location list, ICS recurrence expansion, triage batch size and prompt, event detail route vs panel, Eventbrite organizer list storage, wave split.

## Deferred Ideas
NETWORK tab and contacts CRM, people going, the GOALS signal (Phase 8), LLM relevance, Gmail push, `gmail.modify` actions, agent pipeline/task writes, Outlook, event cover images/agenda/map, bulk outreach, Meetup Pro and Humanitix API providers.

## Research notes

Verified 2026-10-13 (web). The planner should re-verify the starred items before building.

- **Eventbrite:** public Event Search (`GET /v3/events/search/`) closed to the public on 2019-12-12, with a creator whitelist until 2020-02-20 and all requests denied after that. The recommended replacements are event by id, events by venue, and events by organization. A private token is for the owner's own account; acting for other organizers needs OAuth. Token check: `GET /v3/users/me/`. * Whether `organizations/{id}/events` or `organizers/{id}/events` returns public events of organizations the owner doesn't belong to is unconfirmed (D-06 handles both outcomes).
  - https://github.com/Automattic/eventbrite-api/issues/83 (quotes the deprecation notice)
  - https://community.make.com/t/eventbrite-api-depreciated/80369
  - https://docs.stackone.com/connectors/eventbrite/guides/link-account/private-token
- **Luma API:** needs **Luma Plus**. Each key covers only the calendar it was created on. Base `https://public-api.luma.com`, header `x-luma-api-key`, check `GET /v1/users/get-self`. No public discovery or search endpoint is documented.
  - https://docs.luma.com/reference/getting-started-with-your-api.md
  - https://help.luma.com/p/luma-api
- **Luma iCal:** public calendars and **Discover city pages** have "Add iCal Subscription". A city feed holds "all upcoming approved events in that city". The help article's example is lu.ma/sf, so Sydney should be luma.com/sydney (*). Copy the generated link instead of building `api.lu.ma/ics/get?entity=calendar&id=…` by hand (an undocumented format seen only in third-party examples).
  - https://help.luma.com/p/ical-syncing
  - https://apify.com/benthepythondev/luma-calendar-events-scraper
- **Meetup:** the GraphQL API needs a Pro subscription (already in docs/integrations.md). Group iCal (`/<group>/events/ical/`) is reported to 404 when logged out on some groups, so it is unreliable (*). The owner can try a feed, and D-04 reports errors honestly.
  - https://wordpress.org/support/?p=16607116
- **Humanitix:** the public API is read-only with an `x-api-key` from account → advanced. Per third-party docs it lists events owned by or shared with the account, so it is not discovery.
  - https://help.humanitix.com/en/articles/8888275-public-api-documentation
  - https://docs.nexla.com/user-guides/connectors/humanitix_api
- **schema.org Event JSON-LD:** standard `Event` properties (name, startDate, endDate, location Place/VirtualLocation, organizer, offers, url, eventStatus, eventAttendanceMode). Event platforms embed it for search engines, which makes URL import reliable without scraping.
  - https://schema.org/Event
  - https://developers.google.com/search/docs/appearance/structured-data/event
- **Gmail scopes:** `gmail.readonly` is restricted, `gmail.compose` (drafts + send) is restricted, `gmail.send` is sensitive (send only, no drafts), `gmail.modify` is restricted, and `gmail.metadata` is restricted (no bodies). So any useful read scope is restricted.
  - https://developers.google.com/workspace/gmail/api/auth/scopes
- **Verification:** Google's exceptions include "personal use (fewer than 100 users)". The user clicks through the unverified-app warning, and the 100-user cap lifts only after verification. Restricted-scope verification (CASA assessment) is only needed beyond personal use. (*) Google can block unverified apps that request restricted scopes for accounts other than the project owner or developers; the owner's own account is the project owner, which is the expected path.
  - https://support.google.com/cloud/answer/13464323
  - https://developer.nylas.com/docs/cookbook/use-cases/build/fix-google-access-denied/
- **Refresh tokens:** with **Testing** publishing status, refresh tokens expire after 7 days and up to 100 test users are allowed. **In production**, they last until revoked or about 6 months unused. Phase 4 already put the app In production (docs/integrations.md), so adding Gmail scopes keeps long-lived tokens after one re-consent.
  - https://www.unipile.com/google-oauth-refresh-token/
- **Gmail incremental sync:** full sync (`messages.list` + `messages.get`, store the latest `historyId`), then `history.list?startHistoryId=`. History is kept for at least about a week, sometimes less. A 404 means a full sync is required. Push needs Pub/Sub, so LifeOS polls.
  - https://developers.google.com/workspace/gmail/api/guides/sync

## Planning-time auto-decisions (from 06-RESEARCH.md, overnight 2026-10-13)

| Topic | Auto-selected | Why |
|---|---|---|
| D-28 enforcement | Hard mail-private check in the run scope that ignores `ai.free_private_ok`; Outreach agent `routable: false` | the toggle is ON for the owner, so the existing D-09 gate alone would let mail reach free models |
| Google scopes (D-21) | Split requested vs required (calendar) scopes, store granted list in `connections.scopes`, `include_granted_scopes=true` | unticking Gmail on the consent screen must not break Calendar |
| Gmail backfill (D-22) | Resumable full sync, ≤200 message fetches per run | 500 × 20 units exceeds 6,000 units/min quota |
| Dedup (D-11) | URL merge also requires the same start minute | recurring ICS events share a URL |
| Send idempotency (D-32) | Saved Gmail draft id is the primary guard; `rfc822msgid:` search is fallback | Gmail may rewrite custom Message-ID |
| SSRF | Small stdlib `node:https` fetcher rejecting private IPs at connect time (no new deps) | codebase only has URL-syntax checks; closes DNS rebinding |
| e2e scope (D-37) | URL import, Add to calendar, real send → DB tests with fakes; Playwright drives seeded rows | e2e server has no worker/LLM/outbound network |
| Eventbrite | Own-organization path + per-organizer probe with honest error; organizer ids in `event_sources.config` | public search removed; owner verifies with a real token |
| D-14 PROJECTS (plan-checker blocker 2) | Full D-14: active project name + category label + context keywords (distinct words >= 4 chars minus stopwords, <= 20 per project); `rescoreAll` fire-and-forget after project create/update/archive/unarchive in `project-actions.ts` (plan 06-09) | no scope reduction; supersedes RESEARCH A6 (names only) |
| D-28 mail-derived tasks (plan-checker warning 4) | Agent-facing task outputs (`tasks.list`, `projects.list` nextTask, `projects.get` tasks) show "Email follow-up (private)" for tasks with `mail_message_id` (plan 06-14) | smaller than widening `mailInScope` to task reads; owner UI unchanged |
| D-32 adopt order (plan-checker warning 3) | Checkpoint `{ draftId, draftMessageId }`; adopt: draft exists -> send; checkpointed message has SENT -> done; `rfc822msgid:` -> done; else send fresh | three independent "already sent" signals before any re-send |
