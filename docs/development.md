# Development

## Methodology
DISCOVER → ARCHITECT → PLAN → IMPLEMENT → TEST → REVIEW → HARDEN → DEPLOY → ITERATE, driven by GSD:
- `.planning/` holds PROJECT, REQUIREMENTS, ROADMAP, STATE and per-phase plans.
- Each phase: plan → execute in small commits → verify → `code-review` + `security-review` → fix → docs → commit.
- Test-first for critical paths: auth, permissions/approvals, crypto, mutations of external state.
- Reversible, low-risk decisions are made and recorded as ADRs in `docs/decisions/`. Security-critical, irreversible, credential-dependent, or architecture-changing decisions are escalated to the owner.

## Commands
| Command | What |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run worker` | Worker (tsx watch) |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run typecheck` / `lint` | Static checks |
| `npm test` | Vitest (unit + DB integration; needs dev Postgres) |
| `npm run e2e` | Playwright |
| `npm run create-owner` | Create the single owner account (interactive env vars) |

## Layout
```
src/app/          Next.js routes (UI + API)
src/server/       server-only: env, db, auth, crypto, log, services
src/worker/       pg-boss worker entry
src/ui/           design system primitives
drizzle/          generated SQL migrations
tests/            vitest + playwright
docker/           Dockerfile + compose files
```
