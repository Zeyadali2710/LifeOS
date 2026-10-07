# ADR-009: Debian VM + Docker Compose + Tailscale on Proxmox
Status: Accepted (2026-10-07)
## Decision
LifeOS runs in its own Debian VM on Proxmox using Docker Compose. Access only via Tailscale (`tailscale serve` HTTPS). No public exposure. See `../deployment.md`.
## Why
VM gives clean isolation and whole-VM backups; Compose gives restart policies, limits, healthchecks without Kubernetes overhead.
## Rejected
LXC+Docker (nesting quirks), k3s (no value for one user), Cloudflare Tunnel (public surface).
