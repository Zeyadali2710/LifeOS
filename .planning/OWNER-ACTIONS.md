# Owner actions

Things only the owner can do (VM, deploy, UAT, credentials). Autonomous runs append here and keep going with work that doesn't depend on them. Tick items off when done.

## Phase 5 — post-review fixes (added 2026-10-13, overnight run)

- [ ] **Deploy + apply migration 0006 (`projects.archived_from`)** — from WR-02 fix (unarchive restores the pre-archive status).
  ```bash
  cd ~/lifeos && git pull && lc up -d --build
  lc logs migrate | tail -5        # expect "migrations applied", no error
  bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/project-actions.test.ts tests/db/tasks.test.ts
  ```
  Unblocks: nothing in the overnight run (fixes are tested locally: unit 322, db 268 against Postgres, e2e projects+career 12/12). **Required before the new code runs on the VM** — /projects reads the new column, so the `migrate` service must apply 0006 (it does on `lc up`).
- [ ] **Quick re-check on the VM** (2 min, from 05-VERIFICATION human items): delete a project whose only link is a dependency (CR-01); archive a paused project and unarchive it — it should come back paused (WR-02); delete a blocking task → "became unblocked" activity event (WR-03); new task with a blocker that fails to save keeps the saved blockers listed (WR-05); tasks in an archived project can't be ticked (WR-01).

## Phase 5.1 — project agent writes + repo contents

- [ ] **Add "Contents: Read-only" to the GitHub fine-grained read token** (github.com → Settings → Developer settings → Fine-grained tokens → the LifeOS read token → Repository permissions → Contents: Read-only → Update). If GitHub issues a new token value, paste it in LifeOS Settings → Connections → GitHub (read).
  Unblocks: live `github.list_tree` / `github.get_file` on the VM (without it they return 404 → "not found"). Local tests use fixtures, so the build isn't blocked.
- [ ] **Make sure the Studio repo is synced** (it shows on /career). Needed for the "create a project from my Studio repo" UAT.
- [ ] **Review auto-decisions** in `.planning/phases/05.1-project-agent-writes-repo-contents-inserted/05.1-DISCUSSION-LOG.md` — notably Projects agent run limits (16 tool calls / 150k tokens ≈ ≤US$0.50 per run on Sonnet), draft caps (12 milestones / 40 tasks / 10 links, 16 KB per file), no agent deletes. If your 3.1 private-repo free-model toggle is ON, private README/docs content may go to free models.

### Phase 5.1 — deploy, migrate 0007, VM tests, live UAT

- [ ] **Deploy; migrations 0006 AND 0007 both apply on this deploy** (0007 adds `projects.context`).
  ```bash
  cd ~/lifeos && git pull && lc up -d --build
  lc logs migrate | tail -5        # expect 0007_project_context applied (and 0006 if not yet), no error
  bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/github-tools.test.ts tests/db/project-agent-writes.test.ts tests/db/gateway.test.ts tests/db/loop.test.ts tests/db/routing-loop.test.ts tests/db/approvals.test.ts tests/db/project-tools.test.ts tests/db/project-actions.test.ts
  ```
- [ ] **Live UAT** (browser, tailnet HTTPS origin; needs the Contents: Read-only PAT above and the Studio repo synced):
  1. Confirm Settings -> Connections still shows the GitHub read token connected.
  2. Ask LifeOS: "Create a project based on my Studio repository, fully set up". Trace shows list_tree then get_file calls; exactly one approval card (AI panel + /approvals) listing files (untrusted note), context notes, milestones, tasks and the Studio repo link.
  3. On /approvals: EDIT, remove one task, change the name or a due date, DONE, CREATE PROJECT. Card shows Project created + Open project; agent replies with the /projects/<id> link.
  4. /projects/<id> shows the context card, milestones, tasks (minus the removed one) and repo link; Copy context includes "## Context".
  5. Ask "add a milestone 'Beta' with two tasks to Studio": one UPDATE PROJECT card with NEW tags; approve; project shows them, workspace path unchanged.
  6. Edit the project's context in the dialog, then edit only its name: the context stays.

  Unblocks: phase 5.1 human verification (CAR-02, CAR-03, AGT-01 live). Any failure becomes a gap for `/gsd:plan-phase 5.1 --gaps`. Reply with the 0007 migrate log line and pass/issue per UAT item (never paste tokens).
