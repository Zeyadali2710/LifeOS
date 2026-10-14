# Phase 7: Socials — provider API research

**Researched:** 2026-10-15 (Australia/Sydney)
**Domain:** LinkedIn, Instagram and TikTok provider integrations
**Confidence:** MEDIUM — LinkedIn and TikTok are documented by their providers; Meta's developer documentation could not be fetched in this session.

<user_constraints>
## User Constraints (from CONTEXT.md)

<decisions>
## Implementation Decisions

### Owner-given constraints (locked)
- **D-01:** **Credentials are entered only in Settings → Connections.** They are stored AES-256-GCM encrypted in `connections`, like the GitHub token and the Eventbrite/Luma keys (Phase 3 D-09, Phase 6 D-02). Only the last 4 characters are shown, keys can be rotated without a redeploy, and they never appear in `.env`, logs or chat. This includes the one OAuth app credential this phase needs (TikTok client key and secret, D-08). That is a deliberate exception to the Phase 4 Google pattern, where the client id and secret live in env, because the roadmap requires "never .env" for this phase. Validation calls use constant URLs only.
- **D-02:** **Until a platform is connected, its provider is a clearly labelled MOCK.** It is a real class that uses fixture data, has `isMock: true`, and shows a MOCK badge on every card, post and metric it produces (ADR-010, Phase 6 D-09). A mock provider also "publishes" into its fixture store, so the whole approval path can be tested end to end. A mock publish gets a MOCK badge and no external URL. Real and mock data are never mixed in totals: analytics totals count only real providers.
- **D-03:** **Owner-only items are logged, not blocking.** These are VM migrate and deploy, `scripts/vm-db-test.sh`, UAT, creating developer apps, product and scope approvals, tester invites, OAuth consent, and pasting tokens. They go in OWNER-ACTIONS.md at execution time, using the `[BLOCKING]` owner-migrate pattern from earlier phases.

### Provider capability matrix (research-verified, see the log; the planner re-verifies the starred items)

| Provider | Auth | draft | publish | schedule | analytics | Media |
|---|---|---|---|---|---|---|
| LinkedIn | Pasted token (60 days) | yes | **yes**: text, plus an optional link | LifeOS-side | **no** | text and link only |
| Instagram | Pasted token (60 days, auto-refreshed) | yes | **yes**: one image and a caption | LifeOS-side | **yes** | one public https image URL, required |
| TikTok | OAuth (Login Kit) | yes | **no**: manual fallback | no | **yes** | none (video deferred) |
| Portfolio | none | yes | **no**: Markdown export and manual | no | **no** | optional image URL in the Markdown |

- **D-04:** **LinkedIn (`linkedin`).**
  - *Products:* "Sign In with LinkedIn using OpenID Connect" plus "Share on LinkedIn". Both are self-serve, with no review.
  - *Auth:* the owner pastes an access token from LinkedIn's developer-portal **OAuth token generator** with the scopes `openid profile w_member_social`. That way LifeOS needs no client secret and no callback route.
  - *Expiry:* self-serve apps get no refresh tokens. The token lasts 60 days. LifeOS stores `expiresAt` and raises one IMPORTANT notification 7 days before it expires. When it does expire, the connection shows RECONNECT.
  - *Validation:* `GET https://api.linkedin.com/v2/userinfo`. Its `sub` gives the person URN (`urn:li:person:{sub}`), which is stored as `login`.
  - *Publish:* `POST https://api.linkedin.com/rest/posts` with the headers `LinkedIn-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`, author = person URN, visibility PUBLIC, and an optional article link. The new post's id comes from the `x-restli-id` header. The planner pins a current version (*).
  - *Analytics:* `false`. `r_member_social` is closed. The newer `r_member_postAnalytics` (memberCreatorPostAnalytics) is approval-gated for partners (*). The page says: "LinkedIn doesn't share personal-profile analytics with self-serve apps."
- **D-05:** **Instagram (`instagram`), using the Instagram API with Instagram Login.**
  - *Prerequisites:* no Facebook Page is needed. The owner's account must be **Professional** (Creator or Business). A Meta app stays in Development mode with Standard Access, and the owner is added as an Instagram tester. App Review is not needed for an account the developer owns.
  - *Auth:* the owner pastes a token generated in the App Dashboard (Instagram → API setup with Instagram login → Generate token) with the permissions `instagram_business_basic`, `instagram_business_content_publish` and `instagram_business_manage_insights` (*). The token is long-lived (60 days). The sync job refreshes it with `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` once it is more than 24 hours old and more than 7 days have passed since the last refresh. That needs no app secret.
  - *Validation:* `GET https://graph.instagram.com/me?fields=user_id,username`.
  - *Publish:* `POST /{ig-id}/media` with `image_url` and `caption` creates a container, LifeOS polls `status_code` until FINISHED, then calls `POST /{ig-id}/media_publish`. **The image must be at a public https URL**, because Meta fetches it and LifeOS is Tailscale-only. The variant therefore takes an owner-supplied public image URL, and publishing without one is blocked by the format check.
  - *Analytics:* `/me?fields=followers_count,media_count` plus `/{media-id}/insights` (reach, likes, comments, shares, saved, views; the planner checks the current metric names (*)).
