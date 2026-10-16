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

(Added during the autonomous run; see below.)
