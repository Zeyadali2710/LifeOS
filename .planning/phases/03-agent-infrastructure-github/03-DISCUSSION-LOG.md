# Phase 3: Agent infrastructure + GitHub - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 03-agent-infrastructure-github
**Areas discussed:** Approval-gated action, GitHub scope & sync, Chat & conversations, Cost & guardrails

---

## Approval-gated action

| Question | Options | Selected |
|---|---|---|
| First PREPARE→APPROVE action | Create GitHub issue (2nd PAT, Issues:write) · Comment on a PR · Internal-only action | Create GitHub issue |
| Where to approve | Everywhere (page + inline chat card + notification) · Approvals page only | Everywhere |
| Edit before approve | Approve/reject only · Editable before approve | Editable before approve |
| Unactioned approval | Expire 7 days · Expire 24 h · Never | 7 days |

## GitHub scope & sync

| Question | Options | Selected |
|---|---|---|
| Which repos | Whatever PAT grants · PAT + pick in Settings | Whatever PAT grants |
| Sync model | Periodic sync + live reads · Live tool calls only · Webhooks | Periodic sync + live reads |
| v1 data | PRs + reviews · Issues · Commits + activity · CI/Actions | All four |
| Token entry | Settings UI, encrypted · .env | Settings UI, encrypted |

## Chat & conversations

| Question | Options | Selected |
|---|---|---|
| History | Saved threads · One rolling thread · Ephemeral | Saved threads |
| Where chat lives | AI panel only · Panel + full page | AI panel only |
| Trace detail | Steps + expandable detail · Steps only · Final answer only | Steps + expandable detail |
| Which agents exist | Orchestrator + 1 GitHub agent · Orchestrator only · All agents, most disabled | All agents, most disabled |

## Cost & guardrails

| Question | Options | Selected |
|---|---|---|
| Spend cap | Monthly cap in Settings (US$20) · Daily cap · No cap | Monthly cap |
| At cap | Block new runs + notify · Downgrade models · Warn only | Block + notify |
| Orchestrator model | Opus 5.5 (ADR-008) · Sonnet 5.5 | Opus 5.5 |
| Live agents (follow-up) | Orchestrator + GitHub agent · Orchestrator only | Orchestrator + GitHub agent |

## Claude's Discretion

Per-run limits; sync interval/rate-limit/pagination tuning; thread list size and titling; Command Centre pause/resume/retry/cancel semantics; tier assignment for GitHub read tools.

## Deferred Ideas

- Other GitHub writes (PR comments, labels, closing issues) — future phase.
- GitHub webhooks — needs public endpoint; conflicts with Tailscale-only.
