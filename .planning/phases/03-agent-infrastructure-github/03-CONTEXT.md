# Phase 3: Agent infrastructure + GitHub - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

The orchestrator answers real questions about real GitHub data, with every tool call observable and every risky action gated. Delivers: tool gateway with tiers (READ/PREPARE/APPROVE/EXECUTE/HIGH_RISK), approvals that suspend and resume runs, idempotent side effects, orchestrator chat wired into the Phase 2 AI panel (streaming + execution trace), the Agent Command Centre, and a GitHub integration (read sync + one approval-gated write). Requirements AGT-01..06.

Success criteria (ROADMAP): (1) "What's happening in my repos?" streams an answer citing real repos/PRs; (2) a PREPARE→APPROVE action shows in Approvals and only runs after approval; (3) the Command Centre shows runs with tokens, cost, latency, tool calls.

Not in scope: any other domain agent doing real work (Career, Organization, Socials, … arrive in their own phases), calendars/email, Knowledge/memory beyond conversation threads, webhooks/public endpoints.

</domain>

<decisions>
## Implementation Decisions

### Approval-gated action
- **D-01:** The first real PREPARE→APPROVE action is **create a GitHub issue** (repo, title, body, optional labels). Approval actually creates it on GitHub.
- **D-02:** Two GitHub tokens: the **read PAT** (fine-grained, read-only) for all reads/sync, and a separate **issues-write PAT** (fine-grained, Issues: write on chosen repos only) used solely by the approved create-issue tool. Reads never use the write token. If the write token is absent, the tool is unavailable and the UI says so.
- **D-03:** Approve/reject is available **everywhere**: the Approvals page (design ApprovalDetail), an inline approval ResultCard in the AI panel conversation, and an APPROVAL-category notification linking to it (Phase 2 notification system).
- **D-04:** The prepared payload is **editable before approving** (e.g. issue title/body/labels). The approval record and audit log keep both the agent's original and the owner-edited version; the executed payload is the edited one, re-validated with zod on approve.
- **D-05:** Pending approvals **expire after 7 days**: status expired, the suspended run is cancelled with a clear status, and an FYI notification is sent. Nothing executes after expiry.

### GitHub scope & sync
- **D-06:** Repo visibility = **whatever the read PAT grants**. No second allow-list in LifeOS; Settings shows the effective repo list.
- **D-07:** **Periodic worker sync (~15 min, pg-boss)** stores repos, PRs (+ reviews / review requests), issues (assigned to or opened by owner, labels), recent commits/push activity, and latest CI/Actions run status in Postgres. Sync emits activity events for meaningful changes (e.g. PR merged, review requested, CI failed). Agents read primarily from the DB; a live-read tool may fetch fresh detail on demand.
- **D-08:** v1 GitHub data: **PRs + reviews, Issues, Commits + activity, CI/Actions status**. A failed CI run on a default branch → IMPORTANT notification.
- **D-09:** Tokens are entered in a **Settings → Connections** section (design ConnectionRow), stored **AES-256-GCM encrypted** per ADR-007, never shown again (only last 4 chars + detected scopes/expiry), rotatable without redeploy. Connection status (connected / error / last sync) is visible there. The Anthropic API key stays in `.env` per ADR-007.

### Chat & conversations
- **D-10:** Conversations are **saved threads**. The AI panel's new-chat button starts a new thread; a recent-threads list in the panel reopens old ones. Agents see prior turns within a thread.
- **D-11:** Chat lives in the **AI panel only** (⌘J drawer; full sheet on mobile per design M2), reached from the command bar and the palette's "Ask LifeOS" row. No separate chat page. This replaces the Phase 2 "not connected" InlineError (D-05 of Phase 2).
- **D-12:** The chat shows the design's **ExecutionTrace live** (queued → running → done with durations; delegate + tool steps) with **expandable input/output summaries** per tool step. Full raw detail lives in the Command Centre. Answers stream.
- **D-13:** **All domain agents are registered** in the agent registry now (Home, Career, Social, Outreach, Organization, Projects, Knowledge, Goals, Finance, AgentOps per docs/AGENTS.md). Only the **orchestrator and a GitHub (Projects) domain agent are live**; the rest are disabled and labelled honestly (e.g. "Not connected · arrives in Phase N"), with no fake runs or stats. The orchestrator delegates GitHub questions to the GitHub agent (proves AGT-04 delegation).

### Cost & guardrails
- **D-14:** **Monthly spend cap**, default **US$20**, editable in Settings. Spend = recorded input/output (and cache) tokens × per-model price, summed per calendar month (Australia/Sydney). The Command Centre shows month-to-date vs cap.
- **D-15:** At the cap: **new runs are blocked** with an InlineError explaining why and an **URGENT notification**; in-flight runs finish. Raising the cap in Settings unblocks immediately.
- **D-16:** Orchestrator default model **Opus 5.5** (`claude-opus-5-5`) per ADR-008; domain agents Sonnet 5.5; triage Haiku 4.5. Model is changeable per agent from the Command Centre.

