import { expect, test } from "@playwright/test";
import { deleteApprovalRun, insertApproval, seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("home shows date line, greeting, honest counts and digest sections", async ({ page }) => {
  // A pending item keeps this test on the dashboard rather than the disconnected state.
  const id = await insertApproval({ title: `Home digest ${test.info().project.name} ${Date.now()}` });
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ada\. .+/);
    await expect(page.locator("#main").getByText(/^[A-Z]+ \d{1,2} [A-Z]+ \u00b7 SYDNEY \u00b7 \d{1,2}:\d{2} AE[DS]T/)).toBeVisible();
    await expect(page.locator("#main").getByText(/^[1-9]\d* waiting on you \u00b7 0 agents working \u00b7 /)).toBeVisible();
    await expect(page.getByRole("region", { name: "What matters", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Needs you \u00b7 \d+$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "The office", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Agent activity", exact: true })).toBeVisible();
    const across = page.getByRole("region", { name: "Across LifeOS", exact: true });
    await expect(across.getByRole("article", { name: /^Finances \u00b7 / })).toBeVisible();
    await expect(across.getByRole("article", { name: /^Projects \u00b7 \d+ active$/ })).toBeVisible();
    await expect(across.getByRole("article", { name: /^Outreach \u00b7 \d+ important$/ })).toBeVisible();
    await page.getByRole("region", { name: "Today", exact: true }).getByRole("link", { name: "Calendar \u2192", exact: true }).click();
    await expect(page).toHaveURL(/\/organization$/);
  } finally {
    await deleteApprovalRun(id);
  }
});
