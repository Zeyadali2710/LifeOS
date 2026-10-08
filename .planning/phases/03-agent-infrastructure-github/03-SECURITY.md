---
phase: 03
slug: agent-infrastructure-github
status: verified
threats_total: 81
threats_closed: 81
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
audited_at_commit: 0dc10e9
created: 2026-10-09
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register built from the `<threat_model>` blocks of 03-01..03-19-PLAN.md (T-03-01..T-03-80 plus T-03-SC = 81 entries: 77 mitigate, 4 accept).
> Each mitigation was checked against the code at HEAD 0dc10e9, after the 03-REVIEW-FIX fixes.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| app -> Postgres | agent state, GitHub data, token ciphertext at rest | AES-256-GCM ciphertext, run messages (sensitive) |
| npm registry -> repo | @anthropic-ai/sdk dependency | supply chain |
| app <-> Anthropic API | prompts, thread history, tool results out; model output (possibly prompt-injected) back | owner data; untrusted model output |
| app <-> api.github.com | authenticated outbound HTTP; untrusted JSON back | PATs (secret); untrusted repo/PR/issue text |
| LLM tool_use -> gateway | model-requested tool calls | untrusted args |
| browser -> server actions / API routes | tokens, cap, ids, approval edits, chat prompts | PAT plaintext in transit, owner input |
| server -> browser (DTOs, NDJSON, SSE) | run/approval/step DTOs, summaries | redacted tool I/O, untrusted GitHub text |
| notification actionUrl -> navigation | URLs from GitHub data | untrusted URLs |
| worker jobs -> DB/GitHub | scheduled sync, resume, expire, sweep | write-side effects |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Information disclosure | connections table | mitigate | schema.ts:293-297 has only `ciphertext` + `last4`, no plaintext column; connections.ts:41 `encrypt(token)`; crypto.ts AES-256-GCM v1 format | closed |
| T-03-02 | Tampering (replay) | tool_calls / approvals | mitigate | schema.ts:264-265 uniqueIndex(idempotencyKey), uniqueIndex(runId, toolUseId); drizzle/0001_agents_github.sql:222-223 CREATE UNIQUE INDEX | closed |
| T-03-03 | Repudiation | approvals | mitigate | schema.ts:279-284 originalPayload/editedPayload/payloadHash/decidedAt; gateway.ts:146 payloadHash=sha(canon(payload)); approvals.ts:24-30 aud() writes audit_log | closed |
| T-03-04 | Denial of service | unbounded jsonb messages | accept | see Accepted Risks AR-03-01 | closed |
| T-03-SC | Tampering | npm install @anthropic-ai/sdk | mitigate | 03-02-SUMMARY.md:49-50 records `scripts.postinstall` empty and repository anthropics/anthropic-sdk-typescript; package.json:24 | closed |
| T-03-05 | Elevation of privilege | resolvePolicy | mitigate | policy.ts:4 HIGH_RISK floor; tests/unit/policy.test.ts "never lowers HIGH_RISK" | closed |
| T-03-06 | Information disclosure | tool I/O stored/displayed | mitigate | redact.ts:1 SENSITIVE=/token\|authorization\|secret\|password\|key/i; summarize() max 600 (redact.ts:13) | closed |
| T-03-07 | Information disclosure | ANTHROPIC_API_KEY | mitigate | env.ts:9 optional; read only in llm.ts:5; settings/page.tsx:50 exposes only `Boolean(...)` | closed |
| T-03-08 | Tampering (open redirect/XSS) | GitHub links | mitigate | safe-url.ts isSafeGithubUrl: https + hostname==="github.com" + no credentials + no control chars; tests/unit/safe-url.test.ts | closed |
| T-03-09 | DoS (cost) | unknown model id | mitigate | pricing.ts:13 falls back to Opus (most expensive) price | closed |
| T-03-10 | Tampering (XSS) | ExecutionTrace summaries | mitigate | grep `dangerouslySetInnerHTML\|innerHTML` across src/ returns 0 matches; execution-trace.tsx renders summaries as text | closed |
| T-03-11 | Information disclosure | trace I/O | mitigate | summaries redacted at write (gateway.ts:72-73, 203-204); execution-trace.tsx has no fetch (only DTO props) | closed |
| T-03-12 | Information disclosure | connections.ts | mitigate | connections.ts:41 encrypt(); getConnections DTO (lines 80-95) has no ciphertext; audit metadata `{ id, last4 }` (line 44); settings-actions.ts:31 logs only err | closed |
| T-03-13 | Elevation of privilege | write token misuse | mitigate | `writeToken(` called only at tools/github.ts:255 inside createIssue.handler (repo grep); sync.ts imports readToken only | closed |
| T-03-14 | SSRF | github/client.ts | mitigate | client.ts:3 fixed BASE; checkPath (25-27) requires leading "/" and no "://"; paginate next link must start with `${BASE}/` (line 74) | closed |
| T-03-15 | Tampering | GitHub JSON | mitigate | client.ts get/paginate/post all `schema.parse` (63, 72, 82); sync.ts:12-71 zod schemas with only used fields | closed |
| T-03-16 | Denial of service | slow GitHub | mitigate | client.ts:29,41 AbortSignal.timeout(15000); paginate maxPages bound (line 66, callers pass 1-3) | closed |
| T-03-17 | Elevation of privilege | callTool | mitigate | gateway.ts:97-100 rejects unknown tool / non-live agent / tool not in agent.tools; tier via resolvePolicy (121) | closed |
| T-03-18 | Spoofing | LLM-supplied ids | mitigate | gateway.ts:110-114 tool.resolve before claim/approval; tools/github.ts:24-33, 245-249 re-resolve repo against github_repos and write-token repo list | closed |
| T-03-19 | Tampering | tool input | mitigate | gateway.ts:107 input.safeParse; 201-202 output.safeParse | closed |
| T-03-20 | Tampering (replay) | side-effect tools | mitigate | gateway.ts:125 key=sha(runId:toolUseId); 129-135 insert onConflictDoNothing claims before handler; tests/db/idempotency.test.ts "same key twice runs the handler once", "concurrent calls run the handler once" | closed |
| T-03-21 | Information disclosure | stored tool I/O | mitigate | gateway.ts:72-73 redact(input), 203-204 redact(output); 207-210 stores ToolError message or "Tool failed", stack only to server log | closed |
| T-03-22 | EoP (prompt injection) | approval creation | mitigate | gateway.ts:173-192 returns waiting_approval before handler; tools/github.ts:254 handler throws without ctx.approvalId; only approvals.ts executeApproved passes approvalId | closed |
| T-03-23 | DoS (cost) | spend cap | mitigate | loop.ts:32-35 assertUnderCap in createRun (also used by retryRun loop.ts:296); chat.ts:36-37 preflight; spend.ts:41 integer 1..1000; Sydney-month sum spend.ts:10-18 | closed |
| T-03-24 | Tampering | model override | mitigate | runs.ts:112 rejects non-live agent or model not in MODELS; agent-actions.ts:15 zod enum | closed |
| T-03-25 | Tampering (race) | cancelRun vs approve | mitigate | runs.ts:141-153 CAS on status; approvals.ts:84-88 approve CAS `status='pending'`; approvals.ts:135-145 execute claim refuses cancelled/expired runs (WR-02 fix) | closed |
| T-03-26 | Denial of service | orphaned runs | mitigate | runs.ts:171-185 sweepOrphans; worker/index.ts:57 scheduled every 5 min; loop.ts:141 heartbeatAt per persist | closed |
| T-03-27 | Information disclosure | SSE run/approval DTOs | mitigate | dto.ts toRunDTO/toApprovalDTO omit messages/ciphertext; events.ts loadEventRow returns DTOs; api/events/route.ts:7-8 getSession + 401 | closed |
| T-03-28 | Tampering | NOTIFY payload | mitigate | hub.ts:64 kind whitelist DATA_KINDS + string id; events.ts:106 UUID test; row always reloaded via loadEventRow | closed |
| T-03-29 | Elevation of privilege | write token | mitigate | sync.ts:10 imports readToken only | closed |
| T-03-30 | Tampering (stored injection/XSS) | synced text | mitigate | sync.ts:75 t() truncates to 2000; zod-parsed fields; UI React text only (no dangerouslySetInnerHTML in src); loop.ts:69 <tool_data> wrap | closed |
| T-03-31 | Tampering (open redirect) | CI notification actionUrl | mitigate | sync.ts:229 actionUrl only when isSafeGithubUrl(w.html_url) | closed |
| T-03-32 | Denial of service | GitHub rate limits | mitigate | sync.ts:100-109 ETag cond GET (saved after persist, CR-02 fix); depth bounds (30 active repos, per_page caps, paginate 1 page); client.ts:49-53 rate_limit error stops run, sync.ts:244-248 retries next schedule | closed |
| T-03-33 | Information disclosure | logs | mitigate | worker/jobs/github-sync.ts:7 logs result/repos/events counts only | closed |
| T-03-34 | Spoofing | repo argument | mitigate | tools/github.ts:245-249 createIssue.resolve checks github_repos and write connection repos before approval creation (gateway.ts:111) | closed |
| T-03-35 | Elevation of privilege | write token | mitigate | tools/github.ts:254-255 approvalId required before writeToken | closed |
| T-03-36 | Tampering (duplicate write) | create_issue retries | mitigate | tools/github.ts:258 approval-id marker in body; 259-267 adopt pre-check when ambiguous; approvals.ts:172 adopt: row.ambiguous | closed |
| T-03-37 | Tampering (prompt injection) | READ outputs | mitigate | tools/github.ts:11 cut 2000, :14 limit max 50, :56 slice; registry.ts:24 DATA_RULE in both system prompts; loop.ts:69 <tool_data> with `<` escaped (WR-04 fix) | closed |
| T-03-38 | Information disclosure | tool outputs | mitigate | tools/github.ts read mappers return only ref/title/state/author/url-style public fields; no token fields | closed |
| T-03-39 | Elevation of privilege | settings actions | mitigate | settings-actions.ts:20,36,49,62 `await requireOwner()` first statement in all 4 actions | closed |
| T-03-40 | Tampering | action inputs | mitigate | settings-actions.ts:11-13 zod enum id, token max 255, cap int 1..1000 | closed |
| T-03-41 | Information disclosure | token in DOM/logs/toasts | mitigate | token-form.tsx:61 type=password, :40 setToken("") immediately; SaveTokenResult has no token field; settings-actions.ts:31 logs err only | closed |
| T-03-42 | Spoofing (CSRF) | server actions | mitigate | Next built-in server-action Origin/Host check (no `serverActions.allowedOrigins` override in next.config.ts); auth.ts:34 sameSite "lax", httpOnly | closed |
| T-03-43 | EoP (prompt injection) | loop tool dispatch | mitigate | loop.ts:243 every tool_use via callTool with `allowed` map (134); :69 <tool_data> wrap; writes only via approval (T-03-22) | closed |
| T-03-44 | DoS (cost) | loop | mitigate | registry.ts:8 RUN_LIMITS 12/60k/120s; loop.ts:183-184, 241 enforced; cap preflight createRun (32-35) used by retryRun (296); delegate.ts:7 one level (only orchestrator lists delegate) | closed |
| T-03-45 | Information disclosure | persisted messages | mitigate | dto.ts excludes messages; llm.ts sends no thinking param; tokens never in tool I/O (T-03-38/21) | closed |
| T-03-46 | Repudiation | runs | mitigate | loop.ts:187-197 usage/cost per turn; :114-130 status/errorKind/error on finish; gateway.ts persists every tool call row | closed |
| T-03-47 | Denial of service | orphaned running state | mitigate | loop.ts:104,141 heartbeatAt; runs.ts:171 sweep; loop.ts:116 setStatus guarded `status='running'` (WR-08 fix) | closed |
| T-03-48 | Elevation of privilege | approval actions | mitigate | approval-actions.ts:17,22,27,35 `await requireOwner()` first in all 4 actions | closed |
| T-03-49 | Tampering (replay/double submit) | decide/execute | mitigate | approvals.ts:84-88 pending->approved CAS; :135-145 approved/failed->executing CAS; :94,204,259 singletonKey `resume:${id}`; marker adoption (T-03-36) | closed |
| T-03-50 | Tampering | edited payload | mitigate | approvals.ts:79,108 issuePayloadSchema.safeParse on approve and edit; :82,111 repo change rejected; :90,118 audit original+edited | closed |
| T-03-51 | Elevation of privilege | expired approvals | mitigate | approvals.ts:87,199 CAS `expires_at > now`; :212-217 expireDue; worker/index.ts:56 every 5 min | closed |
| T-03-52 | Repudiation | decisions | mitigate | approvals.ts:71 approval.reject, :90/118 approval.edit, :91 approval.approve audit rows with approval id | closed |
| T-03-53 | Information disclosure | action results | mitigate | approval-actions.ts Result carries only ApprovalDTO; dto.ts toApprovalDTO omits payloadHash/messages/tokens | closed |
| T-03-54 | Spoofing | chat/threads/status routes | mitigate | api/chat/route.ts:16-17, api/threads/route.ts:8-9, api/threads/[id]/route.ts:9-10, api/agents/status/route.ts:8-9 getSession + 401 | closed |
| T-03-55 | Tampering (CSRF) | POST /api/chat | mitigate | api/chat/route.ts:19 application/json required (415); :20-22 Origin compared to BETTER_AUTH_URL origin (2e28d3f); auth.ts:34 SameSite=Lax. Note IN-01 below | closed |
| T-03-56 | DoS (cost) | POST /api/chat | mitigate | route.ts:13 prompt max 8000; chat.ts:29 no-key, :30-34 10 runs/min, :35 paused, :36-37 cap, all before any row or LLM call | closed |
| T-03-57 | Information disclosure | NDJSON events | mitigate | loop.ts emits only delta text, toStepDTO/toApprovalDTO/toRunDTO; summaries redacted at write | closed |
| T-03-58 | Tampering (IDOR) | /api/threads/[id] | accept | see AR-03-02; uuid validated at api/threads/[id]/route.ts:13 | closed |
| T-03-59 | Elevation of privilege | agent actions | mitigate | agent-actions.ts:29,34,39,46,53,60,70 `await requireOwner()` first in all 7 actions | closed |
| T-03-60 | Tampering | action inputs | mitigate | agent-actions.ts:13-15 zod enums for agent ids and models, z.uuid run ids | closed |
| T-03-61 | Information disclosure | runDetail tool I/O | mitigate | queries.ts runDetail redact(c.input)/redact(c.output); toRunDTO never serializes messages | closed |
| T-03-62 | Repudiation | controls | mitigate | agent-actions.ts:17-20 guarded() writes audit for every successful control action | closed |
| T-03-63 | Tampering (XSS) | AnswerText / ApprovalCard | mitigate | answer-text.tsx parseAnswer safe subset, React text nodes only; repo-wide grep: no dangerouslySetInnerHTML | closed |
| T-03-64 | Tampering (malicious link) | CitationChip | mitigate | answer-text.tsx:70 isSafeGithubUrl gate, :76 rel="noopener noreferrer" | closed |
| T-03-65 | EoP (prompt-injected approval) | inline approve | mitigate | approval-card.tsx:74-109 shows repo/title/body/labels from edited ?? original; executes only via approveAction -> decide -> worker | closed |
| T-03-66 | DoS (cost) | accidental cancel/resend | accept | see AR-03-03 | closed |
| T-03-67 | Tampering (XSS) | approval preview | mitigate | approval-detail.tsx:26-36 React text with whitespace-pre-wrap; no HTML rendering in src | closed |
| T-03-68 | Spoofing (misleading preview) | approval detail | mitigate | approval-detail.tsx:100-106 preview from saved (edited ?? original) + draft; :136 sends draft only when dirty, else server uses edited ?? original; approval-edit-form.tsx:38 repo read-only; server re-validates (T-03-50) | closed |
| T-03-69 | Tampering (wrong item approved) | list navigation | mitigate | approvals-view.tsx apply() never changes selection after a decision; approval-list.tsx:48-55 only arrows/Enter navigate, no approve shortcut | closed |
| T-03-70 | Elevation of privilege | approvals page | mitigate | app/(os)/approvals/page.tsx:11 requireOwner; actions guarded (T-03-48) | closed |
| T-03-71 | Information disclosure | run detail I/O | mitigate | queries.ts runDetail redact(); run-detail.tsx renders received props only | closed |
| T-03-72 | Tampering (XSS) | prompts / JSON blocks | mitigate | run-detail.tsx:27 JSON.stringify, :44 rendered as <pre> text child | closed |
| T-03-73 | Elevation of privilege | agent pages | mitigate | app/(os)/agents/page.tsx:11, agents/[agentId]/page.tsx:10, agents/runs/[runId]/page.tsx:11 requireOwner | closed |
| T-03-74 | Spoofing (fake activity) | disabled agents | mitigate | queries.ts agentsOverview returns stats:null for !a.live; agent-card.tsx:42 renders stats only when present | closed |
| T-03-75 | Tampering (open redirect) | notification-row | mitigate | notification-row.tsx:52-57 only isSafeGithubUrl (window.open noopener) or isSafePath; :93 clickable only when either holds | closed |
| T-03-76 | Tampering (double execution) | agent.resume retries | mitigate | approvals.ts:135-150 execute CAS; loop.ts:102-106 run claim CAS; singletonKey per approval (approvals.ts:94) | closed |
| T-03-77 | Denial of service | overlapping syncs | mitigate | worker/index.ts:55,65 and settings-actions.ts:27,53 singletonKey "github.sync" | closed |
| T-03-78 | Information disclosure | live verification | mitigate | 03-19-PLAN step 5 requires a write PAT limited to one test repo, and 03-19-SUMMARY records that all 7 steps passed. No GitHub token env var exists (env.ts). Tokens enter only via saveTokenAction (encrypted) and are never logged. | closed |
| T-03-79 | Tampering | e2e seed helpers | accept | see AR-03-04; grep shows no src/ import of tests/ | closed |
| T-03-80 | EoP | unverified integration assumptions | mitigate | 03-19-SUMMARY.md:61-70 records A1-A7 outcomes; :81 gaps "none blocking" | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-04 | "single-owner app; per-run token limits (plan 11) bound message size" (RUN_LIMITS.tokens 60k, turnMaxTokens 4096 enforced in loop.ts) | owner (plan 03-01) | 2026-10-09 |
| AR-03-02 | T-03-58 | "single-owner app; ids validated as uuid; no cross-user data exists" | owner (plan 03-13) | 2026-10-09 |
| AR-03-03 | T-03-66 | "Esc does not cancel; Stop explicit; server rate limit (plan 13)" (10 runs/minute in chat.ts:34) | owner (plan 03-15) | 2026-10-09 |
| AR-03-04 | T-03-79 | "test-only module against the throwaway lifeos_e2e DB; not imported by app code" | owner (plan 03-19) | 2026-10-09 |

---

## Unregistered Flags

None. No 03-*-SUMMARY.md has a `## Threat Flags` section.

## Residual Notes (informational, not open threats)

These come from 03-REVIEW.md Info findings that were out of scope for the fix pass. None of them removes a declared mitigation.
- IN-01 (T-03-55): `/api/chat` skips the Origin check when the header is absent. Browsers always send Origin on cross-origin POST, and the JSON content-type forces a CORS preflight. A non-browser client has no victim cookie. The CSRF control holds. Optional hardening: reject `Sec-Fetch-Site: cross-site`.
- IN-03 (T-03-14): the `repoArg` / issue-payload regex allows `.` and `..` segments. The host stays fixed to api.github.com, and repo must match a synced row (repoRow/resolve). Optional hardening: a refine that rejects dot segments.
- IN-04 (T-03-36): the adopt pre-check reads one page (30 issues) since the approval was created. On a very busy repo it could miss the marker and create a duplicate. Optional hardening: `per_page=100`.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-09 | 81 | 81 | 0 | gsd-security-auditor (HEAD 0dc10e9) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-09
