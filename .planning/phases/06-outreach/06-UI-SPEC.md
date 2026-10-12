---
phase: 6
slug: outreach
status: approved
reviewed_at: 2026-10-13
shadcn_initialized: false
preset: none
created: 2026-10-13
---

# Phase 6 (Outreach) — UI Design Contract

> Auto mode: the owner was asleep, so no questions were asked. Source priority is `06-CONTEXT.md` D-01..D-36 first, then the Glass system (`04.1-SPACING-RUBRIC.md` wins on radius, spacing and padding), then the existing approval UI (`src/approvals/approval-detail.tsx` `EventApprovalShell`, `event-approval.tsx`, `project-approval.tsx`, `src/shell/ai/approval-card.tsx`), then `05-UI-SPEC.md` and `05.1-UI-SPEC.md` (tokens, copy patterns), then `design/glass/Glass Outreach.dc.html` (layout and content order ONLY).
> The design's placeholder data (Hannah Lee, Priya Nair, Sentinel, Ledgerline, Fishburners, the fake agenda, the "22 min by light rail" facts, "people you know going", cover images, maps, the NETWORK tab) is **never ported**.
> **No new tokens, fonts, radii or colours.** Everything reuses `src/app/globals.css` utilities (`glass-card`, `glass-menu`, `text-text*`, `rounded-24/16/14/full/6`) and the `src/ui/*` primitives. Choices made without the owner are tagged **[auto]** and listed under "Auto-decisions".

---

## Design System

