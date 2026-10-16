# Agents

Status: Orchestrator, Projects, Organization, Outreach, Social, Finance, Knowledge and Goals are live, plus the system Automations agent (no model). Other registry entries remain NOT CONNECTED until implemented.

## Contract

Finance (`finance`) manages `/finances`: private READ tools `finance.overview`, `finance.list_merchants`, `finance.list_transactions`, and HIGH_RISK `finance.update` for one composite category/rule/transaction/budget proposal. The orchestrator delegates finance requests to it. It uses paid models only and has no tools that move money. Full merchant-page coverage, source snapshot checks, owner review, atomic execution and retry adoption protect bulk changes; see `finances.md`.

Knowledge (`knowledge`) answers from `/knowledge` with READ tools `knowledge.search` (keyword, or semantic when the owner enabled it) and `knowledge.get`. Paid models only; knowledge data is hard-private and untrusted. It cannot write items yet.

Goals (`goals`) explains `/goals` with one READ tool, `goals.overview` (vision, goals, objectives, progress, momentum, neglect, linked projects, optional open tasks). It cannot change goals yet. See `knowledge-goals.md`.

Automations (`automations`) is a system agent with no model: the automation engine executes the owner's configured actions as its gateway tool calls (`automation.notify`, `automation.create_task`, `automation.ask_agent`). It cannot be delegated to or chatted with. Pausing it pauses all automations. See `automations-briefings.md`.
Every agent is a registry entry plus a set of tools:

| Field | Meaning |
|---|---|
| `id`, `name`, `purpose` | Identity |
| `model` | Anthropic model id (configurable per agent) |
| `systemPrompt` | Versioned in code; overrides stored in `agents` table |
| `tools[]` | Names of tools the agent may call (allow-list) |
| `schedule?` | Optional cron (pg-boss) |
| `enabled` / `paused` | Operator control from Agent Command Centre |

Runtime state lives in tables, not in the agent: `agent_runs` (one LLM loop execution: status, tokens, cost, latency, summary, error), `tool_calls` (input, output, tier, decision, duration), `approvals`. Queued work is an `agent_runs` row with status `queued`; delegated child runs link back via `parentRunId` (there is no `agent_tasks` table).

## Tools
```ts
type Tool<I, O> = {
  name: string;               // dotted in LifeOS, e.g. "github.get_pull_request"; sent to Anthropic with underscores (github_get_pull_request)
  description: string;
  input: ZodSchema<I>;
  output: ZodSchema<O>;
  tier: 'READ' | 'PREPARE' | 'APPROVE' | 'EXECUTE' | 'HIGH_RISK';
  sideEffect: boolean;        // external or destructive effect
  handler(input: I, ctx: ToolContext): Promise<O>;
};
```
Tools are thin wrappers over application services. They never take raw SQL or arbitrary entity mutation.

## Tool gateway (the only path from LLM → app)
1. Agent allowed this tool? Agent paused? → else reject.
2. Validate input with zod. Re-resolve every entity id against the DB for the owner (never trust LLM ids).
3. Resolve effective policy: tier default ← `permissions` overrides. `HIGH_RISK` cannot be lowered.
4. `READ`/`PREPARE`/`EXECUTE` → run handler. `APPROVE`/`HIGH_RISK` → create `approvals` row with a human-readable preview, suspend run, notify. Approval enqueues a resume job.
5. Side-effecting calls require an idempotency key (unique index); duplicates return the stored result.
6. Record a `tool_calls` row and validate output with zod. Activity events are emitted for run completion, approvals and cancellations, not per tool call.

## Orchestrator
The conversational entry point. Tools: cross-domain READ tools + `delegate(agentId, task)`.
Loop: understand → pick domains → read context → answer directly or delegate → collect child run results → resolve conflicts → request approvals → concise answer with links to LifeOS entities.

## Domain agents
Home · Career · Social · Outreach · Organization · Projects · Knowledge · Goals · Finance (READ/PREPARE only, no transaction tools exist) · AgentOps.

## Observability, not chain-of-thought
Each run stores a short **execution summary** and the list of tool calls. Hidden reasoning is never stored or shown.

## Memory
DB is the source of truth. Context is assembled per call by deterministic retrieval (preferences, facts, relevant entities, recent events, optional semantic search). AI-generated observations live in their own table and are labelled as AI-generated.

## Phase 3 behaviour
- **Delegation** is one level deep: orchestrator -> Projects agent, as a child `agent_runs` row (`parentRunId`).
- **Run limits** per run: 12 tool calls, 60k tokens, 120s of active time. Hitting one ends the run with a limit error.
- **Approvals**: `github.create_issue` is APPROVE tier. The run suspends as `waiting_approval`; the owner edits (re-validated server-side), approves or rejects. Approval resumes the run through a queued job and creates the issue once (idempotency key, plus a hidden marker that adopts an issue created before a crash). Approvals **expire after 7 days**; expiry cancels the run.
- **Spend cap**: monthly cap in USD (default US$20, Settings -> AI and spend, Sydney calendar month). Month-to-date cost is summed from `agent_runs`. At the cap new runs are blocked, running work finishes, and one URGENT notification is raised per month.
- **Pause**: per agent or all runs from the Command Centre; paused agents reject new runs.

