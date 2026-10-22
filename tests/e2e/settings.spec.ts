import { expect, test } from "@playwright/test";
import { signIn } from "./owner";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("connections: five rows and empty token validation", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("main").getByRole("heading", { name: "GitHub · read access", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "GitHub · create issues", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "Anthropic API", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "Google Calendar", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "iCloud Calendar", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Code", exact: true }).getByRole("button", { name: "Connect", exact: true }).first().click();
  await page.getByRole("button", { name: "Save token" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Paste a token to continue." })).toBeVisible();
});

test("iCloud form rejects an empty app-specific password", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Connect iCloud Calendar" }).click();
  await page.getByRole("button", { name: "Save and connect" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Paste the app-specific password to continue." })).toBeVisible();
});

test("spend cap saves with a toast", async ({ page }, info) => {
  // Distinct values per project: both run against one DB.
  const cap = info.project.name === "desktop" ? 40 : 41;
  await page.goto("/settings?section=ai");
  await page.getByLabel("Monthly cap US$").fill(String(cap));
  await page.getByRole("button", { name: "Save cap" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Spend cap set to US$${cap}` })).toBeVisible();
});
