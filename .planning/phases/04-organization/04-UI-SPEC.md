---
phase: 4
slug: organization
status: approved
shadcn_initialized: false
preset: none
created: 2026-10-09
---

# Phase 4 (Organization) — UI Design Contract

> Visual and interaction contract. Inherits the Phase 2 contract (`.planning/phases/02-shell/02-UI-SPEC.md`) and the Phase 3 additions (`.planning/phases/03-agent-infrastructure-github/03-UI-SPEC.md`) in full: tokens, spacing, typography roles, colour, motion, keyboard map, accessibility, voice, and the primitives `Input/Textarea/Select`, `Disclosure`, `Dialog`, `Progress`, `StatusDot`, `Badge`, `Button`, `EmptyState`, `InlineError`, `Skeleton`, `ConnectionRow`. Nothing there is re-decided. This file only adds the Phase 4 surfaces. Layout source of truth: `design/Organization.dc.html` ("OR"), `design/Settings.dc.html` (Accounts row pattern), `design/Approvals.dc.html` l.102-104 (Create event approval), `design/Mobile Layouts.dc.html`, `design/INVENTORY.md`. Names, events and numbers in the design are placeholder and never ship.

Provenance: CONTEXT.md D-01..D-19 pre-populated and treated as locked; Phase 2/3 contracts inherited; the design supplied every remaining value. No user questions asked (nothing unresolved that the design or defaults could not settle; defaults are marked **default**). shadcn / registry gates not applicable (hand-built `src/ui/`, same as Phases 2-3).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-built in `src/ui/`, new `src/organization/`) |
| Preset | not applicable |
| Component library | none |
| Icon library | Material Symbols Outlined self-hosted subset. **Regenerate the subset** with the Phase 4 names below and verify each renders (a missing glyph shows ligature text). Already present: `calendar_month event event_busy event_note date_range schedule alarm task_alt refresh check close more_horiz chevron_right expand_more edit_note error block lock info shield open_in_new arrow_back`. |
| Font | Geist + Geist Mono |
| Theme | Dark only |

Phase 4 icon additions: `chevron_left add delete edit repeat location_on`. (`repeat` marks recurring events, `location_on` the event location line. Keep the list minimal.)

Organization identity (Phase 3): icon `calendar_month`, colour `#4fd1a1`. Page eyebrow `ORGANIZATION` Label colour `#4fd1a1` (OR l.13).

### Category colours (D-02, locked; single source: one `CATEGORY` map in code)

| Key | Label | Colour | Event fill (`colour @ 13%`, hex `22`) | Event border (`@ 27%`, hex `44`) |
|---|---|---|---|---|
| work | Work | `#8b8cff` | `#8b8cff22` | `#8b8cff44` |
| personal | Personal | `#4fd1a1` | `#4fd1a122` | `#4fd1a144` |
| social | Social | `#e889c4` | `#e889c422` | `#e889c444` |
| career | Career | `#e8b86a` | `#e8b86a22` | `#e8b86a44` |
| events | Events | `#6cb6ff` | `#6cb6ff22` | `#6cb6ff44` |
| deadlines | Deadlines | `#f07a6e` | `#f07a6e22` | `#f07a6e44` |

Colour is category identity only: category fills are never used for accent, approval or conflict signals. Focal point: on desktop the **time grid is the visual anchor** (largest surface, first in reading order after the header); the H1 is secondary. 60/30/10 split inherited from Phase 2 (canvas `#0b0c10` 60 / surface `#111318` 30 / indigo `#8b8cff` 10). Green `#4fd1a1` is both the Organization identity and the Personal category: it is never used without its label beside it (legend, picker, detail, Settings), and the Deadlines red `#f07a6e` fill is never a conflict signal: a **conflict is always** the 2px red left edge + `event_busy` icon + the word `Conflict`. Every swatch has its label beside it (legend, calendar picker, Settings mapping, event detail); state is never colour-only. Event text stays `text` `#e9eaf0` on the tinted fill (contrast passes: tint is 13% over `surface`).

---

## Design Tokens

**No new tokens.** Use `globals.css` as is.

Spacing: Phase 2 scale (4/8/16/24/32/48/64 plus documented exceptions 2/6/10/12/14/18/20, and 3 for the segmented container padding). Phase 4 uses these design-sourced values, all already inside the exception list or pure design geometry for the grid (listed for the checker): hour row height **44** (OR `HH`), time-gutter width **56**, day column min **112** (multiple of 4; design 110), event block inset 4/8, month cell min-height **104**, plan card padding **16**, tasks card padding **14**, aside width `flex 0 1 340` min 280, legend chip h28 gap 6. Hairline geometry: event top `+1` and height `-3` (keeps a 1px gap between adjacent blocks and the hour line), month grid `gap: 1px` (cell separators). Design geometry: 22px min event height and 22px all-day pill height (15-minute events and pills stay clickable; mobile hit area is 44 via `::before`). Control heights reuse Phase 2/3: nav arrows 32, view segmented 28 inside 3px padding (documented exception **3px**: segmented-container padding, OR l.23; Phase 2 does not declare this control, so it is new here and design-sourced), chips 28, plan buttons 26 (26 and 34 are in the Phase 2 control-height set), task input 32 (see Mobile for the 44 floor).

Radius: 14 (grid + cards), 10 (plan item), 7 (event blocks, segmented items), 6 (plan buttons), 5 (task checkbox), 999 (legend chips, today dot is 50%).

---

## Typography

**Closed set, inherited from Phase 2 (02-UI-SPEC Typography) and Phase 3:** Display `clamp(30,3.4vw,44)`/500 · H1 `clamp(28,3vw,40)`/500 · H2 20/500 · Lead 17 (15 below 720)/400 · Title 15/500 · Body 14/400 · UI 13.5/400 (500 selected) · Small 12.5/400 · Label Mono 11/500 · Label-sm Mono 10.5/500 · Meta Mono 11.5 (11, 10.5 dense)/400 · Badge Mono 10/600 · Kbd Mono 11/500 · Phase 3 additions Metric 22/500 and Agent title Mono 22/600. Weights are 400 and 500; **600 is the existing Phase 2 role (Badge and Mono agent/state labels), not new**, and Phase 4 uses it only there (plus Phase 3 approval buttons). Phase 4 introduces **no new roles, sizes or weights**: every mapping below uses one of these roles exactly (line-height may vary by context; Body 14/1.65 for long previews follows Phase 3).

Checker note: design scale has more than 4 sizes by design intent (dense OS UI, Phase 2 D-01); roles are a closed set and nothing new is introduced. Phases 2 and 3 passed this dimension on the same basis.

Mapping of design values:

| Design element | Role used |
|---|---|
| Eyebrow `ORGANIZATION` | Label (Mono 500 11/0.12em) |
| H1 "You're free Thursday afternoon." | H1 (clamp 28-40/500/-0.025em) |
| Lead (15px) | Lead (15px, 400, text-2) |
| Range label `Oct 5 – 11, 2026` (Mono 500 12.5) | Meta Mono 11.5/400, `text` colour |
| Day header dow `MON` (Mono 500 10.5/.08em) | Label-sm |
| Day header date number (17/500 in 28px circle) | **Title 15/500** (raise nothing; design 17 is mapped to Title so no stray size) |
| Hour gutter `08:00` (Mono 400 10.5, text-3) | Meta 10.5 |
| Event title (12/500, 1.25) | Small 12.5 at weight 500 |
| Event time (Mono 10) | Meta 10.5 (raised to the a11y floor) |
| Month day number (13) | UI 13.5/400 |
| Month cell item (11) | Small 12.5 (raised; truncated with ellipsis) |
| `+2 more` (Mono 10) | Meta 10.5 |
| Plan label `TODAY'S PLAN` (Mono 500 11/.1em indigo-text) | Label |
| Plan summary (14/1.55) | Body 14/1.5 |
| Plan item time (Mono 500 11) / state (Mono 500 10) | Meta 11.5/400 / Label-sm |
| Plan item title (13.5/1.4) | UI 13.5/400, line-height 1.4 |
| Plan "why" (12, text-3, 1.45) | Small 12.5 in **text-2** only if `text-3` fails 4.5:1 on the plan item bg; default `text-3` (4.9:1 on surface; plan item bg is darker `rgba(11,12,16,.55)` over a tinted card, verify in the checker). Use `text-3`. |
| `TASKS · TODAY` (Mono 500 11/.1em text-3) | Label |
| Task row (13) | UI 13.5/400 |
| Task input (13) | Input role (14 on mobile to avoid iOS zoom; 13.5 desktop uses Input 14 — **use 14 everywhere** and h36 desktop (Phase 3 Input primitive) / h44 mobile) |

