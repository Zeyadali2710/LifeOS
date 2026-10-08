---
phase: 3
slug: agent-infrastructure-github
status: draft
shadcn_initialized: false
preset: none
created: 2026-10-08
---

# Phase 3 (Agent infrastructure + GitHub) — UI Design Contract

> Visual and interaction contract. Inherits the Phase 2 contract (`.planning/phases/02-shell/02-UI-SPEC.md`) in full: tokens, spacing, typography roles, colour, motion, keyboard map, accessibility, voice. Nothing there is re-decided here; this file only adds the Phase 3 surfaces and the few new roles they need. Source of truth for layout is `design/` (Agents.dc.html "AG", Approvals.dc.html "AP", Settings.dc.html "ST", LifeOS.dc.html "SH" AI panel l.160-262, Mobile Layouts.dc.html "MB" M2-M4, INVENTORY.md). Names, numbers and events in the design are placeholder and are never shipped.

Provenance: CONTEXT.md D-01..D-16 pre-populated; Phase 2 contract inherited; design files supplied every remaining value. No user questions asked. shadcn / registry gates not applicable (no component library, same as Phase 2).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-built in `src/ui/`, `src/shell/`, new `src/agents/`, `src/approvals/`, `src/settings/`) |
| Preset | not applicable |
| Component library | none |
| Icon library | Material Symbols Outlined self-hosted subset (Phase 2). **Re-generate the subset** to add the Phase 3 names below, then verify each renders (a missing glyph shows ligature text). |
| Font | Geist + Geist Mono (Phase 2) |
| Theme | Dark only (Phase 2) |

Phase 3 icon additions: `arrow_back check block history stop play_arrow pause_circle play_circle shield warning hub deployed_code visibility_off key refresh open_in_new content_copy radio_button_unchecked` (Phase 2 names already cover `memory verified_user error check_circle schedule edit_square close arrow_upward chevron_right expand_more priority_high info link_off lock code`).

Agent identity (icon, colour) reuses the design: Orchestrator `hub` `#a5a6ff` · Home `space_dashboard` `#a5a6ff` · Career `terminal` `#e8b86a` · Social `public` `#e889c4` · Outreach `travel_explore` `#6cb6ff` · Organization `calendar_month` `#4fd1a1` · Projects `deployed_code` `#e8b86a` · Knowledge `library_books` `#b48cff` · Goals `flag` `#8b8cff` · Finance `account_balance` `#4fd1a1` · AgentOps `monitor_heart` `#a3a6b4`. (Add `account_balance` to the subset.) Colour is identity only; status is always text + dot.

---

## Design Tokens

**No new tokens.** Use Phase 2 `globals.css` as is. Phase 3 additions to existing primitives:

- `Badge`: no changes (existing tones cover every state).
- New primitive **`Input` / `Textarea` / `Select`** (`src/ui/field.tsx`, the Phase 2 DS "inputs" spec): h36 (textarea min 7 rows), radius 9, padding 0 12 (textarea 14), border `--border-strong`, bg `--inset`, text 14px `text`, placeholder `text-3`. Focus: border `rgba(139,140,255,.45)` + `--ring-input` (no outline on the control itself; the ring is the focus indicator, 3:1+ against surface). Error: border `rgba(240,122,110,.5)`, error text 12.5px red below with `aria-describedby`, `aria-invalid="true"`. Disabled: bg fill-1, text `text-4`, `cursor: not-allowed`. Select is the native `<select>` styled the same with a `expand_more` icon (native popup on mobile). Label above: Small 12.5px text-2, gap 6.
- New primitive **`Disclosure`** (button + region): `aria-expanded`, chevron `expand_more` rotating 180deg (150ms), used by trace steps, repo list, "View original".
- New primitive **`Dialog`** for the single destructive confirm (see Copywriting): follows Phase 2 `useDialog` (focus trap, Esc, return focus). Panel radius 16, bg `#14161c`, border `.1`, `shadow-overlay`, width `min(420px, 94vw)`, padding 24, enter `lo-rise`, backdrop `rgba(5,6,9,.6)`.
- New primitive **`Progress`**: track 6px tall radius 3 `rgba(255,255,255,.07)`, fill radius 3. Fill colour: indigo `<80%`, amber `80-99%`, red `>=100%`. `role="progressbar"` with `aria-valuenow/min/max` and a text label alongside (colour is never the only signal).
- New primitive **`StatusDot`**: 7px circle; running = `lo-pulse` 1.4s in indigo-text; online = green (static in cards, `lo-pulse-g` only on the sidebar health row); attention = red static; paused = amber static; idle = `text-2`; not connected = hollow ring 1px `text-3`, transparent fill.

Spacing: Phase 2 scale (4/8/16/24/32/48/64 plus its documented exceptions 2/6/10/12/14/18/20). Phase 3 introduces no new off-scale value other than design-sourced card padding 22 (orchestrator hero card, AG l.24), listed here for the checker. Control heights: reuse Phase 2 (26/28/30/32/34/36/44); approval decision buttons h38 desktop (AP l.72) and 52/48 mobile (MB M3); inputs 36; below 720 every target >= 44.

---

## Typography

Phase 2 role table is the closed set. Phase 3 adds exactly two roles (both in the design) and maps everything else:

| Role | Font | Size | Weight | Line height | Letter-spacing | Used for |
|------|------|------|--------|-------------|----------------|----------|
| Metric (new) | Geist | 22px | 500 | 1.2 | -0.02em | orchestrator stat values, spend value (AG l.36) |
| Agent title (new) | Mono | 22px | 600 | 1.2 | 0.06em UPPER | agent detail H1 (AG l.99). Mono 600 is already permitted for agent labels (Phase 2). |

Mapping (design value -> contract role, so no stray sizes are introduced):
- Page eyebrow `AGENT COMMAND` / `APPROVAL CENTRE` / `SETTINGS`: Label (Mono 11/500, 0.12em; eyebrow colour: Agents `indigo-text`, Approvals `amber`, Settings `text-2`).
- Page H1: H1 role. Page lead: Lead role (15px below 720).
- Approval detail title (AP 20px) and mobile title (21px): **H2 (20/500/1.3)**.
- Current task title (AG 17px): Lead 17px role at weight 500 is NOT allowed; use **Title (15/500)**.
- Agent card name Mono 600 11.5 and run-row agent Mono 500 11: **Badge-adjacent**: use Label-sm (Mono 10.5) with weight 600 for agent names (600 is allowed on agent labels) and Meta 11.5 for run ids.
- Design's 9.5px micro-labels (LAST / QUEUE / HEALTH / WHAT WILL HAPPEN on mobile): raise to **Label-sm 10.5** (a11y floor).
- Button labels: Phase 2 Button roles. **Exception (design, AP l.72-74, MB M3):** the three approval decision buttons (APPROVE-consequence label, EDIT/DONE, REJECT) use Geist 13px **600**, `letter-spacing 0.06em`, UPPERCASE. This is the only new place weight 600 is permitted besides the Phase 2 list.
- Streaming answer text in the ResultCard: Body 14px/1.5 (design uses 15 headline; headline of a result uses **Title 15/500**, following prose uses Body).
- Code/payload (JSON-ish tool summaries, issue body preview): Mono 11.5 (Meta) in `inset` blocks; issue body preview uses Body 14px/1.65 in Geist (it is prose, AP l.64).