## Model routing (Phase 3.1)
- **Tier tag.** `delegate(agentId, task, tier)` carries `simple` or `reasoning`. The tag is set by the orchestrator (Opus, trusted) and is never taken from user or tool text.
- **Picker.** Routable agents (Projects) offer Auto / Free only / Sonnet / Opus. Auto and Free only need an OpenRouter key. The orchestrator is locked to Opus.
- **Auto.** `simple` goes to the free model (`OPENROUTER_FREE_MODEL`, `:free`); `reasoning` goes to Sonnet.
- **Fallback.** A free turn gets one transient retry, then the run switches once and permanently to Sonnet ("Fell back -> Sonnet", with a reason code such as `http 4xx`). A failing free provider triggers a 5 minute cooldown, per process.
- **Escalate.** In Auto runs the free model has an `escalate` pseudo-tool; deterministic sanity checks (invalid tool call, empty, no tool use, unsupported ref, tool markup, repeat, truncated) also switch to Sonnet. The dropped free turn is never added to history, but it is billed in `run_turns`. Text already streamed from a dropped free turn is not retracted in the UI.
- **Free only** never falls back: it fails the run (`free_unavailable` or `private_blocked`) with a FAILED route step.
- **Pricing.** Each LLM turn is stored in `run_turns` and priced with the model that served it; `:free` models cost US$0. The spend cap (D-15) applies to all runs. Settings -> AI and spend groups by turn model.
- **Visibility.** Route steps (Routed / Fell back / Escalated / Switched / Failed) appear in run detail, the latest run on the agent page and reloaded threads (after the tool steps). Runs show a FREE/SONNET/OPUS chip; the Command Centre shows free vs paid counts.

## Projects agent: LifeOS projects (Phase 5)
Tools: `projects.list`, `projects.get` (both READ, Projects agent, reachable from the orchestrator by delegation). Output is bounded (list <= 50, tasks <= 50, milestones <= 30, strings cut) and never includes the workspace path, machine label, launch command or context brief. Output marks the run private (free models never see it unless `ai.free_private_ok` is on). 
### Repo contents and project writes (Phase 5.1)
Tools now also include `github.list_tree`, `github.get_file` (READ) and `projects.create`, `projects.update` (APPROVE, private). The orchestrator delegates repo-based project drafting to the Projects agent and reasons about tiers; delegate child time is excluded from the orchestrator's active time. Per-agent limits: Projects agent 16 tool calls / 150k tokens / 8192 per turn / 240 s; other agents keep RUN_LIMITS. One approval creates or updates the complete project (milestones, tasks, links) in a single transaction; no agent deletes anything this phase.

## Organization agent (Phase 4)
Live. Tools: `calendar.list_events`, `calendar.find_free_slots`, `calendar.detect_conflicts`, `tasks.list` (READ), `calendar.create_event`, `calendar.update_event` (APPROVE), `calendar.delete_event` (HIGH_RISK). Tasks are READ-only for the agent. No tool can create recurring events. Every system prompt carries a Sydney "Current time" line. Calendar tool output marks the run private, so free models never see it unless `ai.free_private_ok` is on. Tiers: `permissions.md`.

## Outreach agent (Phase 6)
Live. Model: Sonnet, **not routable** (never a free model: mail must not reach one). Tools: `outreach.list_events`, `outreach.get_event`, `mail.list`, `mail.get_message` (READ) and `mail.send_reply` (APPROVE). It cannot change the pipeline, create tasks, archive or flag mail; those are owner actions in the UI. Event and mail tool output is third-party text and is treated as untrusted data in the system prompt.

- **Draft with agent** sends `Draft a reply to email {id}` through the normal chat/run plumbing. The orchestrator delegates to the Outreach agent with `tier: reasoning`; the agent reads the message and calls `mail.send_reply` once, which suspends the run as `waiting_approval`.
- **Triage** is a pg-boss job, not a chat run: Haiku classifies, summarises, flags and extracts action items for new INBOX mail (batches of 10, bodies fetched live and discarded). Bulk or promotional mail is classed by rules and never sent to the model. Each batch is recorded as a run and counts against the monthly spend cap; at the cap triage pauses (`mail.triage_paused`), mail keeps syncing with its snippet, and it resumes automatically.
- **Orchestrator** delegates email, inbox and Sydney-events questions to the Outreach agent.