### Claude's Discretion
- Per-run safety limits (max tool calls / tokens / wall time per run) — pick sensible defaults and surface them in the run record.
- Exact sync interval tuning, GitHub rate-limit handling and backoff, pagination depth / history window.
- Thread list size, thread titling (e.g. first prompt or Haiku-generated title).
- Command Centre pause/resume/retry/cancel semantics within AGT-05 (follow docs/AGENTS.md runtime-state model).
- Which tool tier each GitHub read/live tool gets (reads are READ; create-issue is APPROVE).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Agent architecture
- `docs/AGENTS.md` — agent contract, Tool type, tool gateway steps (allow-list, zod, policy, approvals, idempotency, tool_calls), orchestrator loop, domain agent list, observability (summaries, no chain-of-thought)
- `docs/decisions/ADR-008-llm.md` — Anthropic SDK directly, own gateway, per-agent model defaults, prompt caching
- `docs/decisions/ADR-004-pg-boss.md` — job queue (sync jobs, approval resume jobs, expiry)
- `docs/decisions/ADR-005-event-system.md` — activity_events + LISTEN/NOTIFY (sync and agent events reuse Phase 2 `emitActivity`)

### Secrets & integrations
- `docs/decisions/ADR-007-secrets.md` — `.env` for Anthropic key; AES-256-GCM for integration tokens under `LIFEOS_MASTER_KEY`
- `docs/decisions/ADR-010-providers.md` — capability providers + labelled mocks (honest "not connected" states)

### Design
- `design/Agents.dc.html` — Agent Command Centre, agent detail, execution trace
- `design/Approvals.dc.html` — approval queue + ApprovalDetail
- `design/Mobile Layouts.dc.html` — M2 AI sheet, M3 approval, M4 agents
- `design/LifeOS.dc.html` — AI panel (ExecutionTrace, ResultCard incl. approval variant, composer)
- `design/Settings.dc.html` — ConnectionRow / connections section
- `design/INVENTORY.md` — component inventory and design notes

### Prior phase
- `.planning/phases/02-shell/02-CONTEXT.md` — shell decisions (AI panel shell, notifications categories incl. APPROVAL, honest empty states, no placeholder data)
- `.planning/phases/02-shell/02-SECURITY.md` — T-02-45 (server actions behind Tailscale proxy) still applies to new server actions

### Requirements
- `.planning/REQUIREMENTS.md` — AGT-01..06
- `.planning/ROADMAP.md` — Phase 3 goal + success criteria; prerequisites (Anthropic API key, GitHub fine-grained PAT)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/events.ts` (`emitActivity`) + `src/server/hub.ts` (LISTEN hub) + `/api/events` SSE + `src/shell/live-provider.tsx` (`useLive`): stream agent/run/approval/sync events to the client.
- `src/server/notifications.ts` + `notification-actions.ts`: APPROVAL / URGENT / IMPORTANT / FYI notifications (cap reached, CI failed, approval pending/expired).
- `src/shell/ai-panel.tsx`, `command-bar.tsx`, `palette.tsx` ("Ask LifeOS" row): UI shell to wire to the orchestrator.
- `src/ui/*` primitives (Button, Badge, StatusTile, EmptyState, InlineError, Skeleton, PageHeader, SectionHeader), `src/shell/domain-page.tsx`; `/agents` and `/approvals` pages currently placeholders.
- Home status tiles (`src/app/(os)/page.tsx`) show literal "0 running" / "0 waiting" — wire to real counts.
- `src/server/auth.ts` `requireOwner`, `src/lib/safe-url.ts` `isSafePath`, audit log table.

### Established Patterns
- Server actions owner-guarded + zod validated; API routes check session and return 401.
- Worker process (`src/worker/index.ts`) with pg-boss; heartbeat/monitor pattern in `src/server/monitor.ts`.
- DB-backed tests via `setupTestDb()` (tests/db/helpers.ts); e2e on prod build port 3100 with `lifeos_e2e` DB.
- No placeholder data; honest empty / not-connected states.

### Integration Points
- New tables (per docs/AGENTS.md): agents, agent_tasks, agent_runs, tool_calls, approvals, permissions, plus conversation threads/messages, github_* sync tables, integration credentials, spend tracking.
- Settings page gains Connections + spend cap; sidebar Approvals badge (currently literal 0) becomes real.

</code_context>

<specifics>
## Specific Ideas

- Approving must feel safe: readable preview of exactly what will be created on GitHub, edit-before-approve, and a clear expired/rejected/cancelled state on the run.
- Disabled agents must be honest — listed with when they arrive, never with fabricated runs, costs or activity.

</specifics>

<deferred>
## Deferred Ideas

- Other GitHub write actions (PR comments, labels, closing issues) — future phase, each behind approval.
- GitHub webhooks for real-time updates — needs a public endpoint/relay; conflicts with Tailscale-only constraint for now.

</deferred>

---

*Phase: 03-agent-infrastructure-github*
*Context gathered: 2026-10-08*
