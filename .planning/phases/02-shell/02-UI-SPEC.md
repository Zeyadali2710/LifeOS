---
phase: 2
slug: shell
status: approved
shadcn_initialized: false
preset: none
created: 2026-10-07
---

# Phase 2 (Shell) — UI Design Contract

> Visual and interaction contract. Source of truth is the locked hi-fi design in `design/` (D-01). Every value below is cited to a design file; "DS" = `design/Design System.dc.html`, "SH" = `design/LifeOS.dc.html`, "HM" = `design/Home.dc.html`, "MB" = `design/Mobile Layouts.dc.html`, "INV" = `design/INVENTORY.md`. Names, events and numbers in the design are placeholder and are never shipped; copy here is derived from the design's voice rules (calm chief of staff, fact first, no exclamation marks, no emoji).

Provenance: CONTEXT.md D-01..D-16 (16 decisions) pre-populated; no user questions asked. Registry/shadcn gates not applicable (no component library, D-01 + task constraint).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-built components in `src/ui/` and `src/shell/`) |
| Preset | not applicable |
| Component library | none |
| Icon library | Material Symbols Outlined, self-hosted variable font subset (D-04). wght 300, FILL 0/1, opsz auto (20–48), GRAD 0 (DS line 12) |
| Font | Geist (sans) + Geist Mono via `next/font` (already in `layout.tsx`), weights per Typography |
| Theme | Dark only (D-03). Delete the `prefers-color-scheme: light` block. `color-scheme: dark`. Viewport `themeColor` becomes `#0b0c10` |

### Icon font hosting
- File: `src/app/fonts/material-symbols-outlined.woff2`, loaded with `next/font/local` (`display: "block"`, `variable: "--font-symbols"`). Generate a subset from Google Fonts CSS API using `icon_names=` (alphabetical) for the list below, download the woff2, commit it. Nothing is fetched from Google at runtime. CSP `font-src 'self'` is sufficient.
- Class `.msym` (globals.css): `font-family: var(--font-symbols); font-weight: 300; font-style: normal; line-height: 1; letter-spacing: normal; text-transform: none; white-space: nowrap; font-feature-settings: "liga"; font-variation-settings: "FILL" 0, "GRAD" 0; user-select: none;` plus `.msym-fill { font-variation-settings: "FILL" 1, "GRAD" 0 }`. Every icon span has `aria-hidden="true"`; the accessible name lives on the parent control.
- Phase 2 icon names (verify each renders; a missing subset glyph shows ligature text): `space_dashboard terminal public hub calendar_month deployed_code library_books flag memory notifications notifications_off verified_user tune left_panel_close left_panel_open search mic auto_awesome edit_square close arrow_upward arrow_forward chevron_right expand_more more_horiz priority_high event_note travel_explore edit_note link_off error info check_circle task_alt schedule alarm lock gpp_bad dns monitor_heart logout event_busy date_range code mail event`.

---

## Design Tokens (paste into `src/app/globals.css`)

Replaces the Phase 1 placeholder tokens 1:1 (D-02). Source: INV Tokens, DS `surfaces`/`accents`/`elev` arrays (lines 251–271), SH inline styles.

