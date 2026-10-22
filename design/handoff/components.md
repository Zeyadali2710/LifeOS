# Component library (`src/ui/`)

Build these from scratch. Nothing here maps to an existing component. Values reference `tokens.css`; the raw values are shown for checking against the prototype.

## Primitives

| Component | Spec |
|---|---|
| **Button / primary** | bg `--ink`, text `--paper`, height 34, padding 0 12–13, radius 6, 13.5 px / 500. Optional 17 px leading icon, gap 6–8. Optional mono 11 px shortcut hint at 70 % opacity. |
| **Button / secondary** | transparent or `--paper-3`, 1 px `--border`, radius 6, padding 7–8 × 12–13, 13.5 px. |
| **Button / text link** | no bg, no padding, `--accent`, 12.5–13.5 px. Used for "All runs", "Add a feed", "Clear filters". |
| **Icon button** | 40 × 40 (44 on mobile), radius 6, hover `--wash`, icon 20–24. Needs `aria-label`. |
| **Segmented control** | track `--wash`, radius 7, padding 3, gap 2. Item radius 5, padding 5–6 × 10–11, 12.5–13 px. Selected: `--paper-3` + `--shadow-seg` + 600. `role=tablist` or `radiogroup`. |
| **Joined view switcher** | 1 px `--border` box, radius 6, items padding 7 × 13, 13.5 px, separated by 1 px left borders. Selected bg `--wash` + 600. Optional count badge. (Agents.) |
| **Underline tabs** | 14 px, padding 9–10 × 10–12. Selected 600 + `inset 0 -2px 0 var(--accent)`. Optional 17 px icon in `--ink-2` and a count chip (mono 11, `--wash`, radius 9, padding 0 7). Bottom 1 px `--rule`. Label and count on one line. |
| **Count badge (alert)** | mono 11 px, bg `--status-approval`, white, radius 9, padding 0 6, line-height 17. |
| **Filter chip** | height 32, radius 16, 1 px `--border`, padding 0 13, 13 px, gap 6, mono 10.5 count at 75 %. Selected: bg + border `--ink`, text `--paper`. |
| **Toggle pill** | height 36, radius 18, 1 px border, 16 px icon. Off: transparent / `--border`, icon `sell`. On: `--status-working-bg` / `--status-working`, icon `check`. `aria-pressed`. |
| **Tag** | 11.5–12 px, `--wash`, radius 4 (topics: radius 12, padding 2 × 10). Source tag: mono 10.5, 1 px `--rule`, `--ink-2`. |
| **Label pill (issue)** | 11.5 px / 500, radius 10, padding 1 × 8, status bg + fg pairs. |
| **Search field** | height 38, 1 px `--border`, radius 6, bg `--paper-2`, padding 0 10, 18 px `search` icon in `--ink-3`, 14 px input, no outline (focus ring on the wrapper). |
| **Select** | height 34, 1 px `--border`, radius 6, padding 0 8, 13 px, bg `--paper-2`, inline label "Sort" to its left. |
| **Section** | 2 px ink top rule, mono label 11.5 px uppercase `--label-tracking` in `--ink-3`, 12–16 px below. |
| **Card** | bg `--paper-3`, 1 px `--rule`, radius 10. Header strip (optional): bg `--paper`, bottom 1 px `--rule`, padding 11–12 × 16, 13–13.5 px. Inner rows separated by 1 px `--rule-faint`. |
| **Stat tile** | bg `--paper`, radius 8, padding 9 × 10; value Newsreader 22 / 1; key 11.5 px `--ink-3`. |
| **Status** | glyph + word + colour from status tokens. One component, used everywhere. |
| **Alert** | `role=alert`, bg `--status-failed-bg`, radius 8, padding 10 × 12, 18 px `error` icon in `--status-failed`, 13 px / 1.45, optional inline text link. |
| **Menu** | bg `--paper-2`, 1 px `--rule`, radius 8, `--shadow-menu`, padding 6. Items padding 8 × 10, radius 5, 14 px, hover `--wash`, right-aligned mono hint. |
| **Drawer** | 440 px right sheet, `--shadow-dialog`, Esc closes, focus trapped. |
| **Toast** | `role=status`, ink bg, paper text, radius 6, bottom centre, 2.6 s. |
| **Avatar** | circle, `--avatar`, initials 10–12 px / 600. Sizes 24, 28, 30. |
| **Empty state** | centred column, 34 px icon in `--neutral`, Newsreader 22 line, secondary button. Padding 48 × 20. |

