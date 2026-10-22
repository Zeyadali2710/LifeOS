import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { deleteApprovalRun, insertApproval, insertWriteConnection, removeWriteConnection, readApproval, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");

const seeded: string[] = [];
const seed = async (title: string) => {
  const id = await insertApproval({ title });
  seeded.push(id);
  return id;
};
test.afterAll(async () => {
  for (const id of seeded) await deleteApprovalRun(id);
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

// Desktop owns the github_write connection state (disabled -> enabled); mobile only exercises the reject path,
// so the two projects can run concurrently against the shared DB.
test("desktop: pending approval, edit validation, missing token, create issue", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "owns the write-connection state; mobile covers reject");
  await removeWriteConnection();
  const title = `Fix flaky login ${uid()}`;
  const id = await seed(title);
  await page.goto(`/approvals?id=${id}`);

  await expect(page).toHaveURL(new RegExp(`/agents\\?view=approvals&id=${id}$`));
  await expect(page.getByRole("tab", { name: /^Pending/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: new RegExp(title) })).toHaveAttribute("aria-selected", "true");
  const detail = page.getByRole("region", { name: "Approval detail" });
  await expect(detail.getByText(/^. AWAITING YOUR APPROVAL$/)).toBeVisible();
  await expect(detail.getByRole("heading", { name: `Create issue “${title}”` })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(detail.getByText(/issues-write token isn't connected/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "View", exact: true }).getByRole("link", { name: /Approvals/ })).toContainText(/\d+/);

  await insertWriteConnection();
  await page.reload();
  const d = page.getByRole("region", { name: "Approval detail" });
  await expect(d.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();

  await d.getByLabel("Issue title", { exact: true }).fill("");
  await d.getByRole("button", { name: "Approve with edits", exact: true }).click();
  await expect(d.getByText("Title is required.")).toBeVisible();
  await d.getByLabel("Issue title", { exact: true }).fill(`${title} edited`);
  await expect(d.getByRole("button", { name: "Approve with edits", exact: true })).toBeEnabled();
  await expect(d.getByRole("heading", { name: `Create issue “${title} edited”` })).toBeVisible();

  await d.getByRole("button", { name: "Approve with edits", exact: true }).click();
  // No worker in e2e: the decision commits and the footer leaves the pending state.
  await expect(d.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
  await expect(d.getByRole("status").filter({ hasText: "Approved · running" })).toBeVisible();
  const stored = await readApproval(id);
  expect(stored.status).toBe("approved");
  expect(stored.edited).toMatchObject({ title: `${title} edited` });
  await removeWriteConnection();
});

test("reject shows the rejected footer", async ({ page }) => {
  const title = `Reject me ${uid()}`;
  const id = await seed(title);
  await page.goto(`/approvals?id=${id}`);
  const d = page.getByRole("region", { name: "Approval detail" });
  await expect(d.getByRole("heading", { name: `Create issue “${title}”` })).toBeVisible();
  await d.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(d.getByText(/^Rejected at /)).toBeVisible();
  await expect(d.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
});