- **D-06:** **TikTok (`tiktok`).**
  - *Products:* Login Kit plus the Display API (scopes `user.info.basic`, `user.info.stats`, `video.list`), used in **Sandbox** with the owner's account added as a target user (*).
  - *Publish:* `false` this phase. The Content Posting API needs video, and an unaudited app can only post SELF_ONLY, which means private. A public post needs an audit. The variant offers Copy caption, Open TikTok and Mark as posted (D-15).
  - *Analytics:* `user.info.stats` (follower_count, likes_count, video_count) plus `/v2/video/list/` (view, like, comment and share counts per video, verified (*)). The owner links a published variant to a TikTok video by pasting its URL in Mark as posted, and the sync then matches it by video id.
- **D-07:** **Portfolio (`portfolio`) is a real provider with no API and no MOCK badge.** No portfolio site exists in the codebase, so the smallest honest option wins. The provider's capabilities are `{ draft: true, publish: false, schedule: false, analytics: false }`. Its variant is a Markdown document (title, a front-matter date, body, optional image URL) with **Copy Markdown** and **Download .md** actions, then Mark as posted with the live URL. The page says "Portfolio analytics aren't connected."
- **D-08:** **TikTok is the only OAuth flow.** The owner enters the TikTok client key and secret in Settings → Connections (row `tiktok_app`, encrypted). Connect then runs the authorization code flow with `state` (plus PKCE if TikTok's web flow accepts it (*)) to `${BETTER_AUTH_URL}/api/connections/tiktok/callback`. The access token lasts 24 hours and the refresh token 365 days. Both are stored encrypted in the `tiktok` row and refreshed in the sync job. The callback route copies the Google callback's structure: state cookie, fixed hosts, errors as fixed strings.
- **D-09:** **The seam.** `src/server/socials/providers.ts` defines `SocialProvider { platform; label; isMock; capabilities: { draft, publish, schedule, analytics }; publish?(variant, idemKey); findPublished?(variant); sync?(since) }`, following Phase 6's `providers.ts` (plain `fetch`, `AbortSignal.timeout`, 401/403 → `ProviderAuthError` → connection RECONNECT, provider errors mapped to fixed strings). Connections helpers copy `outreach/connections.ts` (`saveSocialToken`, constant validation URLs, `aud`). The UI renders only the actions a provider's capabilities allow. The `docs/integrations.md` "Known API realities" section is updated with the matrix above.

### Draft and variant model
- **D-10:** **Storage uses three tables.**
  - `social_posts`: id, title, idea/body (base text), `source_kind` (`project`, `outreach_event`, `repo` or null), `source_id`, `stage` (`idea` or `draft`, owner-set), created_by (`owner` or `agent`), `drafted_from_content` bool, timestamps.
  - `social_variants`: id, post_id, platform, text, `image_url`, `link_url`, `status` (`draft`, `pending_approval`, `scheduled`, `publishing`, `published`, `failed`, `posted_manually`), `scheduled_at`, `published_at`, `approval_id`, `remote_id`, `remote_url`, `is_mock`, `metrics` jsonb (latest snapshot), `metrics_at`, `last_error`. There is one variant per platform per post (unique).
  - `social_account_snapshots`: platform, date (Sydney), followers, posts, and an extra jsonb. The key is unique on (platform, date). These snapshots give the growth chart its history.
- **D-11:** **The board column is derived.** The design's content pipeline columns are **Ideas, Draft, Review, Scheduled and Published**:
  - Ideas and Draft come from `social_posts.stage`.
  - Review means any variant is `pending_approval`.
  - Scheduled means any variant is `scheduled` and none is pending.
  - Published means every variant is published or posted manually.

  The board reuses the Phase 6 `pipeline-board.tsx` pattern (a static board, cards move with buttons, no drag).
- **D-12:** **Format checks are one pure function, `checkVariant(platform, variant) → { errors[], warnings[] }`, used by the UI, the agent tool and the approval (zod refine).** Text length counts code points.
  - LinkedIn: at most 3,000 characters (error). More than 5 hashtags gives a warning.
  - Instagram: a caption of at most 2,200 characters, at most 30 hashtags and at most 20 @mentions (errors). `image_url` is required and must be https (error).
  - TikTok: a caption of at most 2,200 characters (*). This is a warning only, because posting is manual.
  - Portfolio: a title is required.

  Errors block requesting a publish. Warnings show inline. The limits are constants in one file.
- **D-13:** **Content sources.** "New post" offers four starting points: Blank, From project (Phase 5 `projects`), From event (Phase 6 `outreach_events`, saved or attended) and From repo (synced `github_repos`).
  - Owner mode builds a starter idea from the source's fields (name, description, link) with no LLM.
  - "Draft with Social agent" runs the agent with the source id, and the agent writes variants for the platforms the owner selected.
  - Content from repos and events is untrusted, so `drafted_from_content` is set and the publish approval shows a "Drafted from project/event/repo content (untrusted)" note (5.1 D-15 pattern).

### Scheduling, publish approval, idempotency
- **D-14:** **Every publish is an approval, and it is the same approval whether the owner or the agent asks.**
  - New APPROVE tool `socials.publish` (sideEffect) takes `{ variantId, platform, text, imageUrl?, linkUrl?, publishAt? }`.
  - The owner's **Publish now / Schedule** button creates a synthetic Social-agent run with no LLM (the `mail.triage` pattern of inserting `agent_runs` directly) and invokes the tool through the gateway. That yields the normal pending approval, and the approval sheet opens straight away.
  - New approval kind `social_publish` in `approval-kinds.ts`:
    - `LOCKED`: variantId, platform.
    - Editable: text, imageUrl, linkUrl, publishAt.
    - The edited payload is re-checked with `checkVariant`.
    - Summary: "Approval waiting: post to LinkedIn · Building LifeOS in public #7", plus "· Sat 10:00" when scheduled.
    - Body component: `SocialApprovalBody`.

  The approval works on the Approvals page, inline in the AI panel and through the APPROVAL notification, and it reuses the 7-day expiry. On a **mock** provider the badge says "MOCK · nothing leaves LifeOS".
- **D-15:** **Providers that can't publish never get a publish button.** TikTok and Portfolio variants (and any provider while its capability is false) show **Copy text** (Copy Markdown for Portfolio), **Open in app** (a constant platform URL, with no post content in the URL) and **Mark as posted** (an owner action, direct and audit-logged, with an optional post URL that is validated as https on the platform's host). No approval is needed, because LifeOS performs no external action. The copy reads "TikTok doesn't let LifeOS post for you. Copy the caption and post it in the app."
- **D-16:** **Scheduling happens on the LifeOS side, because none of the three APIs offers member-level scheduling.**
  - Approving a payload with `publishAt` in the future sets the variant to `scheduled` and enqueues the pg-boss job `socials.publish` with `startAfter = publishAt` and `singletonKey = variant id`.
  - When the job runs, it re-reads the variant. It publishes only if the variant is still `scheduled` with the same approval and the text is unchanged since approval. If not, it does nothing.
  - The owner can **Cancel schedule**, which is a direct action that sets the variant back to `draft`. The approved payload is void after that.
  - The owner can **Reschedule**: a direct, audit-logged change of time only, since the owner was the approver.
  - Any change to text, image or link sends the variant back to `draft`, and it needs a new approval.
  - A schedule time that is in the past at approval means publish now. The worker also sweeps on start for `scheduled` variants whose time has passed, so a VM outage just delays the post.
