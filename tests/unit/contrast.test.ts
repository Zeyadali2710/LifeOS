import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/tokens.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("@media"));
const token = (name: string) => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found in :root`);
  return m[1]!;
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lum = ([r, g, b]: RGB) => {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const on = (fg: string, bg: string) => ratio(hex(token(fg)), hex(token(bg)));

// README accessibility bar: text contrast >= 4.5:1 on every surface text sits on.
describe("Almanac token contrast (WCAG 2.x)", () => {
  const surfaces = ["paper", "paper-2", "paper-3"];
  const text = ["ink", "ink-body", "ink-2", "ink-3", "accent", "status-working", "status-approval", "status-failed", "status-merged"];
  it.each(surfaces.flatMap((bg) => text.map((fg) => [fg, bg])))("%s on %s >= 4.5", (fg, bg) => {
    expect(on(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
  });

  // Wash (tracks, tags, hover) only carries ink and ink-2 text; ink-3 (4.497) and accent (4.07) stay off it.
  it.each([["ink", "wash"], ["ink-2", "wash"]])("%s on %s >= 4.5", (fg, bg) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["status-working", "status-working-bg"],
    ["status-approval", "status-approval-bg"],
    ["status-failed", "status-failed-bg"],
    ["status-merged", "status-merged-bg"],
    ["paper", "ink"],
  ])("%s on %s >= 4.5", (fg, bg) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("white on the approval badge >= 4.5", () => {
    expect(ratio([255, 255, 255], hex(token("status-approval")))).toBeGreaterThanOrEqual(4.5);
  });

  it("accent focus ring on paper >= 3", () => {
    expect(on("accent", "paper")).toBeGreaterThanOrEqual(3);
  });
});
