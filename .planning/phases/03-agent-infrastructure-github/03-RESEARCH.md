# Phase 3: Agent infrastructure + GitHub - Research

**Researched:** 2026-10-08
**Domain:** Self-built LLM tool gateway + agent loop (Anthropic SDK), pg-boss suspend/resume, GitHub REST sync, streaming chat in Next.js 16
**Confidence:** MEDIUM-HIGH (pricing, SDK, repo code verified; GitHub API details from training, flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The first real PREPARE→APPROVE action is **create a GitHub issue** (repo, title, body, optional labels). Approval actually creates it on GitHub.
- **D-02:** Two GitHub tokens: the **read PAT** (fine-grained, read-only) for all reads/sync, and a separate **issues-write PAT** (fine-grained, Issues: write on chosen repos only) used solely by the approved create-issue tool. Reads never use the write token. If the write token is absent, the tool is unavailable and the UI says so.
- **D-03:** Approve/reject is available **everywhere**: the Approvals page (design ApprovalDetail), an inline approval ResultCard in the AI panel conversation, and an APPROVAL-category notification linking to it (Phase 2 notification system).
- **D-04:** The prepared payload is **editable before approving** (e.g. issue title/body/labels). The approval record and audit log keep both the agent's original and the owner-edited version; the executed payload is the edited one, re-validated with zod on approve.
- **D-05:** Pending approvals **expire after 7 days**: status expired, the suspended run is cancelled with a clear status, and an FYI notification is sent. Nothing executes after expiry.
- **D-06:** Repo visibility = **whatever the read PAT grants**. No second allow-list in LifeOS; Settings shows the effective repo list.
- **D-07:** **Periodic worker sync (~15 min, pg-boss)** stores repos, PRs (+ reviews / review requests), issues (assigned to or opened by owner, labels), recent commits/push activity, and latest CI/Actions run status in Postgres. Sync emits activity events for meaningful changes (e.g. PR merged, review requested, CI failed). Agents read primarily from the DB; a live-read tool may fetch fresh detail on demand.
- **D-08:** v1 GitHub data: **PRs + reviews, Issues, Commits + activity, CI/Actions status**. A failed CI run on a default branch → IMPORTANT notification.
- **D-09:** Tokens are entered in a **Settings → Connections** section (design ConnectionRow), stored **AES-256-GCM encrypted** per ADR-007, never shown again (only last 4 chars + detected scopes/expiry), rotatable without redeploy. Connection status (connected / error / last sync) is visible there. The Anthropic API key stays in `.env` per ADR-007.
- **D-10:** Conversations are **saved threads**. The AI panel's new-chat button starts a new thread; a recent-threads list in the panel reopens old ones. Agents see prior turns within a thread.
- **D-11:** Chat lives in the **AI panel only** (⌘J drawer; full sheet on mobile per design M2), reached from the command bar and the palette's "Ask LifeOS" row. No separate chat page. This replaces the Phase 2 "not connected" InlineError (D-05 of Phase 2).
- **D-12:** The chat shows the design's **ExecutionTrace live** (queued → running → done with durations; delegate + tool steps) with **expandable input/output summaries** per tool step. Full raw detail lives in the Command Centre. Answers stream.
- **D-13:** **All domain agents are registered** in the agent registry now (Home, Career, Social, Outreach, Organization, Projects, Knowledge, Goals, Finance, AgentOps per docs/AGENTS.md). Only the **orchestrator and a GitHub (Projects) domain agent are live**; the rest are disabled and labelled honestly (e.g. "Not connected · arrives in Phase N"), with no fake runs or stats. The orchestrator delegates GitHub questions to the GitHub agent (proves AGT-04 delegation).
- **D-14:** **Monthly spend cap**, default **US$20**, editable in Settings. Spend = recorded input/output (and cache) tokens × per-model price, summed per calendar month (Australia/Sydney). The Command Centre shows month-to-date vs cap.
- **D-15:** At the cap: **new runs are blocked** with an InlineError explaining why and an **URGENT notification**; in-flight runs finish. Raising the cap in Settings unblocks immediately.
- **D-16:** Orchestrator default model **Opus 5.5** (`claude-opus-5-5`) per ADR-008; domain agents Sonnet 5.5; triage Haiku 4.5. Model is changeable per agent from the Command Centre.

### Claude's Discretion
- Per-run safety limits (max tool calls / tokens / wall time per run) — pick sensible defaults and surface them in the run record.
- Exact sync interval tuning, GitHub rate-limit handling and backoff, pagination depth / history window.
- Thread list size, thread titling (e.g. first prompt or Haiku-generated title).
- Command Centre pause/resume/retry/cancel semantics within AGT-05 (follow docs/AGENTS.md runtime-state model).
- Which tool tier each GitHub read/live tool gets (reads are READ; create-issue is APPROVE).

### Deferred Ideas (OUT OF SCOPE)
- Other GitHub write actions (PR comments, labels, closing issues) — future phase, each behind approval.
- GitHub webhooks for real-time updates — needs a public endpoint/relay; conflicts with Tailscale-only constraint for now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGT-01 | Tool gateway enforces tiers READ/PREPARE/APPROVE/EXECUTE/HIGH_RISK; HIGH_RISK cannot be lowered | Gateway pattern (6 steps from docs/AGENTS.md), `permissions` table, tier-resolution function with HIGH_RISK floor; unit-testable pure function |
| AGT-02 | APPROVE/HIGH_RISK actions create approvals; run suspends and resumes on decision | Persisted-messages resumable loop; approval row + pg-boss `agent.resume` job; expiry sweep job; atomic decide transaction |
| AGT-03 | Side-effecting calls are idempotent | `tool_calls.idempotency_key` unique index; claim-before-execute; GitHub has no idempotency header, so embed marker + pre-check on retry |
| AGT-04 | Orchestrator chat streams responses, shows tool status, delegates | Anthropic `messages.stream` loop, `delegate` tool spawning child run, NDJSON POST route handler, SSE hub for step events |
| AGT-05 | Command Centre: status, queue, runs, tool calls, errors, latency, tokens, cost; pause/resume/retry/cancel | Tables `agent_runs`/`tool_calls`/`agents`, cost computed at record time from price table, global+per-agent pause flags, cancel flag checked between tool calls |
| AGT-06 | GitHub read-only integration feeds Career data and activity | `github_*` tables, pg-boss 15-min sync, ETag conditional requests, `emitActivity` for diffs |
</phase_requirements>

## Summary

The phase is a large vertical slice but every piece maps onto infrastructure already in the repo: Postgres + Drizzle (hand-written/generated SQL migrations in `drizzle/`), pg-boss worker (`src/worker/index.ts`), `emitActivity` + LISTEN hub + `/api/events` SSE, `encrypt()/decrypt()` AES-256-GCM in `src/server/crypto.ts`, `requireOwner`, `setupTestDb()`. The only new runtime dependency needed is `@anthropic-ai/sdk` (already mandated by ADR-008). GitHub should be called with plain `fetch` + zod (a ~60-line client with ETag, pagination via `Link`, and rate-limit handling), not Octokit: nothing here needs a plugin ecosystem, and fewer deps is the project's stated bias.

The one genuinely hard design problem is **suspend/resume**. Do not keep a stream open or hold state in memory. Persist the full Anthropic `messages` array on the run (`agent_runs.messages` jsonb, or a `run_messages` table) after every turn, make the loop a pure function `advance(runId)` that loads state and runs until it either completes, hits a limit, or needs approval. An APPROVE-tier tool call writes an `approvals` row, writes a placeholder `tool_calls` row (status `waiting_approval`), sets the run to `waiting`, and returns. Approving enqueues a pg-boss `agent.resume` job (worker) which executes the tool with the (edited, re-validated) payload under an idempotency key, appends the `tool_result` to the messages, and calls `advance(runId)` again. Interactive turns stream tokens from the web process via a POST route handler; resumed turns run in the worker, and the client gets the final text from the SSE hub / refetch (no token stream needed there).

Pricing (verified from Anthropic's pricing page): Opus 5.5 $4 in / $20 out per MTok, Sonnet 5.5 $2 / $10, Haiku 4.5 $1 / $5; cache-write 5m = 1.25x input, cache-read = 0.05x input on Opus/Sonnet 5.5 and 0.1x on Haiku 4.5. These differ from what ADR text and older blog posts imply, so keep prices in one code table with a test, and store token counts (not just cost) so cost can be recomputed.

**Primary recommendation:** Persisted-messages resumable `advance(runId)` loop + single `callTool()` gateway function that is the only code path to handlers; stream via POST route handler (web), resume/sync/expiry via pg-boss (worker); GitHub via thin `fetch` client; add only `@anthropic-ai/sdk`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat streaming (token deltas, trace events) | API / Backend (route handler) | Browser (render) | Needs Anthropic key + session check; browser only renders NDJSON |
| Agent loop, tool gateway, policy | API / Backend (`src/server/agents`) | Worker (resume) | Same code runs in both processes via `advance(runId)` |
| Approval decision (approve/reject/edit) | API / Backend (server actions) | Worker (execute after approve) | Owner-guarded actions; execution off the request path via pg-boss |
| Approval expiry, GitHub sync, orphan-run sweep | Worker (pg-boss) | — | Scheduled, must not depend on a browser being open |
| Spend cap check + cost accounting | API / Backend (gateway pre-flight) | Database (SUM per Sydney month) | Must be enforced server-side before any LLM call |
| Token storage / decrypt | API / Backend + Worker | Database (ciphertext) | Plaintext only in-process, never to client |
| Live UI updates (runs, approvals, badges) | API (existing SSE hub) | Browser (`useLive`) | Reuse `emitActivity` + new NOTIFY kinds |
| Trace/approval rendering, edit form | Browser / Client | — | UI-SPEC components |
| Secret redaction in run detail | API / Backend | — | Redact before serialization to client |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.132.1 (npm, modified 2026-10-08) | Messages API, `messages.stream()`, tool use, usage fields, AbortSignal | Mandated by ADR-008; official SDK [VERIFIED: npm view; github.com/anthropics/anthropic-sdk-typescript README] |
| `pg-boss` | ^12.37.0 (installed) | sync schedule, `agent.resume`, `approval.expire` jobs | ADR-004, already running the heartbeat |
| `drizzle-orm` / `drizzle-kit` | installed | New tables + migration | Existing pattern (`drizzle/0000_init.sql`) |
| `zod` | ^4.6.5 (installed) | Tool input/output, edited-payload re-validation, GitHub response parsing, `z.toJSONSchema()` for Anthropic `input_schema` | Already used; zod 4 has built-in JSON Schema export so no `zod-to-json-schema` dep [ASSUMED: verify `z.toJSONSchema` output accepted by Anthropic in a Wave 0 spike] |
| Node `fetch`, `node:crypto` | Node 24 | GitHub client, encryption | Stdlib; no Octokit |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` + DB tests | installed | gateway/policy/cost/sync tests | All server logic |
| `@playwright/test` | installed | approval round trip e2e (with a fake LLM, see Validation) | One e2e |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fetch` GitHub client | `@octokit/rest` 22.0.1 | Adds paginate/throttle plugins; not needed for ~6 endpoints. Choose Octokit only if the thin client grows past ~100 lines |
| SDK `toolRunner` helpers | manual loop | Helpers hide exactly the gateway/suspend points ADR-008 says to own. Manual loop |
| Agent framework (Vercel AI SDK, LangGraph) | — | Rejected by ADR-008 |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

**Version verification:** `npm view @anthropic-ai/sdk version` → 0.132.1, `@octokit/rest` 22.0.1 (not adopted). Node v24.19.0 local.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| @anthropic-ai/sdk | npm | multi-year, published by Anthropic | very high | github.com/anthropics/anthropic-sdk-typescript | not run | Approved: named in ADR-008 and official docs/README [CITED: github.com/anthropics/anthropic-sdk-typescript] |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck not run; single first-party package already chosen by ADR-008).
**Packages flagged as suspicious [SUS]:** none. Planner: still run `npm view @anthropic-ai/sdk scripts.postinstall` before install (expect empty).

## Architecture Patterns

### System Architecture Diagram

```
Browser (AI panel) --POST /api/chat {threadId, prompt}--> [Route handler: session check, spend-cap/pause/key preflight]
                                                              |
                                              create agent_runs(status=running) + thread message
                                                              v
                                  advance(runId) in WEB process (streams NDJSON: step/delta/done events)
                                     |  load messages -> anthropic.messages.stream(model, tools=allowlist)
                                     |  text deltas -> NDJSON to browser
                                     |  tool_use blocks -> callTool()  <== ONLY path LLM -> app
                                     |        1 allow-list+paused? 2 zod in 3 policy(tier,permissions)
                                     |        READ/PREPARE/EXECUTE -> handler -> tool_calls row -> activity event
                                     |        delegate(agentId,task) -> child agent_run -> advance(child) (nested, same process)
                                     |        APPROVE/HIGH_RISK -> approvals row + tool_calls(waiting) + notification
                                     |                              run.status=waiting_approval, persist messages, RETURN
                                     v
                         done | limit | cancelled | waiting  ---> NOTIFY (hub) ---> SSE /api/events ---> /agents, /approvals, badges

Owner approves (panel card / /approvals / notification link) --server action decide()--> tx: approval pending->approved, enqueue
        |
        v
pg-boss queue agent.resume (WORKER): claim idempotency key -> execute handler with edited payload (GitHub write, write PAT)
        -> tool_result appended to messages -> advance(runId) (no client stream; final text saved + NOTIFY)
Reject / expiry -> approval rejected|expired, run cancelled, tool_result not sent, notification

pg-boss schedules (WORKER): github.sync (*/15), approval.expire (every 5 min, expires_at<now), run.sweep (running > max wall time + grace -> failed)
github.sync --fetch (read PAT, ETag)--> github_* tables --diff--> emitActivity (PR merged, review requested, CI failed -> IMPORTANT notification)
```

### Recommended Project Structure
```
src/server/agents/
  registry.ts        # static agent defs (all 10 + orchestrator), enabled flags, arrival labels, default models, prompts
  gateway.ts         # callTool(): the 6-step gateway; resolvePolicy() (pure)
  loop.ts            # advance(runId): Anthropic stream loop, limits, persistence, cancel checks
  pricing.ts         # MODEL_PRICES + costUsd(usage) (pure) + sydneyMonthBounds()
  spend.ts           # monthToDate(), assertUnderCap(), cap notification once/month
  approvals.ts       # createApproval, decide (tx), editPayload, expire, resume enqueue
  redact.ts          # redact secrets from tool inputs/outputs before client/DB display
  tools/github.ts    # github.* READ tools (DB-backed) + github.createIssue (APPROVE)
  tools/delegate.ts
src/server/github/
  client.ts          # fetch wrapper: auth, ETag, Link pagination, rate-limit/backoff
  sync.ts            # per-repo sync + diff -> events
  connections.ts     # token store (encrypt/decrypt, last4, expiry), verify on save
src/worker/jobs/     # sync.ts, resume.ts, expire.ts, sweep.ts registered in worker/index.ts
src/app/api/chat/route.ts   # POST, NDJSON streaming
src/app/(os)/agents/{page,[agentId]/page,runs/[runId]/page}.tsx, approvals/page.tsx, settings/page.tsx
src/agents/ src/approvals/ src/settings/   # UI components per UI-SPEC
```

### Pattern 1: Resumable loop (persisted messages)
**What:** `advance(runId, {onEvent, signal})` loads `agent_runs.messages`, loops: check cancel/pause/limits -> `client.messages.stream()` -> record usage+cost -> append assistant message -> for each `tool_use` call `callTool()` -> append one `user` message containing all `tool_result` blocks -> repeat until `stop_reason === "end_turn"`. If any call returned `{status:"waiting_approval"}`, still emit `tool_result` blocks for the other calls but **do not** append the pending one; set run `waiting`, persist, return.
**Critical API rule:** an assistant `tool_use` must be followed by a `user` message with matching `tool_result` for every `tool_use` id. On resume, build the result message containing the result (or a rejection/expiry text result) for the pending call plus any sibling results already computed. Simplest: when a tool call needs approval, return a **provisional** tool_result for siblings and hold the whole tool_result message until the approval resolves; store sibling results in `tool_calls.output`, and rebuild the result message from `tool_calls` rows on resume (deterministic).
Because rejecting/expiry cancels the run (UI-SPEC), the model is never resumed in those cases, so no dangling `tool_use` is ever re-sent. Only approve resumes.
**Example:**
```typescript
// Source: @anthropic-ai/sdk README (messages.stream) + docs/AGENTS.md gateway
const stream = client.messages.stream(
  { model, max_tokens: 4096, system: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }],
    tools, messages },
  { signal },
);
stream.on("text", (t) => onEvent({ k: "delta", text: t }));
const final = await stream.finalMessage();       // final.usage: input_tokens, output_tokens,
                                                  // cache_read_input_tokens, cache_creation_input_tokens
```

### Pattern 2: Single gateway function
`callTool(ctx, name, rawInput)`: (1) agent allow-list + agent/global paused + run cancelled; (2) `tool.input.parse`, then re-resolve any entity ids against the DB (repo must exist in `github_repos`; never trust LLM ids); (3) `resolvePolicy(tool.tier, permissionsRow)` where `HIGH_RISK` returns `HIGH_RISK` regardless of overrides (AGT-01) and an override may only raise or lower between READ..EXECUTE; (4) branch; (5) if `sideEffect`, compute idempotency key `sha256(runId + toolUseId)` (for approved executes: `approval:{id}`) and `insert ... on conflict do nothing returning`; duplicate returns stored output; (6) write `tool_calls`, `emitActivity`, validate output with zod.
**Tier of tools:** all `github.*` DB reads = READ; `github.getLive*` = READ; `github.createIssue` = **APPROVE** (D-01) with `sideEffect: true`; `delegate` = READ-tier internal.

### Pattern 3: Approval state machine
`approvals.status`: `pending -> approved -> executing -> executed | failed`, `pending -> rejected | expired | cancelled`. Every transition is a single conditional `UPDATE ... WHERE id=$1 AND status='pending' RETURNING` (compare-and-set); zero rows = already decided (double-click, two devices) and is a no-op. Columns: `original_payload`, `edited_payload` (nullable), `payload_hash`, `expires_at = created + 7d`, `decided_at`, `result jsonb`, `idempotency_key`. Edit (`DONE`) updates `edited_payload` only while pending, writes `audit_log` with both versions (D-04). Approve re-parses `edited ?? original` with the same zod schema server-side.

### Pattern 4: Streaming chat endpoint
Route handler `POST /api/chat` returning a `ReadableStream` of newline-delimited JSON (copy the style of the existing `src/app/api/events/route.ts`: session check -> 401, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`, `export const dynamic = "force-dynamic"`, abort handling). Use `fetch` + `ReadableStream` reader on the client (EventSource cannot POST). Client disconnect must **not** cancel the run (UI-SPEC: Esc/close leaves the run running): do not wire `request.signal` to the Anthropic call; wire it only to stop writing. Run cancellation is the DB flag. Next 16: verify `after()` (exists, `next/server`, confirmed in local docs) is only for side effects after the response; the loop itself should run inside the stream's `start`/`pull`, not `after`. [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md]
Dynamic route `params` is a `Promise` (`await params`) in this Next version [VERIFIED: local docs page.md]. `/agents/runs/[runId]` is a static `runs` segment beside `/agents/[agentId]`; the static segment wins.

### Pattern 5: GitHub sync
Per sync job: `GET /user` (login, token validity), `GET /user/repos?per_page=100&sort=pushed` (Link pagination) with ETag from `github_repos`/`sync_state`; for each repo: open+recently-closed PRs (`/repos/{r}/pulls?state=all&sort=updated&direction=desc&per_page=50`), reviews for PRs where review state may matter, issues (`/repos/{r}/issues?state=all&since=...` — note this endpoint also returns PRs; filter items with a `pull_request` key), commits on default branch (`/commits?per_page=20`), `/actions/runs?branch={default}&per_page=5`. Use conditional requests (`If-None-Match`; 304 does not consume rate limit). Upsert, diff old vs new state in-memory, `emitActivity` only for transitions (merged, review_requested, CI conclusion `failure` on default branch newly seen — dedupe by `run_id` stored). On 401: mark connection `error`, pause sync, IMPORTANT notification (once). On 403/429 with `x-ratelimit-remaining: 0` or `retry-after`: stop, record `last_error`, let the next schedule retry (pg-boss retry with backoff for transient 5xx).
Review requests: `requested_reviewers` on the PR object, matched against owner `login`.
Singleton: `boss.schedule("github.sync","*/15 * * * *")` plus `singletonKey` so overlapping runs are dropped; "Sync now" = `boss.send` with the same singleton key.

### Anti-Patterns to Avoid
- **Keeping the loop in a long-lived HTTP request only:** approval may come days later; state must be in the DB.
- **Trusting model-supplied repo names/ids:** resolve against `github_repos` before any call or approval preview.
- **Using the write token for reads or syncing:** D-02; separate decrypt helpers, write token only imported by the execute path.
- **Storing chain-of-thought:** only summaries, inputs, outputs (docs/AGENTS.md). If extended thinking is ever enabled, drop `thinking` blocks before persisting for display (they must still be round-tripped to the API within a tool-use turn; simplest is **do not enable thinking** in Phase 3).
- **Computing spend from the Anthropic dashboard or estimates:** record tokens from `usage` on every response, price at record time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue/schedule/retry | setInterval, custom cron table | pg-boss `schedule`/`send` with `singletonKey` | Already running; survives restarts |
| Secret encryption | new crypto | `src/server/crypto.ts` `encrypt/decrypt` | Exists, tested |
| Activity/notification fan-out | new pubsub | `emitActivity` + hub + `useLive` | Exists; add NOTIFY kinds `run`, `approval` only if needed |
| Input validation + JSON Schema for tools | handwritten schemas | zod 4 + `z.toJSONSchema` | Single source of truth |
| Time zone month bounds | manual UTC offset math | `Intl.DateTimeFormat`/`Temporal`-style helper in `src/server/time.ts` (check existing) with `Australia/Sydney` | DST (AEDT/AEST) breaks fixed offsets; unit test across the Oct and Apr transitions |
| Markdown renderer for answers | full markdown lib | UI-SPEC safe subset (paragraphs, `-` lists, `code`, citation chips) parsed to React nodes, no `dangerouslySetInnerHTML` | Untrusted text; tiny parser |
| SSE | new transport | existing `/api/events` | Exists |

**Key insight:** the gateway, resume state and idempotency are the product here; everything else is reuse.

## Runtime State Inventory

Not a rename/refactor phase. Omitted. (Note: replaces literals "0 running"/"0 waiting" on Home and sidebar badge with real counts, code-only.)

## Common Pitfalls

### Pitfall 1: GitHub issue creation is not idempotent
**What goes wrong:** timeout after GitHub created the issue -> retry creates a duplicate.
**Why:** `POST /repos/{o}/{r}/issues` has no idempotency header.
**How to avoid:** claim `approval:{id}` via unique key (state `executing`) before the call; append hidden marker `<!-- lifeos-approval:{id} -->` to the body; on retry after an ambiguous failure (network error/5xx, not a 4xx) first `GET /repos/{o}/{r}/issues?creator={login}&state=all&since=...` and look for the marker, adopting the existing issue instead of re-posting. Store `result {number,url}`. 4xx = definite failure, retry allowed with the same key.

### Pitfall 2: tool_use / tool_result pairing errors
**What goes wrong:** API 400 `tool_use ids were found without tool_result blocks`. **Avoid:** build the result message from persisted `tool_calls` rows keyed by `tool_use_id`; unit test the message builder with pending + sibling calls.

### Pitfall 3: Cap enforcement race and in-flight runs
Check cap before **starting** a run and before each **delegate** child run? D-15 says in-flight finish; so check only at run creation (including retry) and at resume? Resume is the same run, so allow. A single run can overshoot the cap, bounded by per-run limits; accept and document. Fire the URGENT notification once per month (dedupe key `spend_cap:{yyyy-mm}` in `settings`).

### Pitfall 4: Sydney month boundary
Use month bounds computed in `Australia/Sydney`; query `agent_runs`/`usage` rows by `started_at >= start AND < next`. Store `cost_usd` as `numeric(12,6)` (not float) and tokens as integers.

### Pitfall 5: Fine-grained PAT introspection is limited
`x-oauth-scopes` is not returned for fine-grained tokens, so "detected scopes" (D-09) and the UI-SPEC "token can do more than create issues" warning **cannot be reliably detected**. Expiry is available via the `github-authentication-token-expiration` response header on authenticated requests [ASSUMED — training knowledge; verify with a real token in Wave 0]. Plan: detect effective repos (`GET /user/repos` / `GET /installation`-like not available), show `read-only` / `issues: write` as the **intended** use, derive "has access" by attempting a harmless GET, and show scope warning only if a probe proves extra permission (probably drop the warning; raise as Open Question 1).

### Pitfall 6: Prompt injection via GitHub content
Issue/PR titles and bodies are untrusted and flow into model context. Mitigations: wrap tool outputs in clearly delimited data blocks; system prompt states tool results are data not instructions; the only side effect is APPROVE-gated with a human-readable preview showing exactly what is sent (this is the real defense); render everything escaped; truncate bodies (e.g. 2k chars) in tool outputs.

### Pitfall 7: Orphaned runs on restart
Web process restart mid-loop leaves `running` runs forever. `run.sweep` job marks runs with `status=running` and `heartbeat_at` older than N minutes as `failed (interrupted)`; loop updates `heartbeat_at` each turn. `waiting_approval` runs are not swept.

### Pitfall 8: Streaming through Next/proxy compression
Copy the SSE route headers (`no-transform`); verify in the **production build** (e2e runs prod build on 3100). The `src/proxy.ts` CSP is `connect-src 'self'`, fine for same-origin fetch.

### Pitfall 9: Cost accuracy and the new tokenizer
4.7+ models produce ~30% more tokens for the same text [CITED: pricing page]; cap math must use actual `usage`, never char-count estimates. Cache-read multiplier differs by model (0.05x Opus/Sonnet 5.5, 0.1x Haiku 4.5): store per-model price rows rather than a global multiplier.

### Pitfall 10: Secrets leaking into logs/run records
`pino` already redacts; additionally `redact.ts` strips keys matching `/token|authorization|secret|password|key/i` from stored tool input/output and never passes decrypted tokens through tool inputs (tools fetch the token internally).

## Code Examples

### Price table and cost
```typescript
// Source: platform.claude.com/docs/en/about-claude/pricing (fetched 2026-10-08), $ per MTok
export const PRICES = {
  "claude-opus-5-5":           { in: 4,  out: 20, w5m: 5,    read: 0.20 },
  "claude-sonnet-5-5":         { in: 2,  out: 10, w5m: 2.5,  read: 0.10 },
  "claude-haiku-4-5-20251001": { in: 1,  out: 5,  w5m: 1.25, read: 0.10 },
} as const;
export const costUsd = (m: keyof typeof PRICES, u: { input: number; output: number; cacheWrite: number; cacheRead: number }) => {
  const p = PRICES[m];
  return (u.input * p.in + u.output * p.out + u.cacheWrite * p.w5m + u.cacheRead * p.read) / 1e6;
};
```
Note `usage.input_tokens` excludes cache read/creation tokens (they are separate fields), so the sum above does not double count [ASSUMED: matches Anthropic usage semantics; add a unit test with a recorded fixture].

### Compare-and-set decision
```typescript
const [row] = await tx.update(approvals).set({ status: "approved", decidedAt: new Date() })
  .where(and(eq(approvals.id, id), eq(approvals.status, "pending"), gt(approvals.expiresAt, new Date())))
  .returning();
if (!row) return { ok: false, reason: "not_pending" };
await boss.send("agent.resume", { approvalId: id }, { singletonKey: `resume:${id}` });
```
(Enqueue via pg-boss in the same transaction if its `db` option is used with the Drizzle pool, otherwise enqueue after commit and rely on an `approved`-but-not-executing reconciliation in `run.sweep`.)

### Run limits (discretion defaults)
Max tool calls 12, max tokens 60k (in+out per run), max wall time 120s of active time (excluding approval wait). UI-SPEC already shows `12 / 60k / 120s`. Per-turn `max_tokens` 4096. Hitting a limit ends the run `failed` with reason `limit:tool_calls|tokens|time` so the UI "Run limit hit" error maps 1:1.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Older Opus $5/$25, cache read 0.1x | Opus 5.5 $4/$20, cache read 0.05x | 5.5 release | Use the verified table above |
| `x-oauth-scopes` for PAT scopes | Fine-grained PATs have no scope header | — | Cannot show detected scopes (Pitfall 5) |
| Agent frameworks | Own gateway + SDK | ADR-008 | Manual loop |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `z.toJSONSchema()` output is accepted as Anthropic `input_schema` | Standard Stack | Small adapter needed (strip `$schema`); spike in Wave 0 |
| A2 | `github-authentication-token-expiration` header present for fine-grained PATs | Pitfall 5 | Expiry display shows "unknown" |
| A3 | Fine-grained PATs expose no scope header; permission detection unreliable | Pitfall 5 | If detectable, add warning; UI-SPEC D-09 "detected scopes" partially unmet |
| A4 | `usage.input_tokens` excludes cache fields (no double counting) | Code Examples | Cost overstated; fixture test catches |
| A5 | GitHub list-issues endpoint includes PRs (filter on `pull_request`) and `/user/repos` works with fine-grained PAT | Pattern 5 | Sync shape adjustments |
| A6 | Haiku 4.5 id `claude-haiku-4-5-20251001` (given by orchestrator brief) | Code Examples | Wrong id = 404 only if Haiku is used (titling deferred, so Haiku likely unused this phase) |
| A7 | Sonnet 5.5 / Opus 5.5 ids `claude-sonnet-5-5` / `claude-opus-5-5` | Code Examples | Per ADR-008 and brief; verify first live call |
| A8 | Anthropic prompt caching min size (~1-4k tokens) means small system prompts may not cache | Pattern 1 | Cache just no-ops; harmless |

## Open Questions

1. **Detected PAT scopes (D-09 / UI-SPEC "can do more than create issues")**
   - Known: fine-grained tokens expose no scope header.
   - Unclear: whether a reliable probe exists.
   - Recommendation: show verified facts only (login, last4, repo count, expiry if header present); drop the over-permission warning; note in plan.
2. **Where resume-run text is surfaced when the panel is closed**
   - Recommendation: persist assistant message to the thread, emit NOTIFY `run`; panel refetches thread on open/SSE event; notification of category AGENT optional (FYI).
3. **Orchestrator delegation depth**
   - Recommendation: one level only (orchestrator -> Projects agent); child run is its own `agent_runs` row (`parent_run_id`) so Command Centre shows both; child tokens/cost counted in the month sum; parent limits apply to total tool calls.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | yes | 24.19.0 | — |
| npm registry | install SDK | yes | — | — |
| Docker | local Postgres for DB tests | yes | 29.6.1 | — |
| Postgres | DB tests (`TEST_DATABASE_ADMIN_URL` default `localhost:5433`) | not verified (`pg_isready` absent on PATH) | — | start via docker compose before tests |
| Anthropic API key | live LLM | unknown (`ANTHROPIC_API_KEY` not in `env.ts` schema yet) | — | tests use a fake client; add as **optional** env (app boots without it, UI shows NOT CONNECTED) |
| GitHub PATs | live sync | user-supplied via Settings | — | tests use fake `fetch` |

**Missing with no fallback:** none for planning. Live acceptance (success criterion 1) needs a real Anthropic key and read PAT: a human-verify checkpoint.
**Note:** `env.ts` must gain `ANTHROPIC_API_KEY: z.string().min(1).optional()`; FND-04 "fail fast" must not make it required, because UI-SPEC defines a no-key state.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^5.0.3 (+ `setupTestDb()` throwaway Postgres), Playwright ^1.63 e2e (prod build, port 3100, `lifeos_e2e` DB) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npx vitest run tests/unit tests/db/<file>` |
| Full suite command | `npm run typecheck && npm run lint && npm test && npm run e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGT-01 | `resolvePolicy`: HIGH_RISK never lowered by permissions; allow-list, paused, zod rejection | unit | `npx vitest run tests/unit/policy.test.ts` | Wave 0 |
| AGT-01 | gateway rejects tool not in agent allow-list; ids not in DB | db | `npx vitest run tests/db/gateway.test.ts` | Wave 0 |
| AGT-02 | APPROVE call creates approval + suspends; approve resumes once; reject/expire cancel run, nothing executes | db (fake LLM + fake GitHub fetch) | `npx vitest run tests/db/approvals.test.ts` | Wave 0 |
| AGT-02 | concurrent approve (two calls) executes once | db | same file | Wave 0 |
| AGT-03 | duplicate idempotency key returns stored result; ambiguous-failure retry adopts existing issue via marker | db | `npx vitest run tests/db/idempotency.test.ts` | Wave 0 |
| AGT-04 | loop streams deltas, emits trace steps, delegates to Projects agent, tool_result pairing correct | db with scripted fake Anthropic stream | `npx vitest run tests/db/loop.test.ts` | Wave 0 |
| AGT-04 | NDJSON endpoint 401 without session; streams events | e2e/db | `npm run e2e -- chat.spec.ts` | Wave 0 |
| AGT-05 | cost calc per model incl. cache; Sydney month bounds across DST; cap blocks new run, not in-flight | unit + db | `npx vitest run tests/unit/pricing.test.ts tests/db/spend.test.ts` | Wave 0 |
| AGT-05 | pause/cancel/retry state transitions; sweep marks orphaned runs | db | `npx vitest run tests/db/runs.test.ts` | Wave 0 |
| AGT-06 | sync upserts repos/PRs/issues/CI from recorded GitHub fixtures; 304 handling; diff emits events once; 401 pauses | db with fake fetch | `npx vitest run tests/db/github-sync.test.ts` | Wave 0 |
| D-09 | token stored encrypted, only last4 exposed; write token never used for reads | db/unit | `npx vitest run tests/db/connections.test.ts` | Wave 0 |
| UI | approvals/agents/settings pages a11y + approve flow | e2e (fake LLM via env `LIFEOS_FAKE_LLM=1` test-only seam) | `npm run e2e -- approvals.spec.ts` | Wave 0 |
| Success 1/3 | real answer citing real repos | manual (live key + PAT) | human-verify checkpoint | manual-only: needs real credentials |

### Sampling Rate
- **Per task commit:** relevant `npx vitest run <file>` (< 30s)
- **Per wave merge:** `npm run typecheck && npm test`
- **Phase gate:** full suite green + live manual check before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Test seam: injectable `LlmClient` interface (`stream(params)`) and injectable `fetch` for GitHub, so no network in tests; scripted-stream helper in `tests/db/helpers.ts`
- [ ] Recorded GitHub JSON fixtures under `tests/fixtures/github/`
- [ ] Test files listed above; `tests/e2e/prepare-db.ts` seeds agents registry
- [ ] Spike: one live Anthropic call with a zod-derived tool schema (A1, A4) and live GitHub `GET /user/repos` with a fine-grained PAT (A2, A3, A5)

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Better Auth session; `/api/chat` checks session like `/api/events` |
| V3 Session Management | yes (inherited) | existing cookies |
| V4 Access Control | yes | `requireOwner` on every server action; approval decide via compare-and-set; T-02-45 (server actions behind Tailscale proxy) applies |
| V5 Input Validation | yes | zod on every tool input, edited approval payload, token form, spend cap (1..1000), chat prompt length cap (e.g. 8k chars) |
| V6 Cryptography | yes | AES-256-GCM via existing `crypto.ts`; never log/echo tokens |
| V7/V8 Logging, Data protection | yes | `redact.ts`; audit_log for edits/decisions/token changes; no chain-of-thought stored |
| V13 API | yes | Chat route: 401 JSON, body size cap, rate-limit runs per minute (cheap DB count) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection from issue/PR text | Tampering/EoP | Data-delimited tool results; only APPROVE-gated writes; readable preview; escaped rendering |
| LLM-supplied repo/id spoofing | Spoofing/EoP | Re-resolve ids in DB; write only to repos present in `github_repos` and token-accessible |
| Approval replay/double submit | Tampering | Compare-and-set + idempotency key |
| Editing payload after approval prepared | Tampering | Re-validate zod at approve; hash recorded; audit both versions |
| Token exfiltration via tool I/O, logs, client | Info disclosure | Server-side redaction; tokens never in tool inputs/outputs or DTOs; only last4 sent |
| Runaway spend | DoS/Cost | Per-run limits + monthly cap preflight + Anthropic-side console limit recommended |
| XSS via agent/GitHub text | Tampering | No raw HTML; CitationChips only for validated `https://github.com/...` via `isSafeUrl` |
| SSRF via GitHub client | SSRF | Client only builds `https://api.github.com/` URLs from fixed templates; Link-header next URLs must be checked to share that origin |
| CSRF on chat POST | CSRF | SameSite=Lax cookie + require `Content-Type: application/json` + Origin check |

## Sources

### Primary (HIGH confidence)
- platform.claude.com/docs/en/about-claude/pricing (fetched 2026-10-08): model prices, cache multipliers
- github.com/anthropics/anthropic-sdk-typescript README: `messages.stream`, usage cache fields, AbortSignal, `max_tokens` required
- Local repo: `src/server/{events,crypto,env,hub}.ts`, `src/worker/index.ts`, `src/app/api/events/route.ts`, `src/proxy.ts`, `tests/db/helpers.ts`, `docs/AGENTS.md`, ADR-004/007/008
- Local Next docs: `after.md`, `page.md` (params is a Promise)
- npm registry: `@anthropic-ai/sdk` 0.132.1, `@octokit/rest` 22.0.1

### Secondary (MEDIUM)
- Web search pricing roundups (superseded by official page)

### Tertiary (LOW, from training; see Assumptions A2, A3, A5)
- GitHub REST behaviors (ETag/304 not counting toward limits, fine-grained PAT headers, issues endpoint including PRs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, one new dep, mandated
- Architecture: MEDIUM-HIGH, patterns derived from repo + docs/AGENTS.md; resume design is original reasoning
- Pitfalls: MEDIUM, GitHub specifics need a live spike

**Research date:** 2026-10-08
**Valid until:** 2026-11-08 (model/pricing fast-moving)
