# Integrations

Status: designed; first provider (GitHub) lands in Phase 3.

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