Weights stay 400/500, 600 only where Phase 2/3 allow (agent labels, approval buttons). Calendar approval decision buttons follow the Phase 3 approval-button style. Plan card buttons (`Add to calendar`, `Skip`, `Undo`) are ordinary xs Buttons (h26, Small 12.5/500), not approval buttons.

---

## Color

Unchanged 60/30/10 split (canvas `#0b0c10` / surface `#111318` and overlays / accent `#8b8cff`). Destructive `#f07a6e` only for delete, failed, conflict (see below), reject.

**Accent (indigo) reserved for, additions to the Phase 2/3 list:** the "now" line and dot in the time grid; today's date circle (day header and month cell, filled `#8b8cff`, text `#0b0c10`); the selected-day tint in Month (`rgba(139,140,255,.06)`); the Today's plan card border (.25), glow and `TODAY'S PLAN` label; the primary plan button `Add to calendar`; the primary `Save event` / `Add event` button in the event form; primary `Connect Google Calendar` / `Connect iCloud Calendar` in Settings; the `SUGGESTED` state text (`#a5a6ff`); focus rings. Nothing else.

**Conflict colour:** red `#f07a6e` (text + `event_busy` icon + label `CONFLICT`). Conflicts are a "needs attention" signal, not a failure, but the design uses red for P1/deadline urgency and conflicts are what the owner must act on. Overlapping events keep their category fill; the overlap is marked with a 2px red left edge on both blocks and the label in the detail, never colour alone.

