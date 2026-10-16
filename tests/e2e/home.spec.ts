import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("home shows date line, greeting, honest tiles and empty sections", async ({ page }, info) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Ada\.$/);
  await expect(page.getByText(/^[A-Z]+, [A-Z]+ \d{1,2}( · SYDNEY · -?\d+°C( [A-Z ]+)?)?$/)).toBeVisible();
  await expect(page.getByText("0 running", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d+ waiting$/)).toBeVisible();
  await expect(page.getByText(/^(Healthy|Degraded|Down|Unknown)$/)).toBeVisible();
  // Real digest sections; content depends on what other specs seeded into the shared e2e database.
  await expect(page.getByRole("region", { name: "Priorities" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live activity" })).toBeVisible();

  if (info.project.name === "mobile") {
    await expect(page.getByRole("region", { name: "Upcoming" })).toBeHidden();
    return;
  }
  await expect(page.getByRole("region", { name: "Upcoming" })).toBeVisible();
  await page.getByRole("link", { name: "Open calendar →" }).click();
  await expect(page).toHaveURL(/\/organization$/);
});
