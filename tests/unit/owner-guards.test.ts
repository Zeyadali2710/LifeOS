import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static guard: every exported server action and every API route (except the two public ones) checks the owner
// before doing anything. Cheap to run, and it fails the moment a new action forgets the check.
const files = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).map((f) => join(dir, f)).filter((f) => /\.tsx?$/.test(f));
const slash = (f: string) => f.split("\\").join("/");

describe("owner guards", () => {
  it("every exported function in a 'use server' file calls requireOwner() first", () => {
    const missing: string[] = [];
    for (const f of files("src")) {
      const s = readFileSync(f, "utf8");
      if (!/^"use server";/m.test(s)) continue;
      const lines = s.split("\n").map((l) => l.replace(/\r$/, ""));
      lines.forEach((line, i) => {
        const name = /^export async function (\w+)/.exec(line)?.[1];
        if (!name) return;
        let j = i;
        while (j < lines.length && !/\{\s*$/.test(lines[j]!)) j++; // the header may span lines; it ends with "{"
        const first = lines.slice(j + 1).find((l) => l.trim() !== "");
        if (!first || !/^\s*await requireOwner\(\);/.test(first)) missing.push(`${slash(f)}: ${name}`);
      });
    }
    expect(missing).toEqual([]);
  });

  it("every API route checks the session, except auth and health", () => {
    const open = files("src/app/api").filter((f) => f.endsWith("route.ts")).filter((f) => !/requireOwner\(\)|auth\(\)\.api\.getSession\(/.test(readFileSync(f, "utf8")));
    expect(open.map(slash).sort()).toEqual(["src/app/api/auth/[...all]/route.ts", "src/app/api/health/route.ts"]);
  });

  it("every page under the signed-in shell requires the owner", () => {
    const pages = files("src/app/(os)").filter((f) => /page\.tsx$/.test(f));
    const gatedByLayout = /requireOwner\(\)/.test(readFileSync("src/app/(os)/layout.tsx", "utf8"));
    expect(pages.filter((f) => !gatedByLayout && !/requireOwner\(\)/.test(readFileSync(f, "utf8"))).map(slash)).toEqual([]);
  });
});
