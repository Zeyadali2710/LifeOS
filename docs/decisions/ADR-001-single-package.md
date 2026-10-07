# ADR-001: Single npm package, two entrypoints
Status: Accepted (2026-10-07)
## Decision
One package. Next.js app (`src/app`) and a Node worker (`src/worker/index.ts`) share `src/server/**`. One Docker image, two commands.
## Why
One language, one lockfile, one image. Workspaces/monorepo tooling adds ceremony with no benefit for one developer.
## Revisit when
A second deployable with different dependencies appears (e.g. a mobile app).
