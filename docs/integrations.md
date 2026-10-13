# Integrations

Status: designed; GitHub shipped in Phase 3 (below).

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
- **LinkedIn**: posting needs an approved app (Share on LinkedIn / Community Management API); analytics restricted.
- **Instagram**: Graph API requires a Business/Creator account linked to a Facebook Page.
- **TikTok**: Content Posting API requires app audit; unaudited apps post privately only.
- **Meetup**: GraphQL API requires a Pro subscription.
- **Apple Calendar**: CalDAV with an app-specific password; no official REST API.

## Least-privilege scopes
Documented per provider when implemented. Default to read-only scopes; write scopes added only for APPROVE-tier features the owner enables.

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
