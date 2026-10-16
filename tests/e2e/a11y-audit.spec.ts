import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

// axe-core ships with eslint-plugin-jsx-a11y (via eslint-config-next); injected per page, no extra dependency.
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const PAGES = ["/", "/career", "/socials", "/outreach", "/organization", "/projects", "/knowledge", "/goals", "/finances", "/agents", "/approvals", "/briefings", "/automations", "/settings", "/settings?section=briefings"];
type Violation = { id: string; impact: string | null; help: string; nodes: { target: string[] }[] };

test.beforeAll(seedHeartbeat);

test("no serious or critical WCAG 2 A/AA violations on any signed-in page", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  const found: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.addScriptTag({ path: AXE });
    const v = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Violation[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return r.violations.filter((x) => x.impact === "serious" || x.impact === "critical").map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.slice(0, 3).map((n) => ({ target: n.target })) }));
    }) as Violation[];
    for (const x of v) found.push(`${path} [${x.impact}] ${x.id}: ${x.help} → ${x.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  }
  expect(found).toEqual([]);
});
