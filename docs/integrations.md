# Integrations

Status: provider contracts and shipped integrations are described below. Socials live behavior still needs the owner checks in `.planning/OWNER-ACTIONS.md`.

## Capability providers
Application code depends on capability interfaces, never on vendor SDKs.

| Interface | Implementations (planned) |
|---|---|
| `RepoProvider` | GitHub |
| `CalendarProvider` | Google Calendar, CalDAV (iCloud) |
| `MailProvider` | Gmail, Outlook (Graph) |
| `SocialProvider` | LinkedIn, Instagram (Graph), TikTok, Portfolio |
| `EventSourceProvider` | Eventbrite, Luma, Meetup, Humanitix, manual/URL import |

Each provider:
- declares `capabilities` (e.g. `{ publish: false, analytics: true }`) — the UI renders only what the provider can actually do;
- handles auth + token refresh (tokens encrypted in `integrations`), rate limits, retries, and maps errors to `AuthExpired | RateLimited | Unavailable | Invalid`;
- returns **normalized** internal models; raw payloads may be kept in a JSONB column for debugging;
- has `isMock: boolean`. Mock providers are real classes with realistic data and are badged **MOCK** in the UI. They are never presented as live.

## Known API realities (verify again at each phase)
- **LinkedIn**: self-serve Share on LinkedIn can create member text posts with `w_member_social`; member analytics remain unavailable here.
- **Instagram**: this integration uses Instagram Login for a Professional account, without a Facebook Page. Post insights are implemented; live permission/metric availability still needs owner verification.
- **TikTok**: Login Kit and Display API provide analytics when granted; publishing remains manual. Public Content Posting needs an audit and video handling.
- **Meetup**: GraphQL API requires a Pro subscription.
- **Apple Calendar**: CalDAV with an app-specific password; no official REST API.

## Least-privilege scopes
Documented per provider when implemented. Default to read-only scopes; write scopes added only for APPROVE-tier features the owner enables.

## Socials (Phase 7)

Social drafts and variants are local. Every LinkedIn or Instagram publish, including a scheduled one, requires an editable owner approval. Scheduling is a LifeOS worker job, with no provider-side schedule. A disconnected provider uses a labelled MOCK; mock publications have no external URL and mock metrics never enter real totals. Credentials are entered and rotated only in Settings → Connections, encrypted at rest; no Socials credential belongs in `.env`.

| Provider | Auth | Publish | Schedule | Analytics | Media / limitation |
|---|---|---|---|---|---|
| LinkedIn | Owner-pasted OAuth token with `openid profile w_member_social` | Text and optional plain URL | LifeOS-side | None for personal profile | No image upload or promised rich link preview |
| Instagram | Owner-pasted Instagram Login token; Professional account | One public HTTPS image URL and caption, after owner verification | LifeOS-side | Returned account fields and post views/reach/likes/comments/shares/saves | No Facebook Page; `verification_pending` disables real publish/analytics |
| TikTok | Web Login Kit OAuth; requested `user.info.basic,user.info.stats,video.list` | Manual copy/open/mark as posted | None | Account/video fields only for scopes actually granted | Video upload and posting deferred |
| Portfolio | No connection | Markdown copy/download, then manual mark as posted | None | None | Optional image URL in Markdown |

LinkedIn uses `/rest/posts` with `Linkedin-Version: 202609` and `X-Restli-Protocol-Version: 2.0.0`. The client escapes reserved characters for LinkedIn's little-text format; an optional link is appended to commentary as plain text. The 3,000-code-point check is a conservative LifeOS limit, not a verified current Posts API ceiling. The owner must smoke-test one real text post and link before accepting that path.

TikTok's **web** authorization code flow uses an unpredictable state and the configured HTTPS callback; the documented web flow does not use PKCE. The returned grant can omit `user.info.stats` or `video.list`, so LifeOS stores actual scopes and disables missing analytics. A 401/403 marks a connection RECONNECT. Refresh rotates encrypted access/refresh tokens without changing an approval's credential generation.

