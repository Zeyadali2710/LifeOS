---
phase: 7
slug: socials
status: approved
reviewed_at: 2026-10-13
shadcn_initialized: false
preset: none
created: 2026-10-13
---

# Phase 7 (Socials) — UI Design Contract

> Auto mode: the owner was asleep, so no questions were asked. Source priority: `07-CONTEXT.md` D-01..D-24 first, then the Glass system (`04.1-SPACING-RUBRIC.md` wins on radius, spacing and padding; `04.1-UI-SPEC.md` closed type scale and closed spacing exception set), then the Phase 6 contract (`06-UI-SPEC.md`: pipeline board, `MailApprovalShell`, Settings `ConnectionRow`/`TokenForm`, MOCK badge), then `design/glass/Glass Socials.dc.html` (layout, content order and the `PL` platform colours ONLY).
> The design's placeholder data (`@zeyad`, `@zeyad.builds`, `@zeyadcodes`, `zeyad.dev`, 4,812 followers, "Building LifeOS in public #6", Sentinel, Ledgerline, the reach bars, engagement-rate chart, growth/frequency rows, `+6.2% · 30d` deltas) is **never ported**. The `INSIGHTS · SOCIAL AGENT` block and the X/Twitter card are **not rendered** (D-21, deferred).
> **No new tokens, fonts, radii, type sizes or spacing values.** Everything reuses `src/app/globals.css` utilities and `src/ui/*`. Choices made without the owner are tagged **[auto]** and listed under "Auto-decisions".

---

## Design System

