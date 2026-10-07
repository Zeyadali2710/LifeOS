# Security

LifeOS holds tokens to email, calendars, socials and code. Treat it as highly sensitive.

## Layers
1. **Network** — reachable only over Tailscale (`tailscale serve` provides HTTPS with a valid cert on the tailnet hostname). Postgres is on an internal Docker network, never published.
2. **Authentication** — Better Auth, single owner account. Email+password (argon2/scrypt hashing) with passkeys planned. Sign-up is disabled after the owner exists. Login rate-limited.
3. **Sessions** — DB-backed, httpOnly, `Secure`, `SameSite=Lax` cookies. Better Auth validates `Origin` on mutating requests (CSRF).
4. **Authorization** — every route and server action checks the session. Every agent tool call goes through the permission gateway (`permissions.md`).
5. **Secrets** — `.env` on host (mode 600, gitignored) for bootstrap secrets; integration tokens encrypted at rest with AES-256-GCM (`src/server/crypto.ts`, key `LIFEOS_MASTER_KEY`). Keys never reach the browser: no `NEXT_PUBLIC_*` secrets exist (ADR-002 amendment).
6. **Client IP** — `src/proxy.ts` rewrites `X-Forwarded-For` to the rightmost (proxy-appended) hop before Better Auth sees it, so clients cannot spoof the IP used for rate limiting (5 sign-ins/min/IP) and audit.
7. **Headers** — per-request nonce CSP (`src/proxy.ts`, `strict-dynamic`), HSTS, `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `nosniff`, strict referrer policy, permissions policy.
8. **Input/output validation** — zod at every trust boundary: env, HTTP bodies, provider responses, LLM tool inputs and outputs.
9. **Audit** — `audit_log` for auth events, approvals, permission changes, integration connects/disconnects, and all side-effecting tool calls.
10. **Supply chain** — lockfile committed, `npm audit` + gitleaks in CI, minimal dependencies.

## Rules
- Never commit credentials. Never hardcode secrets. Never log tokens (pino redaction paths configured).
- Never trust agent-generated ids or permission claims.
- OAuth scopes are least-privilege and listed per provider in `integrations.md`.

## Key rotation
`LIFEOS_MASTER_KEY` rotation: decrypt-with-old/encrypt-with-new migration script (Phase 10). Until then, back the key up separately from DB backups — a DB backup without the key cannot reveal tokens, and without the key tokens are unrecoverable (re-connect integrations).
