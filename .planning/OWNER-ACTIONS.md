# Owner actions

Things only the owner can do (VM deploys, live tests, credentials). Autonomous runs add items here and keep going. Tick items off when done. Phase 5–7.1 items were confirmed done by the owner on 2026-10-17 and removed (see Git history for the old checklists).

Standard deploy (homelab):
```bash
cd ~/lifeos && git pull && lc up -d --build
lc logs migrate | tail -20     # expect the new migration applied, no error
lc ps                          # web, worker up; migrate exited 0
```

## Deferred

- [ ] **Socials real posting and scheduling** (owner deferred 2026-10-17). On the tailnet page: approve a harmless real post on one platform, schedule one for a few minutes ahead, cancel/reschedule one, restart the worker while one is queued, confirm exactly one publication each. TikTok stays Copy/Open/Mark as posted.

## Phase 8 — Knowledge + Goals

- [x] **Deploy** (standard deploy above). Expect `0013_knowledge_goals` in `lc logs migrate`; it also runs `CREATE EXTENSION IF NOT EXISTS vector` (needs the compose DB superuser, which is the default).
- [x] **Knowledge check** on the tailnet page: add a note, a bookmark (https link) and upload a `.md` file; keyword search finds each by a word prefix and by tag; edit and delete one.
- [x] **Decide on semantic search.** Owner decided 2026-10-17: keep it off until there is a bigger knowledge set. It is off. Turning it on (Knowledge → Semantic → Turn on) sends item titles/text (first 8,000 chars) and semantic queries to OpenRouter (`openai/text-embedding-3-small`) with your saved OpenRouter key. If you turn it on: within ~10 minutes "Semantic index N/M" should reach M/M, and a by-meaning query should rank sensibly. Cost is fractions of a cent for hundreds of notes.
- [x] **Goals check:** write the vision, add a goal and 2 objectives, link a real project to one, tick a task in the tree, check the horizon tabs and the header sentence. Archive and restore a goal via Show archived.
- [x] **Ask Knowledge / Ask Goals** once each from the AI panel; both should answer from your data (paid model, no free model in Command Centre).
- [x] **Review Phase 8 auto-decisions** (accepted 2026-10-17) in `.planning/STATE.md` → Decisions and ROADMAP Phase 8 (critique section).

## Phase 9 — Daily intelligence, briefings, automations

- [x] **Deploy** (standard deploy). Expect `0014_briefings_automations` in `lc logs migrate` (if you happened to deploy commit 1dc7c28 overnight, tell Claude first: that commit briefly had a different 0014). Worker restart registers `briefings.tick` and `automations.tick`.
- [x] **Home:** Priorities, Today and Upcoming show your real tasks/events; the lead line counts priorities.
- [x] **Briefings:** Settings → Briefings, check the times (morning 07:00, evening 18:00, weekly Sunday 18:00 on; midday off). Next morning a "Morning briefing" notification should arrive once; open it. `/briefings` → Build now works any time.
- [x] **Automations:** create one harmless rule, e.g. "When: Briefing ready → Send a notification 'Briefing: {{event.title}}'", wait for the next briefing (or Build now does not trigger it — only scheduled ones emit the event), confirm one notification and a "Trace →" link under the rule. Optionally an "Ask LifeOS" rule on a schedule: any change it proposes must appear in Approvals, never execute on its own.
- [x] **Review Phase 9 auto-decisions** (accepted 2026-10-17) in `.planning/STATE.md` → Decisions.

## Phase 10 — Hardening

- [x] **Deploy** (standard deploy). Expect `0015_activity_type_time` in `lc logs migrate`. The `backup` service now runs `docker/backup.sh`: after the deploy, `lc logs backup` should show no "FAILED"; tomorrow Home must not show a backup priority.
- [x] **Run a restore drill once** (safe, throwaway database): `bash scripts/restore-drill.sh` — expect "Restore drill OK" and restored counts close to live.
- [ ] **Rotate `LIFEOS_MASTER_KEY`** (owner planned for 2026-10-18, at home) using `docs/security.md` → Key rotation (stop web+worker, dry run, rotate, update `.env`, `lc up -d`). Save the new key in your password manager first; old backups still need the old key.
