# ADR-008: Anthropic SDK, per-agent model selection
Status: Accepted (2026-10-07)
## Decision
Use `@anthropic-ai/sdk` directly with our own tool gateway (no agent framework). Defaults: orchestrator `claude-opus-5-5`, domain agents `claude-sonnet-5-5`, classification/triage `claude-haiku-4-5`. Configurable per agent. Prompt caching on stable system prompts.
## Why
Permissions, approvals, and observability must be ours; frameworks hide exactly the parts we need to control.
