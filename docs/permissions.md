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

## Repo content and project tools (Phase 5.1)
| Tool | Tier |
|---|---|
| `github.list_tree`, `github.get_file` | READ |
| `projects.create`, `projects.update` | APPROVE |

**Content floor (D-06, `withContentFloor` + `contentScope` in `src/server/agents/policy.ts`):** once any run in scope has read third-party content — `github.get_file`, `list_tree`, `get_pull_request`, `list_issues`, `list_pull_requests` or `recent_commits` (`CONTENT_TOOLS`) — every side-effect tool resolves to at least APPROVE. Scope = the run tree (self, parent, siblings, children), the run it retries (and its parent), and every run in those threads, so repo-derived text carried into later thread turns stays floored. HIGH_RISK is unchanged. The write handlers refuse to run without an approval. No agent deletes projects, milestones or tasks this phase.

## Outreach tools (Phase 6)
| Tool | Tier |
|---|---|
| `outreach.list_events`, `outreach.get_event`, `mail.list`, `mail.get_message` | READ |
| `mail.send_reply` | APPROVE |

- **Content floor.** The event and mail tools are in `CONTENT_TOOLS`, so once any of them has run in a run's scope every side-effect tool resolves to at least APPROVE (the 5.1 floor).
- **Hard mail taint.** `mail.list`, `mail.get_message` and `mail.send_reply` (`MAIL_TOOLS`) mark the whole run scope private with no override: the `ai.free_private_ok` setting does not apply to mail, and a run that touched mail can never use a free model.
- **`mail_reply` approval.** Recipients (`to`, `cc`), thread id and reply headers are rebuilt server-side from the stored message and are locked: the owner can edit only the subject and body, and the server re-validates on approve. The approval card carries an "untrusted" note. Alternatives: **Save to Gmail drafts** (creates a plain draft, marks the approval rejected, never sends) and Reject.
- **Idempotent send.** Approving creates a threaded draft with a deterministic `Message-ID` (derived from the approval id), checkpoints `draftId` and the draft's message id on the approval, then sends. A retry after an ambiguous failure first looks for the draft (send never landed), then for a SENT copy or the `rfc822msgid` (send landed) and adopts it instead of sending twice. Sending needs the `gmail.compose` scope; without it the approval fails with a Reconnect Google message and nothing is sent.
- **Owner-only writes.** Pipeline stage changes, dismiss/restore, import, follow-up task creation, Add as task, archive and flag are owner UI actions (audit-logged). Agents never create tasks from events or mail, and mail-linked task titles are redacted to "Email follow-up (private)" in agent tool output.
