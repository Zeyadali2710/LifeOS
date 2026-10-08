import { expect, test } from "@playwright/test";
import { signIn } from "./owner";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("connections: three rows and empty token validation", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("GitHub · read access")).toBeVisible();
  await expect(page.getByText("GitHub · create issues")).toBeVisible();
  await expect(page.getByText("Anthropic API")).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).first().click();
  await page.getByRole("button", { name: "Save token" }).click();
  await expect(page.getByText("Paste a token to continue.")).toBeVisible();
});

test("spend cap saves with a toast", async ({ page }, info) => {
  // Distinct values per project: both run against one DB.
  const cap = info.project.name === "desktop" ? 40 : 41;
  await page.goto("/settings?section=ai");
  await page.getByLabel("Monthly spend cap").fill(String(cap));
  await page.getByRole("button", { name: "Save cap" }).click();
  await expect(page.getByText(`Spend cap set to US$${cap}`)).toBeVisible();
});
