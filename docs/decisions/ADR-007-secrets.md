# ADR-007: Secrets in env, integration tokens encrypted at rest
Status: Accepted (2026-10-07)
## Decision
Bootstrap secrets (DB password, auth secret, master key, Tailscale auth key, Anthropic key) live in `.env` on the host (gitignored, mode 600). OAuth/integration tokens are stored in Postgres encrypted with AES-256-GCM (`node:crypto`) under `LIFEOS_MASTER_KEY`.
## Why
Simple, no Vault to operate. A leaked DB dump alone doesn't leak tokens.
## Revisit when
Multiple hosts or users need secrets.
