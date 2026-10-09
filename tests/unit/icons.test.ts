import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "@/ui/icon-names";

const files = (readdirSync("src", { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));

describe("icon subset", () => {
  it("is sorted, unique and has the 69 spec names", () => {
    expect([...ICONS]).toEqual([...ICONS].sort());
    expect(new Set(ICONS).size).toBe(ICONS.length);
    expect(ICONS.length).toBe(69);
  });

  it("covers every icon literal used in src", () => {
    const re = /(?:<Icon[^>]*?\bname=|\bicon=|\bicon:\s*)["']([a-z_]+)["']/g;
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(join("src", f), "utf8").matchAll(re)) used.add(m[1]!);
    expect([...used].filter((n) => !(ICONS as readonly string[]).includes(n))).toEqual([]);
  });

  it("ships a real woff2 of sane size", () => {
    const p = "src/app/fonts/material-symbols-outlined.woff2";
    const size = statSync(p).size;
    expect(size).toBeGreaterThan(5000);
    expect(size).toBeLessThan(60000);
    expect(readFileSync(p).subarray(0, 4).toString("latin1")).toBe("wOF2");
  });
});
