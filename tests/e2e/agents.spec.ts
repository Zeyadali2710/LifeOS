import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { insertRun, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("lists orchestrator + 10 domain agents, 8 honestly not connected (Organization live)", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.getByRole("heading", { name: "Your autonomous workforce." })).toBeVisible();
  const cards = page.getByRole("region", { name: "Agents" }).getByRole("link");
  await expect(cards).toHaveCount(11);
  await expect(cards.filter({ hasText: "Not connected" })).toHaveCount(8);
  await expect(cards.filter({ hasText: "Projects" })).not.toContainText("Not connected");
  await expect(cards.filter({ hasText: "Organization" })).not.toContainText("Not connected");
});

test("seeded run shows tokens, cost, latency and opens its detail", async ({ page }, info) => {
  const prompt = `What is happening ${uid()}`;
  const id = await insertRun({ prompt });
  await page.goto("/agents");
  const link = info.project.name === "desktop" ? page.locator(`a[href="/agents/runs/${id}"]`).first() : page.getByRole("link").filter({ hasText: prompt });
  if (info.project.name === "desktop") {
    const row = page.getByRole("row").filter({ hasText: prompt });
    await expect(row).toContainText("US$");
    await expect(row).toContainText("1.5k");
    await expect(row).toContainText("4.2s");
  } else {
    await expect(link).toContainText("US$");
    await expect(link).toContainText("1 tools");
  }
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/agents/runs/${id}$`));
  await expect(page.getByText("TOOL CALLS", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^(\d+ )?github\.list_repos READ/ }).click();
  await expect(page.getByRole("button", { name: "Copy input" })).toBeVisible();
});

// ponytail: "No runs yet." is not asserted here; desktop and mobile share the DB so run counts are racy.
test("an unconnected agent says so", async ({ page }) => {
  await page.goto("/agents/home");
  await expect(page.getByText("Home isn't connected yet.")).toBeVisible();
});