## Composites

### Event card (Outreach → Discover)
- Container: Card at radius 12, column, `overflow: hidden`. Hover: translateY(-2px), `--shadow-card-hover`, border `#b9ae9b`, 150 ms.
- **Media:** 16 : 9. Uses the event image when one exists; otherwise a striped placeholder (135° repeating stripes, 9 px bands, two tints per first category). Overlays, 10 px inset:
  - **Date block** (top left): 48 px wide, `--paper-3`, radius 8, `--shadow-chip`. Weekday mono 9.5 px `.1em` `--accent`, day Newsreader 22 / 1, month 10 px `--ink-3`.
  - **Relevance ring** (top right): 42 px conic ring, 34 px inner, mono 12 / 500 score. Ring colour: ≥ 80 working, ≥ 65 approval, otherwise neutral. `title="Relevance n of 100"`.
  - **Stage badge** (bottom left, when staged): 11.5 px / 600, radius 10, padding 2 × 9. Saved = wash/ink, Interested = approval-bg/approval, Attending = working-bg/working.
- **Body** (padding 14 14 12, gap 8): title Newsreader 20 / 1.15, 2-line clamp, opens event. Date line 13 / 500: "Sat 24 Oct · 18:00–20:30 · Free" (Free in working colour). Venue and organiser rows 12.5 px `--ink-2` with 15 px icons (`location_on`, `groups`). Tags row. Optional "why" note: `--paper` bg, radius 6, padding 7 × 9, 15 px `auto_awesome` icon in working colour, 12.5 / 1.4, pinned to the bottom of the body.
- **Action bar:** 4 equal columns, height 42, top 1 px `--rule-soft`, dividers `--rule-faint`. Save (`bookmark`), Interested (`star`), Attend (`check_circle`), Calendar (`event`). Reached: `--accent-wash` bg, `--accent` text, icon FILL 1. Locked: `--disabled`, `not-allowed`, tooltip names the prerequisite.

### Discover toolbar
Row 1 (wraps): search (flex 1 1 260, max 420) · When segmented · Free only pill · Sort select pushed right. Row 2: chip row, horizontal scroll, `flex: none` chips. Row 3: source strip (Card-style, `--paper-2`, radius 8, padding 9 × 12, 12.5 px, `travel_explore` icon).

### Repository row (Career list)
Name (accent, 600), visibility pill, description (2 lines max), meta row: language dot + name, stars, CI status, open PRs, pushed age. Whole row is a button with hover `--paper`.

### Repo header and tabs
See README → Career. Breadcrumb 13.5 px, back link in accent with `chevron_left`. Visibility pill: 1 px `--border`, radius 10, padding 1 × 9, 12 px, 13 px icon.

### File table
Header: 24 px avatar, author 600, last message (ellipsis), short sha mono 11.5 accent, age mono 11.5, `history` + "n commits". Rows: grid `22px minmax(120px,1fr) minmax(0,1.6fr) 60px`, gap 12, padding 9 × 16, 13.5 px. Folder icon FILL 1 in `--status-approval`; file icon `draft` in `--ink-3`. Hover `--paper`.

### README card
Header "README.md" with `menu_book` icon. Body padding 20 24 24, max 860: h2 Newsreader 30 with bottom rule, paragraphs 14.5 / 1.6 `--ink-body`, h3 16 / 600, code block bg `--ink`, text `--paper`, radius 8, padding 14 × 16, mono 12.5 / 1.7, horizontal scroll.

### CI strip
12 equal bars, height 20, radius 3, gap 3: pass `--status-working`, fail `--status-failed`. Each bar has a title with run time.

### Language bar
8 px, radius 4, 2 px gaps between segments. Legend: 9 px dots, 12.5 px name + percentage in `--ink-3`.

### Run table (Actions)
Grid `24px minmax(0,1.6fr) 120px 90px 80px`, gap 12, padding 10 × 16. Header row mono 10.5 `.08em` uppercase on `--paper`. Min width 640, scrolls horizontally inside the card.

### Bar chart (Insights)
180 px plot, bars max 34 px wide, radius 3 3 0 0, working colour, value labels mono 10.5 above, week labels below, 1 px `--border` baseline. `aria-label` states the trend.

### Needs-you inbox, approval list/detail, office inspector, mail panes, calendar, finance charts
Specified in the page files. They share the primitives above. The approval list and detail render once and mount in both Home (compact) and the Agents → Approvals tab (full).
