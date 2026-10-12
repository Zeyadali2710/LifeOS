import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");
const vis = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a workspace path with $ shows the field error and creates nothing", async ({ page }) => {
  await page.goto("/projects?new=project");
  const dlg = page.getByRole("dialog", { name: "New project" });
  await dlg.getByLabel("Name", { exact: true }).fill(`E2E bad path ${uid()}`);
  await dlg.getByLabel("Workspace path").fill("C:\code\$HOME");
  await dlg.getByRole("button", { name: "Create project" }).click();
  await expect(dlg.getByText("Paths can't contain quotes, backticks, $ or line breaks.")).toBeVisible();
  await expect(dlg).toBeVisible(); // dialog stays open; the ?new param is dropped on open by design
});

test("project lifecycle: create, workspace, task, milestone, archive, list, home", async ({ page }, info) => {
  const id = uid();
  const name = `E2E project ${id}`;
  const path = `C:\code\e2e-${id}`;

  await page.goto("/projects?new=project");
  const dlg = page.getByRole("dialog", { name: "New project" });
  await dlg.getByLabel("Name", { exact: true }).fill(name);
  await dlg.getByLabel("Category").selectOption("technical");
  await dlg.getByLabel("Workspace path").fill(path);
  await dlg.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("CLAUDE CODE WORKSPACE").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy launch command" })).toBeVisible();
  await expect(page.getByText(`cd "${path}" && claude`, { exact: true })).toBeVisible();

  // Task with the project preselected.
  const task = `E2E task ${id}`;
  await page.getByRole("button", { name: "New task" }).click();
  const tdlg = page.getByRole("dialog", { name: /task/i });
  await expect(tdlg.getByLabel("Project", { exact: true })).toContainText(name);
  await tdlg.getByLabel("Title").fill(task);
  await tdlg.getByRole("button", { name: "Add task" }).click();
  await expect(vis(page, task)).toBeVisible();

  // Milestone.
  const ms = `E2E milestone ${id}`;
  await page.getByRole("button", { name: "Add milestone" }).click();
  const mdlg = page.getByRole("dialog", { name: "Add milestone" });
  await mdlg.getByLabel("Title").fill(ms);
  await mdlg.getByRole("button", { name: "Add milestone" }).click();
  await expect(vis(page, ms)).toBeVisible();

  // Archive / unarchive.
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: "Archive project" }).click();
  await expect(vis(page, "This project is archived.")).toBeVisible();
  await page.getByRole("button", { name: "Unarchive project" }).click();
  await expect(vis(page, "This project is archived.")).toHaveCount(0);

  // Index card under its category chip.
  await page.goto("/projects");
  await page.getByRole("button", { name: /^Technical/ }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first()).toBeVisible();

  // Home (desktop only: Active projects shows at most 4, newest-first is not guaranteed on mobile runs).
  if (info.project.name === "desktop") {
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first()).toBeVisible();
  }
});

test("non-uuid project id 404s", async ({ page }) => {
  await page.goto("/projects/not-a-uuid");
  // loading.tsx streams the response, so Next keeps HTTP 200 and renders the not-found page (with noindex).
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
