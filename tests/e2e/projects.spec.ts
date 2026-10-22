import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { deleteProject, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");
const vis = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("a workspace path with $ shows the field error and saves nothing", async ({ page }) => {
  await page.goto("/projects?new=project");
  const dlg = page.getByRole("dialog", { name: "New project" });
  await dlg.getByLabel("Name", { exact: true }).fill(`E2E bad path ${uid()}`);
  await dlg.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  try {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit project" });
    await edit.getByLabel("Workspace path").fill(String.raw`C:\code\$HOME`);
    await edit.getByRole("button", { name: "Save project" }).click();
    await expect(edit.getByText("Paths can't contain quotes, backticks, $ or line breaks.")).toBeVisible();
    await expect(edit).toBeVisible();
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await edit.getByRole("button", { name: "Discard", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(edit.getByLabel("Workspace path")).toHaveValue("");
  } finally {
    await deleteProject(projectId);
  }
});

test("project lifecycle: create, workspace, task, milestone, archive, list, home", async ({ page }, info) => {
  const id = uid();
  const name = `E2E project ${id}`;
  const path = String.raw`C:\code\e2e-${id}`;

  await page.goto("/projects?new=project");
  const dlg = page.getByRole("dialog", { name: "New project" });
  await dlg.getByLabel("Name", { exact: true }).fill(name);
  await dlg.getByLabel("Category").selectOption("technical");
  await dlg.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Edit project" });
  await workspace.getByLabel("Workspace path").fill(path);
  await workspace.getByRole("button", { name: "Save project" }).click();
  await expect(workspace).toBeHidden();
  await expect(page.getByText("WORKSPACE · OWNER ONLY", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy launch command" })).toBeVisible();
  await expect(page.getByText(`$ cd "${path}" && claude`, { exact: false })).toBeVisible();

  // Context notes: empty state, edit, survive a name-only edit.
  const note = `Context note ${id}`;
  await expect(vis(page, "No context yet. Add it in Edit.")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edlg = page.getByRole("dialog", { name: "Edit project" });
  await edlg.getByLabel("Context", { exact: true }).fill(note);
  await edlg.getByRole("button", { name: "Save project" }).click();
  await expect(edlg).toBeHidden();
  await expect(vis(page, note)).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await edlg.getByLabel("Name", { exact: true }).fill(`${name} b`);
  await edlg.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${name} b`);
  await expect(vis(page, note)).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await edlg.getByLabel("Name", { exact: true }).fill(name);
  await edlg.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // Task with the project preselected.
  const task = `E2E task ${id}`;
  await page.getByRole("button", { name: "+ Add task", exact: true }).click();
  const tdlg = page.getByRole("dialog", { name: /task/i });
  await expect(tdlg.getByLabel("Project", { exact: true }).getByRole("option", { selected: true })).toHaveText(name);
  await tdlg.getByLabel("Title").fill(task);
  await tdlg.getByRole("button", { name: "Add task" }).click();
  await expect(vis(page, task)).toBeVisible();

  // Milestone.
  const ms = `E2E milestone ${id}`;
  await page.getByRole("button", { name: "+ Add milestone", exact: true }).click();
  const mdlg = page.getByRole("dialog", { name: "New milestone" });
  await mdlg.getByLabel("Title").fill(ms);
  await mdlg.getByRole("button", { name: "Add milestone" }).click();
  await expect(vis(page, ms)).toBeVisible();

  // Archive / unarchive.
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible();

  // The project row still shows its category.
  await page.goto("/projects");
  await page.getByRole("searchbox", { name: "Search projects" }).fill(name);
  await expect(page.getByRole("region", { name: "All projects", exact: true }).getByRole("link", { name: new RegExp(name) })).toContainText("Technical");
  await expect(page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first()).toBeVisible();

  // Home (desktop only: Projects shows at most 3, as in the redesigned summary).
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
