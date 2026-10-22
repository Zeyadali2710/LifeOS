import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);

test("briefings: schedule in settings, build now, open and list", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings?section=briefings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await page.getByLabel("Midday check-in time").fill("13:15");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Briefing schedule saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Midday check-in time")).toHaveValue("13:15");

  await page.goto("/briefings");
  await page.getByLabel("Briefing to build").selectOption("evening");
  await page.getByRole("button", { name: "Build one now", exact: true }).click();
  await expect(page).toHaveURL(/\/briefings\?id=[0-9a-f-]{36}$/);
  const briefingId = new URL(page.url()).searchParams.get("id")!;
  const detail = page.getByRole("article", { name: "Evening wrap-up" });
  await expect(detail.getByText(/tasks? done today\.$/)).toBeVisible();
  await expect(detail.getByRole("region", { name: "Done today" })).toBeVisible();
  await page.goto("/briefings");
  const entry = page.getByRole("list", { name: "Recent briefings" }).getByRole("link", { name: /^Evening/ }).and(page.locator(`a[href="/briefings?id=${briefingId}"]`));
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(/tasks? done today\./);
  await entry.click();
  await expect(page).toHaveURL(`/briefings?id=${briefingId}`);
  await expect(detail).toBeVisible();
});
