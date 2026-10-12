import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("@media"));
const token = (name: string) => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found in :root`);
  return m[1];
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lum = ([r, g, b]: RGB) => {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Backdrops from 04.1-UI-SPEC "Text tiers"
const card = hex("#202022");
const panelWorst: RGB = [34, 40, 50];
const chromeWorst: RGB = [49, 70, 92]; // rgb(49,70,92)
const solidMenu = hex("#232326");

const on = (fg: string, bg: RGB) => ratio(hex(token(fg)), bg);

describe("Glass token contrast (WCAG 2.x)", () => {
  it.each([
    ["text", card], ["text-soft", card], ["text-2", card], ["text-3", card],
    ["text", panelWorst], ["text-soft", panelWorst], ["text-2", panelWorst], ["text-3", panelWorst],
    ["text", chromeWorst], ["text-soft", chromeWorst], ["cyan", chromeWorst], ["amber", chromeWorst], ["green", chromeWorst],
    ["text-3", solidMenu],
  ] as [string, RGB][])("%s on %j >= 4.5", (fg, bg) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("white on accent-solid >= 4.5", () => {
    expect(ratio([255, 255, 255], hex(token("accent-solid")))).toBeGreaterThanOrEqual(4.5);
  });

  it("cyan focus ring on chrome worst >= 3", () => {
    expect(on("cyan", chromeWorst)).toBeGreaterThanOrEqual(3);
  });

  it("text-2 and text-3 fail on chrome worst (banned inside pills)", () => {
    expect(on("text-2", chromeWorst)).toBeLessThan(4.5);
    expect(on("text-3", chromeWorst)).toBeLessThan(4.5);
  });
});