Instagram stays `verification_pending` after a token is pasted. The owner must confirm token provenance, granted `instagram_business_*` scopes, expiry/refresh, a successful public-image container/publish, and the actual per-image insights response before confirming the real connection in Settings. Post insights request views, reach, likes, comments, saved and shares on each non-Story media item within the current Sydney calendar year. Both values[].value and total_value.value responses are supported; saved maps to saves. Sync pages using cursors on the fixed Instagram host, and never follows a provider-supplied next URL. Sync imports existing Instagram and public TikTok posts from the current Sydney calendar year into the Published column, calendar and analytics, with original captions/titles, dates and links. Imports are labelled and read-only; their text is untrusted source content. A platform/account/remote-ID unique index prevents repeated imports, and matching real LifeOS publications receive metric updates without rewriting approved content. Missing Instagram insights do not block importing the post itself. Analytics defaults to YTD. Insights require instagram_business_manage_insights on the connected Professional account. The token lifetime remains owner-confirmed. Only fields actually returned are shown; missing metrics are unavailable, not zero. Container adoption requires one unique caption match across a complete media scan; an inconclusive result stops for owner review.

## GitHub (Phase 3)
Two fine-grained personal access tokens, added in Settings -> Connections. They are encrypted at rest (AES-256-GCM, key from `LIFEOS_MASTER_KEY`). Only the last four characters, login, expiry and repository list are shown; tokens are never logged or sent to the browser.

- **Read token** (sync and all READ tools). Repository permissions, all read-only: Contents, Metadata, Pull requests, Issues, Actions, Commit statuses.
- **Repo contents (Phase 5.1)**: `github.list_tree` and `github.get_file` need the read token to have Contents: Read-only (otherwise 404, shown as not found). Default branch only; caps 400 tree entries, 16 KB per file, 1 MB source size; binary files refused; no caching (fetched live per call).
- **Issues-write token** (only `github.create_issue`). Repository permission: Issues: read and write, on the chosen repositories only. Without it CREATE ISSUE is disabled in the Approval Centre.
- **Sync**: every 15 minutes (pg-boss schedule) plus Sync now. ETags make unchanged resources return 304. Stored: repos, pull requests (with reviews and requested reviewers), issues, recent commits and workflow runs. New or changed items emit activity events once.
- **Failures**: a 401 pauses sync and marks the connection RECONNECT; rate limits back off until reset. Expiry comes from GitHub's token-expiration header; if GitHub omits it, none is shown.
- **No webhooks**: polling only. Webhooks are deferred.

## Calendar (Phase 4)
`CalendarProvider` has two real adapters. Sync, window and error rules are shared (`src/server/calendar/sync.ts`).

**Google** (`src/server/calendar/google/`): plain `fetch` REST client, no `googleapis`. Scopes: `calendar.calendarlist.readonly` and `calendar.events`. Connect is OAuth authorization code + PKCE; redirect URI `${BETTER_AUTH_URL}/api/connections/google/callback` (owner confirmed the redirect flow works, so no manual-paste fallback exists). Incremental sync uses a `syncToken`; a 410 triggers a full resync. Writes use `sendUpdates=none` and `If-Match`; creates use a deterministic remote id so retries are idempotent.

**iCloud** (`src/server/calendar/caldav/`): `tsdav` against `caldav.icloud.com` with an app-specific password. A ctag check short-circuits unchanged calendars, otherwise a time-range fetch runs. Writes send `If-Match` (update/delete) and `If-None-Match: *` (create); 412 is a conflict. Every calendar/object URL must be https on `*.icloud.com`.

**Cadence and window.** Every 5 minutes (pg-boss) plus Sync now. Window: 30 days back, 12 months ahead. Activity events are emitted only for events added, changed or deleted that start within the next 7 days (D-03).

**Errors.** `auth` -> connection marked RECONNECT and sync paused; `rate_limit` / `unavailable` -> retried next run.

**Rotation (D-05).** Reconnecting Google or re-entering the iCloud password overwrites the encrypted secret without a redeploy.

