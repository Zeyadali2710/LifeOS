# LifeOS design — inventory

Source: Claude Design project `faf225f7-8c4a-46ca-982e-fd969ee2f29d`
(https://claude.ai/design/p/faf225f7-8c4a-46ca-982e-fd969ee2f29d), imported 2026-10-07.
Files are byte-identical to the project (preview-server injections stripped).

**Layout and visuals are the source of truth. Content (names, events, numbers) is placeholder.**
`support.js` is the Claude Design runtime (`DCLogic`, `<x-dc>`, `<sc-for>`, `<sc-if>`, `<dc-import>`) — reference only, never ship it.

## Files

| File | What it is | Phase |
|---|---|---|
| `LifeOS.dc.html` | **App shell prototype**: sidebar, top bar, command bar, ⌘K palette, ⌘J AI panel, notifications drawer, toast; imports every page | 2 |
| `Design System.dc.html` | Tokens, components, states, motion, a11y rules — **the token source** | 2 |
| `Mobile Layouts.dc.html` | Mobile (M1 Home, M2 AI, M3 Approval, M4 Agents) + tablet rail, breakpoints | 2 |
| `Home.dc.html` | Home: greeting, priorities, today, live activity, projects, agent activity, upcoming | 2 |
| `Approvals.dc.html` | Approval queue + ApprovalDetail | 3 |
| `Agents.dc.html` | Agent Command Centre, agent detail, execution trace | 3 |
| `Career.dc.html`, `Projects.dc.html` | GitHub/project views | 3+ |
| `Outreach.dc.html`, `Socials.dc.html`, `Organization.dc.html`, `Knowledge.dc.html`, `Goals.dc.html`, `Settings.dc.html` | Domain pages | 4–11 (Phase 2 ships them as honest empty states) |
| `shots/home.jpg` | Thumbnail of desktop Home | — |

## Tokens (dark only — the design defines no light theme)

**Fonts:** Geist 300–700, Geist Mono 400–600, Material Symbols Outlined (opsz 20–48, wght 300, FILL 0/1).

**Surfaces / text**
| Token | Value | Use |
|---|---|---|
| canvas | `#0b0c10` + `radial-gradient(1200px 600px at 10% -10%, rgba(110,112,255,.10), transparent 60%)` | app bg |
| surface | `#111318` | cards, panels |
| inset | `#0d0e13` | code, previews, inputs |
| raised | `#1a1d24` | tooltips, toasts |
| selected | `#1f222b` | active segment |
| border | `rgba(255,255,255,.07)` (hover `.12`–`.2`) | hairline |
| text | `#e9eaf0` | primary |
| text-2 | `#a3a6b4` | secondary (7.6:1) |
| text-3 | `#80849a` | labels/meta (4.9:1) |
| text-4 | `#4a4e5c` | decorative only |

**Accents** (same L/C, hue varies; tints 8–14% alpha, borders 22–45%)
| Token | Value | Meaning |
|---|---|---|
| indigo | `#8b8cff` | LifeOS, primary, AI, focus |
| indigo-text | `#a5a6ff` | accent text |
| green | `#4fd1a1` | healthy, done, online, Organization |
| amber | `#e8b86a` | at risk, approval, P2, Career |
| red | `#f07a6e` | error, P1, destructive |
| blue | `#6cb6ff` | Outreach, events, ready |
| pink | `#e889c4` | Socials |
| violet | `#b48cff` | Knowledge |

**Type**
| Role | Spec |
|---|---|
| Display | Geist 500 · 44/1.05 · −0.03em |
| H1 | Geist 500 · clamp(28px, 3vw, 40px) · −0.025em |
| H2 | Geist 500 · 20–22 · −0.01em |
| Lead | Geist 400 · 15–17/1.5 · text-2 |
| Body | Geist 400 · 13.5–14/1.5 |
| Small | Geist 400 · 12–12.5 · text-2 |
| Label | Mono 500 · 10–11 · 0.08–0.12em · UPPER · text-3 |
| Agent | Mono 600 · 11–13 · 0.08em · UPPER · domain colour |
| Meta | Mono 400 · 10.5–12 · text-3 |

**Space:** 4 · 6 · 8 · 12 (card grid gap) · 14 (section header→content) · 16 (compact card pad) · 24 (column gap) · 32 (section gap / page x).
**Radius:** 5 (badges) · 8 · 12 · 14 · 16 · 999.
**Elevation**
| Level | bg / border / shadow | Use |
|---|---|---|
| 0 Flat | `#111318` / border / none | default |
| 1 Floating | `rgba(17,19,24,.82)` / `rgba(139,140,255,.22)` / `0 18px 50px rgba(0,0,0,.55)` | command bar |
| 2 Overlay | `#12141a` / `rgba(255,255,255,.1)` / `0 30px 80px rgba(0,0,0,.6)` | drawer, palette |
| Glow · AI | `#8b8cff` / — / `0 0 0 4px rgba(139,140,255,.12), 0 8px 24px rgba(110,112,255,.3)` | primary AI action only |

**Grid:** 12 columns, max-width 1280.

## Shell (LifeOS.dc.html)

- **Sidebar** 232px (compact 64px, toggle ⌘\\). Logo + version. Primary nav (⌥1–9): Home, Career, Socials, Outreach, Organization, Projects, Knowledge, Goals, Agents. Lower nav: Notifications (unread count), Approvals (amber pending count), Settings (⌘,). Current item: bg `rgba(139,140,255,.1)`, border `.18`, filled icon `#a5a6ff`. Compact: dot badges + hover tooltips.
- **Top bar:** mono breadcrumb `LIFEOS / HOME`, search field (opens palette, ⌘K hint), clock `19:44 AEDT` (hidden < 680px content width), bell with unread dot, "Ask LifeOS" button (⌘J). Running indicator "3 RUNNING".
- **Command bar** (floating, bottom of content, elev 1): "Ask LifeOS anything…", mic, ⌘J, 3 suggestion chips above. Hidden while AI panel is open.
- **Command palette** (⌘K, elev 2): scope tabs (All/Projects/Tasks/Events/Emails/People/Notes/GitHub/Agents, Tab cycles), groups Commands / Jump to / per-type; typed query adds top "Ask LifeOS: …" row; ↑↓ Enter; no match → ask.
- **AI panel** (⌘J, right drawer 440px): status ONLINE/WORKING, empty state with 4 suggestions, conversation of prompt → ExecutionTrace (queued 40% → running pulse → done green + duration) → ResultCard (events | list | plan | approval) + follow-up actions; composer with Enter-to-send.
- **Notifications drawer** (right): groups NOW / TODAY / EARLIER; important+unread rows are bold with tinted bg; icon tinted by tone; per-row primary action, mark read/unread, snooze (toast "Snoozed until HH:MM"), dismiss; "mark all read"; empty state.
- **Toast:** raised surface, 2.6s.

## Home (Home.dc.html)

Order: date line (mono label: `WEDNESDAY, OCTOBER 7 · SYDNEY · 17°C CLEAR`) → Display greeting → Lead summary sentence → status tiles (Agents running / Approvals waiting / Next) → **Priorities** (ranked by orchestrator; PriorityCard P1 lead + P2/P3, "Later") → **Today** → **Live activity** (role=log; new item every ~9s drops in from top, faint tint) → **Active projects** (ProjectCard with 24-bar sparkline) → **Agent activity** → **Upcoming**.
Activity sources and icon colours: GitHub `code #c9cbd6`, Email `mail #6cb6ff`, Calendar `event #4fd1a1`, Social `public #e889c4`, Agent `memory #a5a6ff`, Project `deployed_code #e8b86a`.

## Responsive (Mobile Layouts.dc.html)

| Width | Layout |
|---|---|
| < 720 | bottom bar: Home · Organize · **AI (centre)** · Projects · More; single column |
| 720–1100 | 68px icon rail, 2 columns |
| > 1100 | 232px sidebar, 12-col grid |

Mobile Home: greeting → top priority expanded → other priorities → next 3 items → agent summary. Activity + projects move to More. AI opens as a full sheet. Touch targets ≥ 44px.

## Components (from the design's own component map)

AppShell · SidebarNavItem · CommandBar · CommandPalette · AIPanel · ExecutionTrace · ResultCard · PriorityCard · ActivityItem · ProjectCard · AgentCard · ApprovalDetail · EventCard · EmailCard/EmailDetail · CalendarGrid · GoalTreeColumn · ConnectionRow · InlineError · EmptyState · Skeleton/AgentLoading.
Also: buttons (Primary `#8b8cff`/hover `#a5a6ff`, Secondary, Ghost, Destructive — each with a spinner state), inputs (default/focus 3px tint ring/error/disabled), badges (P1/P2/P3, status pills, tag, ASK FIRST), 8 agent states (ONLINE, WORKING, SEARCHING, READY, IDLE, WAITING, PAUSED, ATTENTION).

## Motion

route: opacity 150ms, sidebar width 180ms · activity enter: translateY −6→0 450ms · agent ring pulse 1.2–1.4s · scan line 1.8s · trace step opacity 200ms · drawer translateX 16→0 200ms · palette translateY 8→0 + scale .99 160ms · card hover lift 1px 150ms · `prefers-reduced-motion` disables all.

## Accessibility & voice

Every action keyboard-reachable (⌘K, ⌘J, ⌥1–9, ⌘\\, arrows+Enter, Tab scopes, Esc). Focus: 2px `#8b8cff` outline, 2px offset. Activity `role=log aria-live=polite`. Body ≥ 7:1, labels ≥ 4.5:1; status = text + colour. Voice: calm chief of staff, fact first, no exclamation marks/emoji.

## Gaps vs Phase 2 requirements (resolve in discuss/ui phase)

1. **No light theme** in the design; Phase 1 `globals.css` has one.
2. **Notification categories:** SHL-05 says URGENT/IMPORTANT/FYI/AGENT/APPROVAL/REMINDER; the design groups by time (NOW/TODAY/EARLIER) with an `important` flag + tone colour.
3. **Notifications is a drawer**, not a page (nav item opens the drawer).
4. **AI panel** is fully designed but agents arrive in Phase 3 — Phase 2 ships UI only.
5. **Command bar + palette "Ask"** route to the AI panel, which has no backend yet.
6. Design shows weather and a placeholder owner name; no data source exists for weather.
