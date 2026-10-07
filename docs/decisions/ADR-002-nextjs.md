# ADR-002: Next.js App Router + React + Tailwind v4
Status: Accepted (2026-10-07)
## Decision
Next.js (App Router, standalone output), React server components by default, Tailwind v4 with CSS-variable design tokens. Secrets stay server-side because only `NEXT_PUBLIC_*` env vars are ever inlined into client bundles; LifeOS defines none.
## Why
UI and API in one deploy unit; server components keep data access and secrets on the server; huge ecosystem.
## Amendment (Phase 1)
The `server-only` package was dropped: it throws when the plain-Node worker imports shared `src/server` modules. Revisit if client/server boundaries get blurry (e.g. add an ESLint import-boundary rule).

## Consequences
Long-running/background work must NOT live in Next route handlers — it goes to the worker (ADR-004).
