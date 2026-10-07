# Agents

Status: **designed (Phase 0), implemented in Phase 3.**

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

Runtime state lives in tables, not in the agent: `agent_tasks` (queued work), `agent_runs` (one LLM loop execution: status, tokens, cost, latency, summary, error), `tool_calls` (input, output, tier, decision, duration), `approvals`.

## Tools
```ts
type Tool<I, O> = {
  name: string;               // e.g. "github.listPullRequests"
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
6. Record `tool_calls` row + activity event. Validate output with zod.

## Orchestrator
The conversational entry point. Tools: cross-domain READ tools + `delegate(agentId, task)`.
Loop: understand → pick domains → read context → answer directly or delegate → collect `agent_tasks` results → resolve conflicts → request approvals → concise answer with links to LifeOS entities.

## Domain agents
Home · Career · Social · Outreach · Organization · Projects · Knowledge · Goals · Finance (READ/PREPARE only, no transaction tools exist) · AgentOps.

## Observability, not chain-of-thought
Each run stores a short **execution summary** and the list of tool calls. Hidden reasoning is never stored or shown.

## Memory
DB is the source of truth. Context is assembled per call by deterministic retrieval (preferences, facts, relevant entities, recent events, optional semantic search). AI-generated observations live in their own table and are labelled as AI-generated.
