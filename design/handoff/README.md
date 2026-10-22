# Handoff: LifeOS UI redesign (Almanac)

## Overview

LifeOS is a single-owner personal operating system: agents, approvals, projects, calendar, mail and events, socials, finances, career (GitHub), knowledge, goals, briefings, automations and settings. This bundle specifies a **complete new UI layer** for the app. Every screen, component and style is new.

## Rebuild mandate (read first)

This is a **base redesign, not a restyle**.

- **Do not reuse, restyle, wrap or extend any existing UI component in `src/`.** That includes `src/shell/*`, every `*-card.tsx`, `*-list.tsx`, page layouts, the current global stylesheet and any existing Tailwind/utility classes or theme. Build a fresh component library (`src/ui/`) and fresh feature views (`src/features/<route>/`) from this spec.
- **Keep the backend as the contract.** Drizzle schema, server actions/queries, the agents runtime, the approval model, pg-boss jobs, auth, connections and the route URLs stay. The new UI reads and writes through them. Types in `src/lib/*-types.ts` (for example `outreach-types.ts`) are the data contract.
- If a screen needs data the server does not expose yet (event discovery feed, repo file tree, CI runs, commit activity), **add a query or server action**. Do not trim the design to fit the current API. Flag each addition in the PR description.
- Ship route by route behind the new shell. Delete the old component files for a route in the same PR that ships its replacement, so no screen mixes old and new UI.
- Existing markup and class names are not a reference. When this README and the old code disagree, this README and the prototype win.

## About the design files

`design/` contains **HTML design references**: a working, clickable prototype of the intended look and behaviour. It is not production code. Recreate it in the repo's stack (Next.js App Router, React Server Components where data is read, client components for interaction). Open `design/LifeOS.dc.html` in a browser to use it; `?route=<route>&state=loading|empty|error|disconnected` previews any page state.

Each page file holds its own exact values inline (colours, sizes, spacing, copy). When a measurement isn't written down here, take it from that page's file. If a page file and `Design System.dc.html` disagree, the page file is newer and wins.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, copy, states and interactions are final. Match them pixel for pixel. Data and pixel art are placeholders (see *Not in scope*).

## Working with Codex

This repo is linked to Codex. Claude Code leads the build. It can hand self-contained visual work to Codex and review what comes back. `CODEX.md` lists which tasks to delegate, gives a brief template and sets the review rules.

## Bundle contents

| Path | What it is |
|---|---|
| `README.md` | This file: mandate, layout system, screens, behaviour, state |
| `components.md` | The new component library: every primitive and composite with measurements |
| `tokens.css` | Design tokens as CSS custom properties. The only source of colour, type, space, radius, shadow, motion |
| `checklist.md` | Page × state × flow checklist. Tick these off per PR |
| `assets.md` | Pixel-art inventory, sizes, anchors and generation prompts |
| `CODEX.md` | Delegation guide for Codex |
| `design/LifeOS.dc.html` | Shell: masthead, nav, ⌘K palette, ⌘J Ask LifeOS drawer, notifications, toasts, breakpoints, page states |
| `design/<Route>.dc.html` | One file per route (Home, Agents, Approvals, Projects, Organization, Outreach, Socials, Finances, Career, Knowledge, Goals, Briefings, Automations, Settings) |
| `design/Design System.dc.html` | Type, colour, status language, proposal/approval/record treatments, pixel rules |
| `design/pixelkit.js` | Reference isometric office renderer (layout maths, depth sort, palettes) |
| `design/lifeos-data.js`, `design/lifeos-app.js` | Sample data and prototype store. Illustrative only; shows the shape of data each screen needs |
| `design/support.js` | Prototype runtime so the HTML opens locally. Not part of the build |

## Visual direction

