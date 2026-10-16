# Daily digest, briefings and automations (Phase 9)

## Daily digest (`src/server/digest.ts`)

One deterministic snapshot built from local data. No model call, nothing leaves LifeOS. Each source fails soft (a broken source is just empty).

Contents: today's events and conflicts (Sydney day), open tasks due today or overdue, tasks completed today, approvals waiting, unarchived HIGH-importance mail from the last 2 days (subject and sender), saved/interested/attending Sydney events in the next 3 days, active objectives that are neglected or slowing, categories over their carried monthly budget, GitHub CI failures in the last 24 h, and events for the next 6 days.

**Home** uses it for Priorities, Today and Upcoming. Priorities use fixed weights (`rankPriorities` in `src/lib/digest.ts`): overdue task 70 (+25 for P1, +10 for P2), approvals 80, conflict 65, important mail 60, CI failure 55, task due today 40, over budget 35, neglected objective 30; top 5. The lead sentence counts them.

## Briefings

- Kinds: morning (today), midday (rest of today), evening (done today, still open, tomorrow), weekly (Sundays: goals, budgets, next 6 days, tasks completed Mon–Sun).
- Schedule: Settings → Briefings (Sydney times). Defaults: morning 07:00 on, midday 12:30 off, evening 18:00 on, weekly Sunday 18:00 on.
- Worker job `briefings.tick` (every 15 minutes) builds every enabled briefing whose time has passed in its current period. Period = Sydney date (weekly = that Sunday). `briefings (kind, period)` is unique; the briefing and its FYI notification commit in one transaction, so a crash or failed notification retries on the next tick, never duplicates. A late worker still builds within the period; missed periods are skipped.
- Notifications carry counts only. Sections (which may include email subjects) are only on the owner-only `/briefings/<id>` page. `/briefings` lists recent ones and can build one now.

## Automations (`/automations`)

Trigger → all-of conditions → up to 5 actions.

- **Triggers:** an activity event (`TRIGGER_EVENTS` in `src/lib/automations.ts`: CI failed, important email, calendar conflict, task reminder, approval requested, …) or a Sydney schedule (time + weekdays). Events from source `automation` never trigger. Only events after the automation was created or re-enabled count (no backlog replay).
- **Conditions:** title / detail / source `contains` or `equals`, case-insensitive.
- **Actions:** send a notification, create a task (due in N days, priority), or ask LifeOS (unattended orchestrator run). Text can include `{{event.title}}`, `{{event.detail}}`, `{{event.source}}`.
- **Engine:** worker job `automations.tick` every minute. Each trigger is claimed once (`automation_runs (automation_id, trigger_ref)` unique, ref `event:<id>` or `schedule:<Sydney date>T<HH:MM>`). Schedules fire up to 30 minutes late, else skip. Max 20 runs per rule per 24 h (checked under a per-automation advisory lock; extra triggers are recorded as skipped).
- **Through the gateway:** each run creates an agent run for the system `automations` agent (no model) and executes actions as gateway tools `automation.notify`, `automation.create_task`, `automation.ask_agent` with deterministic tool-use ids. A run interrupted mid-way is re-executed after 5 minutes (up to 3 attempts) and completed actions return their earlier results instead of repeating. Traces appear under Agents → Automations.
- **Unattended safety:** `ask_agent` starts an orchestrator run with `agent_runs.origin = 'automation'` (set only by the engine). For any run whose parent/retry chain reaches such a root, the gateway raises every side-effect tool to APPROVE (even if a permission override lowered it), and the run is hard-private (never a free model). Spend cap applies.
- **Pause:** pausing the Automations agent in Agents (or the global pause) stops the engine.

## Deploy

Migrations `0014_briefings` and `0015_automations` (adds `agent_runs.origin`). Additive only. The worker registers `briefings.tick` and `automations.tick` on restart.
