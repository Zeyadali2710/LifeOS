# Agents

Status: **implemented (Phase 3).** Orchestrator and Projects agent are live; the other nine domain agents are registered but show NOT CONNECTED until their phase.

## Contract
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
