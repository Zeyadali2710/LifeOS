# Working with Codex

This repo is linked to Codex. **Claude Code leads**: it owns architecture, data wiring, routing, state, accessibility, tests and merges. **Codex is the visual pair**: Claude Code hands it bounded visual work and reviews the result before merging.

## What to delegate

Good Codex tasks are self-contained, visual, and checkable against the prototype.

1. **Primitive visual pass.** Given a primitive already scaffolded in `src/ui/` (props and a11y done), match `components.md` and the prototype exactly: sizes, states, hover/focus/disabled, reduced motion.
2. **Office renderer.** Port `design/pixelkit.js` to a typed canvas module: integer scaling, depth sort by `i + j`, 4 fps loop, redraw on frame or state change only, reduced-motion frame 0. Claude Code owns the DOM desk buttons and data.
3. **Charts.** Finances (savings, net, cumulative, category breakdown), Career Insights bar chart, Home sparkline, CI strip, language bar. Plain SVG or canvas, no chart library, token colours only.
4. **Discover grid and event card.** Card, overlays, action bar states and responsive grid, from `components.md → Event card`.
5. **Career repo page visuals.** Header, tabs, file table, README card, sidebar panels, Actions table.
6. **Placeholder art.** Generate sprite sheets from `assets.md` if Codex has image tools; otherwise produce the `manifest.json` and code-drawn fallbacks at the exact sizes and anchors.
7. **Visual QA.** Screenshot a finished route at 390, 768, 924, 1280 and 1680 px next to `design/LifeOS.dc.html?route=<route>` and list every difference over 2 px, wrong token or wrapped control.

## What not to delegate

Data fetching, server actions, schema changes, approval logic, auth, routing, keyboard models and anything touching agent runs. Codex must not change those files.

## Brief template

```
Task: <one component or screen section>
Reference: design_handoff_lifeos_redesign/design/<File>.dc.html (search for "<anchor text>")
Spec: components.md → <section>; README → <section>
Tokens: tokens.css only. No raw hex, px colours or new values.
Files you may edit: <exact paths>
Files you must not edit: everything else
Props / data shape: <TypeScript type, already defined>
Acceptance:
- Matches reference at 390 / 924 / 1680 px
- Hover, focus (2 px accent ring, 2 px offset), disabled, empty states
- No text wraps inside buttons, pills, tabs or badges
- prefers-reduced-motion respected
Return: a diff plus screenshots at the three widths.
```

## Review rules for Claude Code

- Reject any diff that reuses or imports an old `src/` UI component, adds a colour or size outside `tokens.css`, or adds a dependency.
- Check the diff against `checklist.md` for that route and tick items only after both visual and keyboard checks pass.
- Re-run Codex with the specific differences rather than fixing large visual gaps by hand. Small fixes (≤ 3 lines) Claude Code can make directly.
- Keep one Codex task per PR section so reviews stay small.