| Property | Value |
|---|---|
| Tool | none (hand-built `src/ui/*`; the shadcn gate and the registry gate don't apply) |
| Preset | not applicable |
| Component library | none (Tailwind v4 `@theme inline`) |
| Icon library | Material Symbols Outlined, self-hosted subset. **Add to `src/ui/icon-names.ts` and regenerate the subset** (check each glyph renders, a missing one shows as ligature text): `send` (Publish now), `download` (Download .md), `image` (image URL field/fact). Reused, already present: `public` (Socials identity, activity), `add`, `auto_awesome`, `content_copy`, `open_in_new`, `task_alt` (Mark as posted), `schedule`, `event_busy` (Cancel schedule), `check`, `check_circle`, `chevron_left`, `chevron_right`, `calendar_month`, `edit`, `delete`, `link`, `lock`, `shield`, `info`, `warning`, `error`, `refresh`, `sync_problem`, `close`, `arrow_back`, `arrow_forward`, `key` |
| Display font | Instrument Serif 400 (`font-display`) |
| UI font | Familjen Grotesk (`font-sans`); `font-code` only for image URLs, post URLs, the TikTok redirect URL and the Markdown preview |
| Theme | Dark only |

Reused primitives (do not re-create): `PageHeader`, `SectionHeader`, `Badge`, `Button` (primary/secondary/ghost/destructive/ai/inverse; xs/sm/md/touch), `Dialog` (menu tier, `p-6`, `rounded-30`, `sheet` variant on <760), `Field`/`Input`/`Select`/`Textarea`/`Checkbox`, `InlineError`, `EmptyState`, `Skeleton`, `StatusDot`, `Disclosure`, `Icon`, `useShell().toast`, the approval `Fact`/`Resolved`/`UnreadableApproval`/`stamp`, the Approvals segmented pill markup (`approval-list.tsx` `role="tablist"` container), the Organization legend chip and range-label helpers (`category-legend.tsx` markup, `layout.ts` `rangeLabel`), `sydneyInstant`, and `ConnectionRow`/`TokenForm`/`CalendarConnectionRow` in `src/settings/`.

**One-prop extensions (no new components):**
- `SectionHeader`: optional `action?: ReactNode` rendered after the rule (the CONTENT PIPELINE header needs two buttons).
- `ConnectionRow`: widen the `id` union with `linkedin`, `instagram`, `tiktok_app` so the remove path and toasts work.

**New components** (composed from the above; no new styling primitives):
- `src/socials/platform.ts`: one `PLATFORM` map (label, 2-letter mark, `color`, `text`, `host`, constant app URL) plus number formatting.
- `src/socials/socials-view.tsx` (view state), `platform-card.tsx`, `content-board.tsx`, `post-sheet.tsx`, `variant-panel.tsx`, `new-post-dialog.tsx`, `schedule-dialog.tsx` (Schedule and Reschedule), `mark-posted-dialog.tsx`, `content-calendar.tsx`, `analytics-view.tsx`, `followers-chart.tsx`, `posts-table.tsx`, `platform-chip.tsx`.
- `src/approvals/social-approval.tsx`: `SocialApprovalBody` plus the `mail-approval.tsx` export set (`socialOf`, `toSocialDraft`, `validateSocialDraft`, `sameSocial`, `socialResolved`), so `approval-detail.tsx` gains a one-line `SocialApprovalShell` branch.
- `src/settings/social-connections.tsx` (four rows).

---

## Spacing Scale

Scale 4 / 8 / 16 / 24 / 32 / 48 / 64 plus the closed 04.1 exception set. The rubric is applied literally. Every value below is on the 4px scale or already in the 04.1 exception table (6, 10, 14, 20, 3).

| Context | Value |
|---|---|
| Page container | `max-w-[1480px] mx-auto px-8 pt-9 pb-[170px]`; sections stacked `gap-8` (32); `<760`: `px-5` (20, exception) |
| Page header row | `flex flex-wrap items-end justify-between gap-6`: header block (eyebrow, H1 `mt-2.5`, lead `mt-2.5`) left; toolbar right (`flex items-center gap-2`, bottom-aligned with the title block) |
| View segmented control | rubric: container `rounded-full p-[3px] border border-white/[.06] bg-white/[.04]`, options `h-[26px] px-3.5 rounded-full text-[12.5px]` |
| Platform cards grid | `grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3` |
| Platform card | `glass-card rounded-24 p-5 flex flex-col gap-3.5`; header row `flex items-center gap-3`; tile `size-9 rounded-14`; stats `grid grid-cols-2 gap-3`; latest-post block `pt-3 border-t border-white/[.05] flex flex-col gap-1`; footer `flex items-center gap-2` |
| Sparkline | `h-10` (40) full width |
| Section header → content | `mb-3.5` (14, rubric) |
| Content board | 5 columns `grid-cols-[repeat(5,minmax(240px,1fr))] items-start gap-3`, `overflow-x-auto` below 1280px; column `glass-card rounded-24 p-2`; column header `flex items-center gap-2 px-3 py-2.5`; card list `flex flex-col gap-2`; card `rounded-16 p-3 flex flex-col gap-2 border border-white/[.06] bg-white/[.03]` (Phase 6 board, unchanged) |
| Empty column note | `px-3 py-6 text-center` |
| Post sheet (desktop) | `Dialog` width `max-w-[1120px]`, `p-6`; header block `flex flex-col gap-4`; variants grid `grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3 mt-6`; footer `mt-6 flex flex-wrap items-center gap-2` |
| Variant panel | `rounded-14 border border-white/[.08] bg-white/[.03] p-4 flex flex-col gap-3`; header `flex items-center gap-2`; checks list `flex flex-col gap-1.5`; actions `flex flex-wrap items-center gap-2` |
| Platform toggles (sheet) | `flex flex-wrap gap-2`; chip `h-8 px-3.5 rounded-full gap-2` |
| Dialogs (new post, schedule, reschedule, mark posted, confirms) | `p-6`; fields `gap-4`; footer `mt-6 gap-2` right-aligned |
| Calendar toolbar | `flex flex-wrap items-center gap-2`, `mb-3.5`; range label `min-w-[150px]` 12.5/500; legend group `ml-auto flex flex-wrap gap-1.5` (6, exception) |
| Month grid | `glass-card rounded-24 overflow-hidden`; weekday header cells `px-2.5 py-2.5`; day cell `min-h-[104px] p-2.5 flex flex-col gap-1.5` (existing Organization values); chips `flex flex-col gap-0.5`, chip `h-5 px-1.5 gap-1 rounded-8` |
| Week view | `glass-card rounded-24 overflow-hidden grid grid-cols-7`; day column `min-h-[240px] p-2.5 flex flex-col gap-2 border-l border-white/[.05]` (first column no border); chip `rounded-8 px-2 py-1.5 flex flex-col gap-0.5` |
| Analytics toolbar | `flex flex-wrap items-center gap-2.5` (10, exception) |
| Analytics grid | `flex flex-col gap-3`; followers card `glass-card rounded-24 p-5 flex flex-col gap-3.5`; chart `h-[180px]`; axis row `flex justify-between` |
| Posts table | `glass-card rounded-24 p-2 overflow-hidden`; header and body rows `px-3 py-2.5` |
| Not-available notes | `flex flex-col gap-2`; each line `flex items-center gap-2` |
| Settings social rows | existing `ConnectionRow` spacing; TikTok app form fields `gap-4`; helper `mt-2` |
| Touch targets | every `a, button` >= 44px on coarse pointer (`touch` size / `size-11`); calendar chips `min-h-11` on coarse pointer |

Exceptions: none beyond the 04.1 table. Existing exceptions reused here: 2px (`gap-0.5`, month-grid chips), 26px (`h-[26px]` segmented options, rubric), 150px (`min-w-[150px]` range label, Organization header). The 36px tile, 8px stage/legend swatches, 40px sparkline and 180px chart are graphic sizes, all on the 4px scale.

---

## Typography

The closed 04.1 scale is reused. **No new sizes.** Weights 400 and 500 only on this phase's content (600 stays only inside the existing `Badge` caps and the existing uppercase approval buttons; `PlatformChip` uses 500).

| Role | Font / size / weight / line-height | Used for |
|---|---|---|
| H1 | Serif `clamp(34px,4.4vw,60px)` / 400 / .95 | `Socials` page title |
| Stat | Serif 29 / 400 / 1 | follower count on platform cards; FOLLOWERS chart total (reuses the existing 29 size, see Auto-decisions) |
| Sheet / dialog / approval title | Serif 26 / 400 / 1.1 (approval `h2` 1.12, existing) | post title in the post sheet, dialog titles, social approval `h2` |
| Card title | Serif 20 / 400 / 1.1 | platform name on platform cards |
| Lead | Grotesk 15 / 400 / 1.5 `text-2` | page lead |
| Body | Grotesk 14 / 400 / 1.5 (textareas 1.45) | variant text, post idea text, approval preview text |
| Row | Grotesk 13.5 / 400 (500 for board-card titles) / 1.5 | board card title, latest post text, table rows, check messages |
| Small | Grotesk 12.5 / 400 `text-2` or `text-3` | meta, helpers, counters, notes, range label (500) |
| Eyebrow | Grotesk 11 / 500 / tracking .14em uppercase `text-3` | section and card eyebrows (`CONTENT PIPELINE`, `FOLLOWERS`, `POSTS`, `LATEST POST`, `POSTS · 30D`, `NEXT`, `VARIANTS`); page eyebrow `SOCIALS` .12em in `text-pink`; axis labels 11/400 `text-3` |
| Caps tags | Grotesk 10 / 500 / tracking .1em uppercase | `PlatformChip`, column labels use Eyebrow; `MOCK`/status via `Badge` |
| Caps status | Grotesk 10.5 / 500 / tracking .14em uppercase | platform-card footer status (`CONNECTED` / `MOCK` / `RECONNECT` / `EXPIRES {d MMM}`); 500, not the Settings-row 600 |
| Delta | Grotesk 12 / 500 | FOLLOWERS total delta (`+{n}`) |
| Calendar chip | Grotesk 11 title / 10 time `text-2` (existing month-grid values) | calendar chips |
| Code | `font-code` 11.5 `text-2` | image URL, post URL, TikTok redirect URL, Markdown preview |

Informative text is never `text-4`. The minimum size is 10px.

---

## Color

Glass 60/30/10 is unchanged.

| Role | Value | Usage |
|---|---|---|
| Dominant (60%) | `#121214` + glow | page canvas |
| Secondary (30%) | `rgba(255,255,255,.045)` `glass-card`; `rgba(255,255,255,.03)` inset; menu tier for dialogs and the post sheet | platform cards, board columns, calendar, followers card, posts table, variant panels |
| Accent (10%) | `#0a84ff` / `#0071e3` fill, `#64d2ff` text | the reserved list below |
| Destructive | `#ff6961` (`text-red`, existing destructive Button) | Delete post, Remove variant, Cancel schedule (confirm button), REJECT, Remove token / Disconnect TikTok, check errors, FAILED status |

**Accent reserved for (this phase, every use listed):**
1. `New idea` primary sm button in the CONTENT PIPELINE header (the only accent button on the Socials page).
2. `Save changes` primary button in the post sheet footer.
3. Dialog submits: `Create post` (New post), `Request approval` (Schedule), `Save new time` (Reschedule), `Mark as posted` (Mark as posted dialog).
4. Social approval footer primary `POST NOW` / `SCHEDULE POST` (existing approve style).
5. Settings: `Connect TikTok` primary sm, only when the TikTok app keys are saved and TikTok is not connected; the existing `TokenForm` submit.
6. `ai` variant buttons (`rgba(10,132,255,.2)` fill, `cyan-soft` text): `Draft with Social agent` (pipeline header, New post dialog, post sheet).
7. Links in `text-cyan`: `Connect in Settings`, `Review approval`, `Open post`, `View in Socials`, `Open approval`, the source link in the post sheet (`From project · {name}`).
8. CONTENT PIPELINE column swatches for DRAFT and SCHEDULED (`#64d2ff`, design `STAGES` colours).
9. Today's day number circle in the calendar (`bg-accent-solid`, existing Organization pattern).
10. Focus ring `#64d2ff`.
Nothing else is accent. Selected segmented options use `bg-white/[.10]` + `text-text` (design value), not accent.

**Platform identity colours** (data colours like `calendar-categories`, kept in `src/socials/platform.ts`; the label or 2-letter mark is always shown, so colour is never the only channel):

| Platform | Mark | `color` (lines, swatches, tint base) | `text` (chip/mark text) | Tint (chip/tile bg) |
|---|---|---|---|---|
| LinkedIn | `IN` | `#64d2ff` | `#64d2ff` | `rgba(100,210,255,.12)` |
| Instagram | `IG` | `#ff6482` | `#ff6482` | `rgba(255,100,130,.12)` |
| TikTok | `TT` | `#40c8e0` | `#40c8e0` | `rgba(64,200,224,.12)` |
| Portfolio | `PF` | `#bf5af2` | `#d08cff` (`--purple-text`, AA at 10px) | `rgba(191,90,242,.12)` |

LinkedIn's identity hex equals `--cyan`; it is identity, not accent, and always appears with its `IN` mark or name.

**Pipeline stage swatches** (8px `rounded-[2px]`, design `STAGES`): IDEAS `#8e8e93`, DRAFT `#64d2ff`, REVIEW `#ff9f0a`, SCHEDULED `#64d2ff`, PUBLISHED `#30d158`.

**Variant status badges** (`Badge kind="status"`): DRAFT `neutral`, AWAITING APPROVAL `amber`, SCHEDULED `blue`, PUBLISHING `blue`, PUBLISHED `green`, POSTED `green` (posted manually), FAILED `red`.

**Other semantic colour (existing pairs only):**
- `MOCK`: `Badge kind="tag" tone="amber"`. On the approval: `MOCK · NOTHING LEAVES LIFEOS` amber tag.
- Untrusted-source note (post sheet and approval): 5.1 amber inset (`border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)]`, `warning` `text-amber`).
- Check errors: `error` 16 `text-red` + text `text-text`; warnings: `warning` 16 `text-amber`; ready: `check_circle` 16 `text-green`.
- Character counter: `text-3`; over the limit `text-red` (the error line carries the meaning too).
- Token expiring (Settings and platform card): amber `StatusDot`; the text stays `text-2`.
- Growth delta on the FOLLOWERS total: `text-green` when positive, `text-2` when zero or negative (never red for audience numbers).
- Socials identity: page eyebrow `text-pink`, activity icon `public` pink (existing map).

---

## Layout and Content Order

### `/socials` (replaces the `DomainPage` empty state)

1. Header row:
   - `PageHeader`: eyebrow `SOCIALS` (`text-pink`), title `Socials`, lead `Write a post once, plan it on the calendar, and see how it does.` **[auto]**
   - Toolbar (right, `items-end`): meta 12.5 `text-3` `Synced {relative}` (only when a real analytics provider is connected), `Sync now` secondary sm (`refresh`, same visibility, loading until enqueued), then the view segmented control (`role="tablist" aria-label="Socials views"`): `Overview`, `Calendar`, `Analytics`. View lives in the URL (`?view=overview|calendar|analytics`, default `overview`) **[auto]**. Arrow keys move between options (roving tabindex).
2. View panel (`role="tabpanel"`, `aria-labelledby` the selected option).

### OVERVIEW

**Platform cards** (4, order LinkedIn, Instagram, TikTok, Portfolio; `<article aria-labelledby>` each):
- Header row: tile (`size-9 rounded-14`, platform tint, mark 11/500 in platform `text`), name Serif 20 (`flex-1`), right: handle 12.5 `text-3` (real: `login`/`@username`; mock: no handle) and `MOCK` tag when mock.
- Followers row (`flex items-baseline gap-2`): count Serif 29 (`4,812` style, `12.4k` at >=10,000), unit 12.5 `text-3` `followers`. No analytics (LinkedIn, Portfolio): count shows `—` (`aria-label="Not available"`) and the unit line becomes the honest note (see copy table).
- Sparkline (`role="img"`, `aria-label="{Platform} followers since {d MMM}: {first} to {last}"`, stroke 1.5 in platform `color`): only with 2+ snapshots. With fewer: 12.5 `text-3` `History since {d MMM}` (or `No history yet` before the first sync). Mock cards draw their fixture series dashed.
- Stats (`grid-cols-2`): `POSTS · 30D` (count of variants published or posted on this platform in the last 30 days, 13.5/500) and `NEXT` (`{EEE d MMM, HH:mm}` of the next scheduled variant, or `Nothing scheduled`).
- `LATEST POST`: post title 13.5 2-line clamp, meta 12.5 `text-3` `{EEE d MMM} · {metrics present, e.g. 1.2k views · 44 likes}` (only metrics the platform returned; none: date only). Empty: `Nothing posted from LifeOS yet.` The block is a button opening the post sheet (`aria-label="Open latest {Platform} post: {title}"`).
- Footer: `StatusDot` + 10.5 caps status (`CONNECTED` green / `MOCK` neutral / `RECONNECT` red / `EXPIRES {d MMM}` amber, the last within 7 days of expiry), then `ml-auto` cyan link `Connect in Settings` (mock or reconnect; `aria-label="Connect {Platform} in Settings"`, to `/settings?section=connections#social-{platform}`). Portfolio footer: `No connection needed` 12.5 `text-3`.
- Sync error (`lastSyncError`): `InlineError` 12.5 above the footer `{Platform} didn't sync: {lastSyncError}.`

**CONTENT PIPELINE** (`<section aria-labelledby>`): `SectionHeader` `CONTENT PIPELINE`, meta `{n} POSTS`, action: `Draft with Social agent` (ai sm, `auto_awesome`) and `New idea` (primary sm, `add`). Both open the New post dialog (agent mode / owner mode with stage Ideas).

Board (D-11, Phase 6 static board, no drag): columns in order `IDEAS`, `DRAFT`, `REVIEW`, `SCHEDULED`, `PUBLISHED`; each a `<section aria-labelledby>` with an `<ol>` of cards. Header: 8px stage swatch, label (eyebrow style), `Badge kind="count" tone="neutral"`.

Card (`<li>`, Phase 6 card shell):
- Row 1 (`flex items-center gap-1.5`): one `PlatformChip` per variant (max 4), `ml-auto` time 12.5 `text-3`: SCHEDULED `{EEE HH:mm}` of the earliest scheduled variant; PUBLISHED `{EEE d MMM}`; others none.
- Title: a button 13.5/500 2-line clamp, `text-left`, opens the post sheet (`aria-label="Open post {title}"`).
- Row 3 (`flex flex-wrap items-center gap-1.5`): by-line 12.5 `text-3` `You` / `Social agent`; `MOCK` tag when any variant is mock; `UNTRUSTED SOURCE` is not shown on cards (sheet and approval only).
- PUBLISHED only: metrics line 12.5 `text-2`, the summed views (or reach) of real variants only: `{n} views`; omitted when no real metric exists.
- Actions (`flex gap-2`), item-specific names:
  - IDEAS: secondary xs `Start draft` (`aria-label="Move {title} to Draft"`).
  - DRAFT: ghost xs `Back` (`arrow_back`, `aria-label="Move {title} back to Ideas"`).
  - REVIEW: cyan link xs `Review approval` (`aria-label="Review the {Platform} approval for {title}"`, to `/approvals?id={id}`; with several pending variants, one link per pending platform).
  - SCHEDULED, PUBLISHED: no move buttons (columns are derived).
- Empty column: 12.5 `text-3` centered: REVIEW `Nothing waiting for review.`; all others `Empty. Move a card here or ask the Social Agent.` (design copy, D-22).
- Moving Ideas↔Draft is optimistic; failure reverts with toast `Couldn't save that. Try again.`

### Post sheet (`?post={id}` on `/socials`, any view) **[auto]**

`Dialog` (`aria-labelledby` the title), desktop `max-w-[1120px]`; `<760` full-screen sheet (menu tier, header `h-14 px-5` with `arrow_back` `Back to Socials` and the title truncated). Esc/back closes, focus returns to the opener.

1. Header block:
   - Eyebrow row: `POST` + stage `Badge kind="status" tone="neutral"` (`IDEA` / `DRAFT`, or the derived column label) + `ml-auto` close icon button (`aria-label="Close post {title}"`).
   - Title `Input` styled as Serif 26 in edit (`aria-label="Post title"`, max 120); read mode when any variant is past draft.
   - Source line (only when `source_kind` is set) 12.5 `text-2`: `From project · {name}` / `From event · {title}` / `From repo · {owner/name}`, name is a cyan link to the source.
   - Untrusted note (when `drafted_from_content`): amber inset `rounded-14 p-4`, `warning` + `Drafted from {project|event|repo} content (untrusted)`; body 12.5 `text-2` `Part of this post came from text LifeOS didn't write. Check every variant before publishing.`
   - `Idea` `Textarea` (rows 4, max 5000, `rounded-14`).
   - Stage segmented `Idea | Draft` (owner-set, D-10), only while no variant is past draft.
   - `VARIANTS` eyebrow + platform toggles (`role="group" aria-label="Platforms for this post"`): one chip per platform, `aria-pressed`, swatch + label; pressing adds a variant (empty text from the idea); un-pressing removes it (confirm when it has text). A toggle is disabled for a variant past draft (`aria-describedby` reason `Cancel the schedule or resolve the approval first.`).
2. Variants grid: one `VariantPanel` per variant, in platform order.
3. Footer: `Draft with Social agent` (ai, `auto_awesome`; drafts the selected platforms; disabled while a run is active), `ml-auto` ghost red `Delete post` (`delete`; disabled with the same reason while any variant is pending, scheduled or publishing), `Cancel` secondary, `Save changes` primary (disabled until something changed; loading). Unsaved changes on close: confirm `Discard changes?` (see copy).

**VariantPanel** (`<section aria-labelledby>`):
- Header: `PlatformChip`, status badge, `MOCK` tag (mock provider), `ml-auto` meta 12.5 `text-3` (`Scheduled {EEE d MMM, HH:mm}` / `Published {d MMM, HH:mm}` / `Posted {d MMM}`).
- Text: draft = `Textarea` (rows 8, `aria-label="{Platform} text"`, LinkedIn/Instagram/TikTok; Portfolio label `Portfolio body (Markdown)`); otherwise read-only 14/1.5 `whitespace-pre-wrap break-words`. Counter 12.5 `text-3` right under it: `{n} / 3,000` (LinkedIn) / `{n} / 2,200` (Instagram, TikTok); Portfolio no counter. Counts code points.
- Platform fields (draft only, `Field` + `Input`):
  - Instagram: `Public image URL` (required, `type="url"`, `inputmode="url"`, placeholder `https://`), helper `Instagram needs a public image link. LifeOS can't host images (it's private to your tailnet).`
  - LinkedIn: `Link (optional)` (`type="url"`), helper `Shown as a link preview under the post.`
  - Portfolio: `Title` (required), `Image URL (optional)`.
  - TikTok: none.
- Checks (`role="list" aria-label="{Platform} checks"`, from `checkVariant`): errors first, then warnings, else one ready line (`Ready to publish` for publish-capable providers, `Ready to post` for manual ones). Re-run on every change (debounced 150ms).
- Portfolio preview: `Disclosure` `Preview Markdown` with the generated Markdown in `font-code` 11.5 inset, `max-h-[240px] overflow-auto`, `tabIndex=0`, `aria-label="Portfolio Markdown preview"`.
- Actions by capability and status (D-15: capabilities decide what renders; never a disabled Publish on a manual platform):
  - Publish-capable, `draft`: secondary sm `Publish now` (`send`, `aria-label="Publish {title} to {Platform} now"`) and secondary sm `Schedule` (`schedule`, `aria-label="Schedule {title} on {Platform}"`). Both disabled while check errors exist (`aria-describedby` → `Fix the errors above first.`) or while the sheet has unsaved changes (`Save changes first.`). Note 12.5 `text-3` under the actions: `Publishing opens an approval. Nothing posts automatically.` On a mock provider the note reads `MOCK: this publishes to a practice copy. Nothing leaves LifeOS.`
  - `pending_approval`: cyan link `Review approval` (`aria-label="Review the {Platform} approval for {title}"`) + 12.5 `text-3` `Edit the text in the approval.`
  - `scheduled`: secondary sm `Reschedule` (`aria-label="Reschedule {title} on {Platform}"`), destructive sm `Cancel schedule` (`event_busy`, `aria-label="Cancel the scheduled {Platform} post"`, confirm). Note `Changing the text cancels the schedule and needs a new approval.`
  - `publishing`: inline spinner + 12.5 `text-2` `Publishing to {Platform}…` (polite live region). No actions.
  - `published`: `check_circle` green `Published {d MMM, HH:mm}` + cyan `Open post` (`open_in_new`, `aria-label="Open the {Platform} post for {title}"`, new tab, real only); mock: `MOCK · nothing left LifeOS` and no link. Metrics row 12.5 `text-2` (`flex flex-wrap gap-3`): only fields present, labels `views`, `reach`, `likes`, `comments`, `shares`, `saves`, `impressions`, plus `Updated {relative}` `text-3`. No metrics field for LinkedIn/Portfolio: the honest note instead.
  - `failed`: `InlineError` with `last_error`; secondary sm `Retry publish` (`aria-label="Retry publishing {title} to {Platform}"`, opens a new approval) and secondary sm `Mark as posted` (LinkedIn ambiguous case, D-17). LinkedIn ambiguous copy: `LinkedIn may have posted this. Check your profile, then Mark as posted or Retry.`
  - Manual platform (TikTok, Portfolio, or any provider with `publish: false`), not yet posted: note 12.5 `text-2` (`TikTok doesn't let LifeOS post for you. Copy the caption and post it in the app.` / `Portfolio posts are Markdown you publish yourself.`); actions: TikTok `Copy caption` (`content_copy`, `aria-label="Copy the TikTok caption for {title}"`), `Open TikTok` (`open_in_new`, constant `https://www.tiktok.com/`, new tab, `aria-label="Open TikTok in a new tab"`), `Mark as posted` (`task_alt`, `aria-label="Mark {title} as posted on TikTok"`); Portfolio `Copy Markdown` (`aria-label="Copy the portfolio Markdown for {title}"`), `Download .md` (`download`, `aria-label="Download {title} as Markdown"`), `Mark as posted` (`aria-label="Mark {title} as posted on Portfolio"`). All secondary sm. Copy is allowed with check warnings; Portfolio copy/download is disabled while the title error exists.
  - `posted_manually`: `task_alt` green `Posted {d MMM}` + cyan `Open post` when a URL was given.
- Agent drafting (any variant in this sheet being written by a run): the panel body shows 4 `Skeleton` lines + 12.5 `text-3` `Social agent is drafting…` (polite).

### New post dialog

Title `New post`. Fields (`gap-4`):
- `Start from` radio group (`role="radiogroup"`, pills like the segmented control, wraps): `Blank`, `From project`, `From event`, `From repo`.
- Source `Select` (hidden for Blank): projects (Phase 5), saved or attended events (Phase 6), synced repos. Empty source list: 12.5 `text-3` `No projects yet.` / `No saved or attended events yet.` / `No synced repos yet.`
- `Title` `Input` (required, max 120; prefilled from the source name).
- `Platforms` checkbox group (`role="group"`): LinkedIn, Instagram, TikTok, Portfolio; default all connected providers plus Portfolio; with nothing connected, all four (mocks). At least one required.
- `Date` (`type="date"`, optional; prefilled when opened from a calendar day). Helper `Used as the default when you schedule. It doesn't schedule anything.`
- Footer: `Cancel`, `Draft with Social agent` (ai), `Create post` (primary). `Create post` builds the starter idea from the source fields (no LLM) and opens the post sheet. `Draft with Social agent` creates the post, starts the run, opens the sheet in the drafting state. Opened via `New idea` the stage is Ideas; via palette `New post` or a calendar day, Draft.

### Schedule / Reschedule dialog

Title `Schedule on {Platform}` / `Reschedule on {Platform}`. Body 13.5 `text-2` `{title}`. Fields side by side (`grid grid-cols-2 gap-4`, one column <760): `Date` (`type="date"`), `Time` (`type="time"`, `step=300`). Default: the post's date at 10:00, else tomorrow 10:00 **[auto]**. Helper `Sydney time. Approving it schedules the post; nothing posts until then.` A past time shows the amber note `That time has passed. It will post as soon as you approve.` Footer `Cancel` / `Request approval` (Schedule) or `Save new time` (Reschedule, direct, audit-logged, no approval).

### Mark as posted dialog

Title `Mark as posted on {Platform}`. `Post URL (optional)` `Input` (`type="url"`, placeholder `https://{host}/…`), helper TikTok `Paste the video link so LifeOS can match its stats.`, others `Paste the live link to keep it with the post.` Error `Use an https link on {host}.` Footer `Cancel` / `Mark as posted`.

### Publish now / Schedule flow (D-14)

`Publish now` (and `Request approval` in the Schedule dialog) calls the synthetic-run action; the button shows `loading`; on success, toast `Approval requested` and `router.push("/approvals?id={approvalId}")` **[auto]**; the variant shows AWAITING APPROVAL when the owner returns. Failure: toast `Couldn't request the approval. Try again.`; a check error returned by the server re-renders the checks list.

### CALENDAR

- Toolbar: `Week | Month` segmented (`role="radiogroup" aria-label="Calendar range"`), prev/next icon buttons `size-8` (`chevron_left`/`chevron_right`, `aria-label="Previous week"`/`Next week` or `Previous month`/`Next month`), `Today` secondary sm, range label 12.5/500 (`rangeLabel`), `ml-auto` platform legend chips (Organization legend markup, `aria-pressed`, swatch + label, off = opacity .4; `aria-label="Show {Platform}"`). Range and anchor in the URL (`?view=calendar&cal=week|month&d=yyyy-mm-dd`) **[auto]**.
- Shows `scheduled`, `publishing`, `published` and `posted_manually` variants at their time (`scheduled_at` or `published_at`), Sydney time. Drafts are not on the calendar.
- **Month:** `content-calendar.tsx`, a lighter grid **[auto]** (MonthGrid's cells are buttons and can't hold chip buttons). Reuses MonthGrid's header, cell classes, `HEAD`, day maths and today circle. Each day is `<li aria-label="{EEEE d MMMM}">` in an `<ol>` per week row; contents: day number (`size-6 rounded-full`, today `bg-accent-solid`), up to 3 chips then `+{n} more` (button, opens a day popover listing all chips, `aria-label="Show all {n} posts on {EEE d MMM}"`), and an `add` icon button (`size-6`, visible on hover/focus-within, always visible on coarse pointer at `size-11`; `aria-label="New post on {EEE d MMM}"`) that opens New post with that date. Out-of-month days `opacity-35`. Below 760px: chips collapse to swatches (existing month-grid behaviour) and tapping the day opens the day popover.
- **Week:** 7 day columns (agenda style, not an hour grid **[auto]**), header `{EEE}` eyebrow + day number; chips sorted by time; same `add` button per day; an empty day column stays blank. Below 760px the week becomes a vertical list of 7 day rows.
- **Chip** (`<button>`, `rounded-8`, platform tint fill + 1px border at the platform `color` 27%): time 10 `text-2` + title 11 truncate; published/posted chips lead with a `check` 12 icon; failed chips use the red tint (`rgba(255,105,97,.12)`) and `error` 12. Accessible name: `{Platform}: {title}, {Scheduled|Published|Posted|Failed} {EEE d MMM, HH:mm}{, mock}`. Click opens the post sheet.
- Empty range: 12.5 `text-3` line under the toolbar `Nothing scheduled or posted this {week|month}.` The grid still renders.

### ANALYTICS

- Toolbar: range segmented `7D`, `30D`, `90D`, `1Y` (`role="radiogroup" aria-label="Range"`, default `30D`, in the URL `&range=`), platform legend chips (same as the calendar), only for platforms with analytics (Instagram, TikTok) **[auto]**.
- **FOLLOWERS card** (`<figure>`): header `flex items-baseline gap-3`: eyebrow `FOLLOWERS` (`flex-1`), total Serif 29 (sum of the latest snapshot of **real** providers only), delta 12/500 (`+{n}` over the range; green when positive, `text-2` otherwise). Chart: SVG `h-[180px]`, 4 guide lines `bg-white/[.05]` (last `.08`), one polyline per visible platform (stroke 1.75 in platform `color`; mock platforms dashed `4 4` and labelled `MOCK` in the legend chip). Axis row 11 `text-3`, 4–5 labels. `figcaption` 12.5 `text-3` `History since {d MMM yyyy}. Mock accounts are dashed and not counted in the total.` Each line has a visually hidden summary list: `{Platform}: {first} on {d MMM} to {last} on {d MMM}`.
  - No real provider with analytics connected: total `—`, chart replaced by centered 13.5 `text-2` `No follower history yet` + 12.5 `text-3` `Connect Instagram or TikTok in Settings. Growth shows from the first sync after connecting.` + cyan `Connect in Settings`. Mock lines still draw above it if mock fixtures exist.
  - Fewer than 2 snapshots for a platform: its line is omitted; caption adds `{Platform} needs one more sync to draw a line.`
- **POSTS table** (`<table>` in the list container, `aria-label="Published posts"`): eyebrow above via `SectionHeader` `POSTS` + meta `{n} in the last {range}`. Columns: `Platform` (`PlatformChip`), `Post` (title, 13.5, link-button opening the post sheet, `aria-label="Open post {title}"`), `Published` (`d MMM`), then only the metric columns that at least one row has: `Views`, `Reach`, `Impressions`, `Likes`, `Comments`, `Shares`, `Saves` (right-aligned 13.5). A missing value renders `—` in `text-3` with sr-only `not provided` (never `0`, D-19). Mock rows carry the `MOCK` tag after the title. Sorted by published date, newest first. Rows `border-b border-white/[.04]`, hover `bg-white/[.025]`. Below 760px the table scrolls horizontally inside the card (`overflow-x-auto`, first column sticky not required).
  - Empty: 13.5 `text-2` centered `No published posts in this range.`
- **Not available** (one line per platform without analytics, `info` 16 `text-3` + 12.5 `text-2`): LinkedIn `LinkedIn doesn't share personal-profile analytics with self-serve apps.`; Portfolio `Portfolio analytics aren't connected.` Their published posts still appear in the table with only `Platform`, `Post`, `Published`.

### Social approval: `/approvals` detail (`SocialApprovalShell`, kind `social_publish`)

Mirrors `MailApprovalShell` (same guard, check, approve, done, busy states, footer). Unparseable payload → `UnreadableApproval`.
1. Header: eyebrow `SOCIALS` (`text-pink`) + `wants to` + `post to {Platform}` (or `schedule a post on {Platform}` when `publishAt` is in the future). `h2` = post title. `MOCK · NOTHING LEAVES LIFEOS` amber tag on mock providers.
2. `WHY` (only when `a.reason`), existing `Fact`.
3. Untrusted note (when the post has `drafted_from_content`): amber inset, `Drafted from {project|event|repo} content (untrusted)` + `Part of this post came from text LifeOS didn't write. Check it before approving; nothing posts until you do.`
4. Facts: `WHAT WILL HAPPEN` LinkedIn `Posts this text publicly on your LinkedIn profile.` / Instagram `Posts this image and caption publicly on @{username}.` / mock `Saves this post to the MOCK {Platform}. Nothing leaves LifeOS.`; `WHERE` `{Platform} · {login}` (mock: `{Platform} · MOCK`); `WHEN` `Immediately after approval` or `{EEE d MMM, HH:mm} Sydney time`.
5. `WHAT DATA WILL BE SENT`: `check_circle` green `Your post text ({n} characters)`; Instagram `check_circle` green `Image link` + host in `font-code` 11.5 and 12.5 `text-3` `Meta downloads the image from this link.`; LinkedIn with link `check_circle` green `Link {host}`; `shield` cyan `Visible to everyone`; `shield` cyan `Posted once, even if a retry happens`. Mock: the list reads `Nothing is sent. This is a MOCK account.`
6. `PREVIEW` (`EDITED` amber tag when edited): inset panel with `PlatformChip` + `lock` 14 (`Platform is locked`), text 14/1.5 pre-wrap, image URL and link in `font-code` 11.5, `When` row. Edit mode: `Text` `Textarea` (rows 10) with the counter and live checks list; `Image URL` / `Link` inputs per platform; `Publish at` date + time inputs (empty = now; helper `Leave empty to post right after you approve.`). Platform stays read-only with helper `The platform is locked to this variant.` Check errors block Approve (`Fix the errors above first.`). `View agent's original` disclosure (existing).
7. Footer (existing uppercase style): primary `POST NOW` or `SCHEDULE POST` (`check`, `min-w-[150px]`), secondary `EDIT` / `DONE`, destructive `REJECT`, right meta `requested {HH:mm} · expires {stamp}`.
8. Resolved (`socialResolved`): approved/executing `schedule` cyan `Posting to {Platform}…`; scheduled `schedule` cyan `Scheduled for {EEE d MMM, HH:mm}. Approved at {HH:mm}.` + outline link `View in Socials` (`/socials?post={id}`, id validated); executed `check_circle` green `Posted to {Platform}. Approved at {HH:mm}.` + `Open post` (real) or `View in Socials` (mock); failed `error` red `Approved, but it couldn't be posted: {error}.` + `View in Socials` (Retry happens from the post sheet, D-17); auth failure adds cyan `Reconnect {Platform} in Settings`; rejected/expired/cancelled use the existing copy with `Nothing was posted.`

**AI panel inline card** (`approval-card.tsx` map; layout unchanged): line 2 `Social agent wants to post to {Platform}`; `h4` = post title; meta 11 `text-3` `{Now | EEE d MMM, HH:mm}`; amber untrusted line when applicable; body = the text with the existing clamp + `Show full preview`; footer meta `{Platform} · Socials · expires {stamp}`; buttons `POST NOW`/`SCHEDULE POST` (inverse), `REJECT`, link `Review and edit` → `/approvals?id={id}`. Resolved pill: `Posted to {Platform}.` / `Scheduled for {when}.` + cyan `View in Socials`.

**List row and notification** (`approvalSummary`, D-14): title `Approval waiting: post to {Platform} · {title}` plus ` · {EEE HH:mm}` when scheduled; body `{n} characters{, 1 image}. Expires {when}.` List icon `public`.

### Settings → Connections: Socials rows (D-01, D-08, D-22)

A `SOCIALS` group header (`SectionHeader`, meta `{n} connected`), rows with anchors `#social-linkedin`, `#social-instagram`, `#social-tiktok`, `#social-portfolio`:
- **LinkedIn** (`ConnectionRow` + `TokenForm`, tile `in`): status `MOCK` until a token exists, then `CONNECTED` with detail `Connected · {name} · expires {d MMM}` (last-4 in `font-code` per existing pattern). Within 7 days of expiry: amber dot + `Expires {d MMM}. Generate a new token and replace it.` Expired or rejected: `RECONNECT` + `This token stopped working. Generate a new one and replace it.` Form helper `Generate a token in LinkedIn's developer portal (OAuth token generator) with openid, profile and w_member_social. It lasts 60 days.`
- **Instagram** (tile `ig`): same pattern; detail `Connected · @{username}`; helper `Your account must be a Professional (Creator or Business) account. Generate a token in your Meta app under Instagram → API setup with Instagram login. LifeOS refreshes it for you.`
- **TikTok** (tile `tt`): step 1 `TikTok app` form: `Client key` `Input`, `Client secret` `Input type="password"`, submit `Save app keys` (stored encrypted, shown as `Client key ••••{last4}`); helper `Create a TikTok app with Login Kit and the Display API, add yourself as a Sandbox target user, and set this redirect URL:` + the redirect URL in `font-code` 11.5 + icon button `content_copy` (`aria-label="Copy the TikTok redirect URL"`). Step 2: `Connect TikTok` (primary sm when keys are saved and not connected; else hidden), `Disconnect TikTok` (destructive sm when connected). Connected detail `Connected · @{username}`. OAuth return toasts (fixed strings): `TikTok connected` / `TikTok didn't connect. Try again.`
- **Portfolio** (tile `pf`, `readOnly`, `statusLabel="NOT NEEDED"`): detail `No connection needed: Markdown export`.
- Sync error on any row: `InlineError` 12.5 `{Platform} didn't sync: {lastSyncError}.`

### Palette and integrations (D-23)

- Palette `Posts` scope: rows `public` icon, title, meta `{column} · {platform labels}` (`· Mock` when mock); opens `/socials?post={id}`.
- Palette command `New post` opens the New post dialog on `/socials`.
- `Draft a post` ghost xs (`edit`) on the project detail, event detail and repo row **if cheap** (planner's call): opens `/socials?new=1&source={kind}:{id}`, prefilled; `aria-label="Draft a post about {name}"`.
- Home: untouched.

### Focal points

- Overview: the REVIEW column of the content pipeline (posts waiting on the owner); `New idea` is the only filled accent button on the page.
- Platform card: the follower count (Serif 29), then the connection footer.
- Post sheet: the first variant panel with a check error, else the first panel's `Publish now`; `Save changes` is the sheet's only accent action.
- New post dialog: the `Start from` choice.
- Schedule dialog: the Date/Time pair, then `Request approval`.
- Calendar: today's cell (accent circle) and the next scheduled chip.
- Analytics: the FOLLOWERS total and its chart.
- Social approval: the `h2`, then the PREVIEW panel, then `POST NOW` / `SCHEDULE POST`.
- Settings → Socials: the first row that is `MOCK` or `RECONNECT`.

---

## Interaction and States

| Surface | Loading | Not connected / mock | Error | Empty |
|---|---|---|---|---|
| Overview cards | route `loading.tsx`: 4 `Skeleton` cards `h-[320px] rounded-24` | MOCK badge + fixture numbers + `Connect in Settings` | per-card `InlineError` (`lastSyncError`); page load failure `InlineError` `Couldn't load Socials.` + `Try again` | `Nothing posted from LifeOS yet.` in LATEST POST |
| Content board | 5 skeleton columns `h-[320px] rounded-24` | mock posts badged MOCK | same page error | per-column design copy |
| Post sheet | `Skeleton` header + 2 panel skeletons `h-[280px] rounded-14` | MOCK tag + mock publish note | save failure toast; unknown id: sheet not opened, toast `That post doesn't exist anymore.`, `?post` cleared | n/a |
| Calendar | grid skeleton (`lo-shimmer` cells) | mock chips carry `, mock` in the name and a MOCK tag in the popover | page error | empty-range line |
| Analytics | chart skeleton `h-[180px]` + 5 row skeletons | dashed mock lines, excluded from the total | page error | no-history block; `No published posts in this range.` |
| Social approval | existing approvals skeleton | mock facts and tag | existing decision toast | n/a |
| Settings rows | existing | `MOCK` status | `RECONNECT`, `InlineError` | n/a |

- **Owner writes** (title, idea, stage, variants, platform toggles, Ideas↔Draft, cancel schedule, reschedule, mark as posted, delete) are direct and audit-logged; the sheet awaits the server (button `loading`), then `router.refresh()`. Board moves are optimistic.
- **Any edit to a scheduled variant's text, image or link** is blocked in the sheet (read-only) until `Cancel schedule`; this matches D-16 without a surprise state change **[auto]**.
- **Copy actions** use `navigator.clipboard.writeText`; success toast `Copied` / `Markdown copied`; failure toast `Couldn't copy. Select the text and copy it yourself.` Download builds a `Blob` client-side; filename `{yyyy-mm-dd}-{slug}.md`.
- **Sync now:** `loading` until enqueued, toast `Sync started`; results arrive via `notifyLive` + `router.refresh()`; new cards and rows fade in with `lo-in`.
- **Live status:** variant status changes (approved → scheduled, publishing → published/failed) arrive through the existing live provider and refresh the board, sheet and calendar.
- **Motion:** only `lo-in`, `lo-fade`, `lo-rise` (dialogs, sheet), `lo-shimmer`. `prefers-reduced-motion` is handled globally.
- **Responsive:** `>=1100` as described. 760–1099: platform cards 2 columns, board scrolls horizontally, post sheet variants 1–2 columns. `<760` (Glass Mobile): `px-5`; header toolbar wraps below the title, segmented control full width; platform cards 1 column; **board becomes a stacked list**, one section per column in stage order with its header and cards, empty columns show their one-line copy; post sheet full screen; calendar per the CALENDAR section; analytics table scrolls inside its card; dialogs use the `sheet` variant.

---

## Accessibility

- View switcher: `role="tablist"`/`tab`/`tabpanel` with `aria-selected`, roving tabindex. Range and calendar-range controls: `role="radiogroup"` with `aria-checked`.
- Board columns are `<section aria-labelledby>` with `<ol>`; reading order = stage order. Stage swatches are `aria-hidden`.
- Every icon-only and repeated button has an item-specific accessible name (listed inline): `Move {title} to Draft`, `Move {title} back to Ideas`, `Open post {title}`, `Review the {Platform} approval for {title}`, `Publish {title} to {Platform} now`, `Schedule {title} on {Platform}`, `Reschedule {title} on {Platform}`, `Cancel the scheduled {Platform} post`, `Retry publishing {title} to {Platform}`, `Copy the TikTok caption for {title}`, `Copy the portfolio Markdown for {title}`, `Download {title} as Markdown`, `Mark {title} as posted on {Platform}`, `Open the {Platform} post for {title}`, `Open TikTok in a new tab`, `Close post {title}`, `New post on {EEE d MMM}`, `Show all {n} posts on {EEE d MMM}`, `Show {Platform}`, `Previous/Next week|month`, `Connect {Platform} in Settings`, `Open latest {Platform} post: {title}`, `Copy the TikTok redirect URL`, `Draft a post about {name}`.
- Disabled actions expose their reason through `aria-describedby` (visually hidden text), not only `title`.
- Checks list is `role="list"` and the counter is linked to the textarea with `aria-describedby`; when an error appears, a polite live region announces `{n} problems in the {Platform} variant`.
- Charts: SVGs `role="img"` with sentence labels plus visually hidden data summaries; no information is colour-only (platform label or mark always present, mock lines also tagged in text).
- `—` values carry sr-only `not available` / `not provided`.
- The post sheet and dialogs trap focus, Esc closes, focus returns to the opener. The untrusted note is `role="note"`.
- Third-party and agent text (post text, source names, metrics, `last_error`) render as text nodes only; no `dangerouslySetInnerHTML`; the Portfolio Markdown preview is plain text, never rendered HTML. External links use `rel="noopener noreferrer"`, new tab. `Open TikTok` and `Open post` never put post content in the URL.
- Contrast: existing measured pairs only; platform `text` colours on their 12% tints (Portfolio uses `--purple-text`).

---

## Copywriting Contract

| Element | Copy |
|---|---|
| Page lead | `Write a post once, plan it on the calendar, and see how it does.` |
| Primary CTA (Overview) | `New idea` |
| Primary CTA (post sheet) | `Save changes`; per variant `Publish now` / `Schedule` (secondary) |
| Primary CTA (dialogs) | `Create post` · `Request approval` · `Save new time` · `Mark as posted` |
| Primary CTA (approval) | `POST NOW` / `SCHEDULE POST` |
| Agent CTA | `Draft with Social agent` |
| Views | `Overview` · `Calendar` · `Analytics` |
| Pipeline | header `CONTENT PIPELINE`, meta `{n} POSTS`; columns `IDEAS` `DRAFT` `REVIEW` `SCHEDULED` `PUBLISHED`; buttons `Start draft`, `Back`, `Review approval` |
| Column empty | `Empty. Move a card here or ask the Social Agent.`; REVIEW `Nothing waiting for review.` |
| Card by-line | `You` / `Social agent` |
| Platform card | `followers`; `POSTS · 30D`; `NEXT` / `Nothing scheduled`; `LATEST POST` / `Nothing posted from LifeOS yet.`; `History since {d MMM}` / `No history yet`; status `CONNECTED` / `MOCK` / `RECONNECT` / `EXPIRES {d MMM}`; `Connect in Settings`; Portfolio `No connection needed` |
| Honest notes | LinkedIn `LinkedIn doesn't share personal-profile analytics with self-serve apps.` · Portfolio `Portfolio analytics aren't connected.` · TikTok `TikTok doesn't let LifeOS post for you. Copy the caption and post it in the app.` · Portfolio posting `Portfolio posts are Markdown you publish yourself.` · Instagram image `Instagram needs a public image link. LifeOS can't host images (it's private to your tailnet).` · `Publishing opens an approval. Nothing posts automatically.` · mock `MOCK: this publishes to a practice copy. Nothing leaves LifeOS.` |
| Check errors | `Too long for LinkedIn: {n} of 3,000 characters.` · `Too long for Instagram: {n} of 2,200 characters.` · `Instagram allows up to 30 hashtags. This has {n}.` · `Instagram allows up to 20 @mentions. This has {n}.` · `Add a public image link for Instagram.` · `Use an https:// image link.` · `Add a title for the portfolio post.` · `Write something first.` (empty text) |
| Check warnings | `More than 5 hashtags can look spammy on LinkedIn.` · `Longer than TikTok's 2,200-character caption limit.` |
| Check ready | `Ready to publish` / `Ready to post` |
| Variant states | `Scheduled {EEE d MMM, HH:mm}` · `Publishing to {Platform}…` · `Published {d MMM, HH:mm}` · `Posted {d MMM}` · `MOCK · nothing left LifeOS` · `Edit the text in the approval.` · `Changing the text cancels the schedule and needs a new approval.` · `Updated {relative}` |
| LinkedIn ambiguous failure | `LinkedIn may have posted this. Check your profile, then Mark as posted or Retry.` |
| Disabled reasons | `Fix the errors above first.` · `Save changes first.` · `Cancel the schedule or resolve the approval first.` |
| Untrusted note | `Drafted from {project|event|repo} content (untrusted)` / `Part of this post came from text LifeOS didn't write. Check every variant before publishing.` (approval: `…Check it before approving; nothing posts until you do.`) |
| Agent drafting | `Social agent is drafting…` · `The Social agent didn't draft anything. Try again, or ask in chat.` · `Drafting is paused: monthly AI cap reached.` |
| New post dialog | title `New post`; `Start from`: `Blank` / `From project` / `From event` / `From repo`; `Title`; `Platforms`; `Date` + `Used as the default when you schedule. It doesn't schedule anything.`; empty sources `No projects yet.` / `No saved or attended events yet.` / `No synced repos yet.`; error `Pick at least one platform.` / `Add a title.` |
| Schedule dialog | `Schedule on {Platform}` / `Reschedule on {Platform}`; `Date`, `Time`; `Sydney time. Approving it schedules the post; nothing posts until then.`; `That time has passed. It will post as soon as you approve.` |
| Mark as posted dialog | `Mark as posted on {Platform}`; `Post URL (optional)`; `Paste the video link so LifeOS can match its stats.` / `Paste the live link to keep it with the post.`; error `Use an https link on {host}.` |
| Calendar | `Week` / `Month`; `Today`; empty `Nothing scheduled or posted this {week|month}.`; `+{n} more` |
| Analytics | `7D` `30D` `90D` `1Y`; `FOLLOWERS`; caption `History since {d MMM yyyy}. Mock accounts are dashed and not counted in the total.`; `{Platform} needs one more sync to draw a line.`; no history `No follower history yet` / `Connect Instagram or TikTok in Settings. Growth shows from the first sync after connecting.`; `POSTS` meta `{n} in the last {range}`; table empty `No published posts in this range.`; headers `Platform` `Post` `Published` `Views` `Reach` `Impressions` `Likes` `Comments` `Shares` `Saves` |
| Page error | `Couldn't load Socials.` + `Try again` |
| Sync | `Synced {relative}` · `Sync now` · `{Platform} didn't sync: {lastSyncError}.` |
| Approval facts | `Posts this text publicly on your LinkedIn profile.` · `Posts this image and caption publicly on @{username}.` · `Saves this post to the MOCK {Platform}. Nothing leaves LifeOS.` · `{Platform} · {login}` · `Immediately after approval` / `{EEE d MMM, HH:mm} Sydney time` |
| Approval data list | `Your post text ({n} characters)` · `Image link` + `Meta downloads the image from this link.` · `Link {host}` · `Visible to everyone` · `Posted once, even if a retry happens` · mock `Nothing is sent. This is a MOCK account.` |
| Approval edit helpers | `Leave empty to post right after you approve.` · `The platform is locked to this variant.` |
| Approval resolved | `Posting to {Platform}…` · `Scheduled for {EEE d MMM, HH:mm}. Approved at {HH:mm}.` · `Posted to {Platform}. Approved at {HH:mm}.` + `Open post` / `View in Socials` · `Approved, but it couldn't be posted: {error}.` · `Reconnect {Platform} in Settings` · `Nothing was posted.` |
| Approval summary | `Approval waiting: post to {Platform} · {title}` (+ ` · {EEE HH:mm}`) / `{n} characters{, 1 image}. Expires {when}.` |
| AI card | `Social agent wants to post to {Platform}` · `{Platform} · Socials · expires {stamp}` · resolved `Posted to {Platform}.` / `Scheduled for {when}.` |
| Notifications | publish FYI `Posted to {Platform} · {title}`; failure IMPORTANT `Couldn't post to {Platform} · {title}` / `{last_error}`; expiry IMPORTANT `{Platform} token expires in 7 days` / `Replace it in Settings → Connections to keep posting.` |
| Activity | `Posted "{title}" to {Platform}` (`Posted "{title}" to the MOCK {Platform}` for mocks) |
| Settings | LinkedIn helper `Generate a token in LinkedIn's developer portal (OAuth token generator) with openid, profile and w_member_social. It lasts 60 days.` · Instagram helper `Your account must be a Professional (Creator or Business) account. Generate a token in your Meta app under Instagram → API setup with Instagram login. LifeOS refreshes it for you.` · TikTok helper `Create a TikTok app with Login Kit and the Display API, add yourself as a Sandbox target user, and set this redirect URL:` · `Save app keys` · `Connect TikTok` · `Disconnect TikTok` · Portfolio `No connection needed: Markdown export` · expiring `Expires {d MMM}. Generate a new token and replace it.` · expired `This token stopped working. Generate a new one and replace it.` · mock detail `Mock posts until you add a token.` |
| Settings errors | `That token didn't work. Check its scopes and try again.` · `Couldn't save that. Try again.` · `TikTok didn't connect. Try again.` |
| Toasts | `Post created` · `Changes saved` · `Approval requested` · `Copied` · `Markdown copied` · `Marked as posted` · `Rescheduled to {EEE d MMM, HH:mm}` · `Schedule cancelled` · `Post deleted` · `{Platform} variant removed` · `Sync started` · `TikTok connected` · `{Platform} token saved` · `{Platform} token removed` |
| Error toasts | `Couldn't save that. Try again.` (all owner writes, Sync now enqueue) · `Couldn't request the approval. Try again.` · `Couldn't copy. Select the text and copy it yourself.` · `Couldn't record that decision. Try again.` (approval footer) · `That post doesn't exist anymore.` |
| Destructive: Delete post | Title `Delete post`: `Delete "{title}" and its {n} variants? Published posts stay on their platforms; LifeOS forgets them and their stats.` Buttons `Delete post` (destructive) / `Keep post` |
| Destructive: Remove variant | Title `Remove {Platform} variant`: `Remove the {Platform} text for "{title}"? You can add the platform again, but this text is gone.` Buttons `Remove variant` (destructive) / `Keep variant` (no confirm when the text is empty) |
| Destructive: Cancel schedule | Title `Cancel schedule`: `Cancel the {Platform} post scheduled for {EEE d MMM, HH:mm}? It goes back to draft and needs a new approval to post.` Buttons `Cancel schedule` (destructive) / `Keep schedule` |
| Destructive: Remove LinkedIn/Instagram token | existing `TokenForm` remove confirm + `{Platform} goes back to MOCK. Scheduled {Platform} posts fail until you add a token again.` Behaviour (planner): removing the token makes every scheduled post for that platform FAIL with this message; it never publishes to the mock. |
| Destructive: Disconnect TikTok | Title `Disconnect TikTok`: `LifeOS stops syncing TikTok stats and goes back to MOCK. Your TikTok account is unchanged.` Buttons `Disconnect TikTok` (destructive) / `Stay connected` |
| Discard changes | Title `Discard changes?`: `Your edits to "{title}" aren't saved.` Buttons `Discard changes` (destructive) / `Keep editing` |
| Reject (approval) | no confirm (existing REJECT; the variant returns to draft) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | none (not initialized) | not applicable |
| third-party | none | not applicable |

---

## Auto-decisions

The owner was asleep. Each item is the recommended default, consistent with the Glass system, the Phase 6 contract and `Glass Socials.dc.html`. Review in the morning.

1. Page title `Socials` with a lead sentence (house pattern, as in Phase 6) instead of the design's sentence-as-H1; lead copy chosen here. The view switcher sits right of the title, bottom-aligned (rubric toolbar rule), as in the design.
2. View, calendar range/anchor, analytics range and the open post live in the URL (`?view`, `cal`, `d`, `range`, `post`, `new`) so reload, palette and notification links work.
3. The post detail is a large dialog on `/socials` (`?post={id}`), full-screen sheet on mobile, not a separate route: it is opened from the board, the calendar, the analytics table and the palette, and keeps the view behind it.
4. One accent action per surface: `New idea` on the page, `Save changes` in the sheet. Per-variant `Publish now`/`Schedule` are secondary, because several variants share one sheet.
5. `Publish now`/`Request approval` navigate to `/approvals?id={id}` (the existing edit-before-approve UI) rather than embedding an approval inside the sheet.
6. Board cards show one platform chip per variant (the design shows one platform per card; our model has one post with up to four variants). Only Ideas↔Draft have move buttons; Review links to its approval; Scheduled and Published have none (derived columns, D-11).
7. Platform card stats replace the design's ENGAGEMENT/RECENT with `POSTS · 30D` and `NEXT`, which LifeOS can compute honestly for every platform. Mock cards show fixture numbers with MOCK; LinkedIn and Portfolio show `—` plus the honest note.
8. Follower counts and the FOLLOWERS total use Serif 29, an existing 04.1 size (previously only Agents stat values), instead of the design's 39 (not in the closed scale).
9. Analytics shows only the FOLLOWERS chart, the POSTS table and the not-available notes (D-21). The design's engagement-rate chart, reach bars and growth/frequency rows are not built: they need numbers the APIs don't give consistently.
10. Mock data in analytics: dashed lines and MOCK-tagged rows, never counted in totals (D-02).
11. The content calendar is a lighter grid that reuses MonthGrid's classes and helpers, not MonthGrid itself (its day cells are buttons and can't hold chip buttons). Week is a 7-column agenda, not an hourly grid. Drafts are not on the calendar.
12. Clicking a day uses a dedicated `add` button per day (`New post on {date}`), not the whole cell, to avoid nested interactive elements. The date becomes the schedule default, not a schedule.
13. Schedule default time 10:00 Sydney; time input steps of 5 minutes.
14. Scheduled variants are read-only in the sheet; the owner cancels the schedule to edit (D-16 without hidden state changes).
15. Platform colours live in `src/socials/platform.ts` as data colours (like calendar categories), not new tokens. Portfolio chip text uses `--purple-text` for contrast. `PlatformChip` mirrors the Badge tag geometry at weight 500.
16. Pipeline stage swatches follow the design (DRAFT and SCHEDULED in `#64d2ff`), listed as accent uses 8.
17. Three icons added to the subset: `send`, `download`, `image`. `Draft a post` reuses `edit`.
18. `SectionHeader` gains an optional `action` prop; `ConnectionRow`'s `id` union gains the three social ids. No other primitive changes.
19. Settings → Connections gets a `SOCIALS` group with four anchored rows; TikTok is a two-step row (app keys, then Connect). The redirect URL is shown with a copy button.
20. The new-post `Date` field and palette `New post` command are added; Home is untouched.
21. Planner behaviour: removing a LinkedIn or Instagram token makes every scheduled post for that platform FAIL (IMPORTANT notification, `last_error` set); it never falls back to publishing to the mock provider.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: FLAG (approved)
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: FLAG (approved)
- [x] Dimension 5 Spacing: FLAG (approved)
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-10-13