- **Almanac:** editorial and calm. Warm paper background, ink text, one terracotta accent.
- **Type:** Newsreader (display serif: page titles, headlines, big numbers, card titles), Instrument Sans (all UI), JetBrains Mono (labels, meta, counts, keys, hashes). Load all three with `next/font`.
- **Structure:** sections are separated by a 2 px ink top rule with a mono uppercase label. Cards (paper-3 fill, 1 px rule border, 10 px radius) are used for repeating objects: summary cards, event cards, repo panels, file tables.
- **Status language:** state always shows as glyph + word + colour, never colour alone.
- **Proposal → approval → record:** anything an agent wants to do in the outside world is a *proposal* (amber, "awaiting your approval"), resolved by the owner (*approved / rejected / expired*), then shown as a *record*. Never show a proposal as done.
- **Icons:** Material Symbols Outlined, 15–20 px, `FILL 0` by default and `FILL 1` for an active toggle.

## Layout system

| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Width | < 720 px | 720–1099 px | ≥ 1100 px |
| Page padding | 20 px 16 px 40 px | 28 px 28 px 56 px | 28 px 40 px 64 px (Home: 36 px top) |
| Masthead | 56 px, logo + page title, search, bell | 56 px, 5 routes + More | 56 px, 8 routes + More |
| Bottom tab bar | Home, Agents (count), Outreach, Socials, More sheet | none | none |

- **Content max width: 1680 px, centred.** Every page uses the full width up to that cap. Do not reintroduce narrow 1080–1440 px containers; the redesign removed them on purpose.
- Multi-column pages use flex rows with `flex-wrap: wrap`, a `flex-basis` per column and **ratios instead of fixed max widths**, so columns fill the space and stack cleanly. Typical main : side ratio is 2 : 1 (main `flex: 2 1 520px`, side `flex: 1 1 300–340px`).
- Long-form reading text (Knowledge editor, Briefings body, Settings forms, README) caps at about 860–960 px so line length stays readable.
- Agents and Outreach are full-bleed app views (scene/panes fill the viewport under the masthead; inner scroll areas).
- The main element scrolls; the masthead is fixed. Route changes reset scroll to top.

## Screens

Layout notes follow. Exact values are in each `design/<Route>.dc.html`.

### Shell — `LifeOS.dc.html`
- **Masthead (56 px, 1 px bottom rule):** italic Newsreader "LifeOS" wordmark (23 px). Primary nav, 14 px, items padded 8 × 9 px. Current item is weight 600 ink with a 2 px accent underline; others are ink-2. The Agents item carries an amber count badge for pending approvals. **More** menu holds Knowledge, Goals, Briefings, Automations, Settings.
- Right side: "Search or jump ⌘K" field (200 × 34), "Ask LifeOS ⌘J" primary button, bell with unread badge (accent, 16 px), avatar (30 px circle).
- **Routes:** Home, Agents, Projects, Organization, Outreach, Socials, Finances, Career, + More. Shortcuts Alt+1…8 in that order, ⌘, settings, Esc closes overlays. **There is no Approvals route.** `/approvals` redirects to `/agents?view=approvals` and every "open in Approvals" link goes there.
- **⌘K palette, ⌘J drawer (440 px), notifications drawer, toasts:** see checklist.

### Home
Date line + briefing link, one-sentence headline from the digest, counts line. A two-column body (main `flex 1.7`, side `flex 1`) holds What matters, Today agenda with a now line, the keyboard **Needs you** inbox (↑↓ Enter A R, expands in place), office roll call + activity. Below sits the **Across LifeOS** row with Finances, Projects and Outreach summary cards.

### Agents (`/agents`)
Full-bleed. A 72 px toolbar row holds the title, the status line ("n need you" is a link to the Approvals tab, then working · failed · paused · spend), the view switcher and the actions (Motion on/off, Pause all).
- **View switcher (joined segmented buttons):** **Office · Approvals (count) · Table · Runs**.
- **Office:** isometric scene with a camera zoom on enter (320 ms) and a fixed right inspector (440 px desktop, 380 px tablet, stacked below on mobile).
- **Approvals tab:** the full approvals inbox (former Approvals page), embedded with no page title and the inspector hidden so it uses the full width. Pending / Resolved tabs with counts inline; list + detail; ↑↓ A R E; "Approve with edits" when content changed. The inspector's proposal card has "Review in Approvals", which opens this tab with that item selected.
- **Table / Runs:** dense tables; a run row opens the trace.

