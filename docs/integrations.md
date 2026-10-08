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
- **Issues-write token** (only `github.create_issue`). Repository permission: Issues: read and write, on the chosen repositories only. Without it CREATE ISSUE is disabled in the Approval Centre.
- **Sync**: every 15 minutes (pg-boss schedule) plus Sync now. ETags make unchanged resources return 304. Stored: repos, pull requests (with reviews and requested reviewers), issues, recent commits and workflow runs. New or changed items emit activity events once.
- **Failures**: a 401 pauses sync and marks the connection RECONNECT; rate limits back off until reset. Expiry comes from GitHub's token-expiration header; if GitHub omits it, none is shown.
- **No webhooks**: polling only. Webhooks are deferred.