**State colours (text + dot always):** plan item `SUGGESTED` indigo-text · `ON CALENDAR` green · `SKIPPED` text-3 · `CONFLICT` red · sync `CONNECTED` green / `SYNCING` indigo-text / `RECONNECT` red / `NOT CONNECTED` text-3 hollow (Phase 3 ConnectionRow map). Tentative provider events: dashed `text-3` border with the category fill kept, plus the word `Tentative` in the detail and in the block `aria-label` (indigo is not used: it is the accent, not a status). Past events on today and earlier days: opacity .6 on fill/border only; text keeps >= 4.5:1 (apply opacity to the block background and border, not the label, deviating from the design's whole-block .6).

Destructive: delete event (red outline / destructive button in Dialog). Amber: approval-required wording on agent-written events (Phase 3 amber approval colour) and the "This token/scope" style warnings.

### Activity and notification additions

Activity source: Calendar (`event`, `#4fd1a1`, label `CALENDAR`, Phase 2 map). Titles (fact first): "Event added" / "{title} · {EEE d MMM HH:mm}" ; "Event changed" / "{title} · now {EEE d MMM HH:mm}" ; "Event cancelled" / "{title} · was {EEE d MMM HH:mm}" ; "Calendar synced" only if something changed / "{n} updates" ; "Conflict found" / "{A} overlaps {B} · {EEE d MMM HH:mm}" (red). Meaningful changes only (D-03); never emit for events outside the next 7 days unless added/cancelled.

Notification map (Phase 2 categories; new rows):

| Event | Category | Title | Body | Action |
|---|---|---|---|---|
| Task reminder fires (D-12) | REMINDER | Reminder: {task title} | Due {EEE d MMM HH:mm \| "today" \| "no due date"}. | Open -> `/organization#tasks` |
| Approval created (event create/edit) | APPROVAL | Approval waiting: create calendar event | "{title}" · {EEE d MMM HH:mm}. Expires {EEE d MMM HH:mm}. | Review -> `/approvals?id={id}` |
| Approval created (delete, HIGH_RISK) | APPROVAL | Approval waiting: delete calendar event | "{title}" · {EEE d MMM HH:mm}. This removes it from {calendar}. | Review -> `/approvals?id={id}` |
| Calendar connection rejected | IMPORTANT | {Google Calendar \| iCloud Calendar} needs attention | Access was rejected. Syncing is paused. | Reconnect -> `/settings?section=connections` |
| New conflict in next 48h | IMPORTANT | Schedule conflict | {A} overlaps {B} on {EEE d MMM HH:mm}. | Open -> `/organization?view=day&date={YYYY-MM-DD}` |

Reminder snooze uses the Phase 2 SnoozeMenu unchanged.

---

## Layout and routes

| Route | Content | Notes |
|---|---|---|
| `/organization` | Organization page (replaces DomainPage placeholder) | search params: `view=day\|week\|month` (default `week` >= 720, `day` < 720), `date=YYYY-MM-DD` (default today, Sydney), `event={id}` opens the detail |
| `/settings?section=connections` | Adds Google Calendar + iCloud Calendar rows and per-calendar list | extends Phase 3 |
| `/settings?section=calendars` | **Not added**; the per-calendar list lives under each connection row (Disclosure) | keeps Phase 3's two-section nav |

Page container is the Phase 2 container (max 1480 desktop; OR uses 1600, defer to the shell's `--content-max`; padding `36px 32px 170px`, below 720 `20px 16px calc(bottombar + safe-area + 24px)`). Pages scroll inside the shell wrapper. Breakpoints `tab` 720, `desk` 1100.

Page structure (gap 20): (1) Header row, (2) Category legend row, (3) Body: main column `flex: 1 1 640px; min-width: 0` + aside `flex: 0 1 340px; min-width: 280` (wraps below main under ~1000px content width, as in the design). Aside order desktop: Today's plan, Tasks · today.

Nav wiring: no new nav items; Organization stays Alt+5 (Phase 2 order). Palette gains scopes **Events** and **Tasks** (Phase 2 D-06 pattern: type icon, title, subtitle `Thu 8 Oct 18:00 · Work`, Enter -> `/organization?view=day&date=…&event={id}`; tasks -> `/organization#tasks`) and commands "New event" (hint `N` on the page) and "New task". Home Today / Upcoming EmptyStates: wire to the same data if cheap (list next events as compact rows: time Mono 11.5 + category swatch + title); otherwise leave Phase 2 copy. Planner's call; do not block the phase on it.

---

## Component Inventory

### OrganizationHeader (OR l.11-27)
Left: eyebrow `ORGANIZATION` (`#4fd1a1`), H1, Lead. Right (flex none; wraps under the left block below 720): range navigator + view switch + primary `New event` button.

- **H1 (D-18, real data only):** if a free block >= 2h exists later today or tomorrow, `You're free {Thursday afternoon\|this evening\|tomorrow morning}.` derived from the largest upcoming free slot within waking hours (morning < 12:00, afternoon 12:00-17:00, evening >= 17:00; day name if not today). Otherwise `Your schedule is full {today\|this week}.` If calendars are connected but there are no events: `Nothing scheduled.` If no calendar connected: `Your calendar, in one place.` Never fabricated.
- **Lead:** `Calendar, tasks and planning. {n} events this week · {h} free hours · {c} conflicts.` Counts computed from the displayed week (Mon-Sun, Sydney), all-day and declined excluded from `h`/`c` per D-14; `{c} conflicts` is `No conflicts` at 0 (red text only when > 0; the rest text-2). Singular forms: `1 event`, `1 conflict`. The design's "conflicts resolved" is dropped (nothing is resolved by the system). Omit the counts sentence entirely when no calendar is connected: Lead = `Connect a calendar to see your week. Tasks work without one.`
- **Range navigator:** `chevron_left` / `chevron_right` 32x32 radius 8 border `.08` (`aria-label="Previous {day\|week\|month}"` / `Next …`), label between (Meta Mono 11.5/400, min-width 150, centred; Day `Wed 7 Oct`, Week `5 – 11 Oct 2026` (Sydney, Mon start), Month `October 2026`; design uses US "Oct 5" order, this contract uses Australian `5 Oct`). `Today` ghost button h32 appears left of the arrows whenever the range does not contain today. Keyboard: `[` previous, `]` next, `T` today (page-scoped, ignored in inputs); arrow buttons also reachable by Tab. Navigation updates `?date=` and fetches only the new range (skeleton in the grid body, header stays).
- **View switch:** `role="radiogroup" aria-label="View"`; items `Day` `Week` `Month`; container padding 3 radius 10 bg `rgba(255,255,255,.04)` border `.06`; item h28 padding 0 14 radius 7; selected bg `#1f222b` text `text`; unselected `text-3`. Roving arrow keys. Below 720 items are 44px tall (segmented floor) and `Month` remains.
- **New event button:** primary Button (indigo) h34 `add` icon, label `New event`. Opens EventDialog (create). Hidden when no writable calendar is connected; replaced by secondary `Connect a calendar` -> `/settings?section=connections`.

### CategoryLegend (OR l.28-30)
Row of toggle chips, one per category (all six always, in the order Work, Personal, Social, Career, Events, Deadlines). Chip h28 padding 0 10 radius 999 border `.08`, 8x8 radius-2 swatch + label 12.5. `aria-pressed`; off = opacity .4 on the chip, label stays readable (the chip text must still reach 4.5:1: apply .4 to the swatch and border only, and strike nothing). Toggling filters the grid and month and the count in the Lead is **not** affected (counts describe the schedule, the legend is a view filter). Filter is client state (kept per session, not persisted). A hidden-categories hint when any is off: Meta text-3 `{n} categories hidden` after the chips with a ghost `Show all`. Below 720: single horizontally scrolling row, chips h36 with a 44px hit area (`::before` expansion), no wrap.

### CalendarGrid, Day and Week (OR l.34-59)
Container radius 14, border `.07`, bg surface, `overflow: auto` both axes inside a max-height of `calc(100vh - 260px)` (min 480) so the sticky day header works; hour range **07:00-24:00** (17 rows x 44 = 748px). **Events outside 07:00-24:00** (default scroll start): the grid scrolls on mount so that "now" (today) or 08:00 (other days) is ~120px from the top. Events before 07:00 get a compact `{n} earlier` pill (Meta, row above 07:00 in the day column) that expands the range to 00:00 when clicked (range persisted per session). **default**
- **Header row (sticky, bg surface, z 2):** grid `56px repeat(cols, minmax(112px, 1fr))`, border-bottom `.07`. Each day cell: padding 10, flex baseline gap 8, border-left `.05`: dow (Label-sm; today `indigo-text`, else `text-3`) + date circle 28x28 (Title 15/500; today bg `#8b8cff`, text `#0b0c10`). Cells are links/buttons to Day view for that date (`aria-label="Thursday 8 October, open day"`); in Day view they are plain text. Header includes an **all-day strip** row (below the date row, only rendered when any all-day event exists in range; min-height 28, events as 22px pills radius 6 in category fill, title 12 ellipsis, no time) because all-day events cannot be placed on the hour grid (design omits it; required for real data).
- **Body:** grid same columns, min-width 860 in Week (horizontal scroll below that), 0 in Day. Gutter: hour labels Meta 10.5 text-3 right-aligned padding 0 8, `translateY(-6px)`, first row label blank. Day column: `position: relative`, border-left `.05`, height 748, hour hairlines `repeating-linear-gradient(180deg, rgba(255,255,255,.045) 0 1px, transparent 1px 44px)`; weekend columns bg `rgba(255,255,255,.012)`.
- **EventBlock:** `button`, absolute `left:4 right:4`, `top = (start - 7h) * 44 + 1`, `height = max(duration * 44 - 3, 22)` (min 22 so 15-minute events stay clickable), radius 7, 1px border, padding `4px 8px`, overflow hidden, category fill/border (table above); 44px `::before` hit area below 720; content: row 1 swatch 6x6 radius 2 + title (12.5/500 ellipsis, `repeat` icon 12px text-3 appended if recurring); row 2 (only when height >= 40) time Meta `18:00–20:30` text-2. `title` attribute and `aria-label="{title}, {Thu 8 Oct 18:00 to 20:30}, {category}, {calendar}{, Tentative}{, Conflict}"`. Hover `filter: brightness(1.15)`; focus ring 2px indigo offset 2 (inset if clipped by the scroll container). Click or Enter opens EventDetail (`?event=`). Overlapping events lay out **side-by-side** in equal-width lanes (standard column packing; lane count = max concurrent in the cluster), never stacked on top of each other; conflicting pairs **always** get the 2px red left edge and the `event_busy` icon 12px in place of the swatch, plus the word `Conflict` (Label-sm red) on row 2 when height >= 40; below that the edge + icon + `aria-label` carry it, and the word appears in EventDetail. Red is used deliberately: a conflict needs the owner's action (Phase 2 red = urgent), even though it is not a system failure.
- **Free/transparent events** (D-14): same block with a dashed border in the category colour and the word `Free` after the time (not counted as conflict). **Declined events:** hidden by default; no setting in this phase. **Multi-day timed events** are clipped per day with continuation arrows implied by the time only (`→ 02:00` / `from 22:00` in the time line); all-day multi-day span as pills in each day's strip.
- **Now line (today only):** `aria-label="Now"`-equivalent (decorative; the current time is in the header `Today` cell for AT: add visually-hidden `Current time 19:44`), 1.5px indigo line across the day column at the current Sydney time, with a 9px indigo dot at the left edge, `lo-pulse` 1.8s ease-out infinite (static under reduced motion). Updates every 60s without re-rendering the grid.
- **Empty slot interaction:** clicking (or pressing Enter on, via the focusable column) an empty slot opens EventDialog (create) prefilled with that day and the clicked hour rounded down to 30 minutes, 1h duration. Slot buttons are not individually tabbable: the column is `role="grid"`-lite with `aria-label="{Thursday 8 October}, empty time, press Enter to add an event at {HH:mm}"` and arrow keys move a visible 44px slot cursor (Up/Down 30 min, Left/Right day, Enter opens create). **default**
- **Loading:** Skeleton blocks (3-5 per column, varied heights) matching the grid; header stays. **Error (sync/fetch):** InlineError above the grid (see Copywriting); grid shows last known data dimmed .6 if any.
- **Stale warning:** when the last successful sync is > 15 minutes old or a connection is RECONNECT, an amber Small line under the legend: `Calendar data may be out of date. Last synced {HH:mm}.` + `Sync now` ghost / `Reconnect` link.

### CalendarGrid, Month (OR l.60-71)
Container radius 14, border `.07`, bg `rgba(255,255,255,.06)`, `display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 1px; overflow: hidden`. Head row: dow Label-sm text-3 on surface, padding 8/10 (Mon-Sun). 5-6 rows of cells: `button`, min-height 104, padding 8, bg surface (selected/today cell `rgba(139,140,255,.06)`), hover `#161921`, flex column gap 4. Date number 24x24 circle (UI 13.5/400; today filled indigo). Out-of-month days opacity .35 on number and items. Up to **3** items per cell: 5x5 swatch + title (Small 12.5, text `#c9cbd6`, one line, ellipsis); timed items prefix with `HH:mm` Meta; all-day first, then by start. Remaining: `+{n} more` Meta text-3. Conflict days show the `event_busy` icon 12px red top-right of the cell (not a bare dot) and the cell `aria-label` ends `, has a conflict`. Clicking a cell opens that **Day** view (`view=day&date=`); design opens Week only for the visible week; Day is consistent for every cell. Keyboard: grid arrow navigation (roving tabindex over cells), Enter opens day, PageUp/PageDown previous/next month. Cell `aria-label="{Thursday 8 October}, {n} events"`.
- Mobile Month (< 720): cell min-height 52, show **only up to 3 coloured dots** (5px, decorative `aria-hidden`; the cell `aria-label` names the events and categories, and the legend above labels the colours) and the date number, no titles, `+` count omitted; tapping a day opens Day view. Cells >= 44 high floor satisfied.

### EventDetail (popover desktop, bottom sheet mobile)
Triggered by clicking an EventBlock / month item / plan item reference / `?event=`. Desktop: no anchored popover (focus and clipping in a scrolling grid); use a `Dialog`-style modal panel width `min(420px, 94vw)` (Phase 3 Dialog styling, radius 16, bg `#14161c`, border `.1`, `shadow-overlay`, padding 24, `lo-rise`), focus trap, Esc, focus return to the originating block. **default** Mobile: bottom sheet, full width, radius 16 16 0 0, max-height 85dvh scroll, drag handle decorative, 44px buttons.
Contents (top to bottom): category swatch + category label (Label-sm) + calendar name and account `Personal · zeyad@…` (Meta text-3); title (H2 20/500); `<time>` range line `Thu 8 Oct · 18:00–20:30 AEDT` (Body, `repeat` + rule text if recurring: `Repeats weekly on Thursday`, from RRULE humanised in code, fallback `Repeats`); location (`location_on`, UI 13.5/400, plain text, **not** auto-linked; if it is an `https://` URL render as a link `rel="noopener noreferrer"`, validated with `isSafeUrl`); description (UI 13.5/400, line-height 1.5, text-2, pre-wrap, clamped 6 lines with `Show full description` Disclosure, **escaped text only, no HTML**); status chips (Badge): `Tentative`, `Free`, `All day`, `Declined` (neutral tones), `CONFLICT` (red) with line `Overlaps {title} at {HH:mm}` per conflicting event (each a button that opens that event). Footer: `Edit` (secondary, `edit`), `Delete` (ghost destructive text button, `delete`), right-aligned `Close` (ghost). Read-only calendars (no write scope / holiday): footer shows only `Close` and the Meta line `This calendar is read-only.`

### EventDialog (create / edit; `Dialog` primitive, width `min(520px, 94vw)`, mobile full-screen sheet)
Fields (Phase 3 `Field` + `Input/Select/Textarea`, labels above, gap 16): `Title` (Input, required, max 200) · `Calendar` (Select, writable calendars only, each option `{swatch? native select cannot show swatches}` label `{Calendar name} · {Category}`, default = last used per D-09 else Settings default else first writable; the selected calendar's category swatch + label shown as Meta next to the label) · `All day` (checkbox) · `Start` and `End` (native `<input type="date">` + `<input type="time">`, 15-minute `step=900`; End must be after Start; all-day hides times; two columns desktop, stacked mobile) · `Time zone` (Meta line `Sydney (AEDT)`, plain text, not editable; events in other zones show their own zone read-only on edit) · `Repeat` (Select: `Does not repeat` / `Every day` / `Every week on {Thu}` / `Every month on day {8}` / `Every year` ; `Custom` is not built; editing an existing series with a rule the form cannot represent shows `Custom repeat (edit in Google Calendar or iCloud)` read-only and disables the Repeat control) · `Location` (Input, max 300) · `Description` (Textarea 4 rows, max 8,000) · `Show as` (Select `Busy` / `Free`). Fields not supported by the provider are hidden, not disabled.
- Footer: primary `Add event` (create) / `Save changes` (edit); loading label `Saving…`; ghost `Cancel`. Edit mode also shows destructive text `Delete event` at the left. Enter in Title submits; Esc closes (confirm only if dirty: browser-free inline Small amber line `Discard changes?` replaces the footer with `Keep editing` / `Discard`, **default**).
- **Recurring scope (D-08):** on Save or Delete of an instance of a recurring series a second Dialog step appears (radio group, `role="radiogroup"`, Phase 3 Dialog) titled **Edit repeating event** / **Delete repeating event** with options `This event` · `This and following events` · `All events` (default `This event`), buttons `Cancel` + primary `Save event` (delete variant: destructive `Delete event`); labels name the consequence and match the chosen scope wording. `This and following` is hidden for the first instance of a series (equivalent to All) and for providers that cannot express it (hide, do not disable). Editing only fields that change nothing server-side never prompts.
- **Validation (zod, field-level, `aria-describedby`):** `Add a title.` · `Title must be 200 characters or fewer.` · `End must be after start.` · `Pick a calendar.` · `Pick a start date.`.
- Success: dialog closes, grid updates optimistically with the block in a `SAVING` visual (opacity .7, no label) until the provider write confirms (D-06 direct write); on failure the block reverts and a red toast shows (Copywriting). Toasts: `Event added to {calendar}` / `Event updated` / `Event deleted`.
- Overlap check on save: if the new/edited busy event overlaps another busy event, still save (the owner decides) and show toast `Saved. It overlaps {title} at {HH:mm}.` (D-14 conflicts are detected after the fact, never blocked).

### Delete event (owner UI, D-06)
Dialog (Phase 3 style): Title **Delete "{title}"?** Body `This removes the event from {calendar} ({account}). It also disappears from your other devices.` (recurring: scope step first, then this confirm shows `This removes {this event \| this and following events \| the whole series} from {calendar}.`). Buttons: Secondary `Cancel` (initial focus) + Destructive `DELETE EVENT`. No Undo (provider delete cannot be undone from LifeOS). Toast `Event deleted`.

### TodaysPlanCard (OR l.75-86; D-14..D-18)
Card radius 14, border `rgba(139,140,255,.25)`, bg `linear-gradient(180deg, rgba(139,140,255,.08), #111318 40%)`, padding 16, gap 12. `<section aria-label="Today's plan">`.
1. **Header row:** 7px indigo diamond (`rotate(45deg)`, radius 1) + `TODAY'S PLAN` (Label, indigo-text, flex 1) + Meta text-3 `{Thu 8 Oct}`. **The design's `ORGANIZATION AGENT` tag is removed (D-18).** Right of date, `refresh` icon button 28 (`aria-label="Refresh plan"`) recomputes (D-16).
2. **Summary line** (Body 14/1.5 text), templated from real numbers only, one of: `{h} hours free between now and {22:00}. {n} tasks to place.` · `Your day is full. {n} tasks have no free slot today.` · `All clear. Nothing due today.` · after waking hours end: `Today's plan is done. {n} tasks are still open.` Never mention names, never claim reasoning.
3. **PlanItem list** (gap 8), each: radius 10, bg `rgba(11,12,16,.55)`, border `rgba(255,255,255,.06)` (ON CALENDAR: `rgba(79,209,161,.25)`), padding 12, gap 8:
   - row: time Meta 11.5/400 text-2 (`20:00`, or `Thu 14:00` when not today) + category swatch (6x6) + spacer + state Label-sm (`SUGGESTED` indigo-text / `ON CALENDAR` green / `SKIPPED` text-3 / `CONFLICT` red);
   - title UI 13.5/400, line-height 1.4 (task title, plus ` ({n} min)` when estimated);
   - why Small 12.5 text-3, templated (D-15): `Due {today 23:59}. First free slot of {n} minutes.` · `Priority high, due {Fri 17:00}.` · `Your only free block before it is due.` · `Moved from {20:00} to avoid {event title}.` (only when it really moved).
   - actions (pending only): `Add to calendar` (h26 padding 0 10 radius 6, bg `#8b8cff`, text `#0b0c10`, Small 12.5 at 500; mobile h44) and `Skip` (h26 outline `.1`, text-2). Add to calendar: creates a **real** event immediately on the chosen calendar (D-17): default the last-used writable calendar; a small `Select` appears inline next to the button only when the task has no obvious calendar (always show it as the `Calendar` Select in a one-step popover from `Add to calendar` when more than one writable calendar exists; with exactly one, click adds directly). After add: state flips to `ON CALENDAR`, buttons removed, toast `Added to {calendar} · {HH:mm}`; the grid gains the block; the **task is not completed** by this. **The design's "tentative · confirm in Approvals" behaviour is not built** (owner action writes directly). `Skip`: item dims to opacity .5 on the bg only (text stays legible), state `SKIPPED`, a ghost `Undo` appears for the session, skip persisted for today only (client + `localStorage` keyed by Sydney date; D-17).
   - Conflict item (D-14): a due task with no free slot before its due time: state `CONFLICT`, time omitted, title, why `No free slot before it is due ({Fri 17:00}). Move something or extend the deadline.`, no Add button (nothing to place); instead ghost `Open day` (-> `/organization?view=day&date=`). Overlapping-event conflicts list in a final block `CONFLICTS` Label-sm: rows `{A} overlaps {B}` + Meta `{HH:mm}–{HH:mm}`, each row a button that opens the first event.
4. **Max 6 items** shown, then `Show {n} more` Disclosure.
5. **Empty:** EmptyState compact (see Copywriting). **No calendar connected:** plan still works from tasks with no calendar connected, free time is the whole waking window; show it and add Meta `Based on tasks only. Connect a calendar to plan around events.` **default**
6. Waking hours **default 08:00-22:00** Sydney (fixed constant, not a setting; mention in Meta tooltip `Planning window 08:00–22:00`), slot granularity 15 min, minimum slot 15 min, task default length 30 min when no estimate. Past times today are not offered. Ordering: due date asc, priority desc, created asc (stable). Ties never reshuffle on refresh (deterministic).
7. Live: recomputed on page load, on `Refresh`, on relevant SSE kinds (`calendar.synced`, `task.changed`), and every 5 minutes. A recompute never moves focus; items keep position unless the data changed (new items insert with `lo-in`).

### TasksCard (OR l.87-99; D-10..D-13) — `id="tasks"`
Card radius 14, border `.07`, bg surface, padding 14, gap 4. Header: `TASKS · TODAY` (Label text-3, flex 1) + Meta `{done} / {total}` + ghost icon `more_horiz` 28 (`aria-label="Task list options"`) opening a menu: `Show all open tasks` / `Show completed` toggles. Default list = **due today (Sydney) or overdue, plus any open task with a reminder today**; `Show all open tasks` switches the header to `TASKS · ALL OPEN` and lists every open task (grouped by `Overdue` / `Today` / `Upcoming` / `No date` Label-sm subheads).
- **TaskRow** (`button` row visually, implemented as `li` with a checkbox button + a title button): padding 8/6, radius 7, gap 10, hover bg `rgba(255,255,255,.03)`. Checkbox 16x16 radius 5, border 1.5px `rgba(255,255,255,.25)`, checked bg `#8b8cff` border `#8b8cff` with `check` 13px `#0b0c10`; `role="checkbox" aria-checked`, hit area 44 on mobile via padding. Title UI 13.5/400 flex 1 (done: opacity .5 on the text colour kept >= 4.5:1 by using `text-3` + `line-through` instead of .5 opacity). Right: due Meta (`18:00`, `Fri`, or `Overdue 2d` in red text) then priority marker then the 6x6 category swatch **only if the task has a category/link** (tasks have no category column in D-11: the design's coloured square is **dropped**; use priority instead): priority P1/P2/P3 Badge (existing P1/P2/P3 Badge: P1 red, P2 amber, P3 neutral), shown only for P1/P2 to reduce noise; P3 / none shows nothing. Reminder indicator: `alarm` 14px text-3 when `remind_at` is in the future (`aria-label="Reminder {Thu 18:00}"`). Clicking the title opens TaskDialog (edit); clicking the checkbox toggles complete (sets/clears `completed_at`), toast none, `aria-live` polite `Task completed`/`Task reopened`; completed tasks move to the bottom with `lo-fade` and collapse after 4s unless `Show completed`.
- **Quick add:** Input h36 (mobile h44) radius 8 border `.08` bg `rgba(255,255,255,.02)`, placeholder `Add a task, press ↵`, `aria-label="New task"`; Enter creates a task with title only, due today (no time), priority none; shift+Enter or the trailing `edit_note` icon button (28, `aria-label="Add task with details"`) opens TaskDialog prefilled with the typed title. Empty/whitespace Enter does nothing. Max 200 chars. Input keeps focus after add.
- **TaskDialog** (`Dialog`, width `min(480px, 94vw)`, mobile full-screen sheet): `Title` (required, max 200) · `Due date` (`<input type="date">`, optional) · `Due time` (`<input type="time">`, optional, enabled only with a date) · `Priority` (Select `None` / `Low (P3)` / `Medium (P2)` / `High (P1)`) · `Notes` (Textarea 4 rows, max 4,000) · `Remind me` (Select `No reminder` / `At due time` / `15 minutes before` / `1 hour before` / `The morning of (08:00)` / `Custom…` -> reveals `<input type="datetime-local">`; "At due time"/"before" options are disabled with Meta `Add a due date and time first.` when there is no due time). Edit mode adds a `Completed` checkbox and destructive text `Delete task` (Dialog confirm: **Delete "{title}"?** · `This task is deleted from LifeOS. It can't be undone.` · `Cancel` + `DELETE TASK`). Footer `Add task` / `Save task`, ghost `Cancel`. Errors: `Add a title.` · `Reminder must be in the future.` · `Add a due date before choosing a time.`. Toast `Task added` / `Task saved` / `Task deleted`. No recurrence, no subtasks (D-11).
- **Empty:** `No tasks for today.` with the quick-add input still visible (see Copywriting).

### Settings: calendar connections (extends Phase 3 ConnectionRow; D-01, D-02, D-05, D-09)
Rows appended to Connections in this order: **Google Calendar**, **iCloud Calendar** (after Anthropic API). Monogram tiles `GC`, `IC`. Pattern identical to Phase 3 ConnectionRow (status `CONNECTED` / `NOT CONNECTED` / `RECONNECT` / `SYNCING`, action `Connect` primary / `Reconnect` inverse when RECONNECT, `Disconnect` in the expanded panel as ghost destructive text).
- **Google Calendar** detail connected: `{email} · {n} of {m} calendars syncing · last synced {HH:mm}`; not connected: `Sign in with Google to sync your calendars. LifeOS asks for calendar read and event write access only.` Action `Connect Google Calendar` starts the OAuth redirect (full page, returns to `/settings?section=connections`); on return success toast `Google Calendar connected · {n} calendars` and the calendar list auto-expands. OAuth cancelled/denied: InlineError compact in the row `Google sign-in was cancelled. Nothing was saved.`
- **iCloud Calendar** detail connected: `{apple id} · {n} of {m} calendars syncing · last synced {HH:mm}`; not connected: `Use an app-specific password. Your Apple ID password is never used.` `Connect iCloud Calendar` expands the inline entry panel (Phase 3 token-entry pattern): `Apple ID` (Input email, `autocomplete="off"`, `data-1p-ignore`), `App-specific password` (`type="password"`, Mono, `autocomplete="off"`, `spellcheck="false"`), helper Small text-2 `Create one at account.apple.com → Sign-In and Security → App-Specific Passwords. It looks like xxxx-xxxx-xxxx-xxxx.`; actions primary `Save and connect` (loading `Verifying…`), ghost `Cancel`. The password is cleared from state on submit and never shown again (D-05).
- **Calendar list** (Disclosure `{n} calendars` below the row, expanded by default right after connecting): each calendar row (padding 10/12, radius 10, border `.07`, bg inset, gap 12): checkbox `Sync` (D-01, unchecked by default for holiday/birthday/subscribed, default checked only for the primary/owned calendars **default**), calendar name (UI 13.5/400) + Meta text-3 (`Owner · read and write` / `Read only` / `Subscribed`), then a **Category Select** (D-02) — width 160, options the six categories, current value shows the swatch via a leading 8x8 swatch element rendered next to the select (native `<select>` cannot colour options): `Category` label visually hidden but present; disabled (with `Select a category` placeholder `Choose…`) until the calendar is checked; a checked calendar without a category is invalid and shows field error `Choose a category.`; save occurs on change (optimistic, toast `Saved` is NOT shown for every change: a quiet `Saved` Meta text-3 appears inline for 2s). Read-only calendars can sync (display) but are excluded from the create/edit Calendar select. A `Default for new events` radio (`role="radio"`, one per writable synced calendar, D-09) as the last column; only one selected; helper under the list Small text-2 `New events use this calendar unless you pick another.`
- Unchecking a calendar removes its events from LifeOS views (data deleted after the next sync, not from the provider): no dialog; helper Small text-2 under the list `Unticking a calendar hides its events in LifeOS. Nothing changes in Google or iCloud.`
- Footer line per connection (Mono 11 text-3): `Last synced 14:02 · next about 14:07` or red `Last sync failed 14:02: {reason}` + `Sync now` (secondary xs, `refresh`, loading while running, `aria-live` polite `Calendar synced`).
- **Disconnect** Dialog: Title **Disconnect {Google Calendar \| iCloud Calendar}?** Body `LifeOS stops syncing and deletes the saved access and its synced events. Your events in {Google \| iCloud} are not changed. You can connect again at any time.` Buttons `Cancel` (initial focus) + Destructive `DISCONNECT`. Toast `{Google Calendar} disconnected`.
- Auth failure (D-05): status `RECONNECT` (red), row border `rgba(240,122,110,.3)`, detail line `Access was rejected. Syncing is paused.`, action `Reconnect`.

### Approval variants (Organization agent; extends ApprovalDetail / ResultCard approval variant; design Approvals l.102-104)
ApprovalDetail needs generalisation per RESEARCH Pitfall 1: its preview/facts/edit area must become a per-tool payload preview (registry-supplied per kind) instead of the issue-specific one. Layout, live updates and decision buttons stay as Phase 3, but copy is per kind. Header line: `Organization agent wants to {create|change|delete} a calendar event`. H2 is the event title. Facts: calendar name + account (`iCloud · Personal`), time range, recurrence scope when relevant. Data-sent rows: `Google Calendar` or `iCloud` with the fields sent. Edit shows a before/after diff; delete shows the HIGH_RISK warning. Resolved footers per kind: Expired/Cancelled read `Nothing was created.` (create), `Nothing was changed.` (edit), `Nothing was deleted.` (delete); the `Approval expired` notification body uses the same per-kind sentence.

| Kind | List badge | Approve button | Detail facts |
|---|---|---|---|
| Create event (APPROVE) | `CREATE EVENT` neutral | `ADD TO CALENDAR` | WHAT WILL HAPPEN `Creates one event on {calendar}. Marked {busy\|free}.` · WHY (agent reason) · WHICH ACCOUNT `{Google Calendar \| iCloud} · {calendar} · {email}` · WHEN `Immediately after approval` |
| Edit event (APPROVE) | `EDIT EVENT` neutral | `UPDATE EVENT` | shows a **diff**: only changed fields, each as `FIELD` Label-sm + `old` (text-3, strikethrough) -> `new` (text); recurring scope shown as `Applies to: This event \| This and following events \| All events` |
| Delete event (HIGH_RISK, D-07) | `DELETE EVENT` red | `DELETE EVENT` (destructive: bg `#f07a6e`, text `#0b0c10`, **not** indigo) | detail border `rgba(240,122,110,.35)`; stronger warning block above facts (bg `rgba(240,122,110,.06)`, border `rgba(240,122,110,.25)`, `warning` icon red): `This permanently removes "{title}" ({EEE d MMM HH:mm}) from {calendar}. It can't be undone from LifeOS.`; recurring adds the scope line; Reject is the visually prominent default focus target (initial focus on `REJECT`) |

`WHAT DATA WILL BE SENT` rows: `check_circle` green `Event title, time and location` · `Description ({n} characters)` · `shield` blue `Not shared with other attendees` (only when no attendees/invites; LifeOS never sends invites in this phase, so this row is always shown) · `No email or contact data`. Preview block (inset) renders a mini **EventPreview**: category swatch + title (Title 15/500), `Thu 8 Oct · 18:00–20:30`, location, description (Body 14/1.65 pre-wrap), calendar chip. Edit mode (EDIT/DONE) reuses the EventDialog **fields** inline (Title, Calendar select, dates/times, Location, Description, Show as); `Repeat` is read-only in approvals (an agent cannot create recurrence in this phase; **default**, hide the Repeat control and the recurring-create path from the agent tools; edits and deletes of recurring events carry a scope). Both original and edited payloads kept; `EDITED` badge and `View agent's original` Disclosure as Phase 3. Resolved footers reuse the Phase 3 states with copy: Executed `check_circle` `Event created on {calendar}. Approved at {HH:mm}.` + `View in calendar` (-> `/organization?view=day&date=&event=`), Executed (edit) `Event updated. Approved at {HH:mm}.`, Executed (delete) `Event deleted from {calendar}. Approved at {HH:mm}.`, Failed `Approved, but {Google \| iCloud} rejected it: {reason}. Nothing was changed.` + `Retry`, Rejected `Rejected at {HH:mm}. Nothing was changed and the run was cancelled.`, Expired as Phase 3. If the target event changed since the agent prepared the request (etag mismatch), approve is disabled with amber text `This event changed after the request was prepared, so it can't be applied. Reject it and ask again.` AI panel approval ResultCard variant: same header, body `Organization agent wants to {add an event to \| change an event on \| delete an event from} {calendar}`, event title (Title 15/500), time line Meta, actions `ADD TO CALENDAR` / `UPDATE EVENT` / `DELETE EVENT` (red), `REJECT`, `Review and edit`.

### Organization agent in chat (D-19)
- Registry: Organization card flips live; status/metrics follow the Phase 3 AgentCard rules; task line while idle uses the Phase 3 READY copy; the `Not connected · arrives in Phase 4` copy and disabled treatment are removed for Organization only.
- AI panel empty-thread examples (Phase 3 four rows) gain Organization-relevant rows when a calendar is connected: `event` "What's on my calendar this week?" · `schedule` "When am I free on Thursday?" · `event_busy` "Do I have any conflicts?" · `task_alt` "What's due today?". Keep four rows total: swap the two least relevant GitHub rows so two GitHub and two Organization rows show (or all four Organization when GitHub is disconnected). Empty-thread body copy (Phase 3) adds: `…look at your calendar and tasks…`.
- **Events ResultCard variant (new; the design's "events" variant, SH l.208-222 list style)**: rows `EVENT` key (Mono 500 10.5 in the category colour), title 13.5, subtitle Small 12.5 text-2 `Thu 18:00–20:30 · Work`; rows are buttons that open `/organization?view=day&date=…&event=` in the page (panel stays open on desktop; closes on mobile). Max 8 rows then `Show {n} more` link to the page. Free-slot answers use the same row style with key `FREE` (green) and subtitle `{duration}`. Tasks use key `TASK` (indigo-text), subtitle `Due {when}`. These replace Phase 3's "No events/plan variants" note.
- Trace tool lines: `→ calendar.list_events`, `→ calendar.find_free_slots`, `→ calendar.detect_conflicts`, `→ tasks.list`, `→ calendar.create_event` (WAITING amber), `→ calendar.update_event`, `→ calendar.delete_event` (WAITING amber). Actions: `Searching your calendar`, `Finding free time`, `Checking for conflicts`, `Reading your tasks`, `Preparing an event`.
- No calendar connected (chat): answer from state: `No calendar is connected yet, so I can't see your schedule. Connect Google Calendar or iCloud in Settings → Connections.` ResultCard text variant + ghost link `Open Connections`.
- Permissions card (Phase 3 AgentDetail PERMISSIONS) rows for Organization: `READ` events, free slots, conflicts, tasks · `PREPARE` + `ASK FIRST` create event, edit event · `ASK FIRST (HIGH RISK)` delete event (tag red) · tasks: `READ` only unless the planner enables direct task writes (then `PREPARE` shown honestly; follow whatever policy ships).

---

## Interaction contracts

- **Direct writes (D-06):** owner UI actions write to the provider immediately; the block shows the SAVING visual; on provider failure the UI reverts, the event stays as it was, red toast `Couldn't save that to {Google Calendar}. Nothing was changed.`; auth failure instead routes to RECONNECT state with toast `{Google Calendar} needs reconnecting.` and a `Reconnect` action. Write failures never silently drop the owner's input: the EventDialog stays open with the InlineError (compact, `role="alert"`) above the footer: `Couldn't save this event. {reason}. Nothing was changed.`
- **Concurrency:** if the provider reports the event changed since load (etag/sequence mismatch), show the amber inline line in the dialog `This event changed in {Google Calendar} since you opened it.` with `Reload event` (secondary) which re-fetches and discards edits (after an inline `Discard my changes?` confirm); no overwrite.
- **Sync (D-03):** background; `Sync now` in Settings and a ghost `refresh` icon button 32 in the page header (right of the view switch, `aria-label="Sync calendars"`, spins while `SYNCING`, aria-live polite `Calendar synced` / `Sync failed`). The page updates live from SSE (`calendar.synced`) with `lo-in` on new blocks, no scroll jump, no focus loss; while a dialog is open updates apply behind it.
- **Drag/resize:** **not built** (YAGNI; keyboard and form edits only). Hover shows no drag affordance. **default**
- **Keyboard (page scoped, additive to Phase 2 map):** `[` / `]` previous / next, `T` today, `D` / `W` / `M` switch view, `N` new event, `Enter` on a focused block opens detail, arrow keys in grids as specified, `Esc` closes dialogs/sheets. None of these fire inside inputs or while a dialog is open; destructive actions get no single-key shortcut.
- **Focus management:** Dialog close returns focus to the originating element; after creating an event the new block is focused only if the user created it from a grid slot (otherwise focus returns to `New event`). After a task is added focus stays in the quick-add input. After Delete the focus moves to the grid container (`tabindex=-1`, `aria-label="Calendar"`).
- **Time zone:** all display Sydney (`Australia/Sydney`), 24h; DST transitions render correctly (the 02:00-03:00 hour on 4 Oct 2026 / 5 Apr 2027 is shown per wall-clock without duplicating blocks). Events from other zones are shown converted with the original zone in EventDetail Meta `Created in {zone}`. `<time datetime>` everywhere.
- **Dismissal persistence:** category filters (session), skipped plan items (per day), expanded range (session). Nothing else is stored client-side.

---

## Motion (additions; all stop under reduced motion)

| Name | Trigger | Spec |
|---|---|---|
| now line pulse | today column | `lo-pulse` 1.8s ease-out infinite on the 9px dot |
| block hover | event hover | `filter: brightness(1.15)`, 150ms |
| new block | SSE/optimistic add | `lo-in` 450ms (translateY -6 -> 0) |
| plan item state | state change | opacity/border 200ms, `lo-fade` |
| dialog / sheet | open | `lo-rise` 250ms (sheet: translateY 16 -> 0, 200ms) |
| sync icon | syncing | rotate 1s linear infinite |
| task complete | check | `lo-fade` 200ms; list reorder instant (no layout animation) |

---

## Accessibility contract (additions)

- The time grid is not a data table; each day column is a `role="group"` labelled with the full date, containing a `ul` of events in **chronological order in the DOM** (not visual order) so the reading order is a clear agenda. Event blocks are real `button`s with the full-sentence `aria-label` above. A visually hidden `Skip to today's plan` link precedes the grid.
- Month: `role="grid"` with `row`/`gridcell`, roving tabindex, each cell's label includes counts and conflict flag.
- Legend toggles `aria-pressed`; view switch `radiogroup`; range label is `aria-live="polite"` (announces `5 – 11 Oct 2026` on change).
- Plan card: items are a `ul`; state text always present; `Add to calendar` buttons include the item in their label (`aria-label="Add to calendar: {title} at {HH:mm}"`); results announced via a polite region (`Added to Personal at 20:00`).
- Task checkboxes `role="checkbox"`, label = task title; due/priority conveyed in text (screen-reader-only for the Badge: `Priority high`).
- Colour never alone: category = swatch + label (legend, detail, Settings); conflicts = icon + word; state dots always with words.
- Contrast: `text-3` for all meta/labels (>= 4.5:1); `text-4` decorative only. Event title/time text on tinted fills is `text` / `text-2`; the design's 10px times are raised to 10.5 Meta.
- Touch targets below 720: every interactive element has at least a 44x44 hit area (event blocks and all-day pills get a 44px `::before` hit area; also the mobile Today button, sync refresh icon, plan Skip/Undo buttons, plus every control >= 44 (view switch, arrows, chips (36 + 44 hit area), plan buttons, task checkbox, quick-add input, month cells (>= 44 tall), dialog buttons, week day-header date buttons, the `{n} earlier` pill, Disclosures, and the Settings Sync checkbox, Category select and Default radio)).
- Reduced motion: removes pulses, spin (replaced by static `SYNCING` text), `lo-in`/`lo-rise`.
- Security (UI): all event titles, descriptions, locations and attendee-provided text are untrusted: rendered as escaped text only, no HTML/markdown; links only from validated `https://` URLs (`isSafeUrl`, `rel="noopener noreferrer"`); no secret ever reaches the client after save; server actions behind the owner guard.
- Dialogs: Phase 2 contract (modal, trapped, Esc, focus return). Recurring-scope radio group is arrow-key navigable.

---

## Mobile (< 720; no dedicated design frame beyond Mobile Layouts' "Organize" tab, derive from Phase 2 behaviour)

- Bottom bar `Organize` tab -> `/organization`. Default view `day`; Week available as horizontal scroll with day columns min 112 and the 56 gutter sticky-left; Month as dots.
- Order: header (H1 + Lead, then a single row: `chevron_left` / range label / `chevron_right` at 44 + `Today`), view switch (full width, 44 tall), legend (scroll row), **Today's plan card first**, then the calendar grid, then Tasks. Rationale: the plan is the actionable summary on a phone; the grid is long. (Desktop order is grid first, aside right.) `New event` becomes a 56px circular FAB (indigo, `add`, bottom-right above the bottom bar, safe-area aware, `aria-label="New event"`) instead of the header button.
- Grid height = viewport-limited with internal scroll, same as desktop; EventDetail and dialogs are full-width bottom sheets / full-screen sheets; Settings calendar list rows wrap: checkbox + name on line 1, Category select (full width, 44) and Default radio on line 2.
- Safe-area padding on sheets and the FAB.

---

## Copywriting Contract

Voice: calm chief of staff, fact first, no exclamation marks, no emoji, Australian date order (`5 Oct`).

| Element | Copy |
|---------|------|
| Primary CTA (phase) | `New event` (page); `Add event` / `Save changes` (dialog); `Add to calendar` (plan item); `Add task` / `Save task` (task); `Connect Google Calendar` / `Connect iCloud Calendar` (Settings rows) |
| Eyebrow / H1 | `ORGANIZATION` / dynamic (see header), fallbacks above |
| Lead (no calendar) | `Connect a calendar to see your week. Tasks work without one.` |
| Calendar empty state (connected, none in range) | EmptyState icon `event_note`, title **Nothing scheduled.**, body `No events in this {day\|week\|month}. Add one, or check which calendars are syncing in Settings.` Actions: primary `New event`, ghost `Calendar settings` -> `/settings?section=connections`. Shown **over** the empty grid area (grid hairlines remain, EmptyState centred in the column) |
| Not connected (page body) | EmptyState icon `calendar_month`, title **No calendar connected.**, body `Connect Google Calendar or iCloud to see your events here and let LifeOS plan around them. Tasks work without a calendar.` Action primary `Connect a calendar` -> `/settings?section=connections`. Tasks card and quick-add remain usable; the grid area is replaced by this EmptyState (no fake grid) |
| Calendars connected but none ticked | EmptyState icon `date_range`, title **No calendars are syncing.**, body `Choose which calendars to show in Settings. Holiday and birthday calendars are off by default.` Action `Choose calendars` |
| Plan empty (nothing due, calendar fine) | **All clear for today.** `Nothing is due and you have {h} free hours. Add a task to plan around it.` (compact EmptyState inside the card, no icon box, text only) |
| Plan, no tasks and no free time | Summary line `Your day is full.`; no EmptyState |
| Tasks empty | `No tasks for today.` Small text-2 + the quick-add input; `Add one below, or press ↵ after typing a title.` |
| Task all done | `All done for today.` Meta `{n} completed` |
| Sync error (page) | InlineError label `ERROR · CALENDAR`, title **Calendar data couldn't be refreshed.** · What happened: The last sync failed at {HH:mm}. · Why: {reason, e.g. "Google rate limit reached."}. · What to do: LifeOS retries every 5 minutes. You can also sync now. · Action `SYNC NOW` (inverse). Events shown are from the last successful sync |
| Reconnect (page) | InlineError label `ERROR · {GOOGLE CALENDAR \| ICLOUD CALENDAR}`, title **{Google Calendar} needs reconnecting.** · What happened: Syncing is paused. · Why: {Google \| Apple} rejected the saved access. · What to do: Reconnect in Settings. Your events are not changed. · Action `RECONNECT` (inverse, `/settings?section=connections`) |
| Load error | route error boundary (Phase 2): `This page couldn't load.` |
| Event not found (`?event=`) | Toast `That event isn't available. It may have been deleted.` and the param is dropped |
| Agent no-calendar / no-task answers | see Organization agent in chat |
| Task reminder notification | see Notification map |
| Toasts | `Event added to {calendar}` · `Event updated` · `Event deleted` · `Added to {calendar} · {HH:mm}` · `Task added` · `Task saved` · `Task deleted` · `Saved. It overlaps {title} at {HH:mm}.` · `Couldn't save that to {Google Calendar}. Nothing was changed.` · `{Google Calendar} needs reconnecting.` · `Google Calendar connected · {n} calendars` · `{Google Calendar} disconnected` · `Couldn't save that. Try again.` (generic) |
| Validation | `Add a title.` · `Title must be 200 characters or fewer.` · `End must be after start.` · `Pick a calendar.` · `Choose a category.` · `Reminder must be in the future.` · `Add a due date before choosing a time.` · `Paste the app-specific password to continue.` |
| iCloud errors (inline, Connections) | `Apple rejected this sign-in. Check the Apple ID and app-specific password (not your Apple ID password) and try again.` · `Couldn't reach iCloud. Nothing was saved. Try again.` |
| Google errors (inline) | `Google sign-in was cancelled. Nothing was saved.` · `Google didn't grant calendar access. Connect again and allow calendar access.` |

### Destructive and irreversible actions

| Action | Approach |
|---|---|
| Delete event (owner UI) | Dialog, destructive `DELETE EVENT`, initial focus Cancel; recurring: scope step then confirm. No Undo. |
| Delete event (agent, HIGH_RISK) | ApprovalDetail with red border, warning block, destructive `DELETE EVENT` approve button, initial focus `REJECT` (D-07). |
| Edit recurring "This and following" / "All events" | Scope Dialog is the confirmation; no extra confirm. |
| Delete task | Dialog `DELETE TASK`. Completing a task is reversible (checkbox) and has no dialog. |
| Disconnect calendar account | Dialog `DISCONNECT`; provider data untouched. |
| Skip plan item | No dialog; per-day, with `Undo`. |
| Add to calendar (plan, D-17) | Not destructive; creates a real event; the toast names the calendar and time. Editable/deletable afterwards. |
| Untick a calendar in Settings | No dialog; helper text explains it only hides data in LifeOS. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable (shadcn not used) |
| third-party | none | not applicable |

---

## Open implementation notes for the planner

1. Read `node_modules/next/dist/docs/` before writing Next code (AGENTS.md). Relevant here: `searchParams` (`view`, `date`, `event`) handling and validation (clamp `date` to the sync window; invalid -> today, `view` invalid -> default); route handler for the Google OAuth callback behind tailscale serve (`BETTER_AUTH_URL` origin); server actions for event/task writes; SSE kinds for `calendar.synced` and `task.changed`.
2. Regenerate the Material Symbols subset with the Phase 4 icon additions and delete none. Only add primitives that do not exist: a `Checkbox` (task rows, Settings sync tick, All day) and a `RadioGroup` (recurring scope, default calendar) in `src/ui/field.tsx`; use native `<input type="checkbox|radio">` styled to the 16x16 / radius-5 spec with the indigo checked fill, keep the native semantics. No date-picker library: native `date`/`time`/`datetime-local` inputs (platform feature; styled to the Input spec, `color-scheme: dark`).
3. Data the UI expects: calendars (id, account, name, access `owner\|writer\|reader`, sync boolean, category key, isDefault), events (id, calendarId, title, start/end instant + tz + allDay, location, description, status `confirmed\|tentative\|cancelled`, transparency `busy\|free`, response `declined?`, rrule, recurringEventId, instanceOriginalStart, etag/sequence, htmlLink not exposed), conflicts (pairs + overlap window), free slots, plan items (kind `task\|conflict`, task id, proposed start/end, why template key + params), tasks (id, title, due date, due time?, priority, notes, completed_at, remind_at, nullable project_id), connections (provider, account label, status, last sync, error reason, calendar list). The category colour map is a single module consumed by grid, legend, plan, settings, approvals, agent results.
4. Conflict and free-slot computation is a pure, unit-tested function shared by the grid badge, the plan card, the Lead counts, notifications and agent tools (single implementation, D-14/D-15).
5. Design deviations deliberately made (so the checker/auditor do not flag them): `ORGANIZATION AGENT` tag removed from the plan card; plan summary is templated, not prose; "Added as tentative · confirm in Approvals" replaced by a real immediate event (D-17); "conflicts resolved" in the Lead replaced by real `conflicts`; task rows show priority/reminder not a category swatch (tasks have no category); Month cell click opens Day not Week; US-order range label replaced by Australian order; event/time sizes raised to the 10.5 floor and past-event dimming applied to fills only; all-day strip and `earlier` range added (design omits all-day); legend toggles do not change header counts; agent cannot create recurring events or tasks via approval in this phase (follow the planner's tool policy); drag/resize not built; a Today button, Sync icon, keyboard shortcuts and mobile order/FAB added.
6. Items left to the executor as discretion with these defaults: waking hours 08:00-22:00 fixed; slot cursor keyboard model; grid initial scroll; discard-changes inline confirm; whether Home Today/Upcoming consume the data.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (design-intent note: more than 4 sizes by design, closed role set inherited from Phase 2/3, nothing new; 600 is the existing Badge/Mono label role)
- [x] Dimension 5 Spacing: PASS (Phase 2 exceptions + design grid geometry: 44 hour rows, 56 gutter, 112 day column, 104 month cell; 3px segmented padding documented; control heights 26/34 from the Phase 2 set)
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-10-09 (checker rev 2: D4 label fixes and flags applied inline by orchestrator at owner's request)
