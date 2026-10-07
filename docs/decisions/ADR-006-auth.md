# ADR-006: Better Auth, single owner, DB sessions
Status: Accepted (2026-10-07)
## Decision
Better Auth with email+password for the single owner, created via CLI script; public sign-up disabled. DB-backed sessions, secure cookies, built-in rate limiting and origin checks. Passkeys added in Phase 2/10.
## Why
Mature, self-hosted, Drizzle adapter, no third-party identity provider in the trust path. Tailscale is an additional outer layer, not a replacement.
