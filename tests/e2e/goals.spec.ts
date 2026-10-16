import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { E2E_DB_URL, seedHeartbeat, signIn } from "./owner";
import { createDb } from "@/server/db/client";
import { goals, projects, tasks } from "@/server/db/schema";

test.beforeAll(seedHeartbeat);
const goalTitles: string[] = [], projectIds: string[] = [];
test.afterEach(async () => {
  const conn = createDb(E2E_DB_URL);
  try {
    if (goalTitles.length) await conn.db.delete(goals).where(inArray(goals.title, goalTitles.splice(0)));
    for (const id of projectIds.splice(0)) { await conn.db.delete(tasks).where(eq(tasks.projectId, id)); await conn.db.delete(projects).where(eq(projects.id, id)); }
  } finally { await conn.pool.end(); }
});

test("goals requires sign-in", async ({ page }) => {
  await page.goto("/goals");
  await expect(page).toHaveURL(/\/login/);
});

test("goal → objective → linked project → task tick, horizon target and vision", async ({ page }) => {
  const u = randomUUID().slice(0, 8);
  const goal = `Launch LifeOS ${u}`, objective = `Ship 0.9 ${u}`, project = `LifeOS 0.9 ${u}`;
  goalTitles.push(goal, `${goal} edited`);
  const conn = createDb(E2E_DB_URL);
  try {
    const [p] = await conn.db.insert(projects).values({ name: project }).returning({ id: projects.id });
    projectIds.push(p!.id);
    await conn.db.insert(tasks).values([{ title: `Finish migration ${u}`, projectId: p!.id }, { title: `Write spec ${u}`, projectId: p!.id }]);
  } finally { await conn.pool.end(); }

  await signIn(page);
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const gd = page.getByRole("dialog", { name: "New goal" });
  await gd.getByLabel("Goal").fill(goal);
  await gd.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByRole("button", { name: `Goal ${goal}`, exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Add objective" }).click();
  const od = page.getByRole("dialog", { name: "New objective" });
  await od.getByLabel("Objective").fill(objective);
  const soon = new Date(Date.now() + 86_400_000 * 40).toISOString().slice(0, 10);
  await od.getByLabel("Target date (optional)").fill(soon);
  await od.getByLabel("Manual progress % (optional)").fill("150");
  await od.getByRole("button", { name: "Add objective" }).click();
  await expect(od.getByRole("alert")).toHaveText("Progress must be a whole number from 0 to 100.");
  await od.getByLabel("Manual progress % (optional)").fill("");
  await od.getByRole("button", { name: "Add objective" }).click();
  await expect(page.getByRole("button", { name: `Objective ${objective}`, exact: true })).toBeVisible();

  const tree = page.getByRole("region", { name: "Goal tree" });
  await tree.getByLabel("Project to link").selectOption({ label: project });
  await tree.getByRole("button", { name: "Link", exact: true }).click();
  await expect(tree.getByRole("button", { name: `Project ${project}`, exact: true })).toBeVisible();
  const taskBox = tree.getByRole("checkbox", { name: `Finish migration ${u}` });
  await taskBox.check();
  await expect(taskBox).toBeChecked();
  await expect(tree.getByRole("button", { name: `Project ${project}`, exact: true })).toContainText("50%");
  await expect(tree.getByRole("button", { name: `Objective ${objective}`, exact: true })).toContainText("▲ rising");

  const tabs = page.getByRole("tablist", { name: "Horizon" });
  for (const h of ["THIS WEEK", "THIS MONTH", "THIS YEAR", "LONG TERM"]) {
    await tabs.getByRole("tab", { name: h }).click();
    const has = await page.getByRole("region", { name: `${h} targets` }).getByText(objective).count();
    if (has) { await expect(page.getByRole("region", { name: `${h} targets` }).getByText("50%")).toBeVisible(); break; }
  }

  await page.getByRole("button", { name: "Edit vision" }).click();
  await page.getByRole("textbox", { name: "Vision" }).fill(`Leverage over my own life ${u}`);
  await page.getByRole("button", { name: "Save vision" }).click();
  await expect(page.getByRole("region", { name: "Long-term vision" })).toContainText(`Leverage over my own life ${u}`);

  await page.getByRole("button", { name: `Edit goal ${goal}` }).click();
  const ed = page.getByRole("dialog", { name: "Edit goal" });
  await ed.getByRole("button", { name: "Delete" }).click();
  await ed.getByRole("button", { name: "Delete goal" }).click();
  await expect(page.getByRole("button", { name: `Goal ${goal}`, exact: true })).toHaveCount(0);
});
