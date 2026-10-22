import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E_DB_URL, seedHeartbeat, signIn } from "./owner";
import { createDb } from "@/server/db/client";
import { importFinance } from "@/server/finance";
import { eq } from "drizzle-orm";
import { financeImports } from "@/server/db/schema";

test.beforeAll(seedHeartbeat);
const chartAccounts: string[] = [];
test.afterEach(async () => {
  if (!chartAccounts.length) return;
  const conn = createDb(E2E_DB_URL);
  try { for (const account of chartAccounts.splice(0)) await conn.db.delete(financeImports).where(eq(financeImports.account, account)); }
  finally { await conn.pool.end(); }
});

test("finances requires sign-in", async ({ page }) => {
  await page.goto("/finances");
  await expect(page).toHaveURL(/\/login/);
});

test("overview ranges, three trend charts, monthly values and spending category toggles", async ({ page }, info) => {
  const account = `charts-${randomUUID().slice(0, 8)}`;
  chartAccounts.push(account);
  const conn = createDb(E2E_DB_URL);
  try {
    await importFinance(conn.db, 'Date,Amount,Description,Category\n2024-11-01,500,Old pay,Work\n2025-10-01,100,Earlier pay,Work\n2026-01-01,2000,Pay,Work\n2026-03-01,-100,Market,Groceries\n2026-05-01,-50,Home,Rent\n2026-08-01,1000,Pay,Work\n2026-08-02,-200,Save,Savings\n2026-08-03,-100,Market,Groceries\n2026-09-01,-50,Dinner,Delivery\n2026-10-01,50,Savings withdrawal,Savings\n2026-10-02,-20,Market,Groceries', account, 'charts.csv', false);
  } finally { await conn.pool.end(); }
  await signIn(page);
  await page.goto(`/finances?month=2026-10&range=3m&account=${account}`);
  const range = page.getByRole("radiogroup", { name: "Overview time range", exact: true });
  await expect(range.getByRole("radio", { name: "3m", exact: true })).toBeChecked();
  const savings = page.getByText("Savings · cumulative", { exact: true }).locator("..");
  const net = page.getByText("Net cash flow · monthly", { exact: true }).locator("..");
  const cumulative = page.getByText("Cash flow · cumulative", { exact: true }).locator("..");
  const spending = page.getByRole("heading", { name: "Where the money went", exact: true }).locator("..").locator("..").locator("..");
  await expect(savings.getByRole("img")).toHaveAccessibleName(/\$150\.00 at the end/);
  await expect(cumulative.getByRole("img")).toHaveAccessibleName(/\$680\.00 at the end/);
  if (info.project.name === "desktop") {
    const boxes = await Promise.all([savings, net, cumulative].map(p => p.boundingBox()));
    expect(new Set(boxes.map(b => Math.round(b!.y))).size).toBe(1);
  }
  for (const [chart, month, amount] of [[net, "Oct 26", "$30.00"], [savings, "Oct 26", "$150.00"], [cumulative, "Sept 26", "$650.00"]] as const) {
    await chart.getByText("View values", { exact: true }).click();
    await expect(chart.getByText(month, { exact: true }).locator("..")).toContainText(amount);
  }
  const income = page.getByRole("heading", { name: "Income and spending", exact: true }).locator("..").locator("..").locator("..");
  const august = income.getByRole("button", { name: /Aug 26: income/ });
  if (info.project.name === "desktop") await august.hover(); else await august.tap();
  await expect(income.getByRole("status")).toContainText("Income $1,000.00");
  const groceries = spending.getByRole("checkbox", { name: /Groceries/, exact: false });
  await expect(groceries.locator("..").locator("..")).toContainText("$120.00");
  await groceries.uncheck();
  await expect(spending.getByRole("checkbox", { name: /Delivery/ })).toBeChecked();
  await expect(spending.getByText("Selected $50.00 of spending", { exact: true })).toBeVisible();
  await expect(groceries).not.toBeChecked();
  await spending.getByRole("button", { name: "Hide all", exact: true }).click();
  await expect(spending.getByText("Selected $0.00 of spending", { exact: true })).toBeVisible();
  await spending.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(spending.getByText("Selected $170.00 of spending", { exact: true })).toBeVisible();
  for (const [label, months] of [["6m", 6], ["1yr", 12], ["All time", 24]] as const) {
    await range.getByRole("radio", { name: label, exact: true }).click();
    await expect(range.getByRole("radio", { name: label, exact: true })).toBeChecked();
    await expect(income.getByRole("group", { name: /^Monthly income and spending\./ }).getByRole("button")).toHaveCount(months);
  }
  await range.getByRole("radio", { name: "3m", exact: true }).click();
  await expect(income.getByRole("group", { name: /^Monthly income and spending\./ }).getByRole("button")).toHaveCount(3);
  await savings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/finance-trends-${info.project.name}.png` });
});

test("CSV preview, repeat import, remembered category and carried monthly budget", async ({ page }, info) => {
  await signIn(page);
  const month = info.project.name === "desktop" ? "2026-02" : "2026-04";
  const followingMonth = info.project.name === "desktop" ? "2026-03" : "2026-05";
  await page.goto(`/finances?month=${month}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Finances");
  const account = `test-${randomUUID().slice(0, 8)}`;
  const merchant = `Example market ${randomUUID().slice(0, 8)}`;
  const csv = `Date,Amount,Description,Balance,Category\n${month}-01,1000,Example salary,1100,Work\n${month}-02,-25,${merchant},1075,`;
  async function preview() {
    await page.getByRole("button", { name: "Import CSV", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Account label").fill(account);
    await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "example.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await dialog.getByRole("button", { name: "Preview CSV" }).click();
    return dialog;
  }
  let dialog = await preview();
  await expect(dialog.getByText("new rows", { exact: true }).locator("..")).toHaveText("2new rows");
  await expect(dialog.getByRole("table", { name: "CSV import preview" }).getByRole("row").filter({ hasText: "Ready" })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Confirm import" }).click();
  await expect(dialog.getByRole("status")).toContainText("Imported 2 transactions");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const transactions = page.getByRole("table", { name: "Imported transactions", exact: true });
  await expect(transactions.getByText(merchant)).toBeVisible();
  const marketRow = transactions.getByRole("row").filter({ hasText: merchant });
  await marketRow.getByLabel(`Category for ${merchant}`, { exact: true }).selectOption("Groceries");
  await marketRow.getByLabel("Remember for future imports").check();
  await marketRow.getByLabel("Description keyword", { exact: true }).fill(merchant);
  await marketRow.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(marketRow.getByRole("button", { name: "Save category", exact: true })).toBeHidden();
  await expect(marketRow.getByLabel(`Category for ${merchant}`, { exact: true })).toHaveValue("Groceries");
  dialog = await preview();
  await expect(dialog.getByText("duplicates skipped", { exact: true }).locator("..")).toHaveText("2duplicates skipped");
  await expect(dialog.getByRole("table", { name: "CSV import preview" }).getByRole("row").filter({ hasText: "duplicate" })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Budgets", exact: true }).click();
  await page.getByLabel("Groceries monthly budget in AUD", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Save Groceries budget", exact: true }).click();
  await expect(page.getByLabel("Groceries monthly budget in AUD", { exact: true }).locator("..").locator("..").locator("..")).toContainText("$175.00 left");
  await page.getByLabel("Month", { exact: true }).fill(followingMonth);
  await expect(page.getByLabel("Groceries monthly budget in AUD", { exact: true })).toHaveValue("200.00");
  await expect(page.getByText(/No transactions imported for this month/)).toBeVisible();
  await page.getByLabel("Month", { exact: true }).fill(month);
  await expect(page.getByText(/No transactions imported for this month/)).not.toBeVisible();
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(month);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Where the money went" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where the money went" }).locator("..").locator("..").locator("..")).toContainText("$25.00");
  await page.screenshot({ path: `test-results/finances-${info.project.name}.png`, fullPage: true });
  await page.getByRole("heading", { name: "Where the money went" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/finances-charts-${info.project.name}.png`, fullPage: true });
});
