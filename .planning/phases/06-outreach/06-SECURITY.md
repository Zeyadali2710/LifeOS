---
phase: 06
slug: outreach
status: verified
threats_total: 92
threats_closed: 92
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-10-13
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against the code on `main` (HEAD 775de70). This includes the 06-REVIEW-FIX server fixes (CR-S01, WR-S01..WR-S08, IN-S01, IN-S03, IN-S08) and UI fixes (CR-U01..CR-U04, WR-U01..WR-U10).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| migration -> database | 0008 runs on the local test DB now and on the owner VM later | schema change |
| owner-supplied URL -> outbound request | Feed and import URLs are fetched by the server and worker | SSRF surface, URLs that may carry tokens |
| third-party ICS / HTML / mail -> text | Untrusted markup is parsed and turned into plain text | untrusted text |
| agent/owner text -> MIME headers | Subject, body and names become RFC 2822 headers | header injection |
| owner interests / event text -> regex | Interest strings are matched against untrusted text | ReDoS |
| Google token endpoint -> callback | The granted scope list arrives from Google | consent state |
| server / worker -> Gmail, Eventbrite, Luma | Calls with stored refresh tokens and API keys | credentials, private mail |
| browser -> server actions | The owner session sends ids, stages, URLs, keys and interests | untrusted until validated |
| inbound mail / event text -> LLM context | Third-party content enters agent and triage runs | prompt injection, private data |
| agent run tree -> model router | Private mail could be routed to a free third-party model | private data |
| model -> mail.send_reply input | Injected text may try to redirect or exfiltrate mail | recipients, thread |
| owner edit -> approval decide | An edited payload crosses to the server | re-validated |
| worker -> Gmail send | Outbound mail on the owner's behalf | integrity, idempotency |
| server DTO / third-party text -> React UI | Connection state, event and mail text are rendered | XSS, secret exposure |
| route param / palette query -> DB | Event id from the URL, free-text search | SQL wildcard / id abuse |
| test seeds / docs / SUMMARY / UAT notes -> repo | Planning artifacts and seeds are committed | possible secrets |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Information disclosure | mail_messages | mitigate | `mail_messages` in drizzle/0008_outreach.sql:16-45 has no body column, only metadata, snippet and triage fields. `grep body` hits nothing in the SQL | closed |
| T-06-02 | Information disclosure | event_sources feed URLs | mitigate | Only `url_ciphertext` + `host` (0008_outreach.sql:5-6). `addFeed` stores `encrypt(url)` and `host` only (src/server/outreach/sources.ts:33) | closed |
| T-06-03 | Tampering | stage values | mitigate | `outreach_events_stage_chk` (0008_outreach.sql:78). The migration test inserts 'BOGUS' and expects a failure (tests/db/migrations.test.ts:59-74) | closed |
| T-06-04 | Tampering | migration 0008 on live data | accept | See AR-06-01 | closed |
| T-06-05 | Information disclosure / EoP (SSRF) | safeGet | mitigate | `guardedLookup` vets every resolved address against the `BlockList` at connect time (src/server/net/safe-get.ts:96-106). Literal-IP check (safe-get.ts:94-95). `isSafeUrl` on every hop, at most 3 redirects (safe-get.ts:74-88). IN-S01 also denies NAT64, 6to4, 192.0.0.0/24 and 198.18.0.0/15 (safe-get.ts:35-51). Unit tests in tests/unit/safe-get.test.ts:38 | closed |
| T-06-06 | Denial of service | safeGet | mitigate | Default `maxBytes` 2_000_000 and a 15 s total deadline shared across hops (safe-get.ts:71-72, 126-138) | closed |
| T-06-07 | Information disclosure | feed URLs with tokens | mitigate | `SafeGetError` uses the fixed `MSG` table only (safe-get.ts:7-25). The provider maps errors to fixed strings (src/server/outreach/providers.ts:49-53). Logs are `{ err }` / `{ err, kind }` only | closed |
| T-06-08 | Tampering (XSS / tracking) | htmlToText / bodyText | mitigate | `htmlToText` drops script/style/head, strips all tags (so images are dropped) and turns links into "label (url)" text (src/server/text.ts:31-47). `bodyText` prefers text/plain (src/server/mail/text.ts:24-29) | closed |
| T-06-09 | Tampering (header injection) | buildReplyMime | mitigate | `clean()` strips CR/LF from every header value: addresses, names, subject, In-Reply-To, References, approval id (src/server/mail/mime.ts:4, 12-13, 20, 37-43). Unit test with an injected Bcc (tests/unit/mail-mime.test.ts:25-27) | closed |
| T-06-10 | Denial of service | mail body size | mitigate | `MAIL_BODY_CAP = 16_384` via `capUtf8`, cut on a code-point boundary (mail/text.ts:3, 28; text.ts:2-8). Unit tests in tests/unit/mail-text.test.ts:7-12, 52 | closed |
| T-06-11 | Denial of service (RRULE bomb) | parseFeed | mitigate | `MAX_OCCURRENCES = 2000` (src/server/calendar/expand.ts:7, 167, 183). 60-day window and 500 per feed (src/server/outreach/ics.ts:28-29, 55-56). Test with 600 events (tests/unit/outreach-ics.test.ts:31-33) | closed |
| T-06-12 | Tampering (stored XSS) | descriptions | mitigate | `capUtf8(htmlToText(desc), 4000)` before storage (ics.ts:81; src/server/outreach/jsonld.ts:90). The UI renders text nodes only, with no `dangerouslySetInnerHTML` anywhere in src/ (see T-06-73) | closed |
| T-06-13 | Tampering | JSON-LD url field | mitigate | `url: isSafeUrl(e.url) ? e.url : pageUrl` (jsonld.ts:89). The ICS URL is also gated (ics.ts:62) | closed |
| T-06-14 | Denial of service | malformed JSON-LD / ICS | mitigate | Per-block try/catch (jsonld.ts:54-56). Per-VEVENT try/catch, with a fixed `FeedError` for a bad root (ics.ts:10-14, 31-36, 44-52). Strings are capped (ics.ts:68, 82; jsonld.ts:37, 78-91). WR-S06 skips events with invalid dates (src/server/outreach/sync.ts:39-43) | closed |
| T-06-15 | Denial of service (ReDoS) | scoreEvent interest regex | mitigate | `esc()` regex-escapes the term, which then becomes a literal pattern with letter/digit lookarounds (src/server/outreach/score.ts:22-24). Interests are limited to ≤40 chars and ≤20 items (src/server/outreach-actions.ts:68; sources.ts:126-128). "C++" test (tests/unit/outreach-score.test.ts:20-22). See N-5 | closed |
| T-06-16 | Tampering | why line | mitigate | `why` is built only from matched owner interest terms, the schedule note and project names (score.ts:80-86). No event text is copied | closed |
| T-06-17 | Elevation (over-broad scope) | GOOGLE_SCOPES | mitigate | `GOOGLE_SCOPES = [...CALENDAR_SCOPES, GMAIL_READ, GMAIL_COMPOSE]` (src/server/calendar/google/client.ts:9-12). A repo grep finds no `gmail.modify` or `gmail.send` | closed |
| T-06-18 | DoS (Calendar paused by Gmail) | createGoogle error map | mitigate | A 403 `insufficientPermissions` maps to `"scope"` on `GMAIL_BASE` and to `"auth"` otherwise (client.ts:109) | closed |
| T-06-19 | Spoofing / SSRF | Gmail client | mitigate | Fixed `GMAIL_BASE`. `BASES` allow-list (client.ts:13, 17, 86). `checkPath(path)` (client.ts:88). The Gmail client only passes `base: GMAIL_BASE`, with ids `encodeURIComponent`-ed (src/server/mail/client.ts:57-59) | closed |
| T-06-20 | Information disclosure | tokens | mitigate | The token comes from the encrypted connections row (`googleTokenSource`). Errors use the fixed `MSG` table, never provider bodies (client.ts:19-29) | closed |
| T-06-21 | Repudiation | consent state | mitigate | Scopes are parsed from the token response (client.ts:73) and saved through `saveCalendarSecret`, whose upsert sets `scopes` on every reconnect (src/server/calendar/google/oauth.ts:67; src/server/calendar/connections.ts:31-32). CR-S01 also resets mail state when the account changes (oauth.ts:66) | closed |
| T-06-22 | Elevation | pipeline actions | mitigate | `await requireOwner()` is the first statement in all 5 exported actions (src/server/outreach-pipeline-actions.ts:29, 39, 46, 53, 62) | closed |
| T-06-23 | Tampering | stage changes | mitigate | Conditional UPDATE on the expected `from` and on `dismissedAt is null` (src/server/outreach/pipeline.ts:28-34). `canMove` requires an index difference of exactly 1 (src/lib/outreach-types.ts:21-23). `to === "FOLLOW_UP"` is refused outside `createFollowUps`, which requires ATTENDED under FOR UPDATE (pipeline.ts:28, 145-155) | closed |
| T-06-24 | Tampering (mock -> real calendar/tasks) | addToCalendar / createFollowUps | mitigate | `if (r.isMock) return { error: "mock" }` in both (pipeline.ts:76, 147) | closed |
| T-06-25 | Information disclosure | audit / log | mitigate | Audit metadata contains only ids, stages, counts and calendarEventId (pipeline.ts:35, 55, 125, 159). Logs are `{ err }` only (outreach-pipeline-actions.ts:23; pipeline.ts:17, 121). DB test asserts no title in the metadata (tests/db/outreach-pipeline*.test.ts:68-78) | closed |
| T-06-26 | Repudiation | owner writes | mitigate | Each transition writes an audit row plus `stageAct` → `emitActivity` (pipeline.ts:23, 35-36, 159-160). Dismiss/restore and calendar link are audited (pipeline.ts:55, 125) | closed |
| T-06-27 | Tampering (duplicate calendar event) | addToCalendar | mitigate | Validation runs under FOR UPDATE in a transaction (pipeline.ts:72-82). The provider call happens outside the transaction (pipeline.ts:100-107). Conditional link `where calendarEventId is null` (pipeline.ts:110-115). The losing write deletes its own remote event (pipeline.ts:116-123) | closed |
| T-06-28 | Info disclosure (SSRF) | icsProvider | mitigate | `icsProvider` fetches only through `safeGet` (providers.ts:37-47). No raw `fetch(url)` in src/server/outreach, src/server/mail or the action files. The only `fetch` calls go to fixed hosts (providers.ts:61-65; src/server/outreach/connections.ts:40) | closed |
| T-06-29 | Information disclosure | keys / feed URLs | mitigate | Decryption happens in memory only (providers.ts:213; outreach/connections.ts:10-13). Logs carry `{ err: e, kind }` (sync.ts:185). `lastSyncError` uses fixed strings (sync.ts:179-186) | closed |
| T-06-30 | Tampering | owner pipeline state | mitigate | Sync `fields` and the update set contain no `stage`, `dismissedAt` or `calendarEventId` (sync.ts:48-66, 90-100). Inserts use the defaults | closed |
| T-06-31 | Spoofing (mock passed off as real) | mock providers | mitigate | Mock providers set `isMock: true` (providers.ts:205). The merge uses `isMock: match.isMock && isMock`, and a mock never overwrites real fields (sync.ts:90-96). MOCK badges in the UI (see T-06-75) | closed |
| T-06-32 | Denial of service | many sources / big feeds | mitigate | Per-source try/catch isolation (sync.ts:151-187). 500 per feed (ics.ts:29; providers.ts:35). `boss.schedule(eventsSync, "0 */6 * * *", singletonKey)` (src/worker/index.ts:50) | closed |
| T-06-33 | Spoofing (keyed API host) | Eventbrite/Luma | mitigate | `EVENTBRITE_HOST` / `LUMA_HOST` constants (providers.ts:31-32). The token goes only in `Authorization` / `x-luma-api-key` (providers.ts:123, 180) | closed |
| T-06-34 | Information disclosure | mail at rest | mitigate | `store()` writes metadata and the snippet only (src/server/mail/sync.ts:52-70). Sync uses `getMetadata` and never `getFull` (getFull is used only by live-read paths: mail.ts:109, triage.ts:90, mail-actions.ts:76). 90-day prune (sync.ts:162-163). See N-1 | closed |
| T-06-35 | Denial of service (quota) | full sync | mitigate | `MAX_GETS_PER_RUN = 200` (sync.ts:15, 113, 130). `full` is marked `"pending"` when ids are left, and the old historyId is kept on overflow (sync.ts:116, 146). `rate_limit` → `fail()` keeps the state (sync.ts:39-43, 181) | closed |
| T-06-36 | DoS (Calendar paused) | 403 handling | mitigate | `kind === "scope"` removes only GMAIL_READ/GMAIL_COMPOSE from `scopes` and leaves `status` unchanged (sync.ts:172-175) | closed |
| T-06-37 | Information disclosure | logs | mitigate | `log.error({ err: e })` only (sync.ts:183). `lastSyncError` uses fixed strings (sync.ts:175-184) | closed |
| T-06-38 | Tampering | re-sync overwriting triage/local state | mitigate | The upsert `set: { ...row }` contains only metadata columns (sync.ts:56-69). WR-S05 changes only the INBOX label (sync.ts:96-112) | closed |
| T-06-39 | Elevation | outreach actions | mitigate | `requireOwner()` is first in all 9 actions (outreach-actions.ts:28, 39, 50, 60, 67, 74, 82, 93, 104) | closed |
| T-06-40 | Info disclosure (SSRF) | addFeed / importEventUrl | mitigate | `isSafeUrl` + `safeGet` (sources.ts:25-27, 91-96). `SafeGetError` maps to fixed codes (sources.ts:30, 100) | closed |
| T-06-41 | Information disclosure | keys and feed URLs | mitigate | `encrypt()` at rest (sources.ts:33; outreach/connections.ts:45). The DTO has `host` + `label` and no URL (src/lib/outreach-types.ts:95-105; sources.ts:63-83). Keys show `last4` (outreach/connections.ts:45, 59-60). Audit records id/host/last4/count (sources.ts:34, 56, 133; outreach/connections.ts:47). The action wrapper logs only `{ err }` (outreach-actions.ts:17-24) | closed |
| T-06-42 | Spoofing (key validation endpoint) | saveEventKey | mitigate | `VALIDATE` holds constant URLs per id, guarded by `Object.hasOwn` (outreach/connections.ts:28-41) | closed |
| T-06-43 | Denial of service | interests / organizer lists | mitigate | Interests: `z.array(z.string().max(40)).max(20)` (outreach-actions.ts:68), re-checked in sources.ts:126-129. Organizers: `/^\d{1,20}$/` and ≤20 (sources.ts:52; outreach-actions.ts:105) | closed |
| T-06-44 | Repudiation | source changes | mitigate | Audit rows: `outreach.feed.add/toggle/remove`, `outreach.organizers`, `outreach.interests` (sources.ts:34, 40, 46, 56, 133), `connection.save/remove` (outreach/connections.ts:47, 52) | closed |
| T-06-45 | Information disclosure | mail -> free model | mitigate | `mailInScope` ignores `ai.free_private_ok` (src/server/agents/policy.ts:45-54). It is checked in `createRun` (src/server/agents/loop.ts:64, 76-77) and every turn (loop.ts:282-283). The outreach agent is not routable (src/server/agents/registry.ts:122). DB tests with the toggle on (tests/db/routing-loop.test.ts:348-373) | closed |
| T-06-46 | Tampering / EoP (prompt injection) | mail.* / outreach.* outputs | mitigate | All five tools are in `CONTENT_TOOLS` (policy.ts:13-16), so `withContentFloor` applies (policy.ts:40-43). `untrusted: true` on outputs (src/server/agents/tools/mail.ts:24, 60, 80; tools/outreach.ts:46, 75). `<tool_data>` envelope with `<` escaped (loop.ts:114). Prompt rules (registry.ts:53-57) | closed |
| T-06-47 | Information disclosure | mail bodies at rest | mitigate | The `mail.get_message` body is fetched live (mail.ts:109) and never written to `mail_messages`. The body is capped at 16 KB via `bodyText` (mail/text.ts:3, 28). See N-2 | closed |
| T-06-48 | Elevation | agent writes | mitigate | The list/get tools are `tier: "READ"`, `sideEffect: false` (mail.ts:39-40, 99-100; tools/outreach.ts:27-28, 68-69). No pipeline or task write tool exists for agents | closed |
| T-06-49 | Denial of service | mail.list LIKE | mitigate | `escapeLike` (mail.ts:18, 43). `sender`/`text` `.max(100)` (mail.ts:33-34). `limit` max 50 (mail.ts:17, 58) | closed |
| T-06-50 | Tampering (prompt injection) | triage | mitigate | `<mail_data>` envelope with `<` escaped (src/server/mail/triage.ts:64-65). Forced `toolChoice` (triage.ts:105). The zod schema caps summary 300, action 120, items 5×200 and results 10 (triage.ts:18-30). Ids outside the batch are ignored (triage.ts:121-126) | closed |
| T-06-51 | Info disclosure (free model) | triage model | mitigate | `MODELS.haiku` via `getLlm()`, whose dispatching client sends non-free models to Anthropic (triage.ts:105, 165; src/server/agents/llm.ts:41-42). The run row has `sawPrivate: true` (triage.ts:98) | closed |
| T-06-52 | Denial of service (cost) | triage | mitigate | `capStatus` gate per batch (triage.ts:82-85). 7-day window, `.limit(100)` (triage.ts:156). Bulk mail skips the LLM (triage.ts:158-160). WR-S01 stops at `failed:2` (triage.ts:156) | closed |
| T-06-53 | Repudiation | AI spend | mitigate | Each batch inserts an `agent_runs` row, and `addRunUsage` records cost (triage.ts:96-108) | closed |
| T-06-54 | DoS (notification spam) | HIGH notifications | mitigate | Conditional `notifiedAt` claim, rolled back if the emit fails (triage.ts:67-76) | closed |
| T-06-55 | Information disclosure | logs | mitigate | Logs contain only counts and `{ err }` (triage.ts:113, 147, 166, 181) | closed |
| T-06-56 | Tampering / EoP (redirected mail) | mail.send_reply | mitigate | `resolve()` always rebuilds messageId, threadId, to, cc, inReplyTo, references, originalSubject and from from the stored row and live headers (mail.ts:174-213). `LOCKED.mail_reply` (src/lib/approval-kinds.ts:39). DB test (tests/db/mail-agent.test.ts:108) | closed |
| T-06-57 | Elevation (auto-send) | tier | mitigate | `tier: "APPROVE"`, `sideEffect: true` (mail.ts:167-168). In `CONTENT_TOOLS`. The handler refuses without `approvalId` (mail.ts:221) | closed |
| T-06-58 | Repudiation / Tampering (double send) | sendReply | mitigate | Checkpoint `{ draftId, draftMessageId, at }` (src/server/mail/send.ts:73). On adopt it checks, in order: the draft (52), SENT on the checkpointed message (54-56), rfc822msgid (59-60) and the thread's SENT copy since the checkpoint (63-66). WR-S03: a definite send failure deletes the draft (42). DB tests (mail-agent.test.ts:184-234) | closed |
| T-06-59 | Information disclosure | audit_log | mitigate | `"mail.send_reply": "mail_reply"` (approval-kinds.ts:16). For non-issue kinds `editMeta` stores `changedKeys` only (src/server/agents/approvals.ts:26-28) | closed |
| T-06-60 | DoS (crash on bad model data) | toApproval | mitigate | `safeParse` in `resolve()` throws a `ToolError` (mail.ts:211). `toApproval` only destructures (mail.ts:216-218). Test (mail-agent.test.ts:99) | closed |
| T-06-61 | Tampering (header injection) | MIME | mitigate | Same control as T-06-09 (mime.ts:4) | closed |
| T-06-62 | Information disclosure | redact | mitigate | src/lib/mail-payload.ts has no key-, token-, secret- or password-like field names (grep: no hits) | closed |
| T-06-63 | Information disclosure | keys / feed URLs in browser | mitigate | DTOs carry `last4` and host + label only (outreach-types.ts:95-105). The settings UI shows `••••{last4}` and `f.label` (src/settings/outreach-connections.tsx:42, 177). `TokenForm` clears the input immediately (src/settings/token-form.tsx:62). The add-feed form clears on success (outreach-connections.tsx:131-132) | closed |
| T-06-64 | Spoofing (reconnect) | Reconnect Google | mitigate | Fixed same-origin `<a href="/api/connections/google/start">` (src/settings/calendar-connection-row.tsx:65) | closed |
| T-06-65 | Tampering | interests | mitigate | Server-side validation is authoritative (outreach-actions.ts:68; sources.ts:126-129). Client checks are UX only (src/settings/outreach-section.tsx:33-37) | closed |
| T-06-66 | Repudiation | disconnect side-effect | mitigate | The confirm text says "This also removes Gmail access." (calendar-connection-row.tsx:171). See N-3 | closed |
| T-06-67 | Elevation | mail actions | mitigate | `requireOwner()` is first in all 7 actions (src/server/mail-actions.ts:57, 92, 115, 139, 191, 207, 216) | closed |
| T-06-68 | Tampering (XSS) | mail approval UI | mitigate | No `dangerouslySetInnerHTML` or `innerHTML` anywhere in src/ (grep: no files). `href` is built only when `UUID.test(p.messageId)` (src/approvals/mail-approval.tsx:55) | closed |
| T-06-69 | Tampering (recipient change via UI) | validateMailDraft | mitigate | `{ ...base, subject, body }`: only subject and body come from the editor (mail-approval.tsx:24-25). The server runs `checkLocked` in `decide()` and `saveEdit()` (approvals.ts:91-94, 121-124). CR-U02 refuses a stale base | closed |
| T-06-70 | Repudiation / race | saveReplyToDraftsAction | mitigate | Conditional pending → rejected claim (mail-actions.ts:226-241). The draft is deleted if the claim loses (mail-actions.ts:244-247). Audit records `movedToDrafts: true` (mail-actions.ts:252) | closed |
| T-06-71 | Information disclosure | body persistence / logs | mitigate | `getMailBodyAction` reads with `getFull` and returns, with no insert or update of the body (mail-actions.ts:56-90). Logs are `{ err }` only (mail-actions.ts:36, 51, 246) | closed |
| T-06-72 | Tampering (Gmail state) | archive/flag | mitigate | Only the local columns `archivedAt` / `flaggedAt` are updated, with no Gmail client in these actions (mail-actions.ts:91-136) | closed |
| T-06-73 | Tampering (XSS) | event card / list | mitigate | Repo grep finds no `dangerouslySetInnerHTML`. Card and list links go to internal routes only (src/outreach/event-card.tsx:100, 146; pipeline-board.tsx:81). The external link is gated by `isSafeUrl` with `noopener noreferrer` (src/outreach/event-detail.tsx:55, 199-203) | closed |
| T-06-74 | Elevation | /outreach route | mitigate | `await requireOwner()` in src/app/(os)/outreach/page.tsx:16 and events/[id]/page.tsx:14. The actions are guarded too (T-06-22, T-06-39, T-06-67) | closed |
| T-06-75 | Spoofing (mock as real) | badges / hide mock | mitigate | MOCK badge (event-card.tsx:28-30; pipeline-board.tsx:89-91). Mock buttons are disabled with a stated reason (event-card.tsx:87; pipeline-board.tsx:113-120; event-detail.tsx:166, 190-192) | closed |
| T-06-76 | Tampering | query params | accept | See AR-06-02 | closed |
| T-06-77 | Tampering | /outreach/events/[id] | mitigate | `requireOwner()`, then `z.uuid().safeParse(id)` before `loadEvent` (events/[id]/page.tsx:14-18) | closed |
| T-06-78 | Tampering (SQL wildcard) | palette search | mitigate | `escapeLike` + parameterised `ilike`, `.limit(8)`, query 2-100 chars (src/server/palette-actions.ts:19-20, 39-41) | closed |
| T-06-79 | Tampering (javascript:/http links) | Open original page | mitigate | `isSafeUrl(event.url)` (https only) and `target="_blank" rel="noopener noreferrer"` (event-detail.tsx:55, 199-203) | closed |
| T-06-80 | Tampering (XSS) | description | mitigate | Plain text nodes. Repo-wide grep gate: no hits | closed |
| T-06-81 | Tampering (XSS / tracking pixels) | email detail | mitigate | The body is server-stripped plain text from `getMailBodyAction` (via `bodyText`), rendered as text with no HTML and no remote images. Grep gate: no hits | closed |
| T-06-82 | Tampering (link injection) | Open in Gmail | mitigate | `THREAD = /^[A-Za-z0-9]+$/` is tested before building the fixed `mail.google.com` URL (src/outreach/email-detail.tsx:21, 225-226) | closed |
| T-06-83 | Elevation (accidental send) | draft block | mitigate | Sending is only possible via `approveAction` on an existing approval (src/outreach/draft-reply.tsx:212). Copy says "Nothing sends automatically." (draft-reply.tsx:139, 239). CR-U01 restricts auto-draft to the exact selected mail | closed |
| T-06-84 | Information disclosure | mail in URL | accept | See AR-06-03 | closed |
| T-06-85 | Information disclosure | e2e seeds | mitigate | Dummy ciphertext `'v1.e2e.e2e.e2e'`, `@example.test` addresses, pinned to `/lifeos_e2e` (tests/e2e/owner.ts:9, 230, 244-249, 278) | closed |
| T-06-86 | Elevation (docs drift) | docs/permissions.md | mitigate | docs/permissions.md:41-48 documents the content floor for event/mail tools, the hard mail taint, locked mail_reply recipients and APPROVE-only sending. See N-4 | closed |
| T-06-87 | Tampering (prod data) | migration 0008 | mitigate | Additive tables, nullable columns and constant defaults (0008_outreach.sql:81-83). Applied twice in the test (migrations.test.ts:26). The owner applies it via the migrate service (.planning/OWNER-ACTIONS.md:70). See N-6 | closed |
| T-06-88 | Information disclosure | SUMMARY / UAT notes | mitigate | No token, feed-URL or mail-content patterns in 06-*-SUMMARY.md (grep for `ya29`, `refresh_token`, `sk-ant`, `webcal`, `private-`: no hits). OWNER-ACTIONS.md:70 says "never paste tokens, feed URLs or mail content" | closed |
| T-06-89 | Elevation | live send during UAT | mitigate | The UAT step uses "a real thread you own" (.planning/OWNER-ACTIONS.md:67). Sending still requires approval in code (T-06-57). See N-6 | closed |
| T-06-90 | Denial of service | project writes blocked by rescoring | mitigate | `void rescoreAfterProjectChange(...)` runs after commit (src/server/project-actions.ts:49; src/server/agents/tools/projects.ts:173) and catches + logs internally (sources.ts:138-143) | closed |
| T-06-91 | Tampering / EoP | later side effects after drafting mail | mitigate | `mail.send_reply` is in `CONTENT_TOOLS` (policy.ts:15). Test (mail-agent.test.ts:93) | closed |
| T-06-92 | Info disclosure (mail -> free model via tasks) | tasks.list / projects tools | mitigate | `MAIL_TASK_TITLE` substitution in the calendar tasks tool (tools/calendar.ts:120-123), `projects.list`/`projects.get` (tools/projects.ts:35, 47, 68, 85), and blocker labels via `mailBlockerRedactor` (WR-S04, tools/projects.ts:70; src/server/tasks.ts:173-190) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-04 | Migration 0008 only adds tables, nullable or constant-default columns and check constraints, with no backfill or rewrite. It is tested to apply twice (migrations.test.ts:26, 59-74). | owner (plan 06-01) | 2026-10-13 |
| AR-06-02 | T-06-76 | `/outreach` query params (tab, interest, view, mock, mail, draft) only choose filters and views. Unknown values fall back to defaults. `mail` must match a uuid (page.tsx:45-46), and CR-U01 restricts `draft` to the exact selected message. | owner (plan 06-15) | 2026-10-13 |
| AR-06-03 | T-06-84 | Only the internal mail uuid and the category appear in the query string, never the subject, sender or body. | owner (plan 06-17) | 2026-10-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. No 06-*-SUMMARY.md has a `## Threat Flags` section. Each 06-REVIEW-FIX item maps to an existing threat:
- CR-S01 (mail state wiped on disconnect or account change) -> T-06-21, T-06-34, T-06-66
- IN-S03 -> T-06-21
- WR-S01 -> T-06-52
- WR-S02 and WR-S03 -> T-06-58
- WR-S04 -> T-06-92
- WR-S05 -> T-06-38
- WR-S06 -> T-06-14
- WR-S07 -> T-06-30 and T-06-31 (dedup integrity)
- WR-S08 -> T-06-23
- IN-S01 -> T-06-05
- IN-S08 -> T-06-48
- CR-U01 -> T-06-83 and AR-06-02
- CR-U02 -> T-06-69
- CR-U03 and WR-U06 (locked `from`, redirect note) -> T-06-56 and T-06-69
- WR-U02 -> T-06-17
- WR-U08 -> T-06-75
- CR-U04, WR-U01, WR-U03..WR-U05, WR-U07, WR-U09 and WR-U10 are UI correctness fixes with no new attack surface