| Property | Value |
|---|---|
| Tool | none (hand-built `src/ui/*`; the shadcn gate and the registry gate don't apply) |
| Preset | not applicable |
| Component library | none (Tailwind v4 `@theme inline`) |
| Icon library | Material Symbols Outlined, self-hosted subset. **Add to `src/ui/icon-names.ts` and regenerate the subset** (check each glyph; a missing one renders as ligature text): `bookmark` (Save), `star` (Interested), `groups` (organizer), `reply` (draft reply). Already present and reused: `travel_explore` (Outreach identity), `event`, `event_busy`, `location_on`, `public` (online), `schedule`, `check_circle`, `mail`, `flag`, `archive`, `unarchive`, `task_alt`, `radio_button_unchecked`, `add`, `link`, `open_in_new`, `refresh`, `sync_problem`, `warning`, `error`, `lock`, `shield`, `close`, `arrow_back`, `more_horiz`, `auto_awesome`, `visibility_off`, `pause_circle`, `key`, `hub` |
| Display font | Instrument Serif 400 (`font-display`) |
| UI font | Familjen Grotesk (`font-sans`); `font-code` only for feed hosts and email addresses inside the approval facts |
| Theme | Dark only |

Reused primitives (do not re-create): `PageHeader`, `SectionHeader`, `Badge` (`status|tag|count`; tones red/amber/green/blue/indigo/neutral/purple), `Button` (primary/secondary/ghost/destructive/ai/inverse; sizes xs/sm/md/touch), `Dialog` (menu tier, `p-6`, `rounded-30`), `Field`/`Input`/`Select`/`Textarea`/`Checkbox`, `InlineError`, `EmptyState`, `Skeleton`, `StatusDot`, `Disclosure`, `Icon`, `useShell().toast`, the approval `Fact`/`Resolved`/`UnreadableApproval`/`stamp`, the Phase 4 task row and checkbox, the Approvals segmented-tab markup (`approval-list.tsx` `role="tablist"` pill container), `ProgressRing` (`src/projects/progress-ring.tsx`), and `ConnectionRow`/`TokenForm`/`CalendarConnectionRow` in `src/settings/`.

**`ProgressRing` change (one prop, no new component):** add an optional `color?: string` that overrides its built-in colour rule. The relevance score uses it with the score rule below.

**New components** (all composed from the above; no new styling primitives):
- `src/outreach/outreach-view.tsx`: tabs and tab state.
- `src/outreach/event-card.tsx`, `event-list.tsx`, `pipeline-board.tsx`, `event-detail.tsx`, `why-block.tsx`, `stage.ts` (one `STAGE` map: labels, order, next and previous step).
- `src/outreach/add-to-calendar-dialog.tsx`, `follow-up-dialog.tsx`, `import-url-dialog.tsx`.
- `src/outreach/email-view.tsx` (category nav, list, detail), `email-card.tsx`, `email-detail.tsx`, `draft-reply.tsx`.
- `src/outreach/follow-ups.tsx`.
- `src/approvals/mail-approval.tsx`: `MailApprovalBody` plus the same export set as `event-approval.tsx` / `project-approval.tsx` (`mailOf`, `toMailDraft`, `validateMailDraft`, `sameMail`, `mailResolved`), so `approval-detail.tsx` gains a one-line branch.
- `src/settings/event-feeds.tsx`, `src/settings/outreach-section.tsx` (interests chip editor).

---

## Spacing Scale

Scale 4 / 8 / 16 / 24 / 32 / 48 / 64 plus the closed 04.1 exception set. The rubric is applied literally.

| Context | Value |
|---|---|
| Page container | `max-w-[1480px]`; sections stacked `gap-8` (32) |
| Page header block | eyebrow, H1 `mt-2.5`, lead `mt-2.5`; header to tab bar 24 (`mt-6`); tab bar to tab toolbar 16 (`mt-4`) |
| Tab bar | `flex gap-6 border-b border-white/[.06]`; tab `h-10`, label + count `gap-2`; selected tab has a 2px bottom bar |
| Tab toolbar (filters row) | `flex flex-wrap items-center gap-2`; meta text pushed right with `ml-auto` |
| Filter chips | `h-8 px-3.5 rounded-full gap-2`, count in `text-text-3` (Phase 5 chip) |
| Event grid | `grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3` |
| EventCard | `glass-card rounded-24 overflow-hidden`; body `p-4` (dense card) `flex flex-col gap-3`; top row `flex gap-3.5 items-start` |
| Date block | `w-12 h-[52px] rounded-14 flex flex-col items-center justify-center` (graphic size, not spacing) |
| WHY block (card) | inset `rounded-14 p-3 flex flex-col gap-1` |
| Card action bar | `grid grid-cols-4 border-t border-white/[.06]`; cells `h-10 gap-1.5`, separated by `border-r border-white/[.05]`; coarse pointer `h-11` |
| Pipeline board | 5 columns `grid-cols-[repeat(5,minmax(240px,1fr))] gap-3`, `overflow-x-auto` below 1280px; column = `glass-card rounded-24 p-2`, header `px-3 py-2.5`, cards `rounded-16 p-3 gap-2` |
| Event detail | two columns `gap-6`: `grid-cols-[minmax(0,1fr)_360px]` at `desk:` (>=1100), single column below; main stack `gap-6` (24) |
| Email view (desktop) | `grid-cols-[200px_minmax(0,380px)_minmax(0,1fr)] gap-6` at `desk:`; category nav `p-2` list container, rows `rounded-16 px-3 py-2.5`; email list `flex flex-col gap-2`; EmailCard `glass-card rounded-24 p-4 gap-1.5` |
| Email detail | `glass-card rounded-24 overflow-hidden`; header `px-5 py-5 border-b border-white/[.06]`; each section `px-5 py-5 border-b border-white/[.06]`; SUMMARY + ACTION ITEMS `grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6` |
| Message body / draft body | inset panel `rounded-14 border border-white/[.08] bg-white/[.03] p-4` |
| Draft actions row | `flex flex-wrap items-center gap-2 mt-4`; trailing note `ml-auto` |
| Follow-ups list | `glass-card rounded-24 p-2`; rows `rounded-16 px-3 py-2.5 grid grid-cols-[22px_minmax(0,1fr)_auto_auto] items-center gap-3` |
| Dialogs | `p-6`; fields `gap-4`; footer `mt-6 gap-2` right-aligned; follow-up task lines `grid grid-cols-[minmax(0,1fr)_160px_auto] gap-2 items-end`, collapsing to one column below 720px |
| Settings rows | existing `ConnectionRow` spacing; event feeds list `p-2` container, rows `rounded-16 px-3 py-2.5`; interests chips `flex flex-wrap gap-2` |
| Touch targets | every `a, button` >= 44px on coarse pointer (`touch` size / `size-11`) |

Exceptions: none beyond the 04.1 table. Score ring 44px and date block 48x52 are graphic sizes, not spacing.

---

## Typography

The closed 04.1 scale is reused. **No new sizes or weights.** Weights 400 and 500 only on this phase's content (600 stays only inside the existing `Badge` status caps and the existing uppercase approval buttons).

| Role | Font / size / weight / line-height | Used for |
|---|---|---|
| H1 | Serif `clamp(34px,4.4vw,60px)` / 400 / .95 | `Outreach` page title; event title on the detail route |
| Card title | Serif 20 / 400 / 1.12 | event title on EventCard; date-block day number |
| Approval / email title | Serif 26 / 500 / 1.12 (existing approval `h2`) | email subject in EmailDetail header; mail approval h2. Weight 500 here is intentional reuse of the existing approval `h2` style, not a new weight |
| Lead | Grotesk 15 / 400 / 1.5 `text-2` | page lead, event description lead on detail |
| Body | Grotesk 14 / 400 / 1.5 (1.65 inside message and draft panels) | event description, AI summary, message body, draft body |
| Row | Grotesk 13.5 / 400 (500 for sender names and task titles) / 1.5 | email card sender and subject, follow-up rows, action items |
| Small | Grotesk 12.5 / 400 `text-2` or `text-3` | card meta (time · price, location, organizer), WHY text on cards, helper text, chips |
| Eyebrow | Grotesk 11 / 500 / tracking .14em uppercase `text-3` | section and card eyebrows (`WHY THIS IS RELEVANT`, `AI SUMMARY`, `ACTION ITEMS`, `MESSAGE`, `DRAFT REPLY`, `SIGNALS`); approval section eyebrows stay at the existing 10px |
| Caps tags | Grotesk 10 / 500 / tracking .1em uppercase | event category chips, date-block weekday, `MOCK` and source badges (via `Badge`) |
| Score | Grotesk 12 / 500 | number inside the score ring, in a fixed `w-7 text-center` box (28px) so 1–3 digit scores never shift |
| Code | `font-code` 11.5 `text-2` | feed host, email addresses in approval facts |

Informative text is never `text-4`. The minimum size is 10px.

---

## Color

Glass 60/30/10 is unchanged.

| Role | Value | Usage |
|---|---|---|
| Dominant (60%) | `#121214` + glow | page canvas |
| Secondary (30%) | `rgba(255,255,255,.045)` `glass-card`; `rgba(255,255,255,.03)` inset; menu tier for dialogs and the mobile sheet | event cards, pipeline columns, email cards, email detail, follow-ups list, panels |
| Accent (10%) | `#0a84ff` fill / `#64d2ff` text | see the reserved list |
| Destructive | `#ff6961` (`text-red`, existing destructive Button) | REJECT on the mail approval, Remove feed, Disconnect Google, HIGH importance and IMPORTANT category marks |

**Accent reserved for (this phase only):**
1. The primary Button on each surface: `Import event` (EVENTS toolbar and dialog), the next-step button on the event detail stage card (`Save event` / `Mark interested` / `Attend` / `Mark attended` / `Follow up`), `Reconnect Google` in Settings when Gmail is not allowed, `Add to calendar` (dialog submit), `Create follow-up tasks` (dialog submit), `Draft with agent` (EmailDetail, when no draft exists), `SEND REPLY` (mail approval), `Add feed` (Settings).
2. The selected tab's 2px underline (`bg-cyan`) and the selected filter chip (`rgba(100,210,255,.12)` fill, `rgba(100,210,255,.45)` border).
3. The selected EmailCard (`border-[rgba(10,132,255,.40)]` plus `bg-[rgba(10,132,255,.06)]` overlay tint, rubric `before:` pattern).
4. The WHY THIS IS RELEVANT block: inset tint `bg-[rgba(10,132,255,.06)] border border-[rgba(10,132,255,.16)]`, eyebrow `text-cyan` with the 6px rotated `bg-accent` diamond.
5. Reached-stage cells on the card action bar (`bg-[rgba(10,132,255,.08)]`, icon filled, text `#9fd8ff`, design value).
6. Links (`text-cyan`): `Open original page`, `Open event`, `Open email`, `Open Settings`.
7. The focus ring `#64d2ff`.
Nothing else is accent.

**Relevance score colour** (the design's rule, using existing tokens; colour is never the only channel because the number is always shown):

| Score | Colour |
|---|---|
| 85–100 | `--green` `#30d158` |
| 70–84 | `--cyan` `#64d2ff` |
| 0–69 | `text-2` `#aeaeb2` |

**Email category dots** (the design's `CC` map, existing tokens; label always shown):

| Category | Dot |
|---|---|
| IMPORTANT | `--red` |
| EVENTS | `--purple-text` (purple) |
| NETWORKING | `--green` |
| OPPORTUNITIES | `--amber` |
| FOLLOW-UP | `--cyan` |
| OTHER | `text-3` |

**Importance** (`Badge kind="status"`): HIGH `red`, MEDIUM `amber`, LOW `neutral`. The importance → recommended action line on EmailCard is the badge followed by `→ {action}` in 12.5 `text-2`.

**Other semantic colour (existing pairs, no new ones):**
- `MOCK` badge: `Badge kind="tag" tone="amber"`. Source badges (`iCal`, `URL`, `Eventbrite`, `Luma`, `Meetup`, `Humanitix`): `Badge kind="tag" tone="neutral"`. Category chips on cards: `Badge kind="tag" tone="blue"` (the design's cyan-on-cyan-tint chip).
- Stage labels: `Badge kind="status"` neutral for SAVED and INTERESTED, `blue` for ATTENDING, `green` for ATTENDED, `amber` for FOLLOW UP. `On calendar` is a green status badge with `check_circle`.
- Untrusted note on the mail approval: the 5.1 amber inset (`border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)]`, `warning` `text-amber`).
- Triage paused and sync errors: `InlineError` (existing red) for errors; the triage-paused note uses the amber inset with `pause_circle`, because it is a state, not an error.
- Agent flag on EmailCard: `flag` icon 15 `text-amber`. The owner's Flag (pinned) uses the same icon filled.
- Outreach agent identity: eyebrow `text-cyan`, activity icon `travel_explore` cyan (D-16).

---

## Layout and Content Order

### `/outreach` (replaces the `DomainPage` empty state)

1. `PageHeader`: eyebrow `OUTREACH` (`text-cyan`), title `Outreach`, lead `Sydney events worth your time, and the email that needs you.` **[auto]**
2. Tab bar (`role="tablist"`, `aria-label="Outreach"`): `EVENTS {n}`, `EMAIL {n}`, `FOLLOW-UPS {n}`. Labels Grotesk 12.5/500 tracking .1em uppercase; selected `text-text` with the cyan underline, others `text-text-3`, hover `text-text`. Count is `Badge kind="count" tone="neutral"`. Arrow keys move between tabs (roving tabindex), Enter/Space selects. The tab lives in the URL (`?tab=events|email|follow-ups`, default `events`) so reload and palette links land correctly **[auto]**. NETWORK is not rendered (D-34).
   - Counts: EVENTS = events that the current list would show with no interest filter (window, not dismissed, Hide mock applied). EMAIL = non-archived INBOX mail. FOLLOW-UPS = open tasks linked to an event or an email.
3. Tab panel (`role="tabpanel"`, `aria-labelledby` the tab).

### EVENTS tab

**Toolbar row** (same row, `items-center`, wraps on narrow screens):
- Interest filter chips (`role="group" aria-label="Filter by interest"`, `aria-pressed`): one chip per interest from `outreach.interests` (D-15). Multi-select, OR semantics (an event matches if any selected interest matched it). A trailing ghost xs `Edit interests` link to `/settings?section=outreach`.
- `ml-auto` cluster: `Hide mock` toggle chip (`aria-pressed`, `visibility_off` icon; shown only when at least one mock event exists; default on once any real source exists, D-09), `List | Pipeline` segmented control (Approvals pill markup), `Sync now` secondary sm (`refresh`, loading state), `Import event` primary sm (`add`).
- Meta line under the toolbar (12.5 `text-3`): `{n} events · Sydney · next 60 days · sorted by relevance`. In Pipeline view: `{n} saved events by stage`.
- Filter and view state go in the URL (`?interest=AI,Fintech&view=pipeline`) **[auto]**. A visually hidden `aria-live="polite"` region announces `{n} events shown`.

**Source status strip** (only when relevant, above the grid, stacked `gap-2`):
- No real sources (only mocks): a `glass-card rounded-24 p-4` note with `travel_explore` cyan + `Add an iCal feed or import an event URL to see real Sydney events.` + buttons `Add a feed` (secondary sm, links to `/settings?section=connections#event-feeds`) and `Import event` (ghost sm, opens the dialog). Mock events below stay visible and badged.
- A source with `lastSyncError`: `InlineError` per failing source: `{label} didn't sync: {lastSyncError}. Showing the last events we have.` + `Open Settings` link. One line per source, at most 3, then `and {n} more sources failed`.

**List view:** grid of `EventCard`, sorted by score descending, then start time.

**EventCard** (`glass-card rounded-24 overflow-hidden`, hover border `.16` + `-translate-y-px`). The card body is an overlay-link (`after:absolute after:inset-0`) to `/outreach/events/{id}`; the action bar sits above it (`relative z-10`) so there is no interactive-inside-interactive markup (Phase 5 pattern).
- Row 1 (`flex gap-3.5 items-start`): date block (`bg-white/[.04] border border-white/[.07] rounded-14`: weekday 10/500 caps `text-3`, day Serif 20); title block (title Serif 20/1.12, 2-line clamp; meta 12.5 `text-2`: `{HH:mm}–{HH:mm} · {price}`; price omitted when unknown; all-day events show `All day`); score ring right (`ProgressRing` size 44, stroke 4, `color` from the score rule, number 12/500 inside; `aria-label="Relevance {n} out of 100"`).
- Row 2 meta (12.5 `text-2`, `flex flex-wrap gap-3`): `location_on` + venue text, or `public` + `Online`, or `location_on` + `Location unknown`; `groups` + organizer (omitted when unknown).
- Row 3 chips (`flex flex-wrap gap-1.5`): up to 3 category chips (uppercase), then `MOCK` (amber) if mock, then one source badge per distinct source (max 2, then `+{n}`). Stage badge when saved (`SAVED`, `INTERESTED`, `ATTENDING`, `ATTENDED`, `FOLLOW UP`) and `On calendar` when linked.
- Row 4 WHY block: eyebrow `WHY THIS IS RELEVANT` (11/500 tracking .14em caps cyan with the diamond; the same size on card and detail), the templated `why` line 12.5/1.5 `text-text`, 3-line clamp. When the score is 0 and no signal matched: `No interest or project matches yet. It fits your schedule.` style lines come straight from the templated `why` (never invented).
- Action bar (4 cells): `Save` (`bookmark`), `Interested` (`star`), `Attend` (`check_circle`), `Calendar` (`event`). Behaviour (D-16 forward one step at a time) **[auto]**:
  - A cell for a stage already reached is pressed (`aria-pressed="true"`, filled icon, accent tint) and does nothing on click (moving back is on the detail page).
  - The cell for the next stage is enabled.
  - Later cells are disabled with `title` and `aria-describedby` text: `Mark Interested first` / `Save it first`.
  - `Calendar` is enabled only at ATTENDING (and later) when the event is real and not yet on a calendar; it opens the Add to calendar dialog. On a mock event it is disabled with `Mock events can't go on your calendar.` Once linked it reads `On calendar`, pressed, and is a link to the calendar event in Organization.
  - Accessible names (visible labels stay short per D-16): `Save {title}`, `Mark {title} interested`, `Attend {title}`, `Add {title} to calendar` (`{title} is on your calendar` once linked).
  - Each click is optimistic: the cell flips at once; on failure it reverts and the toast `Couldn't update the event. Try again.` appears. Success is silent (the badge change is the feedback).

**Pipeline view** (D-34; static board, no drag):
- 5 columns in stage order: `SAVED`, `INTERESTED`, `ATTENDING`, `ATTENDED`, `FOLLOW UP`. Column header: label (11/500 caps `text-3`) + count badge.
- Compact card (`rounded-16 p-3 bg-white/[.03] border border-white/[.06]`): date `{EEE d MMM · HH:mm}` 12.5 `text-3`, title 13.5/500 (2-line clamp, link to detail), score number 12/500 in the score colour, `MOCK` badge if mock, `On calendar` badge if linked. Footer `flex gap-2`: ghost xs `Back` (`arrow_back`, `aria-label="Move {title} back to {stage}"`, hidden in SAVED) and secondary xs next-step button (`Interested` / `Attend` / `Attended` / `Follow up`; hidden in FOLLOW UP). `Follow up` opens the follow-up dialog (or is disabled on mock events, see D-09).
- Empty column: centered 12.5 `text-3` `Nothing here yet.`
- The board scrolls horizontally inside the page below 1280px; the column order is also the reading order for screen readers (each column is a `<section aria-labelledby>` with an `<ol>` of cards).

**Event detail** `/outreach/events/[id]` (route, not a panel **[auto]**: shareable, palette and notifications can link to it, and mobile gets a full page):
- Back link `arrow_back All events` (keeps the previous `?tab&interest&view` query).
- Main column (`gap-6`):
  1. Chips row: category chips, `MOCK`, source badges, stage badge.
  2. H1 = event title; lead (15 `text-2`) = first paragraph of the description.
  3. `WHY THIS IS RELEVANT · {score}/100` block (same tint as the card, `p-4`): the `why` line 14/1.5, then `SIGNALS` rows (`grid grid-cols-[96px_minmax(0,1fr)_auto] gap-3 items-center`): label caps 11/500 `text-3` (`INTERESTS`, `PROJECTS`, `SCHEDULE`), a 4px bar (`bg-white/[.08]` track, fill in the score colour of that signal value, `role="img" aria-label="{label} {value} out of 100"`), and the matched terms 12.5 `text-2` (`cybersecurity, AI` / `project {project name}` / `fits your Thursday evening`). A signal with no match shows `No match` in `text-3`. The design's NETWORK and GOALS rows are not rendered.
  4. `DESCRIPTION` card (`glass-card rounded-24 p-5`): the full description as plain text, `whitespace-pre-wrap break-words`, max ~4 KB as stored. Never rendered as HTML (third-party content). Collapsed at `max-h-[320px]` with `Show full description` / `Show less` (cyan text button, `aria-expanded`) when it overflows.
- Side column (360px):
  1. Facts card (`glass-card rounded-24 p-5 flex flex-col gap-3.5`): rows icon 18 `text-text-3` + value 13.5 + sub 12.5 `text-3`: `event` `{EEE d MMM yyyy}` / `{HH:mm}–{HH:mm} {AEDT|AEST}` (Sydney zone; the original zone in the sub line when it differs); `location_on` venue / `Online` / `Location unknown`; `groups` organizer / `Organizer unknown`; price text / `Price not listed`. No travel time, no past-attendance facts.
  2. Stage card (`glass-card rounded-24 p-5`): eyebrow `PIPELINE`, a 5-step horizontal stepper (`<ol>`; reached steps cyan dot + label `text-text`, current step label 500, later steps `text-3`; `aria-current="step"` on the current one). Then the actions, stacked `gap-2`, full width:
     - Primary (accent) = the next step: `Save event` / `Mark interested` / `Attend` / `Mark attended` / `Follow up`. Hidden at FOLLOW UP.
     - Secondary `Add to calendar` (at ATTENDING and later, real events, not yet linked) or the `On calendar` badge + cyan link `Open in Organization`.
     - Ghost `Move back to {previous stage}` (hidden at discovered and SAVED; from SAVED the ghost reads `Unsave`, returning the event to discovered).
     - Ghost `Open original page` (`open_in_new`, `rel="noopener noreferrer"`, new tab, accessible name `Open {title} on {host}`); hidden when the event has no URL.
     - Ghost `Dismiss event` (`visibility_off`) at the bottom, only when the event is not saved.
     - Mock note (mock events only), 12.5 `text-3` with `info`: `This is a mock event from {provider}. It can't go on your calendar or create follow-up tasks.`
  3. Dismissed state: when `dismissed_at` is set, a neutral banner above the main column `This event is dismissed and hidden from your lists.` + secondary sm `Restore event`. Stage actions are hidden until restored.
- Unknown id: 404 `EmptyState` (`event_busy`) `Event not found` / `It may have been pruned after it ended. Saved events are always kept.` + `Back to events`.
- Not rendered: cover image, agenda, PEOPLE YOU KNOW GOING, map.

**Add to calendar dialog** (D-17): title `Add to calendar`; body 13.5 `text-2` `{title} · {EEE d MMM, HH:mm}–{HH:mm}`; `Calendar` Select (writable calendars, default per Phase 4 D-09); helper `The event's link goes in the description. Moving the event back later doesn't remove it from your calendar.` Buttons `Add to calendar` (primary) / `Cancel`. On success: toast `Added to {calendar name}`, badge `On calendar`. No calendar connected: the Select is replaced by `No calendar is connected. Connect one in Settings.` + `Open Settings`, and the submit is disabled.

**Follow-up dialog** (D-18; opens when the owner presses `Follow up`; the stage changes to FOLLOW UP only when the dialog is confirmed **[auto]**):
- Title `Follow up`; lead `Create tasks for after "{title}".`
- Task lines (one prefilled: `Follow up: {title}`, due = event end + 2 days, priority 2 shown as a `P2` tag, not editable here **[auto]**): `Title` Input (required, max 200) + `Due` date Input + remove `close` icon button (`aria-label="Remove task {n}"`, hidden when only one line). Visible labels on the first line, `aria-label="Task {n} title"` / `Task {n} due date` on the others.
- `Add another task` ghost xs (`add`), max 10 lines.
- Footer: `Create follow-up tasks` (primary; label `Create follow-up task` when one line) / `Cancel`. Toast `{n} follow-up tasks created`. Validation: `Add a title.`
- Mock events: the `Follow up` button is disabled with `Mock events can't create follow-up tasks.`

**Import event dialog** (D-05; from the EVENTS toolbar and the palette command):
- Title `Import an event`; `Event page URL` Input (`type="url"`, `inputmode="url"`, placeholder `https://`), helper `Works with pages that publish event details, like Eventbrite, Humanitix, Meetup and Luma.`
- Footer `Import event` (primary, loading) / `Cancel`.
- Success: close, toast `Event saved`, navigate to `/outreach/events/{id}` (it lands in SAVED). If the event already exists: toast `Already in your events` and navigate to it.
- Errors (`Field` error under the input, input keeps focus): see the copy table.

### EMAIL tab

Desktop (`desk:`) is three columns: category nav, email list, detail. Between 760 and 1099px the category nav becomes a horizontal chip row above a two-column list + detail. Below 760px (Glass Mobile pattern): chip row, list only; tapping a card opens the detail as a full-height sheet (menu tier, `rounded-t-30`, header `h-14 px-5` with `arrow_back` `Back to inbox` and the subject truncated), Esc/back closes it and focus returns to the card.

**Status notes** above the columns (stacked `gap-2`, only when they apply):
- Triage paused (D-25): amber inset `rounded-14 p-4` with `pause_circle`: `Triage paused: monthly AI cap reached.` + body 12.5 `text-2` `New mail still syncs and shows its preview. Summaries resume next month, or when you raise the cap.` + cyan link `AI and spend` → `/settings?section=ai`.
- Sync error: `InlineError` `Gmail didn't sync: {lastSyncError}. Showing the last mail we have.` + `Sync now` secondary xs.
- Toolbar (right-aligned, same row as the first note or alone): meta 12.5 `text-3` `Synced {relative}` + `Sync now` secondary sm (`refresh`).

**Category nav** (`<nav aria-label="Email categories">`, `glass-card rounded-24 p-2`): rows `IMPORTANT`, `EVENTS`, `NETWORKING`, `OPPORTUNITIES`, `FOLLOW-UP`, `OTHER`, then `UNTRIAGED` (only when n > 0) and `ARCHIVED` (only when n > 0) **[auto]**. Row: 7px category dot, label 12.5/500 caps, count right `text-3`. Current row `aria-current="page"`, `bg-white/[.05]`, `text-text`. The category is in the URL (`?tab=email&cat=important&mail={id}`). Default category is IMPORTANT; if it is empty, the first non-empty one.

**EmailCard** (`<button>` inside a `role="list"` / `role="listitem"` wrapper; `glass-card rounded-24 p-4`; selected = accent border and tint):
- Row 1: sender name 13.5 (500; HIGH importance mail uses the same 500 plus the red importance badge, no 600), agent-flag or owner-flag `flag` icon 15 `text-amber` (`aria-label="Flagged"`), time 12.5 `text-3` right (`HH:mm` today, `EEE` this week, `d MMM` older).
- Row 2: subject 13.5 `text-text`, 1-line truncate.
- Row 3: summary 12.5 `text-2`, 2-line clamp. Untriaged mail shows the Gmail snippet here instead, in `text-3`, plus a neutral tag `NOT TRIAGED`.
- Row 4 (triaged only): importance badge + `→ {recommended action}` 12.5 `text-2`.
- Bulk mail (D-25 rule) shows no importance row, only the neutral tag `BULK`.

**EmailDetail** (`<article aria-labelledby>`, sections as in the spacing table):
1. Header: subject (Serif 26/500), importance badge; line 2 13.5: sender name + `<{address}>` 12.5 `text-3` + ` · {EEE d MMM, HH:mm}`; line 3 12.5 `text-3`: `To {names}` (+ `, cc {names}` when present).
2. `AI SUMMARY` (eyebrow) + summary 14/1.5. Untriaged: `Not triaged yet.` 13.5 `text-2` + secondary xs `Triage` (`auto_awesome`; disabled with `Triage is paused at the monthly AI cap.` when paused). Bulk: `Bulk or promotional mail. Not sent to the AI.`
3. `ACTION ITEMS` (eyebrow): rows `radio_button_unchecked` 16 `text-text-3` + text 13.5 + optional due 12.5 `text-3` + ghost xs `Add as task` (`add`, `aria-label="Add {text} as a task"`). After adding, the row icon becomes `task_alt` green, the button becomes the text `Task added` 12.5 `text-3`. None: `No action items.` 13.5 `text-2`.
4. `MESSAGE` (eyebrow): plain-text body in the inset panel, 14/1.65 `whitespace-pre-wrap break-words`, `max-h-[480px] overflow-auto`, `tabIndex=0`, `role="region" aria-label="Message body"`. Loading: 4 `Skeleton` lines. HTML-only mail: same panel (server-stripped text) plus the footnote 12.5 `text-3` `Shown as plain text. Images and formatting are not loaded.` Truncated at 16 KB: footnote `Message is long; showing the first part.` + cyan link `Open in Gmail` (`https://mail.google.com/mail/u/0/#inbox/{threadId}`, new tab). Body fetch failure: `InlineError` `Couldn't load the message. Try again.` + `Try again`.
5. `DRAFT REPLY · OUTREACH AGENT` (eyebrow, `reply` icon) with a neutral tag `NOT SENT` on the right. Three states:
   - **No draft:** 13.5 `text-2` `No reply drafted.` + actions row.
   - **Drafting** (agent run in progress): `Skeleton` 4 lines + 12.5 `text-3` `Outreach agent is drafting…` (polite live region).
   - **Pending approval** (a `mail_reply` approval for this message): read mode shows `Subject` (13.5/500) and the body in the inset panel (14/1.65 pre-wrap). The locked fields render as facts with a `lock` 14 icon: `To {addresses}`, `Cc {addresses}` (omitted when empty), and the line 12.5 `text-3` `Replies only go to people already in this thread.` The untrusted note (amber inset, see the approval section) sits above the subject. `EDITED` amber tag when the owner has edited it.
   - **Edit mode** (pending only): `Subject` Input (max 200) and `Body` Textarea (rows 10, max 10000, `rounded-14`, `aria-label="Edit draft reply"`); `To`/`Cc` stay read-only with the lock icon.
   - **Actions row:** 
     - No draft: `Draft with agent` (primary, `auto_awesome`), `Archive` (secondary, `archive`), `Flag` / `Unflag` (secondary, `flag`, `aria-pressed`).
     - Pending: `Send reply` (primary, `check`; validates first; runs the same approve path as `/approvals`), `Edit draft` / `Done editing` (secondary), `Save to Gmail drafts` (secondary), `Reject draft` (ghost, red text), then `Archive`, `Flag`. While any approval call runs, all buttons are disabled except the loading one.
     - Trailing note (12.5 `text-3`, `ml-auto`, wraps under on narrow screens): `Reply opens an approval. Nothing sends automatically.`
   - **Resolved draft:** sent: `check_circle` green `Reply sent {HH:mm}.`; moved: `Moved to Gmail drafts. Finish it in Gmail.` + cyan `Open Gmail drafts` link; rejected or expired: `No reply drafted.` again with `Draft with agent`.
6. Empty selection (desktop, the category has mail but none selected): the first mail is auto-selected; the detail column never shows an empty card.

### FOLLOW-UPS tab

- `SectionHeader` `FOLLOW-UPS` + meta `{n} open · from events and email`.
- Sorted by due date ascending, undated last.
- Row: Phase 4 task checkbox (`aria-label="Mark {title} done"`); title 13.5/500 + context 12.5 `text-3` (`From event · {event title}` with `event` icon, or `From email · {subject} · {sender}` with `mail` icon; the context is a link to the event detail or the email); due 12.5 (`text-red` overdue, `text-amber` within 3 days, else `text-3`; `No due date`); action: email-linked rows get ghost xs `Draft with agent` (`auto_awesome`), which switches to the EMAIL tab on that mail and starts the draft; event-linked rows get ghost xs `Open event`.
- Completing a task is optimistic (row fades out with `lo-fade`, polite announcement `{title} done`); failure reverts with the toast `Couldn't update. Try again.`

### Mail approval: `/approvals` detail (`MailApprovalShell`, kind `mail_reply`)

Mirrors `EventApprovalShell` exactly (same guard, check, approve, done, busy states, footer). Unparseable payload → `UnreadableApproval`.
1. Header: eyebrow `OUTREACH` (`text-cyan`) + `wants to` + `send an email reply`. `h2` = subject.
2. `WHY` (only when `a.reason`), existing `Fact`.
3. Untrusted note (always for this kind, D-30): amber inset (5.1 style), `warning` + `Drafted from email content (untrusted)`; body 12.5 `text-2` `The original email was written by someone else. Check the reply before approving; nothing sends until you do.`
4. Facts: `WHAT WILL HAPPEN` `Sends a reply to {first recipient name}{ and n others} in the thread "{original subject}".`; `WHERE` `Gmail · {connected address}`; `WHEN` `Immediately after approval`.
5. `WHAT DATA WILL BE SENT` (existing list style): `check_circle` green `Your reply ({n} characters)`; `check_circle` green `To {addresses}{, cc {addresses}}` in `font-code` 11.5; `shield` cyan `Only to people already in this thread`; `shield` cyan `Sent once, even if a retry happens` (D-32).
6. `PREVIEW` (eyebrow; `EDITED` amber tag when edited): inset panel with `To` / `Cc` rows (`lock` icon 14, `font-code` 11.5), `Subject` 15/500, body 14/1.65 pre-wrap. Edit mode: `Subject` Input + `Body` Textarea (rows 12) as in EmailDetail; `To`/`Cc` read-only with the helper `Recipients are locked to the original thread.` `View agent's original` disclosure (existing).
7. Footer (existing uppercase style): primary `SEND REPLY` (`check`, `min-w-[150px] rounded-full`), secondary `EDIT` / `DONE`, secondary `SAVE TO GMAIL DRAFTS`, destructive `REJECT`, right meta `requested {HH:mm} · expires {stamp}`.
8. Resolved (`mailResolved`, same shape as `eventResolved`): approved/executing `schedule` cyan `Sending the reply…`; executed `check_circle` green `Reply sent to {name}. Approved at {HH:mm}.` + outline link button `Open email` → `/outreach?tab=email&mail={id}` (id validated before rendering, mirroring `eventResolved`); failed `error` red `Approved, but it couldn't be sent: {error}. Nothing was sent.` + `Retry`; failed with NOT_CONNECTED adds the cyan link `Reconnect Google in Settings`; rejected with reason `moved to Gmail drafts` → `Moved to Gmail drafts. Finish it in Gmail.`; other rejected/expired/cancelled use the existing copy with `Nothing was sent.`

**AI panel inline card** (`approval-card.tsx`, extend the map; the amber card layout is unchanged): line 2 `Outreach agent wants to reply to {name}`; `h4` = subject; meta 11 `text-3` `To {address}`; amber line with `warning` 14 `Drafted from email content (untrusted)`; body uses the existing clamp + `Show full preview`; footer meta `Gmail · Outreach · expires {stamp}`; buttons `SEND REPLY` (inverse), `REJECT`, link `Review and edit` → `/approvals?id={id}`. Resolved pill: `Reply sent to {name}.` + cyan `Open email`.

**List row and notification** (`approvalSummary`): title `Approval waiting: reply to {name} · {subject}` (D-32 example), body `{n} characters to {address}. Expires {when}.` List icon `mail`.

### Focal points

- EVENTS list: the top card's score ring and title (highest score, first in the grid).
- Pipeline: the first non-empty column's first card.
- Event detail: the H1, then the WHY THIS IS RELEVANT block; the next-step button on the stage card is the only accent action.
- EMAIL: the open email's subject (Serif 26) in EmailDetail; the selected EmailCard is the secondary anchor.
- FOLLOW-UPS: the first overdue or soonest-due row.
- Mail approval: subject h2, then the PREVIEW panel, then `SEND REPLY`.
- Settings → Outreach: the interests chips; Event feeds: the add form.

### Settings

**Connections → Google row** (extend `CalendarConnectionRow`):
- A second status line 12.5: `Gmail` + status: `Allowed` (green dot), `Not allowed` (amber dot, with `Reconnect Google to allow Gmail.`), or `Needs reconnect` (red dot).
- Secondary sm `Reconnect Google` (re-runs `startGoogleOAuth`), shown whenever Google is connected; it is the primary action (accent) only when Gmail is `Not allowed` **[auto]**.
- Helper 12.5 `text-3` under the row: `Google will show an "unverified app" screen once. This is your own LifeOS, so continue past it.`
- The existing Disconnect confirm adds one sentence (see the copy table).
- New OAuth return toasts: `Google reconnected · Gmail allowed` / `Google reconnected · Gmail not allowed`.

**Connections → Eventbrite and Luma rows** (reuse `ConnectionRow` + `TokenForm`, D-02): label, status (`Mock` neutral badge until a key exists, then `Connected · ••••{last4}`), `Add key` / `Replace key` / `Remove key`. Eventbrite has an extra `Organizer IDs` Input (comma-separated, helper `Events from these organizers appear in Outreach.`), and when the provider declares `discover: false`, the helper changes to `With this token LifeOS can only list your own events.` Luma helper: `Covers only the Luma Plus calendar the key was made on. For Sydney discovery, add Luma's iCal feed below.` Meetup and Humanitix rows: no key field, a neutral `Mock` badge and the helper `No public API for discovery. Import their event pages by URL instead.`

**Connections → Event feeds** (`id="event-feeds"`, new list card): `SectionHeader`-style row `EVENT FEEDS` + meta `{n} feeds`. Rows: label 13.5/500, host 11.5 `font-code` `text-3` (never the full URL), last sync 12.5 `text-3` (`Synced {relative}` / `Not synced yet`), error line `InlineError` 12.5 when `lastSyncError`, an enabled `Checkbox` (`aria-label="Sync {label}"`), and a `close` icon button `aria-label="Remove feed {label}"` (confirm). Add form below (`gap-4`): `Label` Input (required, max 60), `iCal URL` Input (required, `https://` only), primary `Add feed`. Instructions block 12.5 `text-2` (`Disclosure` `How to add Luma's Sydney feed`): `Open luma.com/sydney, choose "Add iCal Subscription", copy the link, and paste it here.` Empty list: `No feeds yet. Luma's Sydney feed is the best place to start.`

**Settings → Outreach** (new nav section `outreach`, label `Outreach`, icon `travel_explore`): `INTERESTS` card (`glass-card rounded-24 p-5`): lead 13.5 `text-2` `Events are scored against these. They're also the filter chips on Outreach.`; chips (`h-8 rounded-full px-3.5 bg-white/[.06]`, label + `close` icon button `aria-label="Remove {interest}"`); add row: `Input` (`aria-label="New interest"`, max 40) + secondary sm `Add interest`; Enter adds. Max 20 interests; duplicates (case-insensitive) are rejected. Changes save immediately (owner write) with the toast `Interests saved. Scores update shortly.` Seeded with the 8 D-14 interests. Removing the last interest is allowed; the empty state reads `No interests yet. Without them, only projects and your schedule affect scores.`

### Palette and Home (D-36)

- Palette `Events` scope: rows `event` icon, title, meta `{EEE d MMM} · {stage or score}`; navigates to `/outreach/events/{id}`. Mock events carry `· Mock` in the meta.
- Palette command `Import event URL` opens the import dialog on `/outreach`.
- Home: untouched **[auto]** (no existing Home section expects outreach data).

---

## Interaction and States

| Surface | Loading | Not connected / no source | Error | Empty |
|---|---|---|---|---|
| EVENTS list | route `loading.tsx` + 6 `Skeleton` cards `h-[260px] rounded-24` | "no real sources" note + mock events, badged | per-source `InlineError` lines; page load failure `InlineError` `Couldn't load events.` + `Try again` | no events at all: EmptyState; filtered to nothing: EmptyState with `Clear filters` |
| Pipeline | same skeleton as columns | same note | same | per-column `Nothing here yet.`; nothing saved at all: EmptyState `Nothing saved yet` |
| Event detail | `Skeleton` blocks matching the two columns | n/a | 404 EmptyState | n/a |
| EMAIL | category nav skeleton + 5 card skeletons `h-[120px]` + detail skeleton | Gmail not connected / scope missing: EmptyState replaces the whole tab | sync error `InlineError`; body fetch error inline | first sync running: EmptyState `Syncing your inbox` with `lo-shimmer` skeleton list below; category empty: `Nothing in this category.` |
| Triage | per-card nothing (snippet shows) | n/a | paused note | n/a |
| FOLLOW-UPS | 5 skeleton rows | n/a | `InlineError` `Couldn't load follow-ups.` + `Try again` | EmptyState |
| Mail approval | existing approvals skeleton | NOT_CONNECTED on send handled in Resolved | existing decision toast | n/a |

- **Stage changes:** optimistic on the card and board; the detail page awaits the server (button `loading`), then `router.refresh()`. Every change is audit-logged and emits one activity event server-side; no extra UI.
- **Sync now** (events and mail): button shows `loading` until the job is enqueued; toast `Sync started`. Results arrive through the existing live provider (`notifyLive`) and `router.refresh()`; new cards fade in with `lo-in`.
- **Draft with agent:** starts an Outreach agent run (the existing chat/run plumbing, not a new UI); the draft block shows the Drafting state until the `mail_reply` approval exists, then switches to Pending. If the run ends without a draft: `The agent didn't draft a reply. Try again, or ask in chat.` 13.5 `text-2`. If the spend cap is hit: `Drafting is paused: monthly AI cap reached.`
- **Send reply / Save to Gmail drafts / Reject draft:** same busy rules as the approval footer; toasts `Reply sent`, `Saved to Gmail drafts`, `Draft rejected`, failure `Couldn't record that decision. Try again.`
- **Archive / Flag (LifeOS-local, D-26):** optimistic; toasts `Archived in LifeOS. Gmail is unchanged.` / `Flagged` / `Unflagged`. Archived mail lives under the `ARCHIVED` category with an `Unarchive` secondary button in its detail (toast `Moved back to inbox`). After archiving, selection moves to the next mail in the list (or the previous one at the end).
- **Add as task:** awaits the server, toast `Task added`; the row switches to the added state.
- **Keyboard (EMAIL):** within the list, Up/Down move selection (roving tabindex), Enter opens the detail on mobile. No single-letter shortcuts this phase **[auto]**.
- **Motion:** only existing `lo-in` (new cards/rows), `lo-fade` (completed follow-up, resolved states), `lo-rise` (dialogs, mobile sheet), `lo-shimmer` (skeleton). `prefers-reduced-motion` is already handled globally.
- **Responsive:** `>=1100` (`desk:`) as described; 760–1099 events grid 2 columns, event detail single column (facts and stage cards move above the description), email two columns; `<760` single column, `px-5`, tab bar and chip rows scroll horizontally (`overflow-x-auto`, no wrap, `scroll-snap`), event card action bar cells `h-11`, dialogs full width minus gutters, email detail as a full sheet.

---

## Accessibility

- Tabs: real `role="tablist"`/`tab`/`tabpanel` with `aria-selected`, `aria-controls`, roving tabindex.
- Score ring: `role="progressbar"` from `ProgressRing` with `aria-label="Relevance {n} out of 100"`. Signal bars `role="img"` with full-sentence labels. Score and importance always have visible text.
- Card action bar cells are real `<button>`s with `aria-pressed`; disabled cells expose their reason through `aria-describedby` (visually hidden text), not only `title`.
- Pipeline stepper is an `<ol>` with `aria-current="step"`; the board columns are labelled sections.
- Email list: `role="list"` with buttons; selected card `aria-current="true"`. Message body region is focusable and labelled. The mobile sheet traps focus, Esc closes it, and focus returns to the card.
- Category nav and filter chips: `aria-current="page"` / `aria-pressed` in labelled groups; colour dots are `aria-hidden` (the label carries meaning).
- Locked recipients are announced: the `lock` icon is `aria-hidden` and the helper text is linked by `aria-describedby`.
- The untrusted note is a `role="note"` region; its meaning is in the text.
- Every icon-only button has a specific accessible name (listed inline above).
- Third-party text (event descriptions, organizer names, email bodies, subjects, summaries) is always rendered as text nodes; no `dangerouslySetInnerHTML` anywhere in this phase. External links use `rel="noopener noreferrer"` and open in a new tab.
- Contrast: only the existing measured pairs (`text`, `text-2`, `text-3` on glass; badge tones on their tints; amber on the amber inset). No new pairs.

---

## Copywriting Contract

| Element | Copy |
|---|---|
| Page lead | `Sydney events worth your time, and the email that needs you.` |
| Primary CTA (EVENTS) | `Import event` (toolbar), `Import event` (dialog submit) |
| Primary CTA (event detail) | `Save event` / `Mark interested` / `Attend` / `Mark attended` / `Follow up` (next step) |
| Primary CTA (EMAIL) | `Draft with agent`; with a pending draft `Send reply` |
| Primary CTA (approval) | `SEND REPLY` |
| Events meta | `{n} events · Sydney · next 60 days · sorted by relevance` |
| WHY eyebrow | `WHY THIS IS RELEVANT` (card), `WHY THIS IS RELEVANT · {n}/100` (detail) |
| No real sources note | `Add an iCal feed or import an event URL to see real Sydney events.` + `Add a feed` / `Import event` |
| Events empty (nothing at all): heading | `No events yet` |
| Events empty: body | `Add an iCal feed in Settings or import an event page to start. Events in the next 60 days show up here, scored against your interests.` + `Add a feed` |
| Events filtered empty: heading | `No events match these filters.` |
| Events filtered empty: body | `Try removing a filter, or add more interests in Settings.` + `Clear filters` |
| Pipeline empty: heading / body | `Nothing saved yet` / `Save an event from the list to start tracking it here.` + `Show list` |
| Column empty | `Nothing here yet.` |
| Source sync error | `{label} didn't sync: {lastSyncError}. Showing the last events we have.` |
| Disabled cells | `Save it first` / `Mark Interested first` / `Mark Attending first` |
| Mock limits | `Mock events can't go on your calendar.` / `Mock events can't create follow-up tasks.` |
| Mock note (detail) | `This is a mock event from {provider}. It can't go on your calendar or create follow-up tasks.` |
| Location fallbacks | `Online` / `Location unknown` / `Organizer unknown` / `Price not listed` / `All day` |
| Signal without match | `No match` |
| Event not found | `Event not found` / `It may have been pruned after it ended. Saved events are always kept.` + `Back to events` |
| Dismissed banner | `This event is dismissed and hidden from your lists.` + `Restore event` |
| Add to calendar helper | `The event's link goes in the description. Moving the event back later doesn't remove it from your calendar.` |
| No calendar | `No calendar is connected. Connect one in Settings.` + `Open Settings` |
| Follow-up dialog | title `Follow up`, lead `Create tasks for after "{title}".`, `Add another task`, submit `Create follow-up task` / `Create follow-up tasks` |
| Import dialog | title `Import an event`, label `Event page URL`, helper `Works with pages that publish event details, like Eventbrite, Humanitix, Meetup and Luma.` |
| Import errors | `No event data found on that page.` · `Enter a full https:// address.` · `That address isn't allowed. Use a public https link.` · `Couldn't reach that page. Try again later.` · `That page is too large to read.` |
| Gmail not connected: heading | `Gmail isn't connected` |
| Gmail not connected: body | `Connect Google in Settings and allow Gmail to see triaged mail here. LifeOS reads your inbox and only sends replies you approve.` + `Open Settings` |
| Gmail scope missing: heading | `Gmail access wasn't granted` |
| Gmail scope missing: body | `Reconnect Google in Settings and allow Gmail. Calendar keeps working either way.` + `Open Settings` |
| Gmail needs reconnect: heading / body | `Google needs reconnecting` / `Google stopped accepting LifeOS's access. Reconnect in Settings to resume mail sync.` + `Open Settings` |
| First sync | `Syncing your inbox` / `The last 30 days of mail are coming in. This can take a minute.` |
| Category empty | `Nothing in this category.` |
| Mail sync error | `Gmail didn't sync: {lastSyncError}. Showing the last mail we have.` |
| Triage paused | `Triage paused: monthly AI cap reached.` / `New mail still syncs and shows its preview. Summaries resume next month, or when you raise the cap.` |
| Untriaged / bulk | `Not triaged yet.` + `Triage` / `Bulk or promotional mail. Not sent to the AI.` |
| Action items | `No action items.` / `Add as task` / `Task added` |
| Plain-text footnotes | `Shown as plain text. Images and formatting are not loaded.` / `Message is long; showing the first part.` + `Open in Gmail` |
| Body load error | `Couldn't load the message. Try again.` |
| Draft block | eyebrow `DRAFT REPLY · OUTREACH AGENT`, tag `NOT SENT`; `No reply drafted.`; `Outreach agent is drafting…`; `Replies only go to people already in this thread.` |
| Draft note | `Reply opens an approval. Nothing sends automatically.` |
| Draft failures | `The agent didn't draft a reply. Try again, or ask in chat.` / `Drafting is paused: monthly AI cap reached.` |
| Draft resolved | `Reply sent {HH:mm}.` / `Moved to Gmail drafts. Finish it in Gmail.` + `Open Gmail drafts` |
| Untrusted note | `Drafted from email content (untrusted)` / `The original email was written by someone else. Check the reply before approving; nothing sends until you do.` |
| Approval facts | `Sends a reply to {name}{ and n others} in the thread "{subject}".` · `Gmail · {address}` · `Immediately after approval` |
| Approval data list | `Your reply ({n} characters)` · `To {addresses}` · `Only to people already in this thread` · `Sent once, even if a retry happens` |
| Approval resolved | `Sending the reply…` · `Reply sent to {name}. Approved at {HH:mm}.` + `Open email` · `Approved, but it couldn't be sent: {error}. Nothing was sent.` + `Retry` · NOT_CONNECTED adds `Reconnect Google in Settings` |
| Approval summary | `Approval waiting: reply to {name} · {subject}` / `{n} characters to {address}. Expires {when}.` |
| Follow-ups empty: heading | `No follow-ups` |
| Follow-ups empty: body | `Follow up on an event you attended, or add an email's action item as a task. They collect here.` |
| Follow-up context | `From event · {title}` / `From email · {subject} · {sender}` |
| Toasts | `Event saved` · `Already in your events` · `Added to {calendar}` · `{n} follow-up tasks created` · `Sync started` · `Task added` · `Reply sent` · `Saved to Gmail drafts` · `Draft rejected` · `Archived in LifeOS. Gmail is unchanged.` · `Moved back to inbox` · `Flagged` / `Unflagged` · `Event dismissed` · `Event restored` · `Interests saved. Scores update shortly.` · `Feed added` · `Feed removed` |
| Error toasts | `Couldn't update the event. Try again.` (stage cells, board buttons, stage actions, Add to calendar, Dismiss/Restore) · `Couldn't update. Try again.` (follow-up checkbox) · `Couldn't record that decision. Try again.` (Send reply, Save to Gmail drafts, Reject draft, approval footer) · `Couldn't save that. Try again.` (Archive, Unarchive, Flag/Unflag, Add as task, follow-up dialog submit, interests add/remove, feed add/remove/enable, Eventbrite and Luma keys, Sync now failing to enqueue) |
| Settings: Gmail line | `Gmail` · `Allowed` / `Not allowed` (`Reconnect Google to allow Gmail.`) / `Needs reconnect` |
| Settings: unverified helper | `Google will show an "unverified app" screen once. This is your own LifeOS, so continue past it.` |
| Settings: feeds empty | `No feeds yet. Luma's Sydney feed is the best place to start.` |
| Settings: feed how-to | `Open luma.com/sydney, choose "Add iCal Subscription", copy the link, and paste it here.` |
| Settings: feed errors | `Enter a full https:// address.` · `That address isn't allowed. Use a public https link.` · `That feed couldn't be read. Check the link and try again.` |
| Settings: Eventbrite helper | `Events from these organizers appear in Outreach.` / `With this token LifeOS can only list your own events.` |
| Settings: Luma helper | `Covers only the Luma Plus calendar the key was made on. For Sydney discovery, add Luma's iCal feed below.` |
| Settings: Meetup/Humanitix helper | `No public API for discovery. Import their event pages by URL instead.` |
| Settings: interests | lead `Events are scored against these. They're also the filter chips on Outreach.`; `Add interest`; empty `No interests yet. Without them, only projects and your schedule affect scores.`; errors `That interest is already in the list.` / `Keep it under 40 characters.` / `You can have up to 20 interests.` |
| Destructive: Remove feed | Title `Remove feed`: `Remove "{label}"? Events you haven't saved from it disappear at the next sync. Saved events stay.` Buttons `Remove feed` (destructive) / `Cancel` |
| Destructive: Remove Eventbrite or Luma key | existing `TokenForm` remove confirm, with `Events from this source go back to mock data.` appended |
| Destructive: Disconnect Google | existing confirm, with `This also removes Gmail access. Synced mail stays in LifeOS until it's pruned.` appended |
| Destructive: Reject draft | no confirm (existing REJECT behaviour; the email stays and can be drafted again) |
| Dismiss event | no confirm (reversible from the detail page with `Restore event`) |
| Archive mail | no confirm (LifeOS-local, reversible under ARCHIVED) |

Stage label strings are literal: `Saved`, `Interested`, `Attending`, `Attended`, `Follow up` (badges uppercase via `Badge`). Category strings are literal: `IMPORTANT`, `EVENTS`, `NETWORKING`, `OPPORTUNITIES`, `FOLLOW-UP`, `OTHER`. Importance: `HIGH`, `MEDIUM`, `LOW`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | none (not initialized) | not applicable |
| third-party | none | not applicable |

---

## Auto-decisions

The owner was asleep. Each item is the recommended default, consistent with the Glass system, the existing approval UI and `Glass Outreach.dc.html`. Review in the morning.

1. Page title `Outreach` with a lead sentence (house pattern) instead of the design's sentence-as-H1. Lead copy chosen here.
2. Tab, filter, view, category and selected mail live in the URL query so reload, back and palette/notification links work.
3. Card action bar enforces D-16 "one step forward": reached stages show pressed, the next stage is enabled, later ones are disabled with a reason. Moving back happens only on the detail page and the pipeline board.
4. The stage changes to FOLLOW UP only when the follow-up dialog is confirmed; priority is fixed at P2 in the dialog.
5. Event detail is a route (`/outreach/events/[id]`), not a panel. Dismiss lives only on the detail page (unsaved events), with `Restore event` instead of an undo toast (the toast has no action slot).
6. Interest filter chips use OR semantics; the chips come from Settings → Outreach, with an `Edit interests` link.
7. Score colour reuses the design rule (85+ green, 70–84 cyan, else grey) through a new optional `color` prop on `ProgressRing` rather than a new component.
8. Email gets `UNTRIAGED` and `ARCHIVED` nav entries (only when non-empty) so untriaged and locally archived mail stay reachable; archive is reversible.
9. The design's manual `Reply` button is not built: the only reply path is `Draft with agent` → approval (D-30), plus `Save to Gmail drafts` to finish in Gmail. Inline `Send reply` on EmailDetail runs the same approval decision as `/approvals`.
10. Mail approval adds `SAVE TO GMAIL DRAFTS` to the existing footer (D-31) and uses `WHAT DATA WILL BE SENT` (mail leaves LifeOS, unlike 5.1's `WHAT GETS SAVED`).
11. Approvals list and notification icon for `mail_reply`: `mail` (already in the subset).
12. Four icons added to the subset: `bookmark`, `star`, `groups`, `reply`. Price and date facts reuse existing glyphs (no `payments`, no `calendar_today`).
13. `Reconnect Google` becomes the accent button only when Gmail is not allowed; otherwise it is secondary.
14. Settings gains an `Outreach` nav section for interests (D-15); event feeds sit inside Connections with an `#event-feeds` anchor.
15. Home is untouched; the palette gets the `Events` scope and the `Import event URL` command only.
16. No single-letter keyboard shortcuts in the email view this phase; arrow keys only.
17. Event detail main stack uses `gap-6` (24px) rather than the design's 20px gap, to stay on the 4px scale outside the closed 04.1 exception set.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: FLAG (approved)
- [x] Dimension 2 Visuals: FLAG (approved)
- [x] Dimension 3 Color: FLAG (approved)
- [x] Dimension 4 Typography: FLAG (approved)
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-10-13