```css
@import "tailwindcss";

:root {
  /* surfaces */
  --canvas: #0b0c10;
  --surface: #111318;          /* cards, panels (elev 0) */
  --inset: #0d0e13;            /* code, previews, inputs */
  --raised: #1a1d24;           /* tooltips, toasts, menus */
  --selected: #1f222b;         /* active segment */
  --overlay: #12141a;          /* elev 2: drawer, palette base */
  --drawer: #101217;           /* notifications drawer (SH l.268) */
  --panel-top: #14151e;        /* AI panel gradient top (SH l.150, @.98 alpha) */

  /* text */
  --text: #e9eaf0;             /* primary */
  --text-2: #a3a6b4;           /* secondary, 7.6:1 */
  --text-3: #80849a;           /* labels/meta, 4.9:1 */
  --text-4: #4a4e5c;           /* decorative only: never for informative text */

  /* hairlines and fills (white alpha) */
  --border: rgba(255, 255, 255, 0.07);
  --border-soft: rgba(255, 255, 255, 0.05);   /* inner dividers */
  --border-hover: rgba(255, 255, 255, 0.16);  /* design uses .12–.2 */
  --border-strong: rgba(255, 255, 255, 0.12); /* secondary button, input rest .08 */
  --fill-1: rgba(255, 255, 255, 0.03);        /* input/secondary rest */
  --fill-2: rgba(255, 255, 255, 0.05);        /* ghost hover */
  --fill-3: rgba(255, 255, 255, 0.08);        /* disabled send, active tab */

  /* accents (same L/C, hue varies). Tints = accent at 8-14% alpha, borders 22-45%: use bg-indigo/10, border-indigo/35 */
  --indigo: #8b8cff;           /* LifeOS, primary, AI, focus */
  --indigo-text: #a5a6ff;      /* accent text */
  --indigo-soft: #c7c8ff;      /* text on indigo tint (Ask LifeOS button, link hover) */
  --green: #4fd1a1;            /* healthy, done, online */
  --amber: #e8b86a;            /* at risk, approval, important */
  --red: #f07a6e;              /* error, urgent, destructive */
  --blue: #6cb6ff;             /* info/FYI, email, events */
  --pink: #e889c4;             /* Socials (reserved, unused in Phase 2 UI) */
  --violet: #b48cff;           /* Knowledge (reserved, unused in Phase 2 UI) */
  --on-accent: #0b0c10;        /* text on any accent fill */
  --indigo-deep: #5b5cd6;      /* logo gradient end */

  /* elevation */
  --shadow-float: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04); /* command bar, elev 1 */
  --shadow-overlay: 0 30px 80px rgba(0,0,0,.6);                       /* elev 2 */
  --shadow-palette: 0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.5), 0 0 60px rgba(110,112,255,.08);
  --shadow-drawer: -30px 0 60px rgba(0,0,0,.5);
  --shadow-tooltip: 0 8px 24px rgba(0,0,0,.5);
  --shadow-toast: 0 12px 30px rgba(0,0,0,.5);
  --shadow-glow-ai: 0 0 0 4px rgba(139,140,255,.12), 0 8px 24px rgba(110,112,255,.3); /* primary AI action only */
  --ring-input: 0 0 0 3px rgba(139,140,255,.15);                       /* input focus ring */

  /* layout */
  --sidebar-w: 232px;
  --rail-w: 64px;              /* manual compact (desktop) */
  --rail-w-tablet: 68px;       /* 720-1100 auto rail */
  --topbar-h: 56px;
  --ai-w: 440px;
  --drawer-w: 420px;
  --content-max: 1480px;
  --bottombar-h: 66px;         /* + env(safe-area-inset-bottom); design's 96px includes the phone home-indicator mock */

  color-scheme: dark;
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-inset: var(--inset);
  --color-raised: var(--raised);
  --color-selected: var(--selected);
  --color-overlay: var(--overlay);
  --color-drawer: var(--drawer);
  --color-text: var(--text);
  --color-text-2: var(--text-2);
  --color-text-3: var(--text-3);
  --color-text-4: var(--text-4);
  --color-line: var(--border);
  --color-line-soft: var(--border-soft);
  --color-line-hover: var(--border-hover);
  --color-line-strong: var(--border-strong);
  --color-fill-1: var(--fill-1);
  --color-fill-2: var(--fill-2);
  --color-fill-3: var(--fill-3);
  --color-indigo: var(--indigo);
  --color-indigo-text: var(--indigo-text);
  --color-indigo-soft: var(--indigo-soft);
  --color-green: var(--green);
  --color-amber: var(--amber);
  --color-red: var(--red);
  --color-blue: var(--blue);
  --color-pink: var(--pink);
  --color-violet: var(--violet);
  --color-on-accent: var(--on-accent);

  /* Phase 1 legacy aliases so /login keeps compiling. Migrate usages, then delete these 8 lines. */
  --color-bg: var(--canvas);
  --color-bg-raised: var(--surface);
  --color-fg: var(--text);
  --color-fg-muted: var(--text-2);
  --color-fg-faint: var(--text-3);
  --color-signal: var(--indigo);
  --color-attention: var(--amber);
  --color-danger: var(--red);
  --color-ok: var(--green);

  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;

  /* radius: numeric names = design px so utilities are rounded-5, rounded-9, ... */
  --radius-4: 4px; --radius-5: 5px; --radius-6: 6px; --radius-7: 7px; --radius-8: 8px;
  --radius-9: 9px; --radius-10: 10px; --radius-12: 12px; --radius-14: 14px; --radius-16: 16px;

  --shadow-float: var(--shadow-float);
  --shadow-overlay: var(--shadow-overlay);
  --shadow-tooltip: var(--shadow-tooltip);
  --shadow-toast: var(--shadow-toast);
  --shadow-glow-ai: var(--shadow-glow-ai);

  /* viewport breakpoints (min-width). Below 720 = mobile (no variant). */
  --breakpoint-tab: 720px;
  --breakpoint-desk: 1100px;
}

html, body { height: 100%; }
body {
  margin: 0;
  background:
    radial-gradient(1200px 600px at 12% -10%, rgba(110,112,255,.10), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(150,110,255,.06), transparent 60%),
    var(--canvas);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
a { color: var(--indigo-text); text-decoration: none; }
a:hover { color: var(--indigo-soft); text-decoration: underline; }
button { font-family: inherit; }
:focus-visible { outline: 2px solid var(--indigo); outline-offset: 2px; }  /* never removed; no forced radius (design's 6px override distorts pills) */
::selection { background: rgba(139,140,255,.35); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }

/* motion keyframes (SH l.23–32, DS l.18–22) */
@keyframes lo-pulse   { 0% { box-shadow: 0 0 0 0 rgba(139,140,255,.55) } 100% { box-shadow: 0 0 0 7px rgba(139,140,255,0) } }
@keyframes lo-pulse-g { 0% { box-shadow: 0 0 0 0 rgba(79,209,161,.5) }  100% { box-shadow: 0 0 0 6px rgba(79,209,161,0) } }
@keyframes lo-in      { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
@keyframes lo-fade    { from { opacity: 0 } to { opacity: 1 } }
@keyframes lo-rise    { from { opacity: 0; transform: translateY(8px) scale(.99) } to { opacity: 1; transform: none } }
@keyframes lo-slide   { from { opacity: 0; transform: translateX(16px) } to { opacity: 1; transform: none } }
@keyframes lo-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes lo-spin    { to { transform: rotate(360deg) } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

Z-index scale: sidebar 5 · command bar 10 · AI panel 20 · notifications backdrop 60 / drawer 61 · palette backdrop 70 / palette 71 · tooltip 50 · snooze menu 80 · toast 90 (design has toast at 40, which sits under drawer backdrops; Snooze toasts fire while the drawer is open, so toast moves above).

---

## Spacing Scale

Base 4px (INV Space; DS l.264).

| Token | Value | Usage (design source) |
|-------|-------|-------|
| xs | 4px | hairline gaps, nav item gap-y 2px sits below this (2px list gaps are a documented exception) |
| sm | 8px | list gaps, tile gaps, chip row gap 6px (exception), card actions gap |
| md | 16px | compact card padding, sidebar padding x, drawer header |
| lg | 24px | column gap between two-column sections, panel padding, toast offset |
| xl | 32px | section gap; page padding x (desktop) |
| 2xl | 48px | not used in shell chrome; reserved for page hero spacing |
| 3xl | 64px | not used |

Exceptions (all from the design, listed so the checker does not flag them): 2px (nav list gap), 6px (chip gaps), 10px (nav padding x, list row padding, activity item gap), 12px (card-grid gap, palette row gap), 14px (section header to content; stat tile padding x), 18px (card padding on primary cards, InlineError padding), 20px (page gap inside sections, AI panel padding).

Page container: `max-width: var(--content-max); margin: 0 auto; padding: 36px 32px 170px` (170 clears the floating command bar, DS l.86). Below 720: `padding: 20px 16px calc(var(--bottombar-h) + env(safe-area-inset-bottom) + 24px)`.

Control sizes (heights): 26 inline/notification-row actions · 28 icon buttons small, chips · 30 icon buttons, EmptyState action, send · 32 card actions, InlineError action · 34 default button, top-bar controls · 36 nav item, input · 40 palette row · 44 touch (all targets below 720 and tablet rail tiles) · 52 command bar · 56 top bar, palette input, panel headers. Touch rule: every interactive element below 720 is at least 44x44 (DS rule TOUCH).

---

## Typography

Fonts: Geist for everything a person reads; Geist Mono only for system labels, timestamps, identifiers, agent names/states, repo names, compact metrics (DS l.63). If a full sentence is in mono, rewrite as label or move to Geist.

Weights: **400 and 500** for all body UI. **600** is permitted in exactly three places: the "LifeOS" wordmark, important-unread notification titles, and every Mono badge/agent label (DS badges, agent names). No other weight.

Line height: body 1.5, headings 1.05–1.35 per row below (design values; the 1.2 generic recommendation is overridden by the design).

| Role | Font | Size | Weight | Line height | Letter-spacing | Colour | Used for (source) |
|------|------|------|--------|-------------|----------------|--------|------|
| Display | Geist | `clamp(30px, 3.4vw, 44px)` (28px below 720) | 500 | 1.05 | -0.025em | text | Home greeting (HM l.14, MB l.38) |
| H1 | Geist | `clamp(28px, 3vw, 40px)` | 500 | 1.1 | -0.025em | text | placeholder page titles (INV Type) |
| H2 | Geist | 20px | 500 | 1.3 | -0.01em | text | AI panel empty heading (SH l.163) |
| Lead | Geist | 17px (15px below 720) | 400 | 1.5 | 0 | text-2 (key phrase in text) | Home summary sentence (HM l.15) |
| Title | Geist | 15px | 500 | 1.35 | -0.005em | text | panel title (14/500), tile value, EmptyState title, InlineError title |
| Body | Geist | 14px | 400 | 1.5 | 0 | text | default text, composer, EmptyState body is Small |
| UI | Geist | 13.5px | 400 (500 current/selected) | 1.4 | 0 | text / text-2 | nav items, palette rows, notification title, suggestion rows |
| Small | Geist | 12.5px | 400 | 1.45 | 0 | text-2 | notification body, tooltips, header links, row actions 12px |
| Label | Mono | 11px | 500 | 1.3 | 0.1em UPPER | text-3 | section headers (HM `PRIORITIES`), breadcrumb 11/.08em |
| Label-sm | Mono | 10.5px | 500 | 1.3 | 0.08em UPPER | text-3 | group headers NOW/TODAY/EARLIER, sidebar status, tile key (10px), count badge |
| Meta | Mono | 11.5px (11px in dense rows, 10.5px in notification time) | 400 | 1.3 | 0 | text-3 | timestamps, clock (text-2), detail lines |
| Badge | Mono | 10px | 600 | 1 | 0.08em UPPER | tone | Badge pill/tag |
| Kbd | Mono | 11px | 500 | 1 | 0 | text-2 | keyboard hints |

Note for checker: the design's real scale has more than four sizes (it is a dense OS UI). The contract keeps the design's values for fidelity (D-01); roles above are the closed set, nothing else may be introduced. `text-4` (#4a4e5c) is decorative only: the design uses it for informative meta (`RANKED BY ORCHESTRATOR`, `7 ITEMS`), which fails contrast; in this phase such meta uses `text-3`.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0b0c10` canvas + two radial glows | app background, behind everything |
| Secondary (30%) | `#111318` surface, `rgba(11,12,16,.6)` sidebar, `rgba(11,12,16,.55)` top bar, `#12141a`/`#101217` overlays | cards, panels, sidebar, nav, drawers |
| Accent (10%) | `#8b8cff` (fills), `#a5a6ff` (text/icons) | see reserved list |
| Destructive / error | `#f07a6e` | failed/error states and URGENT only |
| Semantic | green `#4fd1a1` healthy/online; amber `#e8b86a` important/approval/degraded; blue `#6cb6ff` FYI; indigo-text `#a5a6ff` agent | status dots and tints only |