- [ ] **During the 5.1 UAT, also check the two edit-form review fixes** (05.1-REVIEW-FIX CR-01/CR-02): in an approval card, a task drafted without a milestone stays "No milestone" after you edit anything else; editing a `project_update` card doesn't clear existing tasks' due date / priority / milestone. Note: once a conversation has read repo files, issues, PRs or commit messages, any side-effecting tool now asks for approval even if you set it to auto (intended security floor, 05.1 WR-01/WR-02).

## Phase 6 — Outreach (do after the Phase 6 deploy; nothing here blocks the build — it runs on labelled MOCKs until then)

- [ ] **Google Cloud → Google Auth Platform → Data Access → Add or remove scopes:** add `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.compose` → Save. Don't submit for verification (personal use is exempt).
- [ ] **Google Auth Platform → Audience:** confirm Publishing status is **In production** (Testing = 7-day refresh tokens for Calendar and Gmail).
- [ ] **After deploy: LifeOS Settings → Connections → Google → Reconnect Google.** On "Google hasn't verified this app" → Advanced → "Go to LifeOS (unsafe)" → tick every box incl. Gmail read + compose. If Google blocks restricted scopes, fallback: set Publishing status to Testing with yourself as test user (weekly re-consent).
- [ ] **Luma Sydney feed:** https://luma.com/sydney → "Add iCal Subscription" → copy link → LifeOS Settings → Connections → Event feeds → Add ("Luma Sydney"). Optional: other Luma calendars you follow, a Meetup group's `/events/ical/` link if it loads logged-out.
- [ ] **Eventbrite (optional):** eventbrite.com → Account Settings → Developer Links → API Keys → copy the **Private token** → LifeOS Settings → Connections → Eventbrite (never .env/chat). Add organizer IDs to follow (number in an organizer page URL).
- [ ] **Luma API (optional, only with a Luma Plus calendar you own):** luma.com/calendar/manage/api-keys → generate → Settings → Connections → Luma.
- [ ] **Settings → Outreach:** edit interests (seeded with the design's eight filters).
- [ ] **Review auto-decisions** in `.planning/phases/06-outreach/06-DISCUSSION-LOG.md` and `06-UI-SPEC.md` (37 decisions — e.g. Haiku triage of mail at <= spend cap, mail bodies never stored, NETWORK tab dropped, Eventbrite/Luma APIs can't discover public Sydney events so discovery = Luma iCal + URL import). Also check: scoring weights and project keyword matching, Sydney filter, triage 7-day backfill, Outreach agent on Sonnet, mail-linked task titles redacted for agents, and the D-37 test split (e2e covers UI flows on seeded rows; URL import, Add to calendar against Google and the real Gmail send are covered by DB tests with fakes because the e2e server has no worker/LLM/outbound network).

### Phase 6 — [BLOCKING] deploy, migrate 0008 (`0008_outreach`), VM tests, live UAT

- [ ] **Deploy + apply migration 0008 (`0008_outreach`)**; the worker restart registers the `outreach.events.sync`, `mail.sync` and `mail.triage` schedules.
  ```bash
  cd ~/lifeos && git pull && lc up -d --build
  lc logs migrate | tail -5        # expect 0008_outreach applied, no error
  bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/outreach-sync.test.ts tests/db/outreach-pipeline.test.ts tests/db/outreach-actions.test.ts tests/db/outreach-queries.test.ts tests/db/outreach-tools.test.ts tests/db/google-oauth.test.ts tests/db/mail-sync.test.ts tests/db/mail-triage.test.ts tests/db/mail-agent.test.ts tests/db/mail-actions.test.ts tests/db/mail-queries.test.ts tests/db/routing-loop.test.ts tests/db/gateway.test.ts tests/db/approvals.test.ts
  ```
  Unblocks: everything live in Phase 6 (migration is additive: new tables and nullable columns).
- [ ] **Live UAT** (browser, tailnet HTTPS origin; needs the Reconnect Google and Luma feed items above):
  1. Settings -> Connections -> Google: Gmail shows "Not allowed"; Reconnect Google, continue past the unverified-app screen, allow Gmail; toast "Google reconnected - Gmail allowed"; Calendar still syncs.
  2. Settings -> Event feeds: add Luma's Sydney iCal link; within a minute (or after Sync now on /outreach) real Sydney events appear without MOCK badges, mocks hidden by default, scores and WHY lines make sense against your interests.
  3. Import an Eventbrite or Humanitix event URL from /outreach -> opens in SAVED. Move Interested -> Attend -> Add to calendar (event appears in Organization with the URL in its description) -> Mark attended -> Follow up -> task appears in FOLLOW-UPS and Organization tasks. Activity shows each transition.
  4. EMAIL tab: inbox mail appears within ~5 minutes with summaries/categories; bulk mail is BULK; a HIGH mail produced one IMPORTANT notification; opening a mail shows plain text only.
  5. On a real thread you own (e.g. an email you sent yourself from another address, so the reply goes to an address you control): Draft with agent -> DRAFT REPLY shows To locked to the thread; edit the body; Send reply through the approval card -> exactly one reply arrives in the same Gmail thread. On a second draft, Save to Gmail drafts creates a Gmail draft and marks the approval "Moved to Gmail drafts".
  6. Command Centre shows the outreach triage runs with cost; mail only ran on Sonnet/Haiku (no free model).

  Reply with the `lc logs migrate` 0008 line, the vm-db-test summary line, and pass/issue per item (never paste tokens, feed URLs or mail content). Any failure becomes a gap for `/gsd:plan-phase 6 --gaps`.
- [ ] **Visual passes on the VM** (from plans 15-17): /outreach with real feeds; pipeline board horizontal scroll; event detail at 760-1099px; follow-up dialog (needs an event at ATTENDED); URL import against a real Eventbrite/Luma page; EMAIL category nav at 760-1099px and mobile sheet; real Draft-with-agent round trip (needs Anthropic key + worker); Open in Gmail on a long message.
- [ ] **Eventbrite organizer probe (A1, from 06-07):** after entering the private token and organizer ids, check the source row: either organizer events list, or it shows the "doesn't allow listing / only your own events" message. Report which.
- [ ] **Luma API path check (A2, from 06-07):** verify the list-events path against https://docs.luma.com/reference before relying on a Luma key (constant `LUMA_LIST` in `src/server/outreach/providers.ts`); report whether events list with your key.

## Phase 7 — Socials owner checkpoints (D-03)

These steps wait until all Phase 7 plans, review and local checks are ready. The fixture/mock implementation can be reviewed before provider setup. Keep every token and app secret in **Settings → Connections** only; never paste one into a document, chat, log, command, test fixture or `.env`.

- [ ] **[BLOCKING] Deploy and apply migration `0009_socials` on the homelab VM.** After the reviewed commits are available to the VM, run from the repository checkout:
  ```bash
  cd ~/lifeos
  git pull
  lc up -d --build
  lc logs migrate | tail -20
  ```
  Confirm the migrate service exited successfully and `0009_socials` applied before using `/socials`; web and worker depend on the migrate service. Record the migration result and deployed commit ID here, without credentials. Do not run a separate migration against the production database.
- [ ] **[BLOCKING] Run the VM database contract suite against the separate throwaway test Postgres.** The script starts the `lifeos-test` database and creates/drops only `lifeos_test_*` databases; it must not point at production:
  ```bash
  cd ~/lifeos
  bash scripts/vm-db-test.sh tests/db/migrations.test.ts tests/db/socials.test.ts tests/db/approvals.test.ts
  ```
  Record passed/failed test counts and any failing test names here. Social provider calls in this suite use fakes; no real post or token is used.
- [ ] **[BLOCKING] Run Phase 7 Playwright and owner UAT on the VM after Plan 07-07 lands.** The Playwright config starts its own test app/database with mock providers:
  ```bash
  cd ~/lifeos
  CI=1 npm run e2e -- tests/e2e/socials.spec.ts
  ```
  Prerequisites: use the isolated test Postgres from `scripts/vm-db-test.sh` (default admin `postgres://lifeos:lifeos@localhost:5433/postgres`). Playwright always creates/drops `lifeos_e2e`; never set `TEST_DATABASE_ADMIN_URL` to production. If local dependencies are missing run `npm ci`; if Playwright Chromium/system libraries are missing run the installed CLI `npx playwright install --with-deps chromium`. `CI=1` selects bundled Chromium on Debian instead of installed Chrome. The harness starts no worker and calls no LLM. `tests/e2e/social-executor.ts` invokes the production `publishVariant` function against only `lifeos_e2e`, with network disabled and a future clock; it does not fake a published SQL status. This proves the mock executor and live refresh, while actual queue delivery/restarts remain deployed UAT.

  On the deployed tailnet HTTPS page, create a post from a project, fix a variant format error, edit an approval, schedule then cancel/reschedule, check the calendar and published board, and try TikTok Copy/Open/Mark as posted plus Portfolio Markdown export. Verify MOCK badges and that mock metrics do not appear in real totals. Record pass/issue for each flow, browser layout, and the deployed commit ID here. Any failure is a Phase 7 gap, not acceptance.
- [ ] **LinkedIn app, consent and live smoke.** In linkedin.com/developers, create or select the owner app and associated Company Page; enable "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn". Generate a token for `openid`, `profile`, `w_member_social` and paste it in Settings → Connections → LinkedIn. Confirm the page shows the connected account. With a harmless owner-approved post, inspect LinkedIn's real result on API version `202609`: reserved little-text characters render as written, and an optional URL appears as plain text without assuming a rich preview. Record the result and remote post URL here, never the token. Personal-profile analytics stay unavailable unless a separate approved product and scope exist.
- [ ] **TikTok Sandbox and granted-scope smoke.** In developers.tiktok.com, enable Login Kit and Display API, request `user.info.basic`, `user.info.stats`, `video.list`, add the owner as a Sandbox target user, and register the exact callback `https://<your tailscale serve host>/api/connections/tiktok/callback`. Paste the client key and secret in Settings → Connections → TikTok app, then use Connect and consent in the owner browser. Confirm which scopes were actually granted: account stats require `user.info.stats`, video metrics require `video.list`; missing fields must show unavailable. Check a public video linked by Mark as posted. Record granted scope names and pass/issue only, never tokens or raw responses. Web OAuth uses state and no PKCE.
- [ ] **Instagram Login live capability gate.** Use a Professional owner account and the Instagram API with Instagram Login in the Meta app; complete the owner tester invite and required product/scope setup. In the app dashboard, confirm where the owner token was generated, which `instagram_business_*` scopes were granted, its actual expiry and refresh behavior. Paste only in Settings → Connections → Instagram; it must remain `verification_pending`. Using Meta's owner developer tools outside LifeOS, supply an owner-controlled public HTTPS image URL reachable by Meta, make one image container/publish smoke, and inspect the actual per-image insights response to identify available metric names. Record provenance, granted scope names, expiry/refresh findings, publish result and metric names here without token or raw payload. Only then use the Settings confirmation control; if any part is inconclusive, leave real publish/analytics disabled and use the MOCK path.
- [ ] **Review auto-decisions** in `.planning/phases/07-socials/07-DISCUSSION-LOG.md` (including manual TikTok posting, unavailable LinkedIn personal analytics, Portfolio Markdown export and LifeOS-side scheduling).

### Phase 6 — extra UAT checks from the review-fix pass
- [ ] During the real-reply UAT, also check the double-send guards against real Gmail (06 WR-S02): approve a reply, and if a retry ever shows, confirm only one message is in the thread.
- [ ] "Draft with agent" while the AI panel is already open/busy delivers the prompt (06 CR-U04 — no automated test).
- [ ] Reconnecting Google with a *different* account clears old mail and re-syncs the new inbox (06 CR-S01).
