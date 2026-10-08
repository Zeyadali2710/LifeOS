# ADR-008: Anthropic SDK, per-agent model selection
Status: Accepted (2026-10-07)
## Decision
Use `@anthropic-ai/sdk` directly with our own tool gateway (no agent framework). Defaults: orchestrator `claude-opus-5-5`, domain agents `claude-sonnet-5-5`, classification/triage `claude-haiku-4-5`. Configurable per agent. Prompt caching on stable system prompts.
## Why
Permissions, approvals, and observability must be ours; frameworks hide exactly the parts we need to control.

## Amendment (Phase 3.1, 2026-10)
- A second provider, OpenRouter, sits behind the same `LlmClient`. It is a hand-rolled `fetch` adapter (`src/server/agents/openrouter.ts`), non-streaming, with no new dependency. `getLlm()` is a dispatching client: model ids ending `:free` go to OpenRouter, everything else to Anthropic.
- The free model id is configurable with `OPENROUTER_FREE_MODEL` (must end `:free`).
- The orchestrator is always Opus. Domain agents default to Auto: free for delegations tagged `simple`, Sonnet otherwise or on any failure. See `agents.md` (Model routing).
- With no OpenRouter key, behaviour is identical to Phase 3.
