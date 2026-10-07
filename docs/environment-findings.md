# Environment Findings (2026-10-07)

## Repository
- `C:\Users\footb\Desktop\LifeOS` was empty and not a git repository. Nothing pre-existing to preserve.
- Initialized git with `main` as default branch.

## Development machine (Windows 11)
| Tool | Version | Notes |
|---|---|---|
| Node.js | 24.19 (upgraded from 20.20 on 2026-10-07) | pg-boss 12 and Vitest 5 need ≥22.12; Docker images use node:24-slim |
| npm | 11.19.1 | Package manager (no pnpm/bun installed; npm is sufficient) |
| git | 2.53 | |
| Docker Desktop | 29.6.1 | Used for local Postgres, integration tests, compose |
| uv / Python | 0.12 | Not used by LifeOS. `python` on PATH resolves to an unrelated project venv |
| gh, psql | — | Not installed. `psql` is available inside the db container |

## Claude Code environment
- **GSD (get-shit-done)** — installed. Drives `.planning/` (PROJECT, REQUIREMENTS, ROADMAP, STATE, per-phase plans).
- **Ponytail** — installed. Applied as YAGNI *within a phase*: build the seams the brief requires (provider interfaces, agent contract, permission gateway) but no code for future phases.
- **Superpowers** — installed via the desktop app on 2026-10-07 but not yet visible to Claude Code sessions (not in the plugin registry; restart may be needed). Its practices (TDD for critical paths, systematic debugging, review before commit) are followed by convention; see `development.md`.
- Built-in skills used: `code-review`, `security-review`, `simplify`, `claude-api`, `run`, `dataviz`; built-in browser for UI verification; Figma MCP available for design work.

- Playwright browser downloads time out on this network; local e2e uses the installed Chrome (`channel: "chrome"`), CI uses bundled Chromium.

## Deployment target
- Proxmox VE homelab → **Debian VM running Docker Compose** (ADR-009).
- Remote access via **Tailscale** only; nothing exposed to the public internet.

## Things that must not be overwritten
- Nothing in the repo yet. On the Proxmox host: any existing VMs/containers — LifeOS gets its own VM.

## Open unknowns
See `.planning/ROADMAP.md` → "Credentials & external access needed".