### Owner setup
- **Google**: create an OAuth client (web) with the redirect URI above. The consent screen must be **In production** or refresh tokens expire after 7 days. The Google Auth Platform **Branding** page requires an app home page URL and a privacy policy URL on the authorised domain `<tailnet>.ts.net` before "Publish app" is allowed.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional; app boots without them) must be set in `.env` and reach **both** the `web` and `worker` containers.
- **iCloud**: generate an app-specific password at appleid.apple.com and enter it in Settings -> Connections. It is never put in `.env`.

## Outreach (Phase 6)
Sydney events and Gmail, shown on `/outreach`. Nothing here posts, registers or sends without an owner approval.

### Event sources
| Source | Status | Notes |
|---|---|---|
| iCal feeds (`ics`) | Real, the main discovery path | Add feed URLs in Settings → Event feeds. URLs are encrypted at rest; only the host is shown. |
| URL import | Real | `Import event` reads schema.org JSON-LD `Event` data from a public page (Eventbrite, Humanitix, Meetup, Luma pages). |
| Eventbrite | MOCK until a private token is added | The token lists only the owner's own organizers (Settings → organizer ids). When the API refuses listing, the source shows its `discover: false` wording instead of failing. |
| Luma API | MOCK until a Luma Plus key is added | Covers only the Luma Plus calendar the key was made on. Use the iCal feed for Sydney discovery. |
| Meetup, Humanitix | MOCK | No public discovery API. Import their pages by URL. |

MOCK events are badged, can be saved to the pipeline, but cannot go on the calendar or create follow-up tasks.

**Luma Sydney feed.** Open luma.com/sydney, choose "Add iCal Subscription", copy the link, and paste it in Settings → Event feeds.

**Fetch safety.** Every outbound event fetch goes through the SSRF guard (public https only, no private or link-local addresses, redirects re-checked) with a 2 MB response cap.

**Cadence.** Events sync every 6 hours (pg-boss) plus Sync now; mail syncs every 5 minutes plus Sync now. Events are kept 60 days ahead; saved events are never pruned.

### Gmail (same Google client as Calendar)
- **Scopes (least privilege):** `https://www.googleapis.com/auth/gmail.readonly` (read the inbox) and `https://www.googleapis.com/auth/gmail.compose` (create drafts and send a reply the owner approved). `gmail.modify` and `gmail.send` are deliberately not requested: LifeOS never deletes, relabels or marks mail, and cannot send without first creating the checkpointed draft.
- **Consent is granular.** Google lets the owner untick Gmail on the consent screen. Granted scopes are stored on the connection (`connections.scopes`); without Gmail the EMAIL tab shows "Gmail access wasn't granted" and Calendar keeps working. Use **Reconnect Google** to grant it later.
- **Unverified app.** An unverified personal OAuth client shows Google's "unverified app" screen once; continue past it (the app is the owner's own). Unverified apps are capped at 100 lifetime users, which does not matter for a single-owner install.
- **Stored vs live.** Only metadata is stored (sender, recipients, subject, date, labels, snippet, triage output). Bodies are fetched live per open, as capped plain text (16 KB); HTML is stripped and no remote images load.
- **Sync.** Quota-safe and resumable: a first sync pulls the last 30 days (capped per run), later runs use the Gmail history id. A 404 on the history id triggers a full resync. Archive and flag in LifeOS are local only; Gmail is never changed.
- **Reconnect.** A 401/invalid grant marks the connection as needing reconnect and pauses mail sync.

## Multiple Gmail accounts (2026-10-16)

Settings → Connections → Email accounts → Add email account connects another Gmail inbox using the existing Google client and callback. Additional inboxes request Gmail read/compose access without calendar access. No new client secret or callback is required. Select the intended Google account and grant Gmail access. If the Google app is in Testing, each added address must be an allowed test user.

Each account has separately encrypted tokens, sync history, failures and message-ID uniqueness. Existing mail is assigned to the original google_calendar connection by migration 0010_multiple_mail_accounts. The worker syncs every connected Google inbox; one failed account does not hide or stop a healthy one. Outreach shows a unified inbox with the receiving mailbox labelled. Body reads, triage, drafts and approved replies use the original account. Mailbox identity is locked through approval; sending refuses a missing or retargeted original message. Disconnecting an additional inbox removes only its local mail/access/history, while keeping other accounts and the shared triage-pause preference. Calendar account removal remains in its Google Calendar connection card.