### Projects
List with status tabs (Active / Paused / Done / Archived / All), health, progress, next task and target. Detail page: tasks with blocked-by, milestones timeline, activity, health reason, linked repos, workspace, context brief. Main `flex 2`, side `flex 1` (max 460 px).

### Organization
Day / Week / Month calendar (D W M), now line, category legend, event detail, Today's plan, conflicts with a proposed fix (→ approval), tasks.

### Outreach
Three-pane mail: mailbox sidebar 248 px · message list 320–400 px · reading pane. Up to 3 accounts with colour dots. The sidebar's **Networking** group has:
- **Discover events (new):** an Eventbrite-style discovery grid of upcoming Sydney events.
  - **Toolbar:** search (events, venues, organisers), When segmented control (Any time / This week / This weekend / Next 30 days), "Free only" toggle pill, Sort select (Best match / Soonest / Most going).
  - **Category chip row** (horizontal scroll) with live counts: All, AI, Startups, Design, Fintech, Engineering, Cybersecurity, Networking.
  - **Source strip:** "n of m upcoming Sydney events, scored against your interests", the feed sources, and an "Add a feed" link to Settings → Connections.
  - **Grid:** `repeat(auto-fill, minmax(min(100%, 290px), 1fr))`, 16 px gap.
  - **Event card** (see `components.md`): 16:9 image, date block, relevance ring, stage badge, title (2-line clamp), date · time · price, venue, organiser · going, category tags + source tag, an AI "why" note when present, and a 4-button action bar: **Save → Interested → Attend → Calendar**. Steps unlock in order; a disabled step's tooltip says why; clicking a reached step undoes it. Saving moves the event into the pipeline.
  - **Empty state:** "No events match these filters." + Clear filters.
- **Event pipeline:** Discovered → Saved → Interested → Attending → Attended → Follow up columns.
- **Follow-ups.**
- "Import event URL" sits in the page header on Discover and Pipeline.

### Socials
Feed with status + platform filters and platform-accurate previews. Review panel (`flex 1.3`, sticky) with variants, live preview, character count and lifecycle actions. Compose. Performance.

### Finances
Overview (range, totals, charts with aria descriptions, category breakdown, rule suggestions, imports), Transactions, Budgets, CSV import (file → preview → result).

