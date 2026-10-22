import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { insertRun, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("lists orchestrator + 11 agents, 3 honestly not connected", async ({ page }) => {
  await page.goto("/agents?view=table");
  await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
  const rows = page.getByRole("grid", { name: "All agents" }).getByRole("row").filter({ has: page.getByRole("gridcell") });
  await expect(rows).toHaveCount(12);
  await expect(rows.filter({ hasText: "Not connected" })).toHaveCount(3);
  for (const name of ["Projects", "Organization", "Outreach", "Social", "Finance"]) {
    await expect(rows.filter({ has: page.getByRole("gridcell", { name, exact: true }) })).not.toContainText("Not connected");
  }
});

test("seeded run shows tokens, cost, latency and opens its detail", async ({ page }) => {
  const prompt = `What is happening ${uid()}`;
  const id = await insertRun({ prompt });
  await page.goto("/agents?view=runs");
  const row = page.getByRole("grid", { name: "Runs", exact: true }).getByRole("row").filter({ hasText: prompt });
  await expect(row).toContainText("4.2s");
  await expect(row.getByRole("gridcell", { name: "1", exact: true })).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/agents\\?view=runs&run=${id}$`));
  const detail = page.getByRole("complementary", { name: "Run detail" });
  await expect(detail).toContainText(prompt);
  await expect(detail).toContainText("US$0.042");
  await expect(detail).toContainText("1.5k tokens");
  await expect(detail).toContainText("4.2s");
  await expect(detail.getByText("TRACE · TOOL CALLS AND ROUTE STEPS", { exact: true })).toBeVisible();
  await expect(detail.getByText("github.list_repos", { exact: true })).toBeVisible();
  await expect(detail.getByText("0 repos", { exact: true })).toBeVisible();
});

// shortcut: run counts are not asserted; desktop and mobile share the database.
test("an unconnected agent says so", async ({ page }) => {
  await page.goto("/agents/home");
  await expect(page).toHaveURL(/\/agents\?[^#]*id=home/);
  await expect(page.getByRole("complementary", { name: "Selected agent" })).toContainText("Not connected");
});