Deployment: use the existing Compose deployment procedure, including the migrate service, before starting the updated web/worker. Migration 0010 is required. Never run this code against an unmigrated database. After deploy, add the second email account, sync all inboxes, verify mailbox labels, and approve a test reply from each account. Check Instagram Sync now against a real published LifeOS image post.

Provider references: [Meta's maintained insight metric/result definitions](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/instagram-insights-result.js) and [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## Work roster (Phase 13)

Settings → Work roster turns roster emails (default sender `rosters@burps.com.au`) arriving in any connected Gmail inbox into events in a calendar the owner picks. Code: `src/server/roster/parse.ts` (pure parser), `src/server/roster/apply.ts` (reconcile), hooked into `runTriage` in `src/server/mail/triage.ts`.

- **Deterministic, no model.** Matching mail (sender, case-insensitive) is handled before the bulk rule and the model batches, needs no AI key or spend headroom, and is marked triaged with `triage_model = 'rules:roster'`. The HTML body is fetched live and never stored.
- **Parsing.** Week from "dd/mm/yyyy - dd/mm/yyyy" (subject, else body); each day row ("Tue 22-Sep") gets its year from that range, so Dec/Jan weeks work. Columns are matched to the header's branches with `colspan` accounting (a row may use a whole multiple of the header's columns). Times are Sydney wall time; an end at or before the start runs past midnight. A row that doesn't line up, a day outside the week, an unreadable cell, or a table that doesn't list every day of the week is an error: nothing is changed, the email is marked given up and an IMPORTANT notification links to it. Outreach → Triage retries it.
- **Fully automatic, including catch-up.** New roster mail is applied as soon as triage runs after sync (every 5 minutes). Roster emails from the last 14 days that the rule hasn't applied yet (e.g. the model triaged them before the rule was turned on) are picked up by the next triage run, and turning the rule on starts one immediately. Each email is applied once; given-up emails wait for the owner's Triage.
- **Events.** Title `Work · <branch>`, location = branch, description with the break, busy, Sydney zone. Optional branch-name lines map the roster's cut-short headers ("TG Warring = TG Warringah").
- **Updates.** State per week lives in `settings` (`roster.week.<YYYY-MM-DD>`): the shifts as written to the calendar (with event ids) plus the last fully applied email. A newer email for the week updates changed shifts, deletes dropped ones and adds new ones; unchanged shifts are left alone (even if the owner moved or deleted the event). An older or already applied email changes nothing. Only event ids in that state are ever touched. A changed shift whose calendar is no longer the configured one is moved (delete + create); unchanged ones stay put.
- **Retries and concurrency.** Progress is saved after each calendar write; a new shift's id key is saved before the provider call so a retry adopts the event instead of duplicating it. One lease (`settings` key `roster.lock`, taken over after 10 minutes) serialises reconciliation; a run that finds it held re-queues triage in 60 s. Calendar failures follow the triage retry ladder (failed:1 → failed:2) and notify once when they give up.
- **Trust.** The sender address is matched on the `From` header of INBOX mail; it is not cryptographically verified (the real mail is relayed by email-od.com). The blast radius is limited to roster-created events in the chosen calendar, and every applied change is an FYI notification.

## Previous social posts (2026-10-16)

Requires migration 0011_social_post_history. After deploying, choose Socials → Sync now; the existing six-hour worker sync also imports history. Imports cover posts available to the connected Instagram Professional account and public TikTok videos permitted by video.list, back to January 1 in Sydney. No historical follower counts are invented: follower graphs still start with LifeOS snapshots. Instagram may omit insights for older posts or missing permissions; the post is retained and sync shows a fixed availability note. LinkedIn self-serve w_member_social does not permit reading previous personal posts; r_member_social requires restricted approval. No scraping or alternative credential path is used.
