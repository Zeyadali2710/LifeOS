import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);

test("briefings: schedule in settings, build now, open and list", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings?section=briefings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Briefings");
  await page.getByLabel("Midday check-in time").fill("13:15");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Briefing schedule saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Midday check-in time")).toHaveValue("13:15");

  await page.goto("/briefings");
  await page.getByRole("region", { name: "Build a briefing now" }).getByRole("button", { name: "Evening wrap-up" }).click();
  await expect(page).toHaveURL(/\/briefings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/tasks? done today\.$/);
  await expect(page.getByRole("region", { name: "Done today" })).toBeVisible();
  await page.getByRole("link", { name: "← All briefings" }).click();
  await expect(page.getByRole("list", { name: "Recent briefings" }).getByText("Evening wrap-up").first()).toBeVisible();
});
