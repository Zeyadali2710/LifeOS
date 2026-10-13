# Phase 7: Socials - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning
**Mode:** --auto (owner asleep). Every decision is the recommended default; see 07-DISCUSSION-LOG.md for alternatives and the research behind the API-reality decisions.

<domain>
## Phase Boundary

Socials stops being an honest-empty page. Four things ship, in one phase built in waves:

1. **Providers (SOC-01):** a `SocialProvider` seam for LinkedIn, Instagram, TikTok and Portfolio. Each provider declares only the capabilities its API really gives a single personal user in 2026 (verified in the log). Until the owner connects an account, each platform runs as a real mock class badged **MOCK**.
2. **Drafts, variants and calendar (SOC-02):** the owner, or the Social agent, writes a post once (from scratch or from a project, event or repo) and gets one variant per platform with length and format checks. Posts move through the design's content pipeline and sit on a week/month content calendar.
3. **Publish = APPROVE (SOC-02):** publishing or scheduling a variant always goes through an approval with edit-before-approve. It is idempotent on retry. Where a platform can't publish through its API, the page offers Copy text, Open the app and Mark as posted instead of pretending.
4. **Analytics (SOC-03):** follower and per-post metrics are synced where the API permits (Instagram, TikTok) and shown on the Socials page. Elsewhere (LinkedIn personal, Portfolio) the page says what isn't available.

Not in this phase: video upload or posting (TikTok, Instagram Reels), carousels, LinkedIn image upload, LinkedIn analytics, X/Twitter, comment or DM inboxes, AI-written insights, media hosting inside LifeOS, and any posting without approval.

</domain>

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

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/outreach/providers.ts`: the provider seam shape (`isMock`, `capabilities`, `ProviderAuthError`, `SourceError`, `getJson` with timeout and fixed error strings). Copy it for `socials/providers.ts`.
- `src/server/outreach/connections.ts`: `saveEventKey`/`removeEventKey`/`eventKeyStatus`/`aud` with constant validation URLs. Copy it for social tokens (LinkedIn and Instagram tokens, TikTok app credentials).
- `src/server/calendar/google/oauth.ts` plus the `/api/connections/google/callback` route: state and PKCE cookie flow, as the template for the TikTok callback.
- `src/server/net/safe-get.ts`: an SSRF-guarded fetch, if image URLs are ever HEAD-checked (optional).
- `src/server/crypto.ts` (`encrypt`/`decrypt`), and `connections` (with `expiresAt`, `login`, `scopes`, `lastSyncAt`, `lastSyncError` already present).
- `src/lib/approval-kinds.ts` (`ApprovalKind`, `SCHEMAS`, `LOCKED`, `checkLocked`, `approvalSummary`) and `src/approvals/mail-approval.tsx` as the template for `SocialApprovalBody`.
- `src/server/agents/gateway.ts` (approval insert, idempotency key, `ctx.adopt`), `policy.ts` (`CONTENT_TOOLS`, `withContentFloor`), `registry.ts` (`off("social", …)` goes live; `limits` override; `routable`).
- `src/server/mail/triage.ts`: inserts `agent_runs` directly with no LLM, the pattern for the synthetic owner publish run.
- `src/server/queue.ts` `QUEUES` plus the `src/worker/index.ts` schedules (pg-boss `startAfter` is already used).
- `src/outreach/pipeline-board.tsx` (board pattern), `src/organization/month-grid.tsx` and `layout.ts` (calendar grid helpers), `src/settings/connection-row.tsx` and `token-form.tsx` (Settings rows).
- `src/server/events.ts` `emitActivity`, `src/server/notifications.ts`.
- `src/server/projects.ts`, the outreach `queries.ts` and the github tables as draft sources.

### Established Patterns
- Capability providers with `isMock` and MOCK badges (ADR-010). The UI renders only the declared capabilities.
- Encrypted single-row connections, where an auth failure means RECONNECT. Errors are fixed strings, never provider output.
- Owner UI writes to LifeOS data go direct and are audit-logged. External side effects always go through APPROVE with edit-before-approve, `LOCKED` fields and zod re-validation.
- Untrusted-content envelope plus the gateway floor (5.1 D-06), and the draft banner (5.1 D-15).
- pg-boss sync every N hours plus Sync now, with the worker owning schedules.

### Integration Points
- `src/app/(os)/socials/page.tsx` (currently a `DomainPage` empty state) is replaced by a `src/socials/` view folder.
- `src/server/db/schema.ts` plus a migration (owner VM migrate).
- `registry.ts`: the Social agent's tools and prompt, and an orchestrator delegation line.
- New queues `socials.sync` and `socials.publish` in `QUEUES`, plus worker schedules and the start-up sweep.
- New route `/api/connections/tiktok/callback`.
- Settings → Connections: LinkedIn, Instagram, TikTok and Portfolio rows.
- The command palette's scopes and commands.

</code_context>

<specifics>
## Specific Ideas

- Copy to keep from the design: "CONTENT PIPELINE", the stage names Ideas / Draft / Review / Scheduled / Published, "Awaiting approval", "Empty. Move a card here or ask the Social Agent.", and the platform colours `LinkedIn #64d2ff`, `Instagram #ff6482`, `TikTok #40c8e0`, `Portfolio #bf5af2`.
- Honest copy: "TikTok doesn't let LifeOS post for you. Copy the caption and post it in the app."; "LinkedIn doesn't share personal-profile analytics with self-serve apps."; "Instagram needs a public image link. LifeOS can't host images (it's private to your tailnet)."; "Publishing opens an approval. Nothing posts automatically."
- The owner is a UNSW CS student who builds in public. Project-based posts (Phase 5 projects, repos) are the expected main source.

</specifics>

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

---

*Phase: 07-socials*
*Context gathered: 2026-10-13*
