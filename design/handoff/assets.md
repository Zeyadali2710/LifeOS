# Asset inventory and generation prompts

All art is pixel art on a **2:1 isometric grid (tile 32 × 16 px)**, delivered as transparent PNG at **1×** native size; the app scales by whole numbers. The outline is 1 px `#2a2420` and there is no anti-aliasing. Light comes from the top-left. Use the day palette from `pixelkit.js → PAL.day`. Art never contains text.

Every prompt below assumes this shared style preamble:

> Isometric pixel art, 2:1 dimetric projection, crisp 1-pixel dark brown outline (#2a2420), no anti-aliasing, no gradients, limited warm palette (floor #dacfba, walls #e6ddcc, wood #c09265, plants #6a9a5c), soft top-left light, transparent background, calm cosy studio mood, no text or logos.

## Characters — 9 sheets

- **Frame:** 10 × 16 px, anchored bottom-centre.
- **Sheet:** 8 columns × 6 rows = 80 × 96 px PNG.
- **Rows:**
  1. working (typing, 2 frames)
  2. needs approval (raised hand wave, 2 frames)
  3. failed (slumped, 2 frames)
  4. idle (holding mug, 2 frames)
  5. paused (eyes closed, 1 frame)
  6. offline (empty chair, 1 frame)

Extra columns are reserved for walk cycles later.

| id | Look | Prompt suffix |
|---|---|---|
| orchestrator | short dark hair, indigo sweater | “a calm team lead in an indigo sweater” |
| projects | curly auburn hair, orange shirt | “a builder with curly auburn hair and an orange overshirt” |
| organization | long black hair, green top | “an organised planner with long black hair and a green top” |
| outreach | yellow cap, blue jacket | “a friendly connector in a yellow cap and blue jacket” |
| social | long dark-purple hair, pink top | “a creator with long dark hair and a pink top” |
| finance | grey hair, glasses, teal cardigan | “a careful accountant with grey hair, glasses and a teal cardigan” |
| knowledge | navy hair, glasses, purple sweater | “a librarian with glasses and a purple sweater” |
| goals | curly red hair, mustard top | “a coach with curly red hair and a mustard top” |
| automations | robot, steel body, antenna | “a small friendly steel robot with a red antenna light and visor eyes” |

Each prompt is: preamble + suffix + “, sprite sheet, 6 rows: typing at a keyboard; waving one hand to ask a question; slumped with smoke from the monitor; holding a mug; eyes closed; empty chair”.

## Furniture and props

| Asset | Footprint | PNG size | Anchor | Prompt suffix |
|---|---|---|---|---|
| desk | 2 × 1 tiles, 9 px high | 48 × 33 | front-left corner of the top face | “a light oak desk with a monitor and keyboard, monitor screen as a flat separate layer” |
| monitor screen overlay | — | 10 × 9 | monitor front face | 5 tinted states: working teal #8fd3c2, approval amber #f0c46a, failed red #e46a55, idle grey #6f7f86, off #3d3c3a |
| chair | 0.5 × 0.5 tiles, 15 px high | 16 × 23 | floor centre | “a sage-green office chair seen from behind” |
| plant | 0.5 × 0.5 tiles | 16 × 22 | pot base centre | “a terracotta pot with a leafy plant” |
| server rack | 0.9 × 0.6 tiles, 30 px high | 24 × 44 | floor centre | “a dark grey server rack with small green status LEDs (LEDs as a separate 2-frame overlay)” |
| pin board | wall-mounted | 56 × 24 | wall baseline | “a cork board with three sticky notes (yellow, coral, green)” |
| window | wall-mounted | 70 × 26 | wall baseline | “a two-pane window with a pale sky, daytime” |
| speech bubbles | — | 9 × 10 each | bottom tip | 5 glyphs: working dots (3 frames), !, ×, II, blank |
| selection ring | 3 × 2.6 tiles | 96 × 42 | floor centre | dashed accent #c2462b ring, 4-frame march, plus a solid variant |

## Rooms

| Asset | Size | Notes |
|---|---|---|
| office floor + walls | 12 × 9 tiles; canvas 364 × 256 at 1× | Floor checker (#dacfba / #d3c7b0), left wall with board, back wall with 2 windows. Desks are placed by code, so leave the floor empty. |
| avatar background | 14 × 14 | Flat `#ebe4d6`, used for list avatars. Crop rows 0–11 of the character frame. |

## Delivery

- **Location:** `public/pixel/{characters,props,rooms}/<id>.png`, plus `manifest.json` listing each file's size, anchor and frame counts.
- **Check before merging:** at 2× and 3×, every sprite lands on whole pixels, and the outline stays 1 px.
