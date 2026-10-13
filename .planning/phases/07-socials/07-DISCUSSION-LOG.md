# Phase 7: Socials - Discussion Log

> Audit trail only. Decisions live in 07-CONTEXT.md.

**Date:** 2026-10-13
**Mode:** --auto (owner asleep, overnight run 2026-10-13). Every choice below is the recommended default; review and override in CONTEXT.md.

[--auto] Selected all gray areas: Provider capability matrix & honesty, Auth per provider, Draft/variant model & platform rules, Content sources, Content calendar, Scheduling, Publish approval & idempotency, Analytics sync & storage, Social agent, Media scope, Page layout, Testing, Phase split.

**Locked by the owner before discussion:**
- Credentials go only in Settings → Connections, encrypted like the GitHub token and the Eventbrite key, and never in .env or chat.
- Each platform runs as a clearly labelled MOCK provider until the owner has approved developer apps.
- Owner-only steps (VM migrate/deploy, vm-db-test, UAT, developer app creation and approval, OAuth consent) are logged and do not block.
- Reuse Phases 3–6.

| Area | Question | Auto-selected (recommended) | Alternatives considered |
|---|---|---|---|
| Capabilities | LinkedIn | Publish text and an optional link through the self-serve Share on LinkedIn (`w_member_social`), scheduled on the LifeOS side, analytics false (D-04) | Request Community Management API (meant for organisations, review needed); image upload now |
| Capabilities | Instagram | Instagram Login (no FB Page), Professional account, one image and a caption, insights through Standard Access for the owner's own account (D-05) | Facebook Login + Page-linked Graph API (more setup); MOCK only |
| Capabilities | TikTok | Analytics only (Display API); publishing is a manual fallback because unaudited apps post SELF_ONLY and video handling is out of scope (D-06) | Direct Post as private (SELF_ONLY) drafts; upload to inbox (needs video handling) |
| Capabilities | Portfolio | Real provider with no API: Markdown copy/download plus Mark as posted, no analytics (D-07) | A GitHub-repo commit target (needs a contents-write token); a webhook to the site |
| Auth | Where do OAuth client credentials live? | Settings → Connections, encrypted (roadmap SC1 "never .env" beats the Phase 4 Google env pattern); only TikTok needs them (D-01/D-08) | env vars like `GOOGLE_CLIENT_ID` (rejected: violates the locked constraint) |
| Auth | LinkedIn token | Paste a token from the developer-portal token generator (60 days, no refresh for self-serve), plus a reminder 7 days before expiry (D-04) | Full OAuth code flow with a callback (still a 60-day reconnect, so more code for no gain) |
| Auth | Instagram token | Paste a dashboard-generated long-lived token, auto-refreshed with `ig_refresh_token` (no secret needed) (D-05) | OAuth via Business Login for Instagram with the app secret in Settings |
| Auth | TikTok | OAuth Login Kit with client key/secret in Settings; refresh token 365 days (D-08) | Skip TikTok (MOCK forever) |
| Model | Draft storage | `social_posts` + `social_variants` (one per platform) + `social_account_snapshots` (D-10) | A single posts table with a variants jsonb; a full metrics history table |
| Model | Pipeline stages | The design's Ideas / Draft / Review / Scheduled / Published, with Review/Scheduled/Published derived from variants (D-11) | A free stage column on the post (can lie about approval state) |
| Rules | Format checks | One pure `checkVariant`: LinkedIn 3,000; IG 2,200 / 30 hashtags / 20 mentions / https image required; TikTok 2,200 (warning); Portfolio title (D-12) | Soft warnings only; per-platform validators scattered in the UI |
| Sources | Draft from | Blank, project, event or repo; owner mode is templated, agent mode is "Draft with Social agent" (D-13) | Agent only; free-text paste only |
| Calendar | Where | A CALENDAR view on the Socials page (week/month), reusing Organization grid helpers, no drag (D-21) | Overlay posts on the Organization calendar (deferred); drag-to-reschedule |
| Scheduling | Platform or LifeOS | LifeOS pg-boss `socials.publish` with `startAfter`, re-checked at run time, plus a sweep on start (D-16) | Platform-native scheduling (not offered to members by any of the three APIs) |
| Scheduling | Reschedule after approval | The owner can change the time directly (audited); a text/image/link change needs re-approval (D-16) | Every change needs re-approval |
| Approval | Owner-initiated publish | A synthetic Social-agent run (triage pattern) calls `socials.publish` through the gateway, so it is the same approval as the agent's (D-14) | An owner Publish that posts directly (violates "publish = APPROVE"); a separate owner-approval table |
| Approval | Locks | variantId and platform locked; text, image, link and time editable, re-checked (D-14) | Everything editable |
| Approval | Can't-publish providers | No publish button; Copy, Open in app, Mark as posted (owner, audited) (D-15) | A publish button that opens the app (looks like it posts) |
| Idempotency | Retry | Key `approval:{id}`; IG reuses the container and checks its status; LinkedIn never reposts blindly, it goes to "check your profile"; mock dedupes by approval (D-17) | Blind retry (could double-post on LinkedIn) |
| Analytics | Cadence and storage | `socials.sync` every 6 h plus Sync now; daily account snapshots; latest metrics on the variant; 90-day window (D-18/19) | Hourly; full metrics history per sync |
| Analytics | Missing data | Show only the fields returned; honest notes for LinkedIn and Portfolio; "History since <date>" (D-19/21) | Zeros or estimates (rejected: no fake data) |
| Agent | Model and tools | Sonnet 5.5, routable, Projects-agent limits; READ posts/projects/events/repo files; PREPARE `save_draft` (sideEffect false); APPROVE `publish` (D-20) | Opus; `save_draft` as a side effect (every repo-sourced draft would become an approval) |
| Media | Scope | Text plus an optional link; one public https image URL (required for Instagram); no uploads, no video (D-05/D-12) | Upload images to LifeOS (Meta can't fetch from a tailnet); video now |
| UI | Views | OVERVIEW (platform cards + pipeline + post sheet), CALENDAR, ANALYTICS; drop INSIGHTS and X/Twitter (D-21) | Port the design's insights with templated rules; keep an X row as a stub |
| Mock labelling | Rules | MOCK badge everywhere; mocks publish into fixtures ("nothing leaves LifeOS"); totals count only real providers (D-02) | Hide mocks entirely |
| Testing | Strategy | Fixtures + `fake-socials.ts`; unit + VM DB + Playwright e2e on mock providers; no live APIs (D-24) | Live sandbox accounts in CI |
| Phase split | One phase or sub-phases | One phase in about 6 waves (D-24 discretion) | 7a drafts/calendar, 7b publish/analytics |

## Claude's Discretion
Table and column names, the LinkedIn version string, Instagram and TikTok metric names after re-verification, MonthGrid reuse versus a light grid, milestone activity events, Draft-a-post links on detail pages, prompt wording, and the wave split.

## Deferred Ideas
Video (TikTok posting, Reels, Stories), carousels and LinkedIn media upload, LinkedIn personal analytics (`r_member_postAnalytics`), Portfolio analytics and repo publishing, X/Twitter, agent insights and best-time suggestions, a comments/DM inbox, an Organization calendar overlay, LifeOS-hosted media, and full LinkedIn and Instagram OAuth flows.

## Research notes

Verified 2026-10-13 (web). The planner should re-verify the starred items before building.

- **LinkedIn Share on LinkedIn:** the self-serve product grants `w_member_social` once it is added under the app's Products tab. Member rate limit: 150 requests per day. The legacy `/v2/ugcPosts` supports text, article (URL) and image/video through `assets?action=registerUpload`, and current docs point to `/rest/posts` with the `LinkedIn-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0` headers. There is no member scheduling field. (*) Pin a current version and check the 3,000-character commentary limit.
  - https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
  - https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
  - https://timetopost.co/blog/how-to-post-to-linkedin-api/
- **LinkedIn tokens:** self-serve apps get 60-day access tokens and no refresh tokens (programmatic refresh is for approved partners). The developer portal has an OAuth token generator. Person id: `sub` from `/v2/userinfo` (OpenID Connect product).
  - https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
  - https://opentweet.io/answers/linkedin-api-token-expires-60-days
- **LinkedIn analytics:** `r_member_social` is a closed permission ("not accepting access requests"). `memberCreatorPostAnalytics` (July 2025) uses `r_member_postAnalytics`, which third parties report as approval-gated. (*) Recheck in the developer portal: if the owner's app can add it self-serve, D-04 analytics flips to true.
  - https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api
  - https://github.com/gitroomhq/postiz-app/issues/1680
  - https://docs.zernio.com/analytics/get-linkedin-post-analytics
- **Instagram API with Instagram Login:** needs no Facebook Page, only a Professional (Business/Creator) account. Host `graph.instagram.com`. Scopes `instagram_business_basic`, `instagram_business_content_publish` and `instagram_business_manage_insights` (the old `business_*` names were removed 2025-01-27). Publishing is `/{ig-id}/media` then `/{ig-id}/media_publish`, and the media must be on a publicly accessible server. Standard Access covers accounts the developer owns or manages that have been added to the app, so App Review is not needed. Long-lived tokens last 60 days and refresh via `refresh_access_token?grant_type=ig_refresh_token` once the token is at least 24 hours old. (*) Confirm the App Dashboard "Generate token" button for Instagram Login and the current media insight metric names.
  - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
  - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
  - https://developers.facebook.com/docs/instagram-platform/content-publishing
  - https://developers.facebook.com/docs/instagram-platform/insights
  - https://bundle.social/blog/instagram-graph-api
- **TikTok Content Posting:** Direct Post needs `video.publish` and Direct Post enabled, and content from unaudited clients is restricted to private viewing (SELF_ONLY). Public posting needs an audit. PULL_FROM_URL needs a verified domain, and FILE_UPLOAD sends chunks. Photo posts go through `/v2/post/publish/content/init/` from verified-domain URLs. MEDIA_UPLOAD (inbox) lets the user finish the post in the app. Third-party reports add caps for unaudited apps (5 users per 24 h, private accounts).
  - https://developers.tiktok.com/doc/content-posting-api-get-started
  - https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
  - https://developers.tiktok.com/doc/content-posting-api-reference-photo-post
  - https://docs.postiz.com/providers/tiktok.md
- **TikTok Display API:** `user.info.stats` gives follower_count, following_count, likes_count and video_count. `video.list` gives the user's public videos (v1 fields like view_count, like_count, comment_count and share_count; (*) confirm on `/v2/video/list/`). Access tokens last 24 hours, so a refresh is needed. Scopes can be granted partially. (*) Confirm Sandbox supports Display API scopes for a target user, and whether web Login Kit takes PKCE.
  - https://developers.tiktok.com/doc/display-api-get-started/
  - https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info
  - https://developers.tiktok.com/bulletin/user-info-scope-migration
  - https://www.getphyllo.com/post/tiktok-api-scopes
- **Portfolio:** no portfolio site, repo or webhook exists in the codebase (`grep -ri portfolio src docs` only finds the provider list in `docs/integrations.md`). Markdown export is the smallest honest provider.
