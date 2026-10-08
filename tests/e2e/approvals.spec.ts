import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { deleteApprovalRun, insertApproval, insertWriteConnection, removeWriteConnection, signIn } from "./owner";

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

  // Next can keep a hidden copy of the route during transitions; assert on the visible heading only.
  await expect(page.getByText(/decisions? (is|are) waiting on you\./).filter({ visible: true })).toBeVisible();
  const detail = page.getByRole("article", { name: "Approval detail" });
  await expect(detail.getByText("WHAT WILL HAPPEN")).toBeVisible();
  await expect(detail.getByText(title).first()).toBeVisible();
  await expect(detail.getByRole("button", { name: "CREATE ISSUE" })).toBeDisabled();
  await expect(detail.getByText(/issues-write token is missing/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Approvals, \d+ waiting$/ }).first()).toBeAttached();

  await insertWriteConnection();
  await page.reload();
  const d = page.getByRole("article", { name: "Approval detail" });
  await expect(d.getByRole("button", { name: "CREATE ISSUE" })).toBeEnabled();

  await d.getByRole("button", { name: "EDIT" }).click();
  await d.getByLabel("Title").fill("");
  await d.getByRole("button", { name: "DONE" }).click();
  await expect(d.getByText("Title is required.")).toBeVisible();
  await d.getByLabel("Title").fill(`${title} edited`);
  await d.getByRole("button", { name: "DONE" }).click();
  await expect(d.getByText("EDITED", { exact: true })).toBeVisible();
  await expect(d.getByText("View agent's original")).toBeVisible();

  await d.getByRole("button", { name: "CREATE ISSUE" }).click();
  // No worker in e2e: the decision commits and the footer leaves the pending state.
  await expect(d.getByRole("button", { name: "CREATE ISSUE" })).toHaveCount(0);
  await expect(d.getByRole("status").filter({ hasText: /Creating the issue|Issue created/ })).toBeVisible();
  await removeWriteConnection();
});

test("reject shows the rejected footer", async ({ page }) => {
  const title = `Reject me ${uid()}`;
  const id = await seed(title);
  await page.goto(`/approvals?id=${id}`);
  const d = page.getByRole("article", { name: "Approval detail" });
  await expect(d.getByText(title).first()).toBeVisible();
  await d.getByRole("button", { name: "REJECT" }).click();
  await expect(d.getByText(/^Rejected at /)).toBeVisible();
  await expect(d.getByRole("button", { name: "REJECT" })).toHaveCount(0);
});
