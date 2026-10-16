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

test("overview ranges, three trend charts, point values and spending category toggles", async ({ page }, info) => {
  const account = `charts-${randomUUID().slice(0, 8)}`;
  chartAccounts.push(account);
  const conn = createDb(E2E_DB_URL);
  try {
    await importFinance(conn.db, 'Date,Amount,Description,Category\n2024-11-01,500,Old pay,Work\n2025-10-01,100,Earlier pay,Work\n2026-01-01,2000,Pay,Work\n2026-03-01,-100,Market,Groceries\n2026-05-01,-50,Home,Rent\n2026-08-01,1000,Pay,Work\n2026-08-02,-200,Save,Savings\n2026-08-03,-100,Market,Groceries\n2026-09-01,-50,Dinner,Delivery\n2026-10-01,50,Savings withdrawal,Savings\n2026-10-02,-20,Market,Groceries', account, 'charts.csv', false);
  } finally { await conn.pool.end(); }
  await signIn(page);
  await page.goto(`/finances?month=2026-10&range=3m&account=${account}`);
  const range = page.getByRole("group", { name: "Overview time range", exact: true });
  await expect(range.getByRole("button", { name: "3m", exact: true })).toHaveAttribute("aria-pressed", "true");
  const savings = page.getByRole("region", { name: "Cumulative savings", exact: true });
  const net = page.getByRole("region", { name: "Net cash flow by month", exact: true });
  const cumulative = page.getByRole("region", { name: "Cumulative cash flow", exact: true });
  const spending = page.getByRole("region", { name: "Where the money went", exact: true });
  await expect(savings.getByRole("paragraph").filter({ hasText: /^\$150\.00$/ })).toBeVisible();
  await expect(cumulative.getByRole("paragraph").filter({ hasText: /^\$680\.00$/ })).toBeVisible();
  if (info.project.name === "desktop") {
    const boxes = await Promise.all([savings, net, cumulative].map(p => p.boundingBox()));
    expect(new Set(boxes.map(b => Math.round(b!.y))).size).toBe(1);
  }
  const netPoint = net.getByRole("button", { name: "Oct 26: Net cash flow by month $30.00", exact: true });
  if (info.project.name === "desktop") await netPoint.hover(); else await netPoint.tap();
  await expect(net.getByRole("tooltip")).toContainText("$30.00");
  await savings.getByRole("button", { name: "Oct 26: Cumulative savings $150.00", exact: true }).focus();
  await expect(savings.getByRole("tooltip")).toContainText("$150.00");
  await cumulative.getByRole("button", { name: "Sept 26: Cumulative cash flow $650.00", exact: true }).focus();
  await expect(cumulative.getByRole("tooltip")).toContainText("$650.00");
  const income = page.getByRole("region", { name: "Income and spending", exact: true });
  const august = income.getByRole("button", { name: /Aug 26: income/ });
  if (info.project.name === "desktop") await august.hover(); else await august.tap();
  await expect(income.getByRole("tooltip")).toContainText("Income: $1,000.00");
  await spending.getByRole("button", { name: "Groceries: $120.00", exact: true }).focus();
  await expect(spending.getByRole("tooltip")).toContainText("$120.00");
  await spending.getByRole("checkbox", { name: "Include Groceries", exact: true }).uncheck();
  await expect(spending.getByRole("checkbox", { name: "Include Delivery", exact: true })).toBeChecked();
  await expect(spending.getByRole("group", { name: "Spending by category chart" })).toContainText("$50.00");
  await expect(spending.getByRole("button", { name: "Groceries: $120.00", exact: true })).toHaveCount(0);
  await spending.getByRole("button", { name: "Hide all", exact: true }).click();
  await expect(spending.getByRole("group", { name: "Spending by category chart" })).toContainText("$0.00");
  await spending.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(spending.getByRole("group", { name: "Spending by category chart" })).toContainText("$170.00");
  for (const [label, months] of [["6m", 6], ["1yr", 12], ["All time", 24]] as const) {
    await range.getByRole("button", { name: label, exact: true }).click();
    await expect(range.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(income.getByRole("button")).toHaveCount(months);
  }
  await range.getByRole("button", { name: "3m", exact: true }).click();
  await expect(income.getByRole("button")).toHaveCount(3);
  await savings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/finance-trends-${info.project.name}.png` });
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