## Residual Notes (informational, non-blocking)

- **N-1 (T-06-34):** The 90-day prune deletes only messages that are no longer in the INBOX (sync.ts:162-163). INBOX metadata older than 90 days is kept. It holds no bodies, so this is a retention note, not a gap.
- **N-2 (T-06-47):** The 16 KB cap is applied by the tool (`bodyText` → `MAIL_BODY_CAP`), not by a generic cap on `tool_calls.output` in the gateway. Live-read bodies therefore persist, capped, in `tool_calls.output` (they are never written to `mail_messages`). This matches the plan's wording, but bodies do exist at rest in the agent trace.
- **N-3 (T-06-66):** The disconnect confirm text says "Synced mail stays in LifeOS until it's pruned." (calendar-connection-row.tsx:171). Since CR-S01, `removeCalendarConnection` wipes mail state through `resetMailState` (connections.ts:76-85), so the copy is stale. It is wrong in the conservative direction, but it should be updated.
- **N-4 (T-06-86):** The general floor paragraph at docs/permissions.md:36 still lists only GitHub tools in `CONTENT_TOOLS`. The Phase 6 section (41-48) covers the event and mail tools.
- **N-5 (T-06-15):** The plan said `\b...\b`. The code uses Unicode letter/digit lookarounds around an escaped literal, which is equally ReDoS-safe and handles "C++".
- **N-6 (T-06-87, T-06-89):** The owner VM migrate of 0008 and the live-send UAT are still pending in .planning/OWNER-ACTIONS.md. The controls exist; the owner has not run them yet.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-13 | 92 | 92 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-13
