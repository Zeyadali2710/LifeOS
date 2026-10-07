# ADR-002: Next.js App Router + React + Tailwind v4
Status: Accepted (2026-10-07)
## Decision
Next.js (App Router, standalone output), React server components by default, Tailwind v4 with CSS-variable design tokens. Server-only modules import `server-only`.
## Why
UI and API in one deploy unit; server components keep data access and secrets on the server; huge ecosystem.
## Consequences
Long-running/background work must NOT live in Next route handlers — it goes to the worker (ADR-004).