Weights remain 400/500 with 600 only where listed in Phase 2 plus the approval buttons above.

---

## Color

Unchanged 60/30/10 split from Phase 2 (canvas `#0b0c10` / surface `#111318` + overlays / accent `#8b8cff`). Destructive `#f07a6e` only for failed/error/cancel-cap/reject/remove.

Accent (indigo) reserved for, additions to the Phase 2 list: primary Button fill for "Save token", "Send"-equivalent, "Sync now" is **secondary** not accent; selected row in the approvals list (tint .06, border .4, AP l.124); the orchestrator hero card border (.25) and halo; RESULT card label and border (.22) in the AI panel; running/working status dots and trace "RUNNING" label (`#a5a6ff`); the active step segment in the run progress bar; the user-visible "Ask" focus rings. The **primary approve button is indigo** (`#8b8cff`, text `#0b0c10`). It is the single decisive action on its screen.

Amber is the approval colour: APPROVAL REQUIRED label, approvals eyebrow, "N approvals waiting" header button (border .35, bg .08), pending state text, sidebar Approvals badge, PAUSED, spend 80-99%, EDITED badge, `ATTENTION`-adjacent warnings that are not failures.
Red: FAILED, ERROR, REJECT button (outline), cap-reached, EXPIRED text uses **text-3** (not red; nothing went wrong) and REJECTED uses red.
Green: DONE, CONNECTED, ONLINE, executed success footer.
Blue: shield "no data of this type is sent" rows (AP) and FYI.

Result/state colour map (text + dot, always both):

| State | Colour | Where |
|---|---|---|
| ONLINE | green | orchestrator / live agent idle-ready |
| WORKING | indigo-text | live agent with a running run |
| READY | blue | live agent enabled, no run, queue empty (design READY) |
| IDLE | text-2 | not used for live agents in this phase (READY is used); reserved |
| PAUSED | amber | paused by owner |
| ATTENTION | red | last run failed / token invalid / tool unavailable |
| NOT CONNECTED | text-3, hollow dot | registered but disabled agents (D-13) |
| run result: Completed / Needs approval / Failed / Running / Cancelled / Expired | green / amber / red / indigo-text / text-2 / text-3 | runs tables |
| approval state: PENDING / APPROVED / EXECUTED / REJECTED / EXPIRED / FAILED | amber / green / green / red / text-3 / red | approvals list + detail |
| trace step: QUEUED / RUNNING / DONE / WAITING / FAILED / CANCELLED | text-4 decorative dot + label `text-3` (opacity .4 row) / indigo-text / green dot + duration text-3 / amber / red / text-3 | execution trace |

(`text-4` is decorative only: queued rows get a `text-3` label; the .4 row opacity is kept from the design but the label must still reach 4.5:1, so apply the .4 opacity to the dot and rule only, not the label.)

### Notification map additions (Phase 2 category table; new rows only)

| Event | Category | Title | Body | Action |
|---|---|---|---|---|
| Approval created | APPROVAL | Approval waiting: create GitHub issue | {repo}: "{title}". Expires {EEE d MMM HH:mm}. | Review -> `/approvals?id={id}` |
| Approval expired (D-05) | FYI | Approval expired | The issue "{title}" was not created. Nothing ran after the request expired. | Open -> `/approvals?id={id}` |
| Spend cap reached (D-15) | URGENT | Monthly AI spend cap reached | New runs are paused at US${cap}. Raise the cap in Settings to continue. | Open settings -> `/settings?section=ai` |
| CI failed on default branch (D-08) | IMPORTANT | CI failed on {repo} | {workflow} failed on {branch} at {HH:mm}. | Open -> GitHub run URL (external, `rel="noopener noreferrer"`, validated with `isSafeUrl`) |
| GitHub token invalid | IMPORTANT | GitHub connection needs attention | The {read\|issues-write} token was rejected by GitHub. Syncing is paused. | Reconnect -> `/settings?section=connections` |

Activity source map additions (Phase 2 table row GitHub/Agent already defined): GitHub events (PR merged, review requested, CI failed, sync completed with changes) use `code` `#c9cbd6`, source label `GITHUB`; agent run events use `memory` `#a5a6ff`, source `AGENT`. Titles (fact first): "Pull request merged" / "{repo}#{n} {title}"; "Review requested" / "{repo}#{n}"; "CI failed" / "{repo} · {workflow}" (red); "GitHub synced" only if something changed / "{n} updates"; "Run completed" / "{agent} · {duration}"; "Approval requested" / "{agent} · create issue" (amber); "Run cancelled" / "{reason}".

---

## Layout and routes

| Route | Content | Notes |
|---|---|---|
| `/agents` | Agent Command Centre (list) | replaces placeholder |
| `/agents/[agentId]` | Agent detail | `agentId` slug, e.g. `orchestrator`, `projects`; disabled agents render a minimal detail (see below) |
| `/agents/runs/[runId]` | Run detail: trace + raw tool calls | the "full raw detail lives in the Command Centre" (D-12) |
| `/approvals` | Queue + ApprovalDetail; `?id=` preselects | replaces placeholder |
| `/settings` | `?section=connections` (default) \| `ai` | replaces placeholder |

Breakpoints follow Phase 2 (`tab` 720, `desk` 1100). Page container is the Phase 2 container (max 1480, padding `36px 32px 170px`; below 720 `20px 16px calc(bottombar + safe-area + 24px)`). Settings max-width 1280 (ST l.10). Pages scroll inside the shell wrapper.

Nav wiring (no new nav items): Agents `/agents` Alt+9; Approvals badge becomes the real pending count (hidden at 0); Home tiles `N running` / `N waiting` become real; top bar shows the Phase 2 reserved running indicator `N RUNNING` (Mono 500 10.5/.08em, indigo-text, `StatusDot` running) only when N > 0, hidden below 1100 main width via container query; sidebar AI row text becomes `AI READY` (green hollow-to-filled diamond marker `#4fd1a1`), `AI WORKING` (indigo-text, `lo-pulse`), `AI PAUSED` (amber, spend cap or pause-all), `AI NOT CONNECTED` (text-2, no API key). Palette gains two commands: "Open approvals" with hint `{n} waiting` and "View agent activity" (design SH l.388) -> `/agents`.

---

## Component Inventory

### AgentCommandCentre (`/agents`; AG l.11-90, MB M4)

Order, top to bottom, gap 28:

