# Phase 2: Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-07
**Phase:** 02-shell
**Areas discussed:** Theme, AI surfaces pre-agents, Home with no data, Notifications model

---

## Theme

| Option | Description | Selected |
|--------|-------------|----------|
| Dark only | Port design tokens 1:1, drop Phase 1 light theme | ✓ |
| Dark + derived light | Invent light tokens | |

| Option | Description | Selected |
|--------|-------------|----------|
| Self-host via next/font | Geist via next/font, Material Symbols self-hosted | ✓ |
| Google Fonts CDN | Exact prototype, third-party request | |
| Swap icon set | e.g. lucide, departs from design | |

## AI surfaces pre-agents

| Option | Description | Selected |
|--------|-------------|----------|
| Build UI, honest offline state | Full panel; prompt → "not connected yet" InlineError | ✓ |
| Labelled mock flows | Port scripted flows with MOCK label | |
| Hide until Phase 3 | Omit command bar/⌘J/Ask | |

| Option | Description | Selected |
|--------|-------------|----------|
| Commands + pages only | Scopes added by later phases | ✓ |
| All scopes, empty | 9 tabs with empty states | |

## Home with no data

| Option | Description | Selected |
|--------|-------------|----------|
| Keep layout, EmptyState per section | Honest, stable layout | ✓ |
| Hide empty sections | Page shape changes each phase | |

Activity sources (multi): Auth events ✓, System events ✓, Notification actions ✗.

| Option | Description | Selected |
|--------|-------------|----------|
| Real values only | Tiles from real data, no weather | |
| Add weather now | Open-Meteo, no key | ✓ |

**Notes:** Tiles still show real values only (Agents 0, Approvals 0, System health); weather added to the date line.

## Notifications model

| Question | Selected |
|---|---|
| Grouping | Time groups (NOW/TODAY/EARLIER) + category as tone, plus category filter row |
| Snooze | Menu: 1h / tonight / tomorrow 9am (Sydney time) |
| Surface | Drawer only |
| Sources | System + security only (no dev seed) |

## Claude's Discretion

Compact-sidebar persistence, mobile More sheet contents, Windows shortcut mapping, SSE reconnection, file structure, domain page placeholders.

## Deferred Ideas

Light theme; palette data scopes; mock AI flows; /notifications page.
