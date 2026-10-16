import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);

test("finances requires sign-in", async ({ page }) => {
  await page.goto("/finances");
  await expect(page).toHaveURL(/\/login/);
});

test("CSV preview, repeat import, remembered category and carried monthly budget", async ({ page }, info) => {
  await signIn(page);
  const month = info.project.name === "desktop" ? "2026-02" : "2026-04";
  const followingMonth = info.project.name === "desktop" ? "2026-03" : "2026-05";
  await page.goto(`/finances?month=${month}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your money, in view.");
  const account = `test-${randomUUID().slice(0, 8)}`;
  const merchant = `Example market ${randomUUID().slice(0, 8)}`;
  const csv = `Date,Amount,Description,Balance,Category\n${month}-01,1000,Example salary,1100,Work\n${month}-02,-25,${merchant},1075,`;
  async function preview() {
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Account label").fill(account);
    await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "example.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await dialog.getByRole("button", { name: "Preview CSV" }).click();
    return dialog;
  }
  let dialog = await preview();
  await expect(dialog.getByText("2 new", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("table").getByText(merchant)).toBeVisible();
  await page.getByRole("table").getByRole("button", { name: "Needs review" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Category", { exact: true }).selectOption("Groceries");
  await dialog.getByLabel("Remember a rule for similar transactions").check();
  await dialog.getByLabel("Description keyword", { exact: true }).fill(merchant);
  await dialog.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const marketRow = page.getByRole("row").filter({ hasText: merchant });
  await expect(marketRow.getByRole("button", { name: "Groceries", exact: true })).toBeVisible();
  dialog = await preview();
  await expect(dialog.getByText("2 confirmed duplicates", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "budgets", exact: true }).click();
  await page.getByLabel("Groceries monthly budget in AUD", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Save Groceries budget", exact: true }).click();
  await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /Groceries/ }) })).toContainText("$175.00 left");
  await page.getByLabel("Month", { exact: true }).fill(followingMonth);
  await expect(page.getByLabel("Groceries monthly budget in AUD", { exact: true })).toHaveValue("200.00");
  await expect(page.getByText(/No transactions have been imported for this month/)).toBeVisible();
  await page.getByLabel("Month", { exact: true }).fill(month);
  await expect(page.getByText(/No transactions have been imported for this month/)).not.toBeVisible();
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(month);
  await page.getByRole("button", { name: "overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Where the money went" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Where the money went" })).toContainText("$25.00");
  await page.screenshot({ path: `test-results/finances-${info.project.name}.png`, fullPage: true });
  await page.getByRole("heading", { name: "Where the money went" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/finances-charts-${info.project.name}.png`, fullPage: true });
});