### Career (`/career`, `/career/[repo]`)
- **List:** GitHub-style repository index. Profile/activity summary, contribution heatmap filterable by repo, repo list with filter (All / Failing CI / Open PRs), search, archived toggle and sync. Each row shows name, visibility, description, language, stars, CI state, open PRs and last push. Latest activity is grouped by day.
- **Repo page (new):** opens on row click and scrolls to top.
  - **Header:** breadcrumb "‹ Career / alex-morgan /", repo name (Newsreader 34 px), visibility pill, CI status, description, topic chips. Actions: "Linked to <project>" / "Link to project" and "Open on GitHub" (primary). Both stay on one line.
  - **Underline tabs:** Code · Pull requests (n) · Issues (n) · Actions · Insights. Active tab is 600 weight with a 2 px accent underline.
  - **Code:** main column (`flex 2.2 1 600px`) has branch selector, branch count, and a clone pill (single line, ellipsis). Below are a file table (last commit header + rows with icon, name, last message, age) and a README card (Newsreader h2, body 14.5/1.6, dark code block). The sidebar (`flex 1 1 300px`) has About (4 stat tiles, language bar + legend), CI last 12 runs strip (with a failure alert → "Ask Projects to draft an issue"), and Recent commits.
  - **Pull requests:** open/merged header, rows with state icon, title, branch pill, meta and checks state.
  - **Issues:** open count, "Ask Projects to draft an issue", rows with coloured labels.
  - **Actions:** run table (status, message, CI #, branch, duration, when), horizontally scrollable under 640 px.
  - **Insights:** commit activity bar chart (12 weeks), code frequency (+/−), contributors.

### Knowledge, Goals, Briefings, Automations, Settings
See checklist. All use the 1680 px container with ratio columns; reading/editing panes cap near 900 px.

## Interactions and behaviour

- **Motion:** 140 ms fast (hover, press), 200 ms base (panels, menus), 320 ms scene (office zoom). Ease `cubic-bezier(.2,.7,.2,1)`. Card hover lifts 2 px with `--shadow-card-hover`. `prefers-reduced-motion` and the in-page Motion toggle zero all durations and freeze the office at frame 0.
- **Keyboard:** list views use roving focus (↑↓ or J K), Enter opens, single-letter actions as listed per page; shortcuts never fire while typing in a field.
- **Focus:** 2 px accent ring, 2 px offset, on every interactive element.
- **No wrapping in controls:** buttons, pills, tabs and badges are `white-space: nowrap; flex: none`. Toolbars wrap as rows; their controls don't.
- **Toasts:** role=status, 2.6 s, bottom centre (above the mobile tab bar).
- **Page states:** every route implements loading (skeleton matching layout), empty, error (role=alert + retry) and disconnected (names the connection + Reconnect). Copy is in `design/lifeos-app.js → APP.states`.

## State management

- Server state through RSC + server actions. Client state per feature, held in the URL where it should survive reload or sharing: `?view=` on Agents, `?box=` and `?tab=` on Outreach, `/career/[repo]?tab=`, filters on Discover (`when`, `cat`, `free`, `sort`, `q`).
- **Event stage:** `null → SAVED → INTERESTED → ATTENDING` (then `ATTENDED`, `FOLLOW_UP` in the pipeline). One step at a time; undo goes back one step. Persist through the existing outreach event model.
- **Approvals:** pending count drives the Agents nav badge, the Agents status line and the Approvals tab badge. All three read one query, so the numbers always match.
- **New data needs:** event discovery feed (Luma iCal, Eventbrite, Meetup/Humanitix by URL), with relevance score + reason; repo detail (file tree root, README, PRs, issues, CI runs, weekly commits, additions/deletions, contributors) through the read-only GitHub token.

## Design tokens

All values are in `tokens.css`. Components must reference tokens, never raw hex or px literals for colour, type, radius, shadow or motion.

## Assets

Pixel art for the office is placeholder code-drawn art; `assets.md` has sizes, anchors and generation prompts. Event images and repo social previews are placeholders (striped tinted blocks labelled "EVENT IMAGE"). Use the event source's image when the feed provides one, and keep the tinted block as the fallback. Icons are Material Symbols Outlined.

## Accessibility bar

Text contrast ≥ 4.5:1. Lists use `role=list/listbox` with arrow keys, dialogs use `aria-modal`, toasts use `role=status`, errors use `role=alert`. Mobile hit targets ≥ 44 px. Charts get an `aria-label` stating the trend. The office canvas is `aria-hidden` with one DOM button per desk.

## Implementation order

1. `tokens.css` + fonts + a reset. Remove the old global styles.
2. `src/ui/` primitives from `components.md`, each with a story or test page.
3. New shell (masthead, nav, palette, drawers, toasts, tab bar) and the `/approvals` redirect.
4. Home → Agents (Office, Approvals tab, Table, Runs) → Projects → Organization → Outreach (mail, Discover, Pipeline, Follow-ups) → Socials → Finances → Career (list, repo page) → Knowledge → Goals → Briefings → Automations → Settings.
5. Page states for every route, then a visual QA pass at 390, 768, 924, 1280 and 1680 px against the prototype.

## Not in scope / open

- **Placeholder art and data:** all pixel art is code-drawn and all figures are illustrative.
- **Dark theme:** not designed. `pixelkit.js → PAL.night` is a starting point.
- **Event detail page:** the card title opens it, but the page isn't designed yet. Link out to the source URL until it is.
