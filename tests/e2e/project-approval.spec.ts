import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { deleteApprovalRun, deleteProject, insertProjectApproval, insertSeededProject, readApproval, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");
const vis = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });

const seeded: string[] = [];
const projects: string[] = [];
test.afterAll(async () => {
  for (const id of seeded) await deleteApprovalRun(id);
  for (const id of projects) await deleteProject(id);
});
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

function draft(u: string) {
  return {
    name: `Studio ${u}`,
    description: "A small studio site.",
    context: `Context for ${u}: built with Next.`,
    category: "technical",
    priority: 2,
    targetDate: null,
    milestones: [
      { ref: "m1", title: `Alpha ${u}`, dueDate: null },
      { ref: "m2", title: `Beta ${u}`, dueDate: null },
    ],
    tasks: [
      { ref: "t1", title: `Draft README ${u}`, milestoneRef: "m1" },
      { ref: "t2", title: `Add tests ${u}`, milestoneRef: "m1" },
      { ref: "t3", title: `Ship it ${u}`, milestoneRef: "m2", blockedBy: ["t2"] },
    ],
    links: [{ kind: "repo", repo: "me/studio" }],
    sources: ["me/studio · README.md", "me/studio · (file list)"],
  };
}
const seed = async (u: string) => {
  const id = await insertProjectApproval({ payload: draft(u) });
  seeded.push(id);
  return id;
};
const article = (page: Page) => page.getByRole("region", { name: "Approval detail" });

test("untrusted note and preview render for a pending project draft", async ({ page }) => {
  const u = uid();
  const id = await seed(u);
  await page.goto(`/approvals?id=${id}`);
  const d = article(page);
  await expect(d.getByText(/^Drafted from repository files \(untrusted\)/)).toBeVisible();
  await expect(d.getByText("me/studio · README.md")).toBeVisible();
  await expect(d.getByText("PREVIEW")).toBeVisible();
  await expect(d.getByText(`Draft README ${u}`)).toBeVisible();
  await expect(d.getByText("LifeOS projects · 2 milestones, 3 tasks, 1 links · nothing is written to GitHub", { exact: true })).toBeVisible();
  await expect(d.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
});

test("edit removes a task and renames, approve records the edited draft", async ({ page }) => {
  const u = uid();
  const id = await seed(u);
  await page.goto(`/approvals?id=${id}`);
  const d = article(page);
  await d.getByRole("button", { name: "Edit", exact: true }).click();
  await d.getByRole("button", { name: `Remove task Draft README ${u}` }).click();
  await expect(d.getByText(`“Draft README ${u}” removed`, { exact: true })).toBeVisible();
  await expect(d.getByRole("button", { name: `Restore Draft README ${u}` })).toBeVisible();
  await d.getByLabel("Name", { exact: true }).fill(`Renamed ${u}`);
  await d.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(d.getByText("EDITED · RE-VALIDATED ON APPROVE", { exact: true })).toBeVisible();
  await d.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(d.getByRole("status").filter({ hasText: /Approved · running|Project created/ })).toBeVisible();
  await expect(d.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

  const row = await readApproval(id);
  expect(row.status).toBe("approved");
  const edited = row.edited as { name: string; tasks: { title: string }[] };
  expect(edited.name).toBe(`Renamed ${u}`);
  expect(edited.tasks.map((t) => t.title)).toEqual([`Add tests ${u}`, `Ship it ${u}`]);
});

test("removing the repo link is accepted by the server", async ({ page }) => {
  const u = uid();
  const id = await seed(u);
  await page.goto(`/approvals?id=${id}`);
  const d = article(page);
  await d.getByRole("button", { name: "Edit", exact: true }).click();
  await d.getByRole("button", { name: "Remove link me/studio" }).click();
  await d.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(d.getByText("EDITED · RE-VALIDATED ON APPROVE", { exact: true })).toBeVisible();
  await d.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(d.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const row = await readApproval(id);
  expect(row.status).toBe("approved");
  expect((row.edited as { links?: unknown[] }).links ?? []).toHaveLength(0);
});

test("executed state links to the complete project", async ({ page }) => {
  const u = uid();
  const name = `Executed ${u}`;
  const pid = await insertSeededProject({ name, context: `Seeded context ${u}`, milestone: `Seed milestone ${u}`, tasks: [`Seed task A ${u}`, `Seed task B ${u}`], repo: { id: 424243, fullName: "me/studio-seed" } });
  projects.push(pid);
  const id = await insertProjectApproval({
    payload: { ...draft(u), name },
    status: "executed",
    result: { projectId: pid, name, url: `/projects/${pid}`, counts: { milestones: 1, tasks: 2, links: 1 } },
  });
  seeded.push(id);
  await page.goto(`/approvals?id=${id}`);
  const d = article(page);
  await expect(d.getByText(new RegExp(`^Project created: ${name}\\. Approved at `))).toBeVisible();
  await d.getByRole("link", { name: "Open project" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(vis(page, `Seeded context ${u}`)).toBeVisible();
  await expect(vis(page, `Seed task A ${u}`)).toBeVisible();
  await expect(vis(page, `Seed task B ${u}`)).toBeVisible();
  await expect(vis(page, `Seed milestone ${u}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "me/studio-seed" }).filter({ visible: true })).toBeVisible();
});