- **D-17:** **Publish is idempotent (AGT-03).** The idempotency key is `approval:{id}`. The variant moves to `publishing` before the API call, and `remote_id` is written as soon as the API returns.
  - On an ambiguous retry (`ctx.adopt`), or when the job finds `publishing` with no `remote_id`:
    - **Instagram:** keep the container id on the variant, check the container's `status_code`. If it is PUBLISHED, recover the media id from `/me/media` by matching the caption. Otherwise publish that same container, never a new one.
    - **LinkedIn:** member posts can't be listed (`r_member_social` is closed). The variant goes to `failed` with "LinkedIn may have posted this. Check your profile, then Mark as posted or Retry." It is **never re-posted blindly**. Retry here is an explicit owner click.
    - **Mock:** dedupe by approval id in the fixture store.

  A publish emits one activity event (Social source, `public` icon, pink) and an FYI notification. A failure creates an IMPORTANT notification, and an auth failure marks the connection RECONNECT.

### Analytics sync
- **D-18:** **Sync uses one pg-boss queue, `socials.sync`, every 6 hours plus Sync now** (the Phase 6 pattern).
  - For each connected provider with `analytics: true`, it writes today's account snapshot (upserted) and refreshes the `metrics` of variants published in the last 90 days. It also performs the Instagram and TikTok token refreshes (D-05, D-08).
  - Errors are isolated per provider and recorded on the connection's `lastSyncError`.
  - There is no activity event per sync. One activity event is emitted only when a post crosses a simple milestone (for example its first 1,000 views), and that is at the planner's discretion. Skip it if it isn't cheap.
