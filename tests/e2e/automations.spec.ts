import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);

test("automations: create with condition and two actions, toggle, edit, delete", async ({ page }) => {
  const name = `CI watcher ${randomUUID().slice(0, 8)}`;
  await signIn(page);
  await page.goto("/automations");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Automations");
  await page.getByRole("button", { name: "New automation" }).first().click();
  const d = page.getByRole("dialog", { name: "New automation" });
  await d.getByLabel("Name").fill(name);
  await d.getByLabel("Event").selectOption("github.ci.failed");
  await d.getByRole("button", { name: "Add condition" }).click();
  await d.getByLabel("Condition 1 value").fill("main");
  await d.getByLabel("Action 1 notification title").fill("CI broke: {{event.title}}");
  await d.getByRole("button", { name: "Add action" }).click();
  await d.getByLabel("Action 2", { exact: true }).selectOption("create_task");
  await d.getByLabel("Action 2 task title").fill("Fix CI");
  await d.getByRole("button", { name: "Create" }).click();

  const card = page.getByRole("list", { name: "Automations" }).getByRole("listitem").filter({ hasText: name });
  await expect(card).toContainText("When: GitHub CI failed");
  await card.getByRole("button", { name: new RegExp(name) }).click();
  const detail = page.getByRole("region", { name: `${name} details` });
  await expect(detail).toContainText("title contains “main”");
  await expect(detail).toContainText("Send notification: “CI broke: {{event.title}}”");
  await expect(detail).toContainText("Create task “Fix CI”");

  await card.getByRole("switch", { name: `${name} enabled` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Turned off." })).toBeVisible();
  await expect(card.getByRole("switch", { name: `${name} enabled` })).not.toBeChecked();

  await detail.getByRole("button", { name: "Edit" }).click();
  const e = page.getByRole("dialog", { name: "Edit automation" });
  await e.getByLabel("Trigger type").selectOption("schedule");
  await e.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("At 08:00 Sydney, Mon, Tue, Wed, Thu, Fri");

  await detail.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog", { name: "Edit automation" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete automation" }).click();
  await expect(page.getByRole("list", { name: "Automations" }).getByText(name)).toHaveCount(0);
});

test("automations requires sign-in", async ({ page }) => {
  await page.goto("/automations");
  await expect(page).toHaveURL(/\/login/);
});
