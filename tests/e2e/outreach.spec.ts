import { expect, test } from "@playwright/test";
import { signIn } from "./owner";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("outreach page renders the EVENTS tab and honest empty state", async ({ page }) => {
  await page.goto("/outreach");
  await expect(page.getByRole("heading", { name: "Outreach", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /EVENTS/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: "Filter by interest" })).toBeVisible();
});

test("?import=1 opens the import dialog once and shows the field error", async ({ page }) => {
  await page.goto("/outreach?import=1");
  const dlg = page.getByRole("dialog", { name: "Import an event" });
  await expect(dlg).toBeVisible();
  await expect(page).toHaveURL(/\/outreach$/);
  await dlg.getByLabel("Event page URL").fill("not a url");
  await dlg.getByRole("button", { name: "Import event" }).click();
  await expect(dlg.getByText("Enter a full https:// address.")).toBeVisible();
});

test("unknown event id shows the not-found state", async ({ page }) => {
  await page.goto("/outreach/events/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
  await page.goto("/outreach/events/nope");
  await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
});

test("pipeline view shows the empty state or the five columns", async ({ page }) => {
  await page.goto("/outreach?view=pipeline");
  await expect(page.getByText(/saved events by stage/)).toBeVisible();
});
