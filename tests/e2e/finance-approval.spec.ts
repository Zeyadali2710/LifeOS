import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { financeChangePlan } from "@/lib/finance-payload";
import { createDb } from "@/server/db/client";
import { agentRuns, approvals, financeCategories, toolCalls } from "@/server/db/schema";
import { prepareFinanceChanges } from "@/server/finance-agent";
import { E2E_DB_URL, seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => signIn(page));

test("Finance agent is available in the command centre", async ({ page }) => {
  await page.goto("/agents/finance");
  await expect(page).toHaveURL(/\/agents\?[^#]*id=finance/);
  const inspector = page.getByRole("complementary", { name: "Selected agent" });
  await expect(inspector.getByText("Finance", { exact: true })).toBeVisible();
  await inspector.getByText("SETTINGS · MODEL AND TOOLS", { exact: true }).click();
  await expect(inspector.getByText("finance.update", { exact: true })).toBeVisible();
});

test("owner edits a finance budget and explicitly reviews before approving", async ({ page }, info) => {
  const conn = createDb(E2E_DB_URL);
  let runId: string | undefined;
  try {
    const category = `Example category ${randomUUID().slice(0, 8)}`;
    const title = `Finance review ${info.project.name}`;
    const plan = financeChangePlan.parse({ title, categories: [{ name: category, group: "Everyday", kind: "expense" }], budgets: [{ category, month: "2026-10", cents: 20000 }] });
    const payload = await prepareFinanceChanges(conn.db, plan);
    const [run] = await conn.db.insert(agentRuns).values({ agentId: "finance", prompt: "Propose a budget", model: "claude-sonnet-5-5", status: "waiting_approval" }).returning();
    runId = run!.id;
    const [call] = await conn.db.insert(toolCalls).values({ runId, toolUseId: "finance-e2e", kind: "tool", tool: "finance.update", tier: "HIGH_RISK", status: "waiting_approval", input: { plan }, seq: 1 }).returning();
    const [a] = await conn.db.insert(approvals).values({ runId, toolCallId: call!.id, agentId: "finance", tool: "finance.update", originalPayload: payload, payloadHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) }).returning();
    await page.goto(`/approvals?id=${a!.id}`);
    const detail = page.getByRole("region", { name: "Approval detail" });
    await expect(detail.getByRole("heading", { name: title })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Apply finance changes", exact: true })).toBeDisabled();
    await detail.getByRole("button", { name: "Edit", exact: true }).click();
    await detail.getByText("Edit budgets (1)", { exact: true }).click();
    await detail.getByLabel(`${category} · 2026-10 limit in AUD`, { exact: true }).fill("125.50");
    await detail.getByRole("button", { name: "Save and review", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await detail.getByText("Budget changes (1)", { exact: true }).click();
    await expect(detail.getByText(`${category} · 2026-10: $125.50`, { exact: true })).toBeVisible();
    await detail.getByLabel("I reviewed the category replacements, transaction changes and budgets").check();
    await detail.getByRole("button", { name: "Apply finance changes", exact: true }).click();
    await expect(detail.getByRole("status")).toContainText("Applying approved finance changes");
    const [stored] = await conn.db.select().from(approvals).where(eq(approvals.id, a!.id));
    expect(stored!.status).toBe("approved");
    expect(stored!.editedPayload).toMatchObject({ plan: { budgets: [{ cents: 12550 }] } });
    // No worker in this stack: approval is recorded, but no budget/category is written before execution.
    expect(await conn.db.select().from(financeCategories).where(eq(financeCategories.name, category))).toHaveLength(0);
    await page.screenshot({ path: `test-results/finance-approval-${info.project.name}.png` });
  } finally {
    if (runId) await conn.db.delete(agentRuns).where(eq(agentRuns.id, runId));
    await conn.pool.end();
  }
});
