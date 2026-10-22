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

test("goal to objective to linked project, task progress, horizon target and vision", async ({ page }) => {
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
  const goalSection = page.getByRole("region", { name: goal, exact: true });
  await expect(goalSection).toBeVisible();

  await goalSection.getByRole("button", { name: "Add objective" }).click();
  const od = page.getByRole("dialog", { name: "New objective" });
  await od.getByLabel("Objective").fill(objective);
  const soon = new Date(Date.now() + 86_400_000 * 40).toISOString().slice(0, 10);
  await od.getByLabel("Target date (optional)").fill(soon);
  await od.getByLabel("Manual progress % (optional)").fill("150");
  await od.getByRole("button", { name: "Add objective" }).click();
  await expect(od.getByRole("alert")).toHaveText("Progress must be a whole number from 0 to 100.");
  await od.getByLabel("Manual progress % (optional)").fill("");
  await od.getByRole("button", { name: "Add objective" }).click();
  const openObjective = goalSection.getByRole("button", { name: `Open objective ${objective}`, exact: true });
  await expect(openObjective).toBeVisible();
  await openObjective.click();
  const detail = page.getByRole("dialog", { name: objective, exact: true });
  await detail.getByLabel("Project to link").selectOption({ label: project });
  await detail.getByRole("button", { name: "Link project", exact: true }).click();
  await expect(detail.getByRole("link", { name: `${project} →`, exact: true })).toBeVisible();
  const taskBox = detail.getByRole("checkbox", { name: `Finish migration ${u}` });
  await taskBox.check();
  await expect(taskBox).toBeChecked();
  await expect(detail.getByRole("progressbar", { name: `${project}: 50%`, exact: true })).toHaveAttribute("aria-valuenow", "50");
  await expect(detail.getByText("Rising", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await expect(goalSection.getByRole("progressbar", { name: `${objective}: 50%`, exact: true })).toHaveAttribute("aria-valuenow", "50");

  const horizons = page.getByRole("radiogroup", { name: "Horizon" });
  const year = new Intl.DateTimeFormat("en", { timeZone: "Australia/Sydney", year: "numeric" }).format(new Date());
  const targetHorizon = soon.startsWith(year) ? "This year" : "Long term";
  for (const horizon of ["This week", "This month", "This year", "Long term"]) {
    const radio = horizons.getByRole("radio", { name: horizon, exact: true });
    await radio.click();
    await expect(radio).toBeChecked();
    await expect(openObjective).toHaveCount(horizon === targetHorizon ? 1 : 0);
    if (horizon === targetHorizon) await expect(goalSection.getByRole("progressbar", { name: `${objective}: 50%`, exact: true })).toHaveAttribute("aria-valuenow", "50");
  }

  const vision = `Leverage over my own life ${u}`;
  await page.getByRole("textbox", { name: "Vision", exact: true }).fill(vision);
  await page.getByRole("button", { name: "Save vision" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Vision saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Vision", exact: true })).toHaveValue(vision);

  await page.getByRole("button", { name: `Edit goal ${goal}` }).click();
  const ed = page.getByRole("dialog", { name: "Edit goal" });
  await ed.getByRole("button", { name: "Delete", exact: true }).click();
  await ed.getByRole("button", { name: "Delete goal", exact: true }).click();
  await expect(goalSection).toHaveCount(0);
});