1. **Header** (flex-wrap, space-between): eyebrow `AGENT COMMAND` (indigo-text), H1 "Your autonomous workforce.", Lead: `{n} agents · {a} active · {k} need attention · nothing sends without your approval.` (counts real; "enabled" replaces "active" if zero running: `2 agents live · 0 running · …`). Right actions: amber outline button `verified_user` `{n} approvals waiting` (hidden at 0; links to `/approvals`) and secondary `Pause all runs` / `Resume runs` (see semantics). 
2. **Orchestrator hero** (AG l.24): radius 16, border `rgba(139,140,255,.25)`, bg surface + radial glow, padding 22, grid-lines overlay (AG l.25, decorative, `aria-hidden`, hidden under `prefers-reduced-motion` no change needed since static). Left button (to `/agents/orchestrator`): 56px tile with pulsing diamond, `ORCHESTRATOR` Mono 600 13/.1em, status pill (Badge status), current task line 15px (real: the latest running run's prompt, ellipsis; else "Waiting for your next request."), Meta line `{n} runs today · median {x}s to first tool call` (real, omit part if no data). Right: stat row (Label-sm key over Metric value): `ACTIVE` `QUEUED` `RUNS TODAY` `SPEND MTD` (value `US$4.82`, sub-meta `of US$20 cap` Mono 11 text-3). The design's `uptime 99.9%` and `APPROVALS` stat are dropped (no data source; approvals live in the header button).
3. **Spend strip** (new, D-14; below the hero, surface card, padding 16/18, radius 14, border .07): label `MONTH TO DATE · OCTOBER 2026 · SYDNEY`, value `US$4.82 of US$20.00` Mono 500 12, `Progress`, right-aligned link `Change cap →` (12.5 text-2) to `/settings?section=ai`. At >=100%: Progress red, text `Cap reached. New runs are blocked until the cap is raised or the month rolls over.` (the Phase 2 InlineError pattern is used on the chat surface, not here). Includes `aria-live="polite"` on the text.
4. **Connector** decorative lines (AG l.41-44) keep, `aria-hidden`.
5. **Domain agents grid** (`repeat(auto-fit, minmax(min(100%,250px),1fr))`, gap 12): 10 `AgentCard`s in docs/AGENTS.md order. Live: **Projects** (GitHub agent). Disabled: Home, Career, Social, Outreach, Organization, Knowledge, Goals, Finance, AgentOps.
6. **Recent runs** table (AG l.73-90): `SectionHeader` label `RECENT RUNS` meta `ALL AGENTS · LAST 24 HOURS` (meta in `text-3`, not text-4). Columns: `RUN` (id short `run_9a10`, Meta) · `AGENT` · `TASK` (prompt/title, ellipsis) · `TOOLS` (count) · `TOKENS` (in+out, Mono, e.g. `18.4k`) · `COST` (`US$0.043`; `<US$0.001` below) · `LATENCY` (total duration, e.g. `3.6s`; time to first tool in run detail) · `RESULT` (dot + label) · `TIME` (`HH:mm`). Grid `110px 150px minmax(220px,1fr) 64px 80px 84px 84px 110px 56px`, gap 12, min-width 1000, horizontally scrollable wrapper (`role="table"`, real `<table>` preferred for semantics). Row click and Enter -> `/agents/runs/{id}`; rows are links (`<a>` spanning the row), hover bg `rgba(255,255,255,.025)`, 20 rows with `Show more` ghost button (cursor pagination). Below 720 the table becomes a card list: line 1 agent + result, line 2 task, line 3 Mono meta `tools · tokens · cost · latency · time`.

Empty/loading/error: loading = Skeleton matching hero + card grid; table empty = EmptyState (see Copywriting).

**AgentCard** (AG l.48-69): button-like link, padding 16, radius 14, border 1px `.07` (attention: red .3), bg surface; hover border `.18` + translateY(-1px) 150ms (only when live; disabled cards do not lift). Contents: identity tile 30 + name (Mono 600 11.5 -> Label-sm 600) + `StatusDot` + status label (Mono 600 10.5/.1em) + task line 13.5/1.45 min-h 40 + scan line (2px, `lo-scan 1.8s linear` in agent colour while running, static track otherwise) + 3-up metrics `LAST` `QUEUE` `HEALTH` (Label-sm key, Mono 500 12 value; HEALTH = 7-day success rate, green >=97% else amber, `—` when no runs) + 24-bar sparkline (runs per hour, last 24h, last 3 bars agent colour, `aria-label="Runs in the last 24 hours"` plus a visually hidden summary).
- **Disabled card (D-13):** `StatusDot` hollow, status `NOT CONNECTED`, task line `Not connected · arrives in Phase {N}` (Home 9, Career 5, Social 7, Outreach 6, Organization 4, Knowledge 8, Goals 8; Finance and AgentOps: `Not connected · planned`), metrics and sparkline **omitted entirely** (no `—` rows, no fake bars), scan line omitted, card opacity .75 on identity only, text stays >= 4.5:1, `aria-disabled` is not used because it still links to the minimal detail page. No cost, no runs, ever.

### AgentDetail (`/agents/[agentId]`; AG l.93-214)
Back link `Agent command` (`arrow_back`, text-2) top-left. Header: 56px identity tile, Agent-title H1, status pill, purpose Lead (15px, max 640). Actions (right): `Pause` / `Resume` (secondary, `pause_circle`/`play_circle`). No "Run now" (agents start from orchestrator delegation in this phase; a manual-run affordance is a scheduler concern, deferred). For disabled agents: no actions; body is one full-width EmptyState (see Copywriting) plus the PERMISSIONS and CAPABILITIES cards from the registry (static definition, no stats).
Live agents: two columns (`flex: 1.6 1 560px` main, `1 1 320px` aside), gap 24; stack below 1100.
Main column: **Current task** card (CURRENT TASK label + run id + progress label; progress = completed steps / planned steps where known else `RUNNING`; step bar segments 4px; **ExecutionTimeline** list) shown only while a run is active or for the latest run (label `LAST RUN`); **Queue** section (`N WAITING`; queue rows `01` index + task + source Mono; empty state per design copy); **Recent runs** (this agent; columns `RUN` `TASK` `TOKENS` `COST` `LATENCY` `RESULT` `TIME`).
Aside cards (surface, padding 16, radius 14, gap 16): error card (red, only if last run failed or a token is invalid; actions `View run` link and where relevant `Reconnect` -> Settings; design's `RECONNECT` inverse button style kept), **HEALTH** (`SUCCESS` `RUNS · 7D` `AVG RUN`, Metric-size 18 is NOT used; use Title 15/500 for values so no extra size), **CAPABILITIES** chips, **PERMISSIONS** (tool tier per capability: `READ`, `PREPARE`, `ASK FIRST` for APPROVE, `NEVER` for HIGH_RISK; Badge tag colours per AG `PERM`), **TOOLS** (name Mono 12 + state `connected` green / `not connected` red / `unavailable` red with reason; e.g. `github.create_issue` `unavailable · issues-write token missing`), **CONFIGURATION** (Model `Select` per D-16: Opus 5.5 / Sonnet 5.5 / Haiku 4.5 with the current default marked `default`; saving shows toast `Model changed to Sonnet 5.5`; per-run limits shown read-only as Mono rows `Max tool calls 12`, `Max tokens 60k`, `Max wall time 120s`). The design's Autonomy Suggest/Ask/Act control is **not built** (autonomy levels are not in Phase 3 scope; the tool tier is the enforced policy).

### RunDetail (`/agents/runs/[runId]`)
Back link to the agent. Header: run id, agent, status pill, prompt (Title). Facts grid (auto-fit 220): `MODEL` `STARTED` `DURATION` `TOKENS IN/OUT/CACHE` `COST` `TOOL CALLS` `LIMITS USED`. Actions by state: `Cancel run` (running or waiting; secondary), `Retry` (failed, cancelled, expired; primary), no actions when completed. Below: **ExecutionTimeline** (same component as the AI panel trace but at timeline size, AG l.123) and a **Tool calls** table: `#` `TOOL` `TIER` (badge) `STATUS` `LATENCY` with a Disclosure per row revealing `INPUT` and `OUTPUT` (raw, pretty JSON in `inset` Mono 11.5 block, max-height 280, scroll, copy button `content_copy`). Secrets are redacted server-side before reaching the client (any value under keys like token/authorization/secret renders `[redacted]`). No chain-of-thought is stored or shown (docs/AGENTS.md): only summaries, inputs and outputs.

### ExecutionTrace (shared; AI panel size: SH l.178-197, MB M2; timeline size: AG l.123)
`role="list" aria-label="Execution trace"`, each step `role="listitem"`: grid `18px minmax(0,1fr) auto` (panel) / `52px 20px minmax(0,1fr) auto` (timeline, adds a time column Mono 11.5 text-2 `HH:mm`). Rail: 9px dot + 1px connecting line `rgba(255,255,255,.09)`. Step content: actor (Mono 500 10.5/.07em in agent colour: `LIFEOS`, `PROJECTS AGENT`), action (13.5px text; e.g. `Searching your repositories`, `Reading open pull requests`), tool line (Mono 11 text-3, `→ github.list_pull_requests`), state label (Mono 500 10.5 right). Step kinds: `delegate` (orchestrator -> agent) and `tool`.

| Step state | Dot | Label | Extras |
|---|---|---|---|
| queued | hollow ring `rgba(255,255,255,.25)` | `QUEUED` text-3 | dot/rule opacity .4 |
| running | indigo fill + `lo-pulse 1.2s` | `RUNNING` indigo-text | 2px scan line `lo-scan 1.4s` under the row |
| done | green fill | duration (`2.1s`) text-3 | |
| waiting approval | amber ring, static | `WAITING` amber | row links to approval card |
| failed | red fill | `FAILED` red | error summary line 12.5px text-2 under the tool line: `{what happened}` |
| cancelled | text-3 ring | `CANCELLED` text-3 | |

**Expandable I/O (D-12):** when a step has recorded summaries, the whole step header is a `button` (`aria-expanded`, `aria-controls`) with a trailing `expand_more` 16px chevron (text-3). Expanded region (padding 8/0/0/28, `lo-fade` 150ms): two blocks `INPUT` and `OUTPUT` (Label-sm key, `inset` block, radius 8, padding 10/12, Mono 11.5 text-2, wrap, max-height 160 scroll). Summaries are server-produced and bounded (<= 600 chars each); overflow ends with `… full detail in the run`, a link to `/agents/runs/{id}`. While running, only INPUT is available. Steps stream in live over the existing SSE hub; new steps animate `lo-fade .2s`; focus is never moved by streaming. A polite live region (visually hidden) announces `Projects agent finished` / `Run failed` only at run end, not per step.

### AI panel (replaces Phase 2 "not connected" body; SH l.150-262, MB M2)
Shell, header, docking, composer geometry: Phase 2. Changes:
- **Header sub-label** (Mono 10/.08em text-3): `ORCHESTRATOR · ONLINE` · `ORCHESTRATOR · WORKING` · `ORCHESTRATOR · PAUSED` (pause-all) · `ORCHESTRATOR · SPEND CAP REACHED` (red-tinted label text uses `text-2`, with a leading red 6px dot) · `ORCHESTRATOR · NOT CONNECTED` (no Anthropic key). Header buttons: `New conversation` (`edit_square`, starts a new thread; no-op with a focus return if the current thread is already empty), new `Recent conversations` (`history`, 30px, `aria-expanded`), `Close assistant`.
- **Recent conversations view (D-10):** replaces the body (not a modal) with a list under header: Label `RECENT` + rows (padding 10/12, radius 9, border .07, hover as suggestion rows): title 13.5px ellipsis (first prompt truncated to 48 chars, default; Haiku titling deferred), Mono 11 text-3 `Thu 14:02 · 4 messages`. Current thread has the Phase 2 selected tint. Shows the 20 most recent; footer none (no search in this phase). Empty: Small text-2 `No conversations yet.` Selecting a row loads the thread and returns focus to the composer; `Esc` returns to the thread view first.
- **Empty thread:** H2 `What should we look at?` + Small body `I can answer from your GitHub data, look into a repository, and prepare actions for your approval. Anything that creates or changes something outside LifeOS waits for you.` + the four EXAMPLES rows replaced with **live-agent-relevant** ones: `priority_high` "What's happening in my repos?" · `code` "Which pull requests need my review?" · `error` "Is CI passing on my default branches?" · `edit_note` "Create an issue in {first repo}" (the repo name is a real synced repo; if none are synced yet, this row is omitted).
- **Turn** (padding 20, bottom border .05, `lo-fade .25s`): `YOU · HH:mm` + prompt 16px/1.4; ExecutionTrace (panel size); **ResultCard**; follow-up chips.
- **ResultCard** (SH l.208-251): radius 12, border `rgba(139,140,255,.22)`, bg `linear-gradient(180deg, rgba(139,140,255,.08), rgba(139,140,255,.02))`, padding 14, `lo-rise .25s` on first token. Label `RESULT` (Mono 500 10.5/.08em indigo-text). Streaming: the answer text grows in place (Body 14/1.5, text; headline sentence Title 15/500 once it completes a first line is NOT restyled mid-stream: the first paragraph is simply Body until `done`, then the card promotes it to the headline style with no layout shift beyond line-height), a 7x14 caret block `rgba(139,140,255,.8)` blinks 1s while streaming (static under reduced motion). `aria-busy="true"` on the card until done; no `aria-live` on the streaming text (screen readers get the final text via the polite end-of-run announcement and can read the card). Rendered content is **escaped text** with a small safe subset: paragraphs, `-` bullet lists, `inline code`, and `owner/repo#123` / `owner/repo` citations rendered as **CitationChips** (Mono 11.5, padding 2/6, radius 5, border .1, bg fill-1; link to the synced repo/PR/issue URL on github.com only, `target="_blank" rel="noopener noreferrer"`, `open_in_new` 12px, `aria-label="{ref}, opens GitHub"`). No raw HTML, no images, no other links.
  - Variants: **text** (default), **list** (SH l.222: rows `PR`/`ISS`/`CI` key Mono 500 10.5 coloured, title 13.5, subtitle 12 text-2; rows link as citations) and **approval** (below). No events/plan variants.
  - Stop: while running the Send button becomes `Stop` (`stop` icon, `aria-label="Stop run"`, same 30px, bg fill-3, icon `text`) and cancels the run; the trace shows `CANCELLED`; ResultCard shows what streamed so far followed by Mono 11 text-3 `Stopped at {HH:mm}.`
  - Follow-up chips (h28, padding 0 10, radius 7, border .1; hover border `rgba(139,140,255,.45)`): generated from the answer only when meaningful (`Open approvals`, `Show failing CI`); none by default.
- **Approval variant of ResultCard (D-03; SH l.233-242):** nested block radius 10, bg surface, border `rgba(232,184,106,.3)`, padding 12, gap 10. Header `verified_user` + `APPROVAL REQUIRED` (amber Mono 500 10.5/.07em). Body: `{agent} wants to create a GitHub issue in {owner/repo}`, issue **title** (Title 15/500), body preview (Body 13px/1.5 text-2, clamped to 4 lines with `Show full preview` disclosure), labels as Badge tags if present, Meta line `GitHub · {owner/repo} · expires {EEE d MMM HH:mm}`. Actions row: primary `CREATE ISSUE` (Button md-ish h30 -> uses the approval-button style at h32; icon `check`), destructive-outline `REJECT`, ghost `Review and edit` (link to `/approvals?id=`). Approve/Reject here operate on the **unedited** payload; editing happens only in ApprovalDetail. After a decision the block collapses to a one-line resolved footer (same copy as ApprovalDetail resolution) and the trace step flips from WAITING. If the approval is later decided elsewhere, the block updates live via SSE.
- **Run blocked / errors in the thread (InlineError, Phase 2 component, full width, padding 14):** copy in Copywriting. The composer stays enabled except at cap/no key, where it is `aria-disabled` with placeholder `New runs are paused` / `Assistant isn't connected` and Send disabled; typing is still allowed (draft preserved).
- Mobile (<720, MB M2): full-screen sheet, header 52 with `expand_more` (close) + diamond + title/sub-label, thread scrolls, composer pinned bottom: `Recent conversations` and `New conversation` live in a header overflow of two 44px icon buttons. Composer height 56 radius 16 per MB; no mic button (voice not available, Phase 2). Safe-area padding bottom. Suggestion/follow-up chips h34 radius 999 scroll horizontally. Resolved approval footers wrap.

### ApprovalsPage (`/approvals`; AP, MB M3)
Header: eyebrow `APPROVAL CENTRE` (amber), H1 headline (real: `One decision is waiting on you.` / `{n} decisions are waiting on you.` / `You are all caught up.`), Lead `Agents can read and prepare. Anything that creates, sends, changes or deletes waits here until you decide.` Two panes (`flex-wrap`, gap 24): **list** `flex: 1 1 340px; max-width 440` and **detail** `flex: 2 1 520px`. Below 720: list full-width; selecting an item navigates to a full-screen detail (`?id=`) with top bar `arrow_back` + Label `APPROVAL · {i} OF {n}` (amber) and prev/next via swipe-free 44px chevrons in the header; Approve/Edit/Reject stack pinned bottom (16px side, bottom `safe-area + 30`): APPROVE-consequence button h52 radius 14, Edit + Reject side by side h48 radius 12. The list then is the default view at that route.

**ApprovalList**: segmented control `Pending · {n}` / `Resolved` (AP l.19; `role="tablist"`, selected `selected` bg `#1f222b`, text `text`; unselected text-3 -> use `text-2`? keep `text-3` 4.9:1 ok). `role="listbox" aria-label="Pending approvals"`, items `role="option" aria-selected`, roving arrow-key focus. **ApprovalItem**: padding 14, radius 12, gap 8; row 1 agent name (Mono 500 10.5/.07em agent colour) + spacer + kind Badge tag (`CREATE ISSUE`, neutral; danger kinds red); row 2 summary 14/1.4 (`Create an issue in owner/repo: "{title}"`); row 3 Mono 11 text-3 `Requested 14:02` + state text (colour map) + `EDITED` amber Badge if the owner edited it. Selected: border `rgba(139,140,255,.4)`, bg `rgba(139,140,255,.06)`. Hover border `.18`. Resolved list shows the 50 most recent, newest first, with executed/rejected/expired/failed states.

**ApprovalDetail** (AP l.42-86): `article aria-label="Approval detail"`, radius 16, border `rgba(255,255,255,.08)` (danger kinds `rgba(240,122,110,.35)` — none ship in Phase 3 but the component supports it), overflow hidden. Sections separated by `.06` hairlines, padding 20/22:
1. Header (bg `linear-gradient(180deg, rgba(232,184,106,.06), transparent)`): line `PROJECTS AGENT` (agent colour) `wants to` (text-3) `create a GitHub issue` (text); H2 title = the issue title (live, reflects edits).
2. Facts grid (auto-fit 220, gap 18/24; key Label-sm text-3, value 13.5/1.5): `WHAT WILL HAPPEN` "Creates one issue in {owner/repo}. It is visible to anyone who can see that repository." (private/public from synced repo visibility: "Visible to you and collaborators." for private) · `WHY` (agent's stated reason, from the run summary; omitted if none) · `WHICH ACCOUNT` `GitHub · @{login} · issues-write token ····{last4}` · `WHEN` `Immediately after approval`.
3. `WHAT DATA WILL BE SENT` (icon rows 13px): `check_circle` green "Issue title ({n} characters)" · "Issue body ({n} characters)" · "{n} labels: bug, docs" · `shield` blue "No email, calendar or contact data". 
4. `PREVIEW` section with Meta `{n} chars`: **Preview** block (`inset`, border .06, radius 10, padding 16, Body 14/1.65, `white-space: pre-wrap`; shows title as Title 15/500 line, labels as tags, body below). **Edit mode** (button `EDIT` toggles to `DONE`): replaces the preview with Fields: `Title` (Input, max 256, required), `Body` (Textarea 7 rows, resize vertical, max 65,536), `Labels` (Input, comma-separated, each <= 50 chars, max 10); `Repository` is read-only text (not editable: the write token's scope was granted per repo). Zod runs on `DONE`/approve; errors are field-level (`Title is required.`, `Title must be 256 characters or fewer.`, `Labels must be comma-separated, up to 10.`). When the payload differs from the agent's original, show amber `EDITED` Badge next to the PREVIEW label and a Disclosure `View agent's original` (read-only inset block with the original title/body/labels) — both versions are kept (D-04). Edits are held client-side until Approve or `DONE`; `DONE` persists the edit server-side (audit-logged) without approving. Leaving with unsaved edits: `beforeunload` is not used; the draft is kept in component state for the session only.
5. Footer (pending): `CREATE ISSUE` approve button (h38, padding 0 18, radius 9, bg `#8b8cff`, `check` icon, 13px 600 .06em UPPER; label names the consequence per DS l.105), `EDIT`/`DONE`, `REJECT` (outline red), spacer, Meta `requested 14:02 · expires Thu 15 Oct 14:02`. Approve behaviour: click -> button `loading` (aria-busy, width kept) and Edit/Reject disabled; server re-validates with zod, executes, and returns. No second confirmation dialog: the preview is the confirmation. A repeat click is a no-op (idempotent key per approval).
   Approve disabled states: the write token is absent or invalid -> button disabled with inline Small amber text above the footer `The issues-write token is missing, so this can't be created. Add it in Settings → Connections.` with a `Open Connections` ghost link; expired -> footer replaced by the resolved footer.
6. **Resolved footer** (replaces the pending footer; bg tinted by state; `lo-fade .2s`; **no Undo button** — the design's Undo (AP l.83) is removed because an executed GitHub write cannot be undone from LifeOS): icon + text + optional action.

| State | Icon / colour | Text | Action |
|---|---|---|---|
| Executing | spinner, indigo | `Creating the issue on GitHub…` | none |
| Executed | `check_circle` green, bg `rgba(79,209,161,.06)` | `Issue created: {owner/repo}#{n}. Approved at {HH:mm}.` | `View on GitHub` (secondary xs, external) |
| Execution failed | `error` red, bg `rgba(240,122,110,.06)` | `Approved, but GitHub rejected it: {reason}. Nothing was created.` | `Retry` (primary xs; same idempotency key; re-validates) |
| Rejected | `block` red, bg `rgba(240,122,110,.06)` | `Rejected at {HH:mm}. Nothing was created and the run was cancelled.` | none |
| Expired (D-05) | `schedule` text-3, bg `rgba(255,255,255,.03)` | `Expired {EEE d MMM HH:mm}. Nothing was created and the run was cancelled.` | none |
| Cancelled (run cancelled by owner) | `block` text-3 | `The run was cancelled before this was decided. Nothing was created.` | none |

Live updates: the list and detail subscribe to the SSE hub; a decision made in the AI panel or on another device flips the detail to its resolved footer with a polite announcement `Approval {state}`. Approve/Reject surface errors as the red toast `Couldn't record that decision. Try again.` and keep the footer pending.

### SettingsPage (`/settings`; ST)
Header: eyebrow `SETTINGS`, H1 per section (`Connections`, `AI and spend`). Two-column layout (ST l.15): sticky section nav `flex: 0 0 200px` (`aria-label="Settings sections"`, items h34 radius 8 icon + label, current = bg `selected` + text, `aria-current="page"`), content `flex: 1 1 560px`, gap 28. Sections shipped: **Connections** (`extension`), **AI and spend** (`auto_awesome`). Design sections without a backing feature (Profile, Agents, Permissions, Notifications, Security, Appearance, Automation, Data, System) are **not listed**. `Sign out` stays as a Secondary button in the page header (Phase 2 behaviour). Below 720 the nav becomes a horizontally scrolling segmented control above the content (44px tall items).

**Connections section:** Lead 14px text-2 `Accounts LifeOS reads from and, with your approval, acts on. Tokens are encrypted and never shown again.` Rows (gap 8) in order: **GitHub · read access**, **GitHub · create issues**, **Anthropic API**.

**ConnectionRow** (ST l.24-35): flex-wrap, gap 14, padding 14/16, radius 12, border `.07` (error: `rgba(240,122,110,.3)`), bg surface. Monogram tile 36 (radius 9, Mono 600 11): `GH`, `GH`, `AI`. Text block: name 14.5/500; detail 12.5 text-3, Mono for ids. Status (Mono 600 10.5/.1em + 7px dot): `CONNECTED` green · `NOT CONNECTED` text-3 hollow · `RECONNECT` red (token rejected/expired) · `SYNCING` indigo-text (spinner dot) for the read row during a sync. Action button h32 min-width 110 radius 8: `Connect` (primary), `Replace` (secondary, when connected), `Reconnect` (inverse, when RECONNECT). Secondary row actions in the expanded panel.
Details by row:
- **GitHub · read access** detail connected: `@{login} · ····{last4} · read-only · expires 14 Jan 2027 · {n} repositories`; not connected: `Add a fine-grained read-only token to sync repositories, pull requests, issues and CI.` Below the row (Disclosure `{n} repositories`): the effective repo list (D-06) as Mono 12 `owner/name` rows with `lock` for private, max-height 240 scroll, plus a "Sync" footer line Mono 11 text-3 `Last synced 14:02 · next about 14:17` or `Last sync failed 14:02: {reason}` (red) with `Sync now` (secondary xs, `refresh`).
- **GitHub · create issues** detail connected: `····{last4} · issues: write · {n} repositories · expires …`; not connected: `Optional. Without it, LifeOS can read GitHub but can't create issues.` Scope warning: if the detected permissions include anything beyond Issues write (e.g. contents write), show an amber Small line `This token can do more than create issues. Use a fine-grained token with Issues: write only.` and still allow saving (the app only uses Issues; owner decides).
- **Anthropic API** (read-only; ADR-007 keeps this key in `.env`): detail `Set in the server environment (ANTHROPIC_API_KEY). Not editable here.`; status `CONNECTED` / `NOT CONNECTED`; **no action button**. Connected shows `Default model Opus 5.5`.

**Token entry (expands inline below the row, `lo-rise`):** panel padding 16/18, radius 12, bg `inset`, border `.08`. Fields: Label `Fine-grained personal access token`, `Input` `type="password"` `autocomplete="off"` `spellcheck="false"` `autocapitalize="off"` `name` unset from browser autofill (`data-1p-ignore`), Mono; helper (Small text-2) `Create it at github.com/settings/personal-access-tokens. Read token: Repository permissions: Contents, Metadata, Pull requests, Issues, Actions, Commit statuses all read-only.` (write token: `Issues: Read and write on only the repositories you choose.`). Actions: primary `Save token` (loading label `Verifying…`), ghost `Cancel`. On success the panel closes, row updates, toast `GitHub connected · {n} repositories` (write: `Issue creation enabled · {n} repositories`). The token text is cleared from state immediately after submit, never echoed, never put in URLs/logs/toasts. Errors (InlineError-style compact, red, above actions, `role="alert"`): `GitHub rejected this token. It may be expired, revoked, or copied incompletely. Check it and try again.`; `This token is valid but has no repository access. Choose at least one repository when you create it.`; `Couldn't reach GitHub. Nothing was saved. Try again.`; empty submit: field error `Paste a token to continue.`. After connection: `Remove` is a ghost destructive text button in the expanded panel -> Dialog (below).

**AI and spend section (D-14):** Row card "Monthly spend cap" (ST rows pattern l.62-70: label + description left, control right): `Input` number prefixed `US$` (adornment), width 140, min 1, max 1000, step 1, default 20; button `Save cap` (secondary; primary when dirty); toast `Spend cap set to US$40`. Description `New runs are blocked once this month's spend reaches the cap. Runs already in progress finish. The month runs on Sydney time.` Below it the MTD block: Label `THIS MONTH · OCTOBER 2026`, Metric value `US$4.82`, `Progress`, Mono 11 text-3 `24% of US$20.00 · resets 1 Nov 00:00 AEDT`, and a compact breakdown table by model (`MODEL` `INPUT` `OUTPUT` `CACHE` `COST`). Row "Models" lists the three defaults (read-only text; per-agent change is in the Command Centre): Orchestrator Opus 5.5 · Domain agents Sonnet 5.5 · Triage Haiku 4.5.

### ApprovalNotification & Home wiring
Notification rows use the existing NotificationRow; no new component. Home StatusTiles: `AGENTS` -> `{n} running` (0 running stays `0 running`), `APPROVALS` -> `{n} waiting` (amber dot). Home "Agent activity" section: replaces its EmptyState with the five most recent real `AGENT` activity items when any exist, otherwise keep the Phase 2 EmptyState with copy updated below. Home "Active projects" EmptyState copy updated once repos have synced (see Copywriting); the section itself is wired in Phase 5.

---

## Interaction contracts

**Pause / resume / retry / cancel (Claude's discretion, AGT-05; follow docs/AGENTS.md runtime states):**
- `Pause all runs` (Command Centre): sets a global flag; **new** runs are not started and the AI panel shows `PAUSED`; in-flight runs finish. Button toggles to `Resume runs`; toast `Runs paused. Running work will finish.` / `Runs resumed.` Per-agent `Pause`/`Resume` does the same for that agent (orchestrator delegation to a paused agent returns a trace step `FAILED` with `Paused by you`).
- `Cancel run`: available on `running` and `waiting` (approval) runs; stops at the next safe point (between tool calls); a tool call already dispatched may complete. Result `Cancelled`. A pending approval attached to a cancelled run becomes `cancelled`. Toast `Run cancelled.`
- `Retry`: creates a **new run** with the same input; links back (`Retry of run_9a10`); available on failed/cancelled/expired runs. Never re-executes a side effect: idempotency keys protect writes.
- Approve/Reject/Edit semantics: see ApprovalDetail. Reject resumes nothing and cancels the run; Approve resumes the run, which finishes with the tool result.
- Busy states: every mutating button uses Button `loading`; on server error revert and show the red toast (5s).

**Live updates:** all lists (`/agents`, runs tables, `/approvals`, sidebar badge, Home tiles) update from the Phase 2 SSE hub with the `lo-in` enter animation for new rows; no auto-scroll; when SSE is down the Phase 2 `RECONNECTING` label appears in the page header Meta and data is served from the last fetch.

**Keyboard:** Phase 2 map unchanged. Additions: in `/approvals` the list is a listbox (↑/↓ select, Enter focuses the detail's first control, `A`/`R` shortcuts are NOT added: irreversible actions get no single-key shortcut). In the trace, Enter/Space toggles a step. In the AI panel `Esc` while a run streams does **not** cancel it (Esc closes the panel; the run continues and the thread is resumable); only `Stop` cancels. ⌘J behaviour unchanged.

**Focus management:** after Approve/Reject succeeds focus moves to the resolved footer (`tabindex=-1`, announced by its `role="status"`); after a decision in the list the next pending item is selected only by click, never automatically (avoids approving the wrong thing).

---

## Copywriting Contract

Voice: Phase 2 (calm chief of staff, fact first, no exclamation marks, no emoji).

| Element | Copy |
|---------|------|
| Primary CTA (phase) | Approval: `CREATE ISSUE` (names the consequence; never "Confirm" / "Approve" generic). Settings: `Save token`. AI panel: icon `Send`. |
| Command Centre eyebrow / H1 | `AGENT COMMAND` / Your autonomous workforce. |
| Command Centre lead | `{n} agents · {a} running · {k} need attention · nothing sends without your approval.` (0 values stay: `10 agents · 0 running · 0 need attention · …`) |
| Pause-all | `Pause all runs` / `Resume runs` |
| Recent runs empty | EmptyState icon `memory`, title **No runs yet.**, body `Ask LifeOS something in the assistant. Each run appears here with its tool calls, tokens and cost.` |
| Agent queue empty | `Queue is empty. This agent picks up work when the orchestrator delegates to it.` |
| Disabled agent task line | `Not connected · arrives in Phase {N}` / `Not connected · planned` |
| Disabled agent detail EmptyState | icon `memory`, title **{Agent} isn't connected yet.**, body `{Purpose sentence}. It arrives in Phase {N}. Until then it has no runs, cost or activity.` |
| Approvals empty (pending) | title **Nothing waiting on you.** body `When an agent prepares something that leaves LifeOS, it appears here with exactly what will happen.` |
| Approvals empty (resolved) | title **No decisions yet.** body `Approved, rejected and expired requests are kept here.` |
| Approvals detail not found | InlineError label `ERROR · APPROVAL`, title **That approval isn't available.** · What happened: It may have been removed or the link is out of date. · Why: No approval with that id exists. · What to do: Choose one from the list. · Action none |
| AI panel empty heading | What should we look at? |
| AI panel empty body | I can answer from your GitHub data, look into a repository, and prepare actions for your approval. Anything that creates or changes something outside LifeOS waits for you. |
| AI composer placeholder | Ask LifeOS anything… (cap: `New runs are paused`; no key: `Assistant isn't connected`) |
| AI disabled label at cap | `ORCHESTRATOR · SPEND CAP REACHED` |
| No GitHub data yet (chat) | assistant answers from state: `GitHub isn't connected yet, so I can't see your repositories. Add a read token in Settings → Connections.` rendered as a ResultCard text variant with ghost link `Open Connections`. |
| **Cap-reached error (D-15)** | InlineError label `ERROR · SPEND CAP`, icon `error`, title **LifeOS can't start a new run.** · What happened: Your request wasn't sent. · Why: This month's AI spend reached the US${cap} cap. · What to do: Raise the cap in Settings. Runs already in progress will finish. · Action: `OPEN SETTINGS` (inverse, `/settings?section=ai`) |
| No key error | InlineError `ERROR · ORCHESTRATOR`, title **LifeOS can't answer yet.** · What happened: Your request wasn't sent anywhere. · Why: The Anthropic API key isn't configured on the server. · What to do: Set ANTHROPIC_API_KEY in the server environment and restart LifeOS. · Action none |
| Run failed error (in thread) | InlineError `ERROR · RUN`, title **That run didn't finish.** · What happened: {short reason, e.g. "GitHub rate limit reached"}. · Why: {cause or "The run stopped after {n} tool calls."} · What to do: {Try again in a few minutes. | Open the run for details.} · Action `TRY AGAIN` (Retry) |
| Run limit hit | same pattern: title **That run stopped at its limit.** · What happened: The run reached its {tool-call\|token\|time} limit. · Why: Limits keep a single run from spending too much. · What to do: Ask a narrower question, or open the run to see what finished. |
| GitHub sync error (Connections) | Row error line: `Last sync failed 14:02: GitHub rate limit reached. LifeOS retries automatically.` / `Last sync failed 14:02: token rejected. Reconnect to resume.` |
| Token removed toast | `GitHub read token removed` / `Issues-write token removed. Creating issues is now unavailable.` |
| Write token absent (chat, when agent tries) | Trace step `FAILED`, summary `Creating issues needs the issues-write token.`; ResultCard text `I can't create issues yet. Add an issues-write token in Settings → Connections.` |
| Connections lead | `Accounts LifeOS reads from and, with your approval, acts on. Tokens are encrypted and never shown again.` |
| Home Agent activity empty (Phase 2 copy updated) | **No agents running.** `Agents run when you ask LifeOS or when work is delegated. Ask something in the assistant to start.` Header link `Agent command →` |
| Home Active projects empty (once synced; page wiring Phase 5) | unchanged Phase 2 copy until Phase 5; no GitHub numbers on Home in this phase except activity items |
| Toasts | `Issue created in {owner/repo}` · `Approval rejected` · `Runs paused. Running work will finish.` · `Runs resumed.` · `Run cancelled.` · `Model changed to {model}` · `Spend cap set to US${n}` · `Couldn't record that decision. Try again.` · `Couldn't save that. Try again.` |
| Empty/load error for Command Centre | route error boundary (Phase 2): `This page couldn't load.` |

### Destructive and irreversible actions

| Action | Approach |
|---|---|
| **Create issue** (executes a GitHub write) | Not destructive but irreversible from LifeOS. Confirmation = the readable preview + the consequence-named `CREATE ISSUE` button. No extra dialog. Idempotent. |
| **Reject approval** | Final for that request; cancels the run. No dialog (low impact, nothing is changed anywhere); toast `Approval rejected`. |
| **Remove token** (read or write) | Dialog (Phase 2 DS l.204 style). Title **Remove the {GitHub read\|issues-write} token?** Body `The encrypted token is deleted from LifeOS. {Read: Syncing stops and synced GitHub data stays until you reconnect. \| Write: LifeOS can no longer create issues.} You can add a token again at any time.` Buttons: Secondary `Cancel` + Destructive `REMOVE TOKEN`. Focus starts on Cancel. |
| **Cancel run** | No dialog; toast. A cancelled run is retryable. |
| **Pause all runs** | No dialog; reversible with one click. |
| **Lower the spend cap below current spend** | Allowed; the Save button's helper shows Small amber `This is below this month's spend (US$4.82). New runs will be blocked now.` No dialog. |
| **Thread / run / approval deletion** | Not in scope (nothing is deletable in Phase 3). |

---

## Accessibility contract (additions to Phase 2)

- Streaming text is not in a live region (would spam). Run end, approval requested, run failed are announced once via the Phase 2 polite region. The `StatusDot` and states always have text.
- Trace step toggles: `button`, `aria-expanded`, `aria-controls`. Timeline is an `ol`/`ul` with `aria-label`. Progress bar has role + text.
- ApprovalList: `listbox/option` per design with roving tabindex; ApprovalDetail is a labelled `article`; Edit fields have visible labels; field errors tied with `aria-describedby`; the resolved footer is `role="status"`.
- Token input: `type="password"`, a visible label, helper text via `aria-describedby`; the stored token is never in the DOM after save; show/hide is intentionally not offered.
- Dialog: Phase 2 dialog contract (modal, trapped, Esc, focus return).
- Colour is never the only signal (state words next to every dot). Contrast: `text-3` >= 4.5:1 for all meta; do not use `text-4` for informative copy (the design does for `ALL AGENTS · LAST 2 HOURS` / `N WAITING`; this contract uses `text-3`).
- Touch targets >= 44 below 720: row action buttons, trace toggles (the entire step header is the target), segmented controls, nav items, Approve/Edit/Reject (52/48/48), composer, history/new buttons.
- Tables: real table semantics (`<table>`, `<th scope="col">`) on desktop; card list below 720 with the same data and labelled values.
- Motion: reduced-motion removes pulses, scan lines, caret blink, `lo-rise`/`lo-in`; state remains conveyed by labels.
- Time: Australia/Sydney 24h everywhere, `<time datetime>`; durations `1.8s`, `1m 52s`; cost `US$0.043`, always with the `US$` prefix to avoid ambiguity; tokens abbreviated `18.4k`, full number in `title`/detail.
- Security (UI side): no secret value reaches the client after save; external links only to validated `https://github.com/...` URLs; server-action behind owner guard (T-02-45); all rendered agent/GitHub text is escaped (issue titles, bodies and PR titles are untrusted input).

---

## Motion (additions; all stop under reduced motion)

| Name | Trigger | Spec |
|---|---|---|
| agent ring pulse | running status dot / running trace dot | `lo-pulse` 1.2-1.4s ease-out infinite |
| scan line | running card / running trace step | 2px gradient sweep `lo-scan` 1.4-1.8s linear infinite (define keyframe `@keyframes lo-scan { from { background-position: -50% 0, 0 0 } to { background-position: 150% 0, 0 0 } }` using `background-size: 35-40% 100%, 100% 100%`) |
| trace step state | state change | opacity transition 200ms |
| card hover lift | hover (live cards only) | translateY(-1px), border `.18`, 150ms |
| step expand | disclosure | height auto via grid-rows 0fr->1fr 150ms + chevron rotate |
| result card | first token | `lo-rise` 250ms |
| stream caret | while streaming | blink 1s steps(2) |
| resolved footer | decision | `lo-fade` 200ms |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable (shadcn not used) |
| third-party | none | not applicable |

---

## Open implementation notes for the planner

1. Read `node_modules/next/dist/docs/` before writing Next code (AGENTS.md): dynamic route params (`/agents/[agentId]`, `/agents/runs/[runId]` — static `runs` segment must win over `[agentId]`), `searchParams` handling, streaming responses for chat (route handler vs server action), `after`/background work, `forbidden`/`notFound`.
2. Regenerate the Material Symbols subset with the Phase 3 icon list and add `lo-scan`. Add `src/ui/field.tsx`, `disclosure`, `dialog`, `progress`, `status-dot`; delete none.
3. Data the UI expects: agent registry (id, name, icon, colour, purpose, enabled, arrival label), per-agent live status + queue + 24h sparkline buckets + 7d success rate + avg run, runs (id, agent, prompt, tool count, tokens in/out/cache, cost, duration, time-to-first-tool, state, retryOf), steps (kind, actor, action, tool, state, startedAt, duration, inputSummary, outputSummary, error), approvals (id, run, agent, kind, original + edited payload, state, createdAt, expiresAt, decidedAt, result {url|error}), spend (MTD by model, cap, month bounds in Sydney), connections (provider, last4, scopes, expiry, status, last sync, repo list), threads (id, title, updatedAt, message count).
4. Phase 2 follow-ups folded into this phase: real approvals count (sidebar + Home), real agents running count, top-bar `N RUNNING`, sidebar AI row states, palette commands.
5. Design deviations deliberately made (so the checker/auditor don't flag them): Undo on resolved approvals removed; Run now removed; Autonomy control not built; orchestrator `uptime` and `APPROVALS` stat removed; settings sections limited to two; design's 9.5px labels raised to 10.5; `text-4` informative meta raised to `text-3`; design mic buttons omitted; events/plan ResultCard variants not built.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS (note: inherits the Phase 2 dense-UI scale; two roles added)
- [ ] Dimension 5 Spacing: PASS (Phase 2 exceptions + 22px hero card padding)
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