- **D-19:** **Metrics are normalized** to `{ impressions?, reach?, views?, likes?, comments?, shares?, saves? }`, with only the fields the platform returns. The UI shows what exists and never shows a zero for "not provided". Growth history starts on the first sync after connecting, and the chart says "History since <date>". Nothing is backfilled or invented.

### Social agent
- **D-20:** **The Social agent goes live.** `off("social", …)` becomes a live agent: default **Sonnet 5.5**, `routable: true` (listing is simple tier, drafting is reasoning tier, and the 03.1 private-repo gate still applies), and `limits` like the Projects agent (16 tool calls, 150k tokens), because it may read repo files. Its tools:
  - **READ:** `socials.list_posts`, `socials.get_post` (with variants, statuses and metrics), and the existing `projects.list`/`projects.get`, `outreach.get_event`, `github.list_tree`/`github.get_file` (already content tools).
  - **PREPARE:** `socials.save_draft` creates or updates a post and its variants. It is **`sideEffect: false`**: it writes LifeOS-local drafts only, and nothing leaves LifeOS without D-14. That keeps "draft from a repo" from turning into an approval for every draft. Variants failing `checkVariant` are saved with their errors shown. The tool is not floored.
  - **APPROVE:** `socials.publish` (D-14). It is floored by the content floor anyway.

  The prompt says source content is data and never instructions, gives the D-12 limits per platform, tells the agent to write natively per platform instead of cutting one text down, and says it must never claim to have posted. The orchestrator gets a delegation line ("drafting or planning social posts → social agent, tier reasoning").