Accent (indigo) reserved for: primary Button fill; current nav item (tint .10 bg, .18 border, `#a5a6ff` filled icon); unread bell dot and nav unread count text dot; focus outline and input focus ring; the LifeOS diamond mark (command bar, AI panel header, AI button); "Ask LifeOS" top-bar button tint; palette selected row tint (.12) and `Ctrl J ask LifeOS` footer hint; send button when enabled; AI panel composer border (.25); command bar border (.22, hover .45, focus .6); selected category filter chip; logo tile; Agents status tile dot. Never used for body text, generic links on cards, or decorative borders.

Accent never on: nav labels, headings, status "healthy" (that is green), disabled controls.

Text on any accent fill is `#0b0c10` (DS l.49). Status is always text + colour, never colour alone (DS CONTRAST).

Contrast contract: body `text` on surface >= 7:1; `text-2` 7.6:1; `text-3` 4.9:1 (labels, meta, placeholders); `text-4` never carries information.

### Notification category map (D-13; tone colour drives icon tint, icon tile bg `tone @ 13%` = `22` hex alpha for important rows else `rgba(255,255,255,.04)`)

| Category | Icon | Tone | Tag text | Bold "important" row |
|---|---|---|---|---|
| URGENT | `error` | red `#f07a6e` | URGENT | yes |
| IMPORTANT | `priority_high` | amber `#e8b86a` | IMPORTANT | yes |
| APPROVAL | `verified_user` | amber `#e8b86a` | APPROVAL | no |
| AGENT | `memory` | indigo-text `#a5a6ff` | AGENT | no |
| FYI | `info` | blue `#6cb6ff` | FYI | no |
| REMINDER | `alarm` | green `#4fd1a1` | REMINDER | no |

A row may override its icon (e.g. `lock` for failed sign-in) but never its tone.

### Activity source map (HM l.169, extended for D-10)

| Source | Icon | Colour | Used in Phase 2 |
|---|---|---|---|
| AUTH | `lock` | text-2 `#a3a6b4`; failed sign-in uses red | yes |
| SYSTEM | `dns` | text-2; degraded uses amber; restored uses green | yes |
| GitHub | `code` `#c9cbd6` · Email `mail` `#6cb6ff` · Calendar `event` `#4fd1a1` · Social `public` `#e889c4` · Agent `memory` `#a5a6ff` · Project `deployed_code` `#e8b86a` | | no (later phases; component supports them) |

---

## Breakpoints and layout behaviour

Viewport breakpoints (CSS `tab:` >= 720, `desk:` >= 1100) from MB l.27. Chrome elements that depend on available content width use container queries on `<main>` (`@container/main`), not viewport, because the AI panel and sidebar steal width (SH l.506).

| Width | Sidebar | Top bar | Command bar | Nav | AI panel | Notifications | Palette | Home grid |
|---|---|---|---|---|---|---|---|---|
| < 720 | none | 56px: logo tile 22 + breadcrumb, search icon button 44, bell 44 | hidden | MobileBottomBar 5 slots | full-screen sheet (modal) | full-width sheet | top 8vh, width 94vw, rows 44px | single column |
| 720–1100 | 68px icon rail (forced compact, tiles 44px) | full | shown | rail | overlay drawer 440 over a backdrop (modal) | 420 drawer | as desktop | 2 cols, sections wrap via flex-basis |
| >= 1100 | 232px, or 64px compact (Ctrl+\\) | full | shown (hidden while AI open) | sidebar | docked 440 column, pushes `<main>` (non-modal) | 420 overlay drawer + backdrop | desktop | 12-col, max 1480 |

Container-query rules for `<main>` width (SH l.506): clock hidden below 680; the `Ctrl K` hint inside the search field hidden below 760; the search field shrinks (`flex: 0 1 360px; min-width: 44px`) down to icon-only.

