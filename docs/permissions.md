# Permissions

| Tier | Behaviour | Examples |
|---|---|---|
| `READ` | Runs automatically | Read GitHub, list calendar events, search notes |
| `PREPARE` | Runs automatically; produces a draft, nothing leaves LifeOS | Draft LinkedIn post, draft email reply, propose schedule |
| `APPROVE` | Requires owner approval per action (default) | Publish post, send email, create/edit external calendar event |
| `EXECUTE` | Runs automatically **only** when a rule allows it | e.g. "auto-accept calendar holds from myself" |
| `HIGH_RISK` | Always requires explicit approval; cannot be lowered by config | Delete data, financial transactions, account/security changes |

- Tier is declared on the tool in code. `permissions` table holds owner overrides `(agent_id?, tool_name, effective_tier, conditions)`; the gateway takes the stricter of code-declared floor and override for `HIGH_RISK`.
- Approvals carry: requesting agent, tool, validated input, human-readable preview, expiry. Expired approvals are rejected, never auto-executed.
- Automations run with the same gateway; an automation cannot gain permissions its tools don't have.
- Finance agent has no tools that move money. This is enforced by absence, not configuration.

Critical tests (Phase 3): tier resolution, HIGH_RISK floor, approval suspend/resume, idempotent retry, agent allow-list, foreign/unknown id rejection.

## Model routing and permissions
`escalate` is a routing pseudo-tool, not a gateway tool: it grants nothing and is not in any agent's allow-list. Tool calls made by a free model go through the same gateway, tiers and approvals as any other model.

## Calendar tools (Phase 4)
| Tool | Tier |
|---|---|
| `calendar.list_events`, `calendar.find_free_slots`, `calendar.detect_conflicts`, `tasks.list` | READ |
| `calendar.create_event`, `calendar.update_event` | APPROVE |
| `calendar.delete_event` | HIGH_RISK (floor; no override lowers it) |

Per ORG-02: owner UI writes run directly and are audit-logged (`calendar.event.create` / `.update` / `.delete`). Only agent writes go through approvals. Approvals are per kind with locked fields (calendar, event id, etag, scope, instance start are rebuilt from the DB, model values overwritten) and an etag check at execution; a stale etag is refused. Tasks are READ-only for agents.