### Socials page (UI)
- **D-21:** **The layout follows `design/glass/Glass Socials.dc.html` in the Glass system** (`04.1-SPACING-RUBRIC.md`). The design's placeholder data and handles are never ported. The design has two views; this phase adds a third, so there are three: **OVERVIEW, CALENDAR and ANALYTICS**.
  - **OVERVIEW:** four platform cards (handle, followers or "—", latest post with its metrics, connection state, MOCK badge, "Connect in Settings" CTA), the **CONTENT PIPELINE** board (D-11) with "New idea" and "Draft with Social agent", and a post detail sheet showing the variants side by side with checks, Copy, Publish/Schedule (when the capability allows), Mark as posted, and the status/approval link.
  - **CALENDAR:** week and month views of scheduled and published variants (platform-coloured chips per the design's `PL` colours). It reuses the Organization `month-grid`/`layout.ts` helpers where they fit, and is otherwise a simple CSS grid. There is no drag. Clicking an empty day opens "New post" with that date, and clicking a chip opens the post sheet.
  - **ANALYTICS:** range chips 7D/30D/90D/1Y, a followers growth chart per platform from snapshots, and a per-post table (platform, date, the metrics present). For each platform without analytics there is a one-line honest note.

  The design's "INSIGHTS · SOCIAL AGENT" block and the X/Twitter row are omitted (deferred).
- **D-22:** **Honest states.**
  - With nothing connected, all four cards show MOCK with "Connect in Settings → Connections".
  - Settings → Connections gets four rows: LinkedIn token, Instagram token, TikTok app plus Connect, and Portfolio. Portfolio is informational only: "No connection needed: Markdown export".
  - An expired or rejected token shows RECONNECT.
  - Sync errors show `lastSyncError`.
  - Loading uses Skeleton. Mobile follows the Glass Mobile pattern: the board becomes a stacked list per column and the post sheet opens full screen.
  - Empty board copy follows the design: "Empty. Move a card here or ask the Social Agent."
- **D-23:** **Small integrations.** The palette gains a "Posts" scope (search posts by title) and a "New post" command (Phase 2 D-06). Project, event and repo detail pages get a "Draft a post" link, which opens New post with that source (planner's call, if cheap). Home is untouched.

### Testing
- **D-24:** **Testing strategy.**
  - *Unit tests:* `checkVariant` limits (code points, hashtags, mentions, https image), provider request building and response parsing against fixtures (`tests/fixtures/socials/{linkedin,instagram,tiktok}/`), token-expiry logic, the `social_publish` locks, summary and re-check, derived board columns, and Portfolio Markdown export.
  - *Helper:* `tests/helpers/fake-socials.ts` is a fake `fetch` for the three hosts, recording posts and supporting an ambiguous-failure mode.
  - *DB tests* (VM, `scripts/vm-db-test.sh`, run by the owner): publish now and scheduled publish through approval, edit-before-approve, cancel and reschedule, the idempotent adopt for Instagram (reuses the container) and LinkedIn (no repost), the sync snapshot upsert, token refresh, RECONNECT on 401, the mock publish path, the synthetic owner run, and `save_draft` not being floored.
  - *e2e* (Playwright, with the fake LLM and mock providers): New post from a project → variants with a check error fixed → Schedule on Instagram (mock) → approval card → edit text → approve → calendar shows the post scheduled → the job publishes → Published column; TikTok variant → Copy → Mark as posted.
  - No test touches the real LinkedIn, Meta or TikTok APIs.

### Claude's Discretion
- Exact table, column and index names; whether `metrics` stays on the variant or moves to a small history table.
- The LinkedIn API version string, and the exact Instagram and TikTok metric field names after re-verification.
- Whether the content calendar reuses `MonthGrid` directly or a lighter grid.
- Milestone activity events (D-18), and the Draft-a-post links on detail pages (D-23).
- Prompt wording, and how many platforms the agent drafts by default (all connected plus Portfolio).
- Wave split. Suggested:
  1. Schema, `checkVariant`, providers with mocks, and connections.
  2. Drafts and variants as owner CRUD, plus the Social agent with `save_draft`.
  3. `socials.publish`, the approval kind, scheduling, and idempotency.
  4. TikTok OAuth plus the analytics sync.
  5. UI (overview, board, calendar, analytics, Settings rows).
  6. Tests and docs (`docs/integrations.md` Socials section, least-privilege scopes).

</decisions>

<deferred>
## Deferred Ideas

- Video: TikTok Content Posting (Direct Post needs an audit to go public; inbox upload needs video handling) and Instagram Reels and Stories.
- Carousels, multi-image posts, and LinkedIn image and document upload (Images API register + upload).
- LinkedIn personal analytics through `r_member_postAnalytics` / memberCreatorPostAnalytics, once LinkedIn grants it.
- Portfolio analytics (Plausible, Umami or GA API), and publishing straight to a portfolio repo (would need a contents-write GitHub token).
- X/Twitter and other platforms.
- The "INSIGHTS · SOCIAL AGENT" block (LLM or rules-based insights), and best-time-to-post suggestions.
- Comments, mentions and a DM inbox. Replying to comments.
- Scheduled posts shown as an overlay on the Organization calendar.
- LifeOS-hosted media (needs a public host or a signed public bucket, which conflicts with Tailscale-only access).
- Full LinkedIn and TikTok OAuth flows (in place of pasted tokens), if the 60-day manual reconnect becomes annoying.

</deferred>
</user_constraints>

The block above reproduces CONTEXT.md decisions; its factual provider claims retain the context's 2026-10-13 research status. The verification findings below supersede those claims where they differ. [VERIFIED: codebase, 07-CONTEXT.md]

<phase_requirements>

## Phase Requirements

| ID | Description | Research support |
|---|---|---|
| SOC-01 | Honest LinkedIn, Instagram, TikTok and Portfolio provider capabilities | Provider findings and owner actions below |
| SOC-02 | Drafts, variants, calendar and approved publishing | LinkedIn request shape, Instagram image flow and TikTok manual fallback below |
| SOC-03 | Analytics where APIs permit | TikTok exact fields; Instagram metric uncertainty; LinkedIn restricted analytics |

</phase_requirements>

## Summary

**Primary recommendation:** Keep the approved provider split, pin LinkedIn `202609`, use TikTok's documented web authorization flow without PKCE, and treat Instagram metric names and token provenance as a live owner-app verification gate. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/recent-changes] [CITED: https://developers.tiktok.com/docs/en/login-kit-web] [ASSUMED]

The current plans can be refined without adding packages. The material gaps are LinkedIn's article/link payload, Instagram's exact insight metrics, and TikTok app scope grants. No real provider call or owner developer portal inspection was possible in this research session. [VERIFIED: codebase, 07-01-PLAN.md and 07-02-PLAN.md] [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Credentials, OAuth and provider calls | Backend | External providers | Secrets and token refresh stay server-side. [CITED: https://developers.tiktok.com/docs/en/login-kit-web] |
| Drafts, approvals, schedules and snapshots | Backend/database | Worker | Persist and re-check state before external side effects. [VERIFIED: codebase, 07-CONTEXT.md] |
| Cards, calendar and honest missing-metric states | Browser | Backend read model | Render only capabilities and fields actually returned. [VERIFIED: codebase, 07-CONTEXT.md] |

## Standard Stack

Use the repository's existing Next.js 16.4, Drizzle/PostgreSQL, pg-boss, Zod, Vitest and plain `fetch` patterns; both plans call for no new dependency. Package legitimacy audit does not apply because this research recommends no package installation. Versions other than Next.js and Vitest were not re-audited here. [VERIFIED: codebase, package.json; 07-01-PLAN.md; 07-02-PLAN.md]

## Provider findings and plan implications

### LinkedIn — HIGH confidence on Posts API; MEDIUM on text limit

- Pin `Linkedin-Version: 202609` for `/rest/posts`; LinkedIn lists September 2026 as its latest Marketing API release, with sunset on 2027-09-15. Also send `X-Restli-Protocol-Version: 2.0.0`. Version `202510` sunsets today (2026-10-15). Re-check the migration table before deployment because releases are monthly. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/recent-changes] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09]
- `w_member_social` supports member post creation; `r_member_social` is restricted. `r_member_postAnalytics` is listed for the separate Member Post Statistics API and LinkedIn says it is included in Community Management API, so keep personal analytics off unless the owner's app actually has that product and scope. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/recent-changes] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics]
- `POST /rest/posts` needs a person URN, `commentary`, `visibility: "PUBLIC"`, `distribution.feedDistribution: "MAIN_FEED"`, and `lifecycleState: "PUBLISHED"`. A successful create returns `201` and `x-restli-id`. The schema accepts a person URN. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema?view=li-lms-2026-09]
- **Plan implication:** An optional `linkUrl` should be appended to plain commentary for the text-only path, with no promise of a rich preview. A true article post uses `content.article` fields such as source/title/description and LinkedIn says it does not scrape the URL for these; thumbnails need its Images API, which this phase defers. Do not silently construct an incomplete article payload. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09]
- The 3,000-character maximum is explicit in LinkedIn's legacy UGC documentation, while the current Posts schema does not state that numeric maximum. Keep the phase's 3,000-code-point validator as a conservative product rule and test the real app response before claiming it is the current Posts API ceiling. Current `commentary` uses LinkedIn's `little` text format, whose reserved characters require escaping. [CITED: https://learn.microsoft.com/en-us/linkedin/compliance/integrations/shares/ugc-post-api] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema?view=li-lms-2026-09] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format?view=li-lms-2026-09]

