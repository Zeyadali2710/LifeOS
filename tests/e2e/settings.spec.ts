import { expect, test } from "@playwright/test";
import { signIn } from "./owner";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("connections: five rows and empty token validation", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.locator("#main").getByText("GitHub · read access")).toBeVisible();
  await expect(page.locator("#main").getByText("GitHub · create issues")).toBeVisible();
  await expect(page.locator("#main").getByText("Anthropic API")).toBeVisible();
  await expect(page.locator("#main").getByText("Google Calendar", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#main").getByText("iCloud Calendar", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).first().click();
  await page.getByRole("button", { name: "Save token" }).click();
  await expect(page.getByText("Paste a token to continue.")).toBeVisible();
});

test("iCloud form rejects an empty app-specific password", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Connect iCloud Calendar" }).click();
  await page.getByRole("button", { name: "Save and connect" }).click();
  await expect(page.getByText("Paste the app-specific password to continue.")).toBeVisible();
});

test("spend cap saves with a toast", async ({ page }, info) => {
  // Distinct values per project: both run against one DB.
  const cap = info.project.name === "desktop" ? 40 : 41;
  await page.goto("/settings?section=ai");
  await page.getByLabel("Monthly spend cap").fill(String(cap));
  await page.getByRole("button", { name: "Save cap" }).click();
  await expect(page.getByText(`Spend cap set to US$${cap}`)).toBeVisible();
});