- Compact persistence (Claude's discretion): cookie `lo_nav=compact|full` (path `/`, max-age 1y, SameSite=Lax, not httpOnly), written client-side on toggle and read in `(os)/layout.tsx` server-side so first paint has no width jump. Ignored below 1100 (rail forced on 720–1100, bar below 720).
- Page scroll: shell is `height: 100dvh; overflow: hidden`; the page content wrapper scrolls (`overflow-y: auto; overflow-x: hidden`) so the sidebar, top bar and command bar stay fixed.
- Mobile Home order (MB M1, with one deviation): date line → greeting → lead → status tiles → Priorities → Today → agent summary row (`N AGENTS RUNNING`, chevron, links to /agents) → Live activity. Design moves activity/projects to More, but this build has no other home for the activity stream, so it stays. Active projects and Upcoming are hidden below 720.
- Desktop Home order (HM): date line, Display greeting, Lead, status tiles, Priorities, [Today | Live activity], [Active projects | Agent activity], Upcoming. Two-column rows use `flex-wrap` with basis `1.5 1 520px` / `1 1 340px`, gap 24.

---

## Component Inventory (Phase 2)

Primitives in `src/ui/`, composites in `src/shell/`. All are hand-built, token-driven, server components unless marked (client).

### AppShell (client shell wrapper; SH l.36, INV Shell)
Layout: `flex h-dvh overflow-hidden`; `<aside Primary>` + `<main>` + (docked AI panel). Skip link "Skip to content" is the first focusable element (visually hidden until focus; then top-left, `raised` bg, 34px). Owns ShellProvider state: `compact`, `aiOpen`, `paletteOpen`, `notifOpen`, `toast`, `moreOpen`. States: expanded · compact · rail (tablet) · mobile. Sidebar width transitions 180ms ease. Route change: content fades in 150ms (`(os)/template.tsx`, opacity only, no slide). Registers global keyboard map.

### SidebarNavItem (SH l.53)
Anchor (`next/link`) for pages; `<button aria-haspopup="dialog">` for Notifications. 36px high, `padding 0 10px`, gap 11, radius 8, 1px border, font 13.5px. Icon 19px in a 20px box.
| State | Style |
|---|---|
| default | border transparent, bg transparent, label `text-2`, icon `text-3` (FILL 0) |
| hover | label `text`, transition bg/colour .12s |
| current (`aria-current="page"`; Notifications is "current" while its drawer is open) | bg `rgba(139,140,255,.10)`, border `rgba(139,140,255,.18)`, label `text`, icon `#a5a6ff` FILL 1 |
| focus-visible | 2px indigo outline, offset 2 |
| badge (expanded) | right-aligned count pill: Mono 500 10.5px, radius 999, padding 2/6. Notifications: bg `rgba(255,255,255,.12)`, text `text`. Approvals: bg amber, text `#0b0c10`. Hidden at 0. Cap display at `99+` |
| badge (compact) | 6px dot at top 7 / left 26, same bg colour, no number |
| compact | label hidden, icon centred in the 44px tile (design left-aligns it; centre it), tooltip on hover AND keyboard focus: `role="tooltip"`, left `calc(100% + 12px)`, `raised` bg, border .1, radius 8, padding 7/10, 12.5px label + Mono 10.5 text-3 key hint, `shadow-tooltip`, fade .12s, `aria-describedby` on the item |
Accessible name always set: `aria-label="Approvals, 4 waiting"` / `"Notifications, 3 unread"`.
Nav data: Home `/` space_dashboard Alt+1 · Career `/career` terminal Alt+2 · Socials `/socials` public Alt+3 · Outreach `/outreach` hub Alt+4 · Organization `/organization` calendar_month Alt+5 · Projects `/projects` deployed_code Alt+6 · Knowledge `/knowledge` library_books Alt+7 · Goals `/goals` flag Alt+8 · Agents `/agents` memory Alt+9 · divider (1px `rgba(255,255,255,.06)`, margin 12/6) · Notifications (drawer, no hint) · Approvals `/approvals` verified_user · Settings `/settings` tune (Ctrl+,).
Sidebar chrome: header 56px with logo tile (24, radius 7, `linear-gradient(140deg,#8b8cff,#5b5cd6)`, glow `0 0 18px rgba(139,140,255,.35)`, inner 8px `#0b0c10` dot), wordmark "LifeOS" 15/600 -0.01em, app version in Mono 10 text-3 (real `APP_VERSION`, never the design's "0.9"), collapse button 28px (`left_panel_close`; compact shows centred `left_panel_open` 36x28 below header). Background `rgba(11,12,16,.6)`, right border `rgba(255,255,255,.06)`. Footer (padding 14/16/16, top border .05), two Mono 500 10.5/.08em rows with 7px markers:
- Row 1 health: `LIFEOS ONLINE` green dot + `lo-pulse-g 2.4s` · `LIFEOS DEGRADED` amber static · `LIFEOS OFFLINE` red static · `RECONNECTING` amber static (SSE down). Driven by latest health event, not hard-coded.
- Row 2 AI: hollow-diamond marker (`#80849a`, 7px, rotate 45) + `AI NOT CONNECTED` (text-2). Design's `AI READY` and `3 RUNNING` are not shown (D-05, D-08). In compact only the markers show.

### MobileBottomBar (< 720; MB l.62)
Fixed bottom, height `var(--bottombar-h)` + safe-area, padding-top 8, bg `rgba(11,12,16,.9)`, `backdrop-filter: blur(16px)`, top border `rgba(255,255,255,.07)`. 5-col grid: Home (`/`) · Organize (`/organization`, calendar_month) · **AI** · Projects (`/projects`) · More. Slots: icon 22px over 10.5px label, min target 44x44, current = `text` label + `#a5a6ff` FILL 1 icon, others `text-3`. AI centre: 56x56, radius 18, `linear-gradient(160deg,#9a9bff,#6c6de6)`, margin-top -22, ring `0 0 0 5px #0b0c10`, glow `0 10px 30px rgba(110,112,255,.45)`, 14px `#0b0c10` diamond; `aria-label="Open LifeOS assistant"`; opens AIPanel sheet. More opens MoreSheet.

### MoreSheet (mobile; Claude's discretion)
Bottom sheet, radius 16 16 0 0, bg `#12141a`, border-top .1, `shadow-overlay`, backdrop `rgba(5,6,9,.6)`, slide-up 200ms. `role="dialog" aria-label="More"`. Rows 52px (icon tile 26 + 14px label + chevron): Career, Socials, Outreach, Knowledge, Goals, Agents, Approvals (amber count), Notifications (unread count; opens drawer), Search (opens palette), Settings, then a Ghost `Sign out` (logout icon). Selecting closes the sheet.

### TopBar (SH l.90)
56px, padding 0 20px, gap 12, bg `rgba(11,12,16,.55)` + blur 12px, bottom border .05. Left to right:
1. Breadcrumb Mono 500 11/.08em text-3: `LIFEOS / HOME` (separator `text-4`, current segment `text`). Crumbs: HOME CAREER SOCIALS OUTREACH ORGANIZATION PROJECTS KNOWLEDGE GOALS AGENTS APPROVALS SETTINGS.
2. Search button (opens palette): h34, `flex: 0 1 360px`, radius 9, border `rgba(255,255,255,.08)`, bg fill-1, `search` icon 18, label "Search pages or run a command" (13px text-3, ellipsis), `Ctrl K` Kbd. Hover border .16 + text-2. `aria-label="Search pages or run a command"`, `aria-keyshortcuts="Control+K"`.
3. Clock: Mono 500 11.5 text-2 `HH:mm` + tz label text-3 (`AEDT`/`AEST` from `Intl.DateTimeFormat("en-AU", {timeZone:"Australia/Sydney", timeZoneName:"short"})`). Ticks every 20s. Render after mount (hydration-safe). Hidden under 680px main width.
4. Bell: 34x34, radius 9, border .08, bg fill-1, `notifications` 19, color text-2; unread dot 7px `#a5a6ff` with 2px `#0b0c10` border at top 6 / right 7, shown when unread > 0. `aria-label="Notifications, N unread"` (or "Notifications"). Opens drawer.
5. "Ask LifeOS": h34, padding 0 12, radius 9, border `rgba(139,140,255,.35)`, bg `rgba(139,140,255,.10)`, text `#c7c8ff` 13px, 7px diamond, `Ctrl J` hint Mono 10.5 `#8f91d9`. Hover bg .18. `aria-expanded` mirrors AI panel. Hidden below 720 (AI is in the bottom bar).
6. Avatar: 30px circle, `linear-gradient(140deg,#2a2d3a,#1a1d24)`, border .12, initial 12/600. Initial = first letter of owner name else email. `role="img" aria-label="{owner name}"`, not interactive.
Running indicator (`3 RUNNING`) is not rendered in Phase 2 (no agents; D-08). Mobile: logo tile 22, breadcrumb, spacer, search icon button 44, bell 44.

### CommandBar (SH l.124; DS l.200)
Floating, absolute bottom 20 centred in `<main>`, `width: min(680px, 100%)`, padding 0 24, `pointer-events` only on children. Three suggestion chips above (h26, padding 0 10, radius 999, border .08, bg `rgba(17,19,24,.85)` + blur 10, text-2 12px; hover text `text` + border `rgba(139,140,255,.4)`): "What needs my attention?", "Plan my week", "Find events this weekend". Bar is a `<button aria-label="Ask LifeOS anything">` h52, padding 0 10 0 16, radius 14, border `rgba(139,140,255,.22)`, bg `rgba(17,19,24,.82)` + `backdrop-filter: blur(18px) saturate(140%)`, `shadow-float`, 9px diamond with `lo-pulse 2.6s`, placeholder "Ask LifeOS anything…" 14.5px text-3, `Ctrl J` Kbd (radius 6, padding 4/7). No mic (nested control; no voice feature).
| State | Style |
|---|---|
| rest | as above |
| hover | border `rgba(139,140,255,.45)` |
| focus-visible | border `rgba(139,140,255,.6)`, bg `rgba(17,19,24,.95)`, `--ring-input` plus 2px outline |
| hidden | while AI panel open, and below 720 |
Click opens AIPanel and focuses the composer. Chip click opens the panel with that prompt submitted (yields the not-connected InlineError, D-05).

### CommandPalette (SH l.309; D-06)
`role="dialog" aria-modal="true" aria-label="Command palette"`, centred at top 12vh, `width: min(680px, 94vw)`, radius 16, bg `rgba(18,20,26,.97)`, border .1, `shadow-palette`, enter `lo-rise 160ms`. Backdrop `rgba(5,6,9,.6)` + blur 3px, fade 120ms, click closes.
- Header 56: `search` 20 text-3, input (16px, transparent, `role="combobox" aria-expanded="true" aria-controls aria-activedescendant aria-autocomplete="list"`, placeholder "Search pages or type a command…", `aria-label="Search pages or type a command"`), `ESC` Kbd.
- No scope tabs in Phase 2 (D-06). Keep Tab reserved: no-op while only one scope exists.
- List `role="listbox"`, max-height `min(420px, 52vh)`, padding 6/8/10. Groups with `role="group"` + label (Mono 10.5/.08em text-3, padding 10/10/6). Row: h40, padding 0 10, radius 8, gap 12; icon tile 26 (radius 7, bg `rgba(255,255,255,.04)`, border .06); label 13.5; hint Mono 11 text-3; `↵` glyph Mono 11 visible only on selected.
- Row states: default transparent · selected (`aria-selected="true"`, bg `rgba(139,140,255,.12)`, icon `#a5a6ff`, `↵` shown) · hover moves selection (mousemove).
- Empty query: group **Commands** (Open notifications · Ask LifeOS `Ctrl J` · Toggle compact sidebar `Ctrl \` · Sign out) then **Jump to** (Home … Agents with `Alt 1–9` hints, Approvals, Settings `Ctrl ,`). Toggle compact sidebar is omitted below 1100.
- Typed query: top group **Ask LifeOS** with one row `Ask LifeOS: "{query}"` (icon `auto_awesome`, hint `assistant`), then substring-filtered Commands and Jump to (max 4 per group). Selection resets to the first row on input.
- No match among commands/pages: the Ask row is still shown, plus the line "No commands or pages match. Press ↵ to ask LifeOS instead." (13px text-2, centred, padding 28/16).
- Footer: Mono 11 text-3 `↑↓ navigate` `↵ open` `esc close`, spacer, `Ctrl J ask LifeOS` in `#a5a6ff`.
- Running Ask: closes palette, opens AI panel, submits the query (InlineError result).

### AIPanel shell (SH l.150; D-05)
`<aside aria-label="LifeOS assistant">` width `min(440px, 92vw)`, left border .07, bg `linear-gradient(180deg, rgba(20,21,30,.98), rgba(13,14,19,.98))`, enter `lo-slide 200ms`. Docked and non-modal >= 1100; overlay + backdrop (modal) 720–1100; full-screen sheet < 720.
- Header 56: 9px diamond, "LifeOS" 14/500, sub-label Mono 10/.08em text-3 `ORCHESTRATOR · NOT CONNECTED`; `New conversation` (edit_square 30px, clears local turns) and `Close assistant` (close 30px) icon buttons (text-3, hover fill-2 + text).
- Body scrolls; empty state: H2 "What should we look at?" + Small body: "The assistant isn't connected yet. When it is, you can plan, search and delegate to your agents from here. Anything that sends, publishes or deletes will wait for your approval." Then Mono label `EXAMPLES` and four suggestion rows (padding 10/12, radius 9, border .07, bg fill-1, 13.5px, 17px indigo icon; hover border `rgba(139,140,255,.35)` + bg `rgba(139,140,255,.06)`): `priority_high` "What needs my attention?" · `event_note` "Plan my week" · `travel_explore` "Find events this weekend" · `edit_note` "Prepare my LinkedIn post".
- Turn (client state only, cleared on reload, fade .25s, padding 20, bottom border .05): `YOU · HH:mm` (Mono 10/.08em text-3) + prompt 16px/1.4, then the AI-not-connected InlineError. No ExecutionTrace, no ResultCard, no fake progress (D-05).
- Composer (padding 12/14/14, top border .06): container radius 12, border `rgba(139,140,255,.25)`, bg fill-1, padding 10/10/8/12; `textarea` rows 2, 14/1.45, `aria-label="Message LifeOS"`, placeholder "Ask LifeOS anything…", autofocus on open; container shows focus via `:focus-within` (border `rgba(139,140,255,.6)` + ring), textarea itself has no outline. Footer row: Mono 10.5 text-3 "↵ send · ⇧↵ newline · actions need approval"; mic button 30px **disabled** (`aria-disabled`, title "Voice input isn't available yet", text-4 icon, no hover); send 30px radius 8, enabled = bg `#8b8cff` + icon `#0b0c10` (+ `shadow-glow-ai`), disabled (empty) = bg fill-3, `aria-label="Send"`.
- Esc inside the panel closes it and returns focus to the opener.

### NotificationsDrawer (SH l.266; D-12..D-16)
`role="dialog" aria-modal="true" aria-labelledby`, right-anchored, `width: min(420px, 94vw)` (100vw below 720), bg `#101217`, left border .08, `shadow-drawer`, enter `lo-slide 200ms`; backdrop `rgba(5,6,9,.45)` fade 150ms, click closes; focus trap; focus returns to the opener (bell or nav item).
- Header 56 (padding 0 12 0 20): "Notifications" 15/500, `Mark all read` ghost 28px (12.5px; disabled when no unread), close 30px.
- Filter row (D-13), padding 8/12, horizontally scrollable, `role="group" aria-label="Filter by category"`: pill chips h28, radius 999, 12.5px. `All` plus one chip per category that currently has items; the whole row is hidden when fewer than two categories are present. Selected: border `rgba(139,140,255,.5)`, bg `rgba(139,140,255,.12)`, text `text`, `aria-pressed="true"`. Unselected: border `rgba(255,255,255,.1)`, text-2. Single-select, default All.
- List (scrolls, padding 8/12/24). Groups in order NOW · TODAY · EARLIER, label Mono 500 10.5/.08em text-3, padding 6/8, margin-top 12; items newest first. Grouping rule: NOW = (unread and category URGENT/IMPORTANT) or created within the last 60 min; TODAY = created today (Australia/Sydney) and not NOW; EARLIER = the rest. Empty groups are omitted.
- Row (NotificationRow): grid 28px icon tile + content, gap 10, padding 12, radius 10, border 1px.
| State | Style |
|---|---|
| unread + important (URGENT/IMPORTANT) | bg `rgba(255,255,255,.035)`, border `rgba(255,255,255,.08)`, title weight 600, icon tile bg `tone @ 13%` |
| unread normal | transparent bg/border, title 400, icon tile bg `rgba(255,255,255,.04)`, tone icon |
| read | opacity .6 on the whole row |
| new (arrived live) | `lo-in 450ms`, then static |
Content: title 13.5px (wraps) + right group (Badge tag for category, Mono 10.5 time); body 12.5px text-2 / 1.45; action row (gap 4, wrap, margin-top 4): primary action (Button xs primary, label from the notification, default "Open", navigates to `actionUrl`, closes drawer, marks read) when `actionUrl` present · `Mark read`/`Mark unread` · `Snooze` (opens SnoozeMenu) · `Dismiss`. Secondary actions: h26, padding 0 8, radius 6, border .08, 12px text-2, hover text. Each row also exposes a visually-hidden "Unread"/"Read" prefix for screen readers. Time format: today `HH:mm`; within 7 days short weekday (`Mon`); older `7 Oct`.
- States: loading (three Skeleton rows) · error · empty · filter-empty (see Copywriting). Optimistic updates for read/snooze/dismiss; on server failure revert and show an error toast.
- Snoozed items disappear and are excluded from the unread count; when `snoozedUntil` passes they reappear with the `new` state (no toast).

### SnoozeMenu (D-14)
Popover anchored to the row's Snooze button, rendered in a portal at the drawer level (the list scroller would clip it), z 80, flips upward near the bottom. `role="menu"`; items `role="menuitem"`, h32, padding 0 10, radius 6, 12.5px; hover/arrow-focus bg fill-2; each item shows the resolved time right-aligned in Mono 11 text-3. Panel: bg `raised`, border .1, radius 10, padding 4, min-width 200, `shadow-toast`, enter `lo-rise 160ms`.
Items (all computed in Australia/Sydney): `1 hour` (now+1h, shows `HH:mm`) · `Tonight` (today 18:00; omitted when now >= 18:00) · `Tomorrow` (09:00, shows `Thu 09:00`). Keys: ↑↓ move, Enter select, Esc closes the menu only (not the drawer) and returns focus to the Snooze button; first item focused on open; click outside closes. Selecting shows toast "Snoozed until {label}".

### Toast (SH l.142; DS l.190)
Persistent live region `role="status" aria-live="polite"` always mounted; message swaps in. Desktop: fixed bottom 24 / right 24. Below 720: bottom `calc(var(--bottombar-h) + env(safe-area-inset-bottom) + 12px)`, centred, `max-width: calc(100vw - 32px)`. Padding 11/14, radius 10, bg `raised`, border .1, `shadow-toast`, 13px, icon 18px (`check_circle` green for success, `error` red for error), enter `lo-rise 200ms`. Auto-dismiss 2.6s (errors 5s); a new toast replaces the current one and restarts the timer. One at a time, no stacking, no action buttons.

### StatusTile (HM l.19; D-08)
Link tile or static tile. `min-width: 132px`, padding 12/14, radius 12, border `rgba(255,255,255,.07)`, bg `rgba(17,19,24,.7)`, column gap 6. Key row: 6px dot + Mono 500 10/.08em text-3 label. Value 15/500 text. Hover (links only): border `rgba(255,255,255,.16)`. Tiles wrap (`flex-wrap`, gap 8); below 720 they are a 3-up row that scrolls horizontally if narrow, each 44px+ tall.
| Tile | Key | Value | Dot | Target |
|---|---|---|---|---|
| Agents | `AGENTS` | `0 running` | indigo | `/agents` |
| Approvals | `APPROVALS` | `0 waiting` | amber | `/approvals` |
| System | `SYSTEM` | `Healthy` / `Degraded` / `Down` / `Unknown` | green / amber / red / text-3 | static (no link) |
Singular/plural: `1 running`, `1 waiting`. The design's `NEXT` tile is removed (no data). Values update from health events over SSE; `Unknown` if health could not be read.

### ActivityItem (HM l.87; D-11)
Grid `44px 26px minmax(0,1fr)`, gap 10, padding 10, radius 9. Time Mono 500 11 text-3 (padding-top 5, `HH:mm` Sydney); icon tile 26 (radius 7, bg `rgba(255,255,255,.04)`, 15px icon in source colour); source Mono 500 10.5/.05em UPPER in source colour; title 13px text (1.4); detail Mono 11 text-3, single-line ellipsis.
| State | Style |
|---|---|
| default | transparent |
| entering (live-arrived only, not initial load) | `lo-in 450ms ease`, bg `rgba(139,140,255,.05)` that transitions to transparent after 4s |
Container: `role="log" aria-live="polite" aria-relevant="additions"`, radius 14, border .07, bg `surface`, padding 6, max-height 520, `overflow: hidden`, shows the 8 newest. Section header: `LIVE ACTIVITY` label + 6px dot (green + `lo-pulse-g 2s` when connected; amber static + label `RECONNECTING` when SSE is down) + hairline + pause control (Mono 500 10.5 text-2, `aria-pressed`): `PAUSE` / `RESUME`; while paused new events are buffered and the control reads `RESUME · {n} NEW`; resume flushes them in order.

### EmptyState (DS l.151; D-07)
Padding 26/20, radius 14, border `1px dashed rgba(255,255,255,.12)`, column gap 8. Icon 26px `text-4` (decorative, `aria-hidden`), title 15px text, body 13px text-2 / 1.5, optional action (Button sm, primary) with margin-top 6. Props: `icon, title, body, action?`. Used as-is for every Home section and every placeholder page. In Home it fills the section's slot (replaces the grid/list). Phase 2 default: no action button (D-07 allows none); section header links (`Open calendar →`, `All projects →`, `Agent command →`) are the routes to real pages and are always rendered.

### InlineError (DS l.173; D-05)
`role="alert"`, radius 14, border `rgba(240,122,110,.3)`, bg `linear-gradient(180deg, rgba(240,122,110,.08), rgba(240,122,110,.02))`, padding 18, column gap 10. Label row: Mono 500 10.5/.1em red + 17px icon (`link_off` or `error`) e.g. `ERROR · ORCHESTRATOR`; title 15/500; three rows 13px text-2 / 1.5 with a `text`-coloured lead-in ("What happened: ", "Why: ", "What to do: "); optional action button (Button `inverse`, h32). Props: `label, icon, title, what, why, fix, action?`. Inside the AI panel it renders full width with padding 14.

### Button (replaces `src/ui/button.tsx`; DS l.273, l.93–101)
Props: `variant` primary|secondary|ghost|destructive|ai|inverse, `size` xs|sm|md|touch, `loading`, standard button attrs. Always `type="button"` unless set. Font 13px/500 (12.5 for xs/sm), `inline-flex items-center justify-center gap-2`.
| Variant | Rest | Hover | Loading |
|---|---|---|---|
| primary | bg `#8b8cff`, text `#0b0c10`, no border | bg `#a5a6ff` | opacity .85 + 12px spinner (`rgba(11,12,16,.25)` ring, `#0b0c10` top) `lo-spin .7s` |
| secondary | bg fill-1, border `rgba(255,255,255,.10)`, text `text` | bg fill-2→`rgba(255,255,255,.06)`, border `rgba(255,255,255,.2)` | spinner `rgba(255,255,255,.2)` ring |
| ghost | transparent, 1px transparent border, text `text-2` | bg fill-2, text `text` | as secondary |
| destructive | transparent, border `rgba(240,122,110,.3)`, text `#f07a6e`, UPPERCASE tracked label | bg `rgba(240,122,110,.08)`, border `rgba(240,122,110,.5)` | spinner `rgba(240,122,110,.25)` |
| ai | bg `rgba(139,140,255,.10)`, border `rgba(139,140,255,.35)`, text `#c7c8ff` | bg `rgba(139,140,255,.18)` | n/a |
| inverse | bg `#e9eaf0`, text `#0b0c10`, 600, UPPERCASE `0.05em` | bg `#ffffff` | spinner dark |
All variants: pressed `transform: scale(.98)`; focus-visible = 2px indigo outline offset 2; disabled = bg fill-1(.04), text `text-4`, border `rgba(255,255,255,.06)`, `cursor: not-allowed`, no hover; `loading` sets `aria-busy="true"` and disables clicks while keeping layout width.
Sizes: xs h26 padding 0 10 radius 6 · sm h30 padding 0 12 radius 7 · md h34 padding 0 14 radius 9 (default) · touch h44 padding 0 16 radius 10. Icon-only buttons: square at the same height, `aria-label` required. Destructive/approval labels name the consequence, never "Confirm" (DS l.105).

### Badge (DS l.285)
Mono 600 10/1 `0.08em` UPPER, padding 3/8, text = tone, bg = tone @ 12%.
| Kind | Radius | Phase 2 use |
|---|---|---|
| status pill | 999 | health state e.g. `ONLINE` green, `DEGRADED` amber, `DOWN` red (Settings/health later; sidebar uses dot+label instead) |
| tag | 5 | notification category tag (`URGENT` red, `IMPORTANT` amber, `FYI` blue, `AGENT` indigo-text, `APPROVAL` amber, `REMINDER` green) |
| count | 999 | nav counts: Mono 500 10.5, padding 2/6 (see SidebarNavItem) |
Priority P1/P2/P3 filled variant (red `#f07a6e`, amber `#e8b86a`, neutral `rgba(255,255,255,.07)` with `#a3a6b4`, radius 5, text `#0b0c10` on fills) is defined for Phase 3 and not rendered here. Kbd is a sibling primitive: Mono 500 11 text-2, border `rgba(255,255,255,.10)`, radius 5 (6 in command bar), padding 2/6.

### Supporting
- **SectionHeader** (HM l.28): flex gap 12, Label (id for `aria-labelledby`), optional Mono 10.5 text-3 meta, 1px hairline `rgba(255,255,255,.06)` flex-1, optional right link 12.5px text-2 (hover text). Margin to content 14px.
- **PageHeader** (placeholder pages): H1 + Lead (text-2, max 640px) with 32px gap to content.
- **Skeleton** (DS l.162): `linear-gradient(90deg,#1a1d24 0%,#232631 50%,#1a1d24 100%)`, size 200% 100%, `lo-shimmer 1.4s linear infinite`, radius 4 (blocks 10). Neutral and wordless; matches final layout to avoid shift. Used in the drawer loading state and `(os)/loading.tsx`.
- **Kbd hint rendering**: SSR-safe default shows `Ctrl`/`Alt`; after mount, on Apple platforms swap to `⌘`/`⌥`.

---

## Home composition (D-07..D-11)

Focal point: the Display greeting is the primary anchor; status tiles, then sections, follow in reading order.

1. **Date line** (Label, text-3): `WEDNESDAY, OCTOBER 7 · SYDNEY · 17°C CLEAR` — Australia/Sydney, uppercase `en-AU`. Weather via Open-Meteo, server-cached 30 min; any failure renders the date only (`WEDNESDAY, OCTOBER 7`), silently. Weather code map to the word: 0 `CLEAR` · 1–2 `PARTLY CLOUDY` · 3 `CLOUDY` · 45/48 `FOG` · 51–57 `DRIZZLE` · 61–67/80–82 `RAIN` · 71–77/85–86 `SNOW` · 95–99 `STORM`. Temperature rounded, `°C`.
2. **Greeting** (Display): `Good morning` (<12:00), `Good afternoon` (<18:00), else `Good evening` (Sydney hour) + `, {first name}.`; with no name on the owner record: `Good evening.`
3. **Lead** (17px text-2, max 640): fact-first, derived from real state, the key clause in `text`. Cases: all healthy and no unread important → "Everything is quiet. **Nothing needs your attention.**" · N unread URGENT/IMPORTANT → "**{N} {item|items} need your attention.** Systems are {healthy|degraded}." (singular: "1 item needs your attention.") · health degraded/down → "**Systems are degraded.** {check} is not responding." Wording per case lives in one pure function with a test.
4. **Status tiles** (StatusTile ×3).
5. **Priorities**, **Today**, **Active projects**, **Agent activity**, **Upcoming**: EmptyState each (copy below); header meta from the design (`RANKED BY ORCHESTRATOR`, `7 ITEMS · 4 DONE`, `NEXT 6 DAYS`) is omitted when empty.
6. **Live activity**: real, SSE-fed ActivityItems.
Layout rows per Breakpoints. Section containers use `aria-labelledby`.

Activity event copy (title / Mono detail), tone colour per Activity source map:
| Event | Source | Title | Detail |
|---|---|---|---|
| sign-in | AUTH | Signed in | Owner session |
| sign-out | AUTH | Signed out | Owner session |
| failed sign-in | AUTH (red) | Failed sign-in attempt | Credentials rejected |
| worker started | SYSTEM | Worker started | v{version} |
| health degraded | SYSTEM (amber) | Health is degraded | {check} not responding |
| health restored | SYSTEM (green) | Health restored | All checks passing |
| migrations | SYSTEM | Migrations applied | {n} new |
| deploy/version change | SYSTEM | LifeOS updated to v{version} | Previous v{old} |
No IP addresses, emails or user agents in activity text.

---

## Keyboard map (Windows; Mac glyphs mirror automatically; design accepts `metaKey || ctrlKey`)

| Keys | Action | Notes |
|---|---|---|
| Ctrl+K | Toggle command palette | closes other overlays; `preventDefault` (beats browser search focus) |
| Ctrl+J | Toggle AI panel | closes palette; browser downloads shortcut is overridden when the page is focused; buttons remain as fallback |
| Ctrl+\\ | Toggle compact sidebar | no-op below 1100 |
| Alt+1 … Alt+9 | Home, Career, Socials, Outreach, Organization, Projects, Knowledge, Goals, Agents | matches by `e.code` `Digit1–9`; closes palette/drawer |
| Ctrl+, | Open Settings | hint shown on Settings nav item |
| Esc | Close the topmost overlay | order: snooze menu → palette → notifications drawer → AI panel (when focus is inside it or it is modal) |
| ↑ / ↓ | Palette: move selection; SnoozeMenu: move | wraps are not used; clamps at ends |
| Home / End | Palette: first / last row | |
| Enter | Palette: run selected, or Ask when no selection; AI composer: send | |
| Shift+Enter | AI composer: newline | |
| Tab / Shift+Tab | Standard focus order; focus trapped inside modal dialogs | palette keeps focus in the input (activedescendant) |
Ignore all shortcuts while `e.isComposing`. Ctrl+K/J work from inside inputs; Alt+digit works everywhere.

---

## Motion

All values from DS l.303–312 and SH keyframes. Everything stops under `prefers-reduced-motion` (animations removed, transitions removed); state stays conveyed by label and colour.
| Name | Trigger | Spec |
|---|---|---|
| route | page change | content opacity 0→1, 150ms, no slide |
| sidebar width | compact toggle | width 232↔64, 180ms ease |
| nav item | hover/current | bg + colour .12s |
| tooltip | compact hover/focus | `lo-fade` 120ms |
| drawer / AI panel | open | `lo-slide` translateX 16→0 + opacity, 200ms ease |
| backdrop | open | `lo-fade` 150ms (palette 120ms) |
| palette | open | `lo-rise` translateY 8→0, scale .99→1, 160ms |
| snooze menu | open | `lo-rise` 160ms |
| toast | show | `lo-rise` 200ms; lives 2.6s (errors 5s) |
| activity enter | live event | `lo-in` translateY -6→0, 450ms ease; tint clears after 4s |
| notification enter | live event | same as activity enter |
| ONLINE ring | health ok | `lo-pulse-g` 2.4s ease-out infinite (live-activity dot 2s) |
| command-bar diamond | idle | `lo-pulse` 2.6s ease-out infinite |
| skeleton | loading | `lo-shimmer` 1.4s linear infinite |
| button spinner | loading | `lo-spin` .7s linear infinite |
| conversation turn | new turn | `lo-fade` .25s |
| button press | active | scale .98, 100ms |
Not used in Phase 2 (no agents): agent ring/scan-line pulses, trace-step opacity, card hover lift.

---

## Accessibility contract

- Landmarks: skip link → `<aside aria-label="Primary">` containing `<nav aria-label="Primary">` → `<header>` (top bar) → `<main id="main">` → `<aside aria-label="LifeOS assistant">`. Mobile bottom bar is `<nav aria-label="Primary">`; the desktop sidebar is not rendered there.
- Every action keyboard-reachable (Keyboard map). Visible focus: 2px `#8b8cff` outline, offset 2, never removed. Inputs add the 3px tint ring; the AI composer and palette show focus on their container.
- Dialogs (palette, notifications drawer, MoreSheet, mobile/tablet AI panel): `role="dialog" aria-modal="true"` + label, focus moves in on open, trapped, Esc closes, focus returns to the opener. Docked AI panel is non-modal and not trapped.
- Palette follows the combobox/listbox pattern (`aria-activedescendant`, `aria-selected`, groups labelled). Filter chips use `aria-pressed`. SnoozeMenu uses `menu`/`menuitem`. Pause control uses `aria-pressed`. Nav uses `aria-current="page"`.
- Live regions: activity `role="log" aria-live="polite"`; Toast `role="status"`; InlineError `role="alert"`; SSE state change announces through the polite region ("Live updates reconnecting" / "Live updates restored", visually hidden).
- Compact-sidebar tooltips appear on focus as well as hover and are not the only name (aria-label present).
- Contrast: body >= 7:1, labels >= 4.5:1; `#4a4e5c` is decorative only (empty-state icons, separators, disabled text). Status = text + colour. Badges and dots never stand alone: counts have text, health dot has a label.
- Touch: every target 44x44 minimum below 720 and on the tablet rail; desktop dense controls 26–34px with >= 8px spacing between neighbours.
- Time: all user-visible times are Australia/Sydney 24h; `<time datetime>` with ISO value on notification and activity times.
- Reduced motion honoured globally (Motion). No information conveyed by animation alone.
- Voice: calm chief of staff, short declaratives, fact first, no exclamation marks, no emoji, no "Hello human".

---

## Copywriting Contract

Primary CTAs and labels: Home has no primary CTA. Placeholder pages have none. `Send` (icon) in the composer; `Review` / `Open` per notification action; `Try again` on retryable errors.

### AI and palette (D-05)
| Element | Copy |
|---|---|
| Command bar placeholder | Ask LifeOS anything… |
| Top bar search | Search pages or run a command |
| Palette placeholder | Search pages or type a command… |
| Palette no-match | No commands or pages match. Press ↵ to ask LifeOS instead. |
| AI panel empty heading | What should we look at? |
| AI panel empty body | The assistant isn't connected yet. When it is, you can plan, search and delegate to your agents from here. Anything that sends, publishes or deletes will wait for your approval. |
| AI status label | ORCHESTRATOR · NOT CONNECTED |
| Sidebar AI row | AI NOT CONNECTED |
| Mic tooltip (disabled) | Voice input isn't available yet |
| **InlineError on submit** | Label `ERROR · ORCHESTRATOR` · Title: **LifeOS can't answer yet.** · What happened: Your request wasn't sent anywhere. · Why: The orchestrator isn't connected. It arrives with agents in the next phase. · What to do: Nothing to fix on your side. Use the command palette to move between pages in the meantime. · Action: none |

### Notifications (D-12..D-16)
| Element | Copy |
|---|---|
| Drawer title | Notifications |
| Header action | Mark all read |
| Row actions | Mark read · Mark unread · Snooze · Dismiss |
| Snooze items | 1 hour · Tonight · Tomorrow |
| Empty heading | You're all caught up. |
| Empty body | Alerts about sign-ins, system health and agents land here. Snoozed items return at the time you chose. |
| Filter-empty heading | No {category} notifications. |
| Filter-empty body | Show all to see everything else. (Ghost sm button: `Show all`) |
| Loading | Skeleton, no copy |
| Load error | InlineError, label `ERROR · NOTIFICATIONS`, title **Notifications couldn't load.** · What happened: The list didn't come back from the server. · Why: The connection dropped or the server is busy. · What to do: Try again. Nothing was changed. · Action: `TRY AGAIN` |
| Mutation error toast | Couldn't update that notification. Try again. |
| Toasts | Snoozed until 18:00 · Snoozed until tomorrow 09:00 · Snoozed until 20:44 · All notifications marked read · Notification dismissed |
| Failed sign-in (URGENT) | **Failed sign-in attempt** — Someone entered the wrong credentials at {HH:mm}. If it wasn't you, change your password. |
| Worker down (IMPORTANT) | **Worker isn't responding** — Background jobs are paused until the worker sends a heartbeat. Last seen {HH:mm}. |
| Health degraded (IMPORTANT) | **System health is degraded** — {check} is failing. LifeOS will keep retrying. |
| Deploy (FYI) | **LifeOS updated to v{version}** — Deployed at {HH:mm}. Previous version v{old}. |

### Home empty and offline states
| Section | Icon | Title | Body | Action |
|---|---|---|---|---|
| Priorities | `priority_high` | Nothing is ranked yet. | Priorities appear here once agents are connected and have something to rank. | none |
| Today | `event_busy` | Your day isn't connected yet. | Today shows events and tasks once a calendar is connected in Organization. | none (header link `Open calendar →`) |
| Live activity (no events yet) | `lock` | No activity yet. | Sign-ins, system changes and agent work appear here as they happen. | none |
| Live activity (SSE offline, no data) | `dns` | Live updates are offline. | LifeOS keeps trying to reconnect. Recent activity appears once it does. | none |
| Active projects | `deployed_code` | No projects yet. | Projects appear here once GitHub is connected. | none (header link `All projects →`) |
| Agent activity | `memory` | No agents running. | Agents start on a schedule or when you ask. None are configured yet. | none (header link `Agent command →`) |
| Upcoming | `date_range` | Nothing upcoming. | The next six days appear here once your calendar is connected. | none |
Status tiles: `0 running`, `0 waiting`, `Healthy` / `Degraded` / `Down` / `Unknown`. Live-activity header while down: `RECONNECTING`. Section header links keep the design copy.

### Placeholder domain pages (each: PageHeader + one full-width EmptyState; D-07)
| Route | Icon | H1 / Lead | Empty title | Empty body |
|---|---|---|---|---|
| /career | `terminal` | Career · Repositories, pull requests and activity. | Career isn't set up yet. | Repositories and commit activity appear here once GitHub is connected. |
| /socials | `public` | Socials · Accounts, drafts and your content calendar. | Socials isn't set up yet. | Accounts, drafts and your content calendar appear here once a social account is connected. |
| /outreach | `hub` | Outreach · Events and email in one pipeline. | Outreach isn't set up yet. | Sydney events and email intelligence appear here once sources are connected. |
| /organization | `calendar_month` | Organization · Calendar, tasks and reminders. | Organization isn't set up yet. | Your calendar, tasks and reminders appear here once a calendar is connected. |
| /projects | `deployed_code` | Projects · Tasks, milestones and repositories together. | No projects yet. | Projects bring tasks, milestones and repositories together. They aren't built yet. |
| /knowledge | `library_books` | Knowledge · Notes, documents and bookmarks. | Knowledge is empty. | Notes, documents and bookmarks live here once Knowledge is built. |
| /goals | `flag` | Goals · From vision to tasks. | No goals yet. | Vision, goals and objectives are tracked here once Goals is built. |
| /agents | `memory` | Agents · Your autonomous workforce. | No agents configured. | Agent status, runs and cost appear here once agents are connected. |
| /approvals | `verified_user` | Approvals · Decisions agents are waiting on. | Nothing is waiting for approval. | Anything an agent wants to send, publish or delete will wait here for your decision. |
| /settings | `tune` | Settings · Connections, permissions and preferences. | Settings aren't built yet. | Connections, permissions and preferences will live here. Action: Secondary `Sign out`. |

### Errors
| Element | Copy |
|---|---|
| Route error (`(os)/error.tsx`) | InlineError, label `ERROR · PAGE`, title **This page couldn't load.** · What happened: Something went wrong while loading it. · Why: The server returned an error. · What to do: Try again. If it keeps happening, check the System tile on Home. · Action: `TRY AGAIN` (calls `reset`) |
| Live updates lost | Header label `RECONNECTING`; sidebar `RECONNECTING`; polite announcement "Live updates reconnecting." Retries with backoff 1s → 30s cap |
| Weather failure | none (date-only) |

### Destructive actions
None in Phase 2 requires a confirmation dialog: **Dismiss** is a soft delete (`dismissedAt`) and low-impact; **Mark all read** is reversible per row; **Sign out** is immediate (existing behaviour) and ends the session only. If a destructive modal is added later it follows DS l.204: radius 16, bg `#14161c`, border .1, `shadow-overlay`, Cancel (Secondary) + Destructive button naming the consequence.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable (shadcn not used) |
| third-party | none | not applicable |

---

## Open implementation notes for the planner

1. Read `node_modules/next/dist/docs/` before writing any Next code (AGENTS.md). Items to verify there: `next/font/local`, `cookies()` (sync vs async), `template.tsx`, `loading.tsx`, `error.tsx`, SSE route handler streaming, `next/link` behaviour.
2. `src/app/layout.tsx`: update `themeColor` to `#0b0c10`; add the local symbols font variable to `<html>` className.
3. Sidebar footer health, StatusTile System, Lead sentence and the date line all derive from `checkHealth()` plus the SSE health events; do not hard-code states.
4. Data this spec expects from the server: owner display name (optional), unread count, approvals count (0 until Phase 3), agents running count (0), APP_VERSION.
5. After migrating `/login` and `src/ui/button.tsx` callers to the new tokens/variants, delete the legacy `--color-bg…--color-ok` aliases.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS (note: design scale has >4 sizes by design intent)
- [ ] Dimension 5 Spacing: PASS (exceptions listed)
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