### Instagram — MEDIUM on flow; LOW on exact insights

- Meta's official Instagram Postman workspace distinguishes Instagram Login from Facebook Login; avoid borrowing `graph.facebook.com` Page-token examples for this phase. It identifies Business/Creator accounts and lists `instagram_business_basic` and `instagram_business_content_publish` for Instagram Login. Meta's developer pages returned 429/inaccessible in this session, so `instagram_business_manage_insights`, the App Dashboard token-generation path, token lifetime/refresh behavior, and current media insight metric names remain **unverified here**. [CITED: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login] [CITED: https://www.postman.com/meta/instagram/overview] [ASSUMED]
- **Plan implication:** Keep `graph.instagram.com` Instagram Login calls separate from Meta's Facebook Login examples. Require the owner to confirm the generated token's granted scopes and expiry in the Meta App Dashboard before the real connection is marked healthy. The worker should persist the returned expiry rather than assume 60 days when the response provides it. [ASSUMED]
- **Plan implication:** Use one externally reachable HTTPS image URL for the Instagram image container; an image hosted only on the LifeOS tailnet cannot be fetched by Meta. Check container status before `media_publish`, persist the container ID before publishing, and do not create a second container on ambiguous retry. The Meta first-party docs for this exact Instagram Login request could not be fetched, so validate with one owner-controlled media smoke test before enabling the real publish button. [ASSUMED]
- **Plan implication:** Do not hard-code `reach`, `likes`, `comments`, `shares`, `saved`, or `views` as a required set until the owner obtains a real `/insights` response for an image post. Store only returned metrics and show missing fields as unavailable; `impressions` should remain optional. This is the context's D-19 behavior. [VERIFIED: codebase, 07-CONTEXT.md] [ASSUMED]

### TikTok — HIGH confidence

- Sandbox supports target users and Login Kit authorization before app review. TikTok's official sandbox page excludes public Content Posting API and Data Portability, but does not exclude Display API. A first-time app review requires a sandbox demo; production scopes still require TikTok approval. Ask the owner to verify the sandbox has `user.info.basic`, `user.info.stats`, and `video.list` toggled for the app and to add their account as a target user. [CITED: https://developers.tiktok.com/docs/en/add-a-sandbox] [CITED: https://developers.tiktok.com/docs/en/app-review-guidelines] [CITED: https://developers.tiktok.com/docs/en/tiktok-api-scopes]
- TikTok's **web** Login Kit documents `client_key`, `response_type=code`, comma-separated `scope`, exact static HTTPS `redirect_uri`, and unpredictable `state`; the token endpoint describes `code_verifier` as required for mobile and desktop only. Do not add PKCE to the web callback. Verify callback state and granted scopes (partial grants are possible). [CITED: https://developers.tiktok.com/docs/en/login-kit-web] [CITED: https://developers.tiktok.com/docs/en/oauth-user-access-token-management]
- Access tokens last 24 hours; refresh tokens last 365 days. Refresh can return a rotated refresh token, so persist both returned values atomically. [CITED: https://developers.tiktok.com/docs/en/oauth-user-access-token-management]
- `GET /v2/user/info/?fields=...` exposes `follower_count`, `following_count`, `likes_count`, `video_count` under `user.info.stats`; `POST /v2/video/list/?fields=...` requires `video.list`, returns public videos newest first, and the Video Object documents `view_count`, `like_count`, `comment_count`, `share_count`. Do not issue a GET for video list or infer metrics for a private post. [CITED: https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info] [CITED: https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list] [CITED: https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object]

## Architecture Patterns

```text
Owner/agent draft → LifeOS database → approval → scheduled worker or immediate executor
                                            ├─ LinkedIn REST Posts → remote post ID
                                            ├─ Instagram image container → media_publish → media ID
                                            └─ TikTok/Portfolio → manual handoff, no API publish
Owner OAuth/token input → encrypted connection → provider-specific sync → optional metrics snapshot → UI
```

Use the existing provider, connection, approval and queue patterns named in the plans. Keep remote calls behind provider implementations and the approval executor. A queued publish must re-read approved content before sending. [VERIFIED: codebase, 07-01-PLAN.md; 07-CONTEXT.md]

## Don't Hand-Roll

| Problem | Use instead | Why |
|---|---|---|
| OAuth state, secret encryption, approval and job retries | Existing LifeOS security/queue helpers from the plans | These are established security boundaries. [VERIFIED: codebase, 07-01-PLAN.md] |
| LinkedIn rich link preview | Plain commentary with URL | Posts API does not scrape article URLs. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09] |
| TikTok public posting | Manual copy/open/mark-as-posted flow | Public Content Posting is outside the sandbox scope and phase scope. [CITED: https://developers.tiktok.com/docs/en/add-a-sandbox] [VERIFIED: codebase, 07-CONTEXT.md] |

## Common Pitfalls

1. **Link payload interpreted as an article.** Current LinkedIn Posts requires article metadata; a URL alone is a text post. Test the outbound JSON. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09]
2. **LinkedIn reserved characters copied raw.** `little` text reserves punctuation. Escape only for the API payload, retaining original draft text in LifeOS. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format?view=li-lms-2026-09]
3. **Meta Facebook Login examples mixed with Instagram Login.** They use different token types and hosts. Keep endpoint fixtures distinct. [CITED: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api]
4. **An HTTPS image URL is mistaken for a public image.** A tailnet-only URL will fail provider fetch. The owner's live smoke test must confirm reachability. [ASSUMED]
5. **Partial TikTok consent treated as a full connection.** Inspect returned `scope`; if `user.info.stats` or `video.list` is missing, disable those capabilities instead of showing zeroes. [CITED: https://developers.tiktok.com/docs/en/login-kit-web]
6. **Ambiguous Instagram publish retried automatically.** Container success does not by itself prove a local media ID was recorded. Reconcile first; if inconclusive, require owner review to avoid duplicate posts. [ASSUMED]

## Code Examples

```ts
// Source: https://developers.tiktok.com/docs/en/login-kit-web
// Web authorization: client_key, response_type=code, scope, redirect_uri, state.
// Verify returned state and scopes before exchanging the code server-side.
```

```json
{
  "author": "urn:li:person:MEMBER_ID",
  "commentary": "Post text with an optional URL",
  "visibility": "PUBLIC",
  "distribution": { "feedDistribution": "MAIN_FEED" },
  "lifecycleState": "PUBLISHED"
}
```

LinkedIn JSON is adapted from its Posts API example; the author URN is documented by its Post Schema. The actual commentary must be escaped for `little` text. [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema?view=li-lms-2026-09]

## Environment Availability

Provider developer apps, grants, tokens, a publicly reachable image, and the owner VM were not accessible in this research session. The local Node project already has its runtime and tests; no additional package is recommended. Real provider setup is an owner action in D-03, while fixtures let local implementation proceed after plan approval. [VERIFIED: codebase, package.json; 07-CONTEXT.md]

## Validation Architecture

| Property | Value |
|---|---|
| Framework | Vitest 5 and Playwright from existing project scripts/config [VERIFIED: codebase, package.json; 07-02-PLAN.md] |
| Quick run | `npm run typecheck` and focused `npx vitest run tests/unit/social-types.test.ts` once created [VERIFIED: codebase, package.json; 07-01-PLAN.md] |
| Full run | `npm run lint && npm test && npm run build`; VM DB/e2e and live API smoke are owner actions [VERIFIED: codebase, package.json; 07-CONTEXT.md] |

| Requirement | Minimum test evidence |
|---|---|
| SOC-01 | Provider mock and capability tests; TikTok partial-scope test; live owner-account smoke for each real provider. [VERIFIED: codebase, 07-01-PLAN.md] |
| SOC-02 | Approval/schedule/idempotency tests; LinkedIn payload fixture; Instagram ambiguous retry; existing planned e2e mock flow. [VERIFIED: codebase, 07-01-PLAN.md; 07-02-PLAN.md] |
| SOC-03 | Normalize only returned fields; missing metric remains absent. [VERIFIED: codebase, 07-CONTEXT.md] |

## Security Domain

| ASVS category | Applies | Required control |
|---|---|---|
| V2 Authentication / V3 Session | Yes | Existing owner session and OAuth state validation. [VERIFIED: codebase, AGENT_HANDOFF.md; 07-01-PLAN.md] |
| V4 Access Control | Yes | Existing owner actions and gateway approval before external publish. [VERIFIED: codebase, 07-CONTEXT.md] |
| V5 Input Validation | Yes | Zod and `checkVariant` at server boundary; fixed provider hosts; validated external URLs. [VERIFIED: codebase, 07-CONTEXT.md] |
| V6 Cryptography | Yes | Existing AES-256-GCM connection encryption; no custom cipher. [VERIFIED: codebase, 07-CONTEXT.md] |

## Project Constraints (from AGENTS.md)

- Read the relevant `node_modules/next/dist/docs/` guide before writing application code because this Next.js version differs from training data. [VERIFIED: codebase, AGENTS.md]
- Read `AGENT_HANDOFF.md` and the approved GSD plan before implementation; follow task ownership, security, verification, escalation and completion gates; do not independently advance phases. [VERIFIED: codebase, AGENTS.md]
- Preserve other agents' uncommitted work; no plan execution while GSD says `ready_to_plan` without owner approval. [VERIFIED: codebase, AGENT_HANDOFF.md]

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | Meta dashboard token is long-lived and refreshable without an app secret. | Broken connection or required architecture/credential change. |
| A2 | Instagram Login image container and listed insight metrics behave as D-05 expects. | Publish or analytics implementation must change after live smoke. |
| A3 | Public HTTPS image is sufficient for Meta to fetch it. | Publish failure due to redirect, content type or image restrictions. |
| A4 | A LinkedIn URL appended to commentary renders acceptably without an article object. | User-visible link preview may differ; publish still creates a text post. |
| A5 | Instagram ambiguous publish can be reconciled safely from returned media data. | Duplicate or uncertain publish requires owner review. |

## Open Questions / owner actions

1. **Meta app:** In the owner's Instagram API with Instagram Login setup, confirm Generate Token, actual expiry, granted `instagram_business_*` scopes and a live image publish. Capture the returned media insight names for an image. Record this as a D-03 owner action; fixture implementation can proceed, while real provider behavior remains unverified until the smoke test. [ASSUMED]
2. **TikTok app:** Add Login Kit and Display API in Sandbox, add the owner as target user, request `user.info.basic,user.info.stats,video.list`, and inspect which scopes are actually granted. Production access may require review. [CITED: https://developers.tiktok.com/docs/en/add-a-sandbox] [CITED: https://developers.tiktok.com/docs/en/app-review-guidelines]
3. **LinkedIn app:** Confirm the owner app has Share on LinkedIn and OIDC products, token generator scopes, and member creation on `202609`; test escaping and optional plain URL. Do not infer `r_member_postAnalytics` from `w_member_social`. [CITED: https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/share-on-linkedin] [CITED: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2] [CITED: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics]

## Sources and confidence

- **HIGH:** LinkedIn [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09), [Post Schema](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema?view=li-lms-2026-09), [version migration table](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations), [recent changes](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/recent-changes); TikTok [web Login Kit](https://developers.tiktok.com/docs/en/login-kit-web), [token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management), [sandbox](https://developers.tiktok.com/docs/en/add-a-sandbox), [video list](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list) and [Video Object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object). [CITED: provider documentation]
- **MEDIUM:** Meta's [official Instagram Postman workspace](https://www.postman.com/meta/instagram/overview) and [Instagram Login collection](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login). It provides provider-origin corroboration, but not enough detail to lock this phase's exact insight metrics or token lifetime. [CITED: provider-owned Postman workspace]
- **LOW:** Instagram flow and insight specifics tagged `[ASSUMED]` above; Meta developer documentation was inaccessible (429 or unavailable) during this session. [ASSUMED]

**Research valid until:** 2026-10-22 for provider version/scope details; recheck at real-app smoke. [ASSUMED]
