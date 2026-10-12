import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { insertNotification, signIn } from "./owner";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const uid = () => randomBytes(4).toString("hex");
const bell = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Notifications/ });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Notifications" });
const row = (page: Page, title: string) => drawer(page).getByRole("listitem").filter({ hasText: title });
const unreadCount = async (page: Page) => Number(/(\d+) unread/.exec((await bell(page).getAttribute("aria-label")) ?? "")?.[1] ?? 0);

// Insert after the SSE stream is up (hydration + connection), then open the drawer.
async function openWith(page: Page, title: string, extra: Partial<Parameters<typeof insertNotification>[0]> = {}) {
  await expect(page.getByRole("banner")).toBeVisible();
  await insertNotification({ category: "URGENT", title, ...extra });
  await expect(async () => {
    if (!(await drawer(page).isVisible())) await bell(page).click();
    await expect(row(page, title)).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test("live badge increments and row shows in NOW with tag", async ({ page }) => {
  const title = `Disk check ${uid()}`;
  const base = await unreadCount(page);
  await expect(async () => {
    await insertNotification({ category: "URGENT", title: `Probe ${uid()}` });
    expect(await unreadCount(page)).toBeGreaterThan(base);
  }).toPass({ timeout: 15_000 });
  await openWith(page, title, { actionUrl: "/settings" });
  const r = row(page, title);
  await expect(r.getByText("URGENT", { exact: true })).toBeVisible();
  await expect(drawer(page).getByRole("region", { name: "NOW" }).getByText(title)).toBeVisible();
});

test("mark read, unread, dismiss persists", async ({ page }) => {
  const title = `Read ${uid()}`;
  await openWith(page, title);
  const r = row(page, title);
  await r.getByRole("button", { name: "Mark read" }).click();
  await expect(r.getByRole("button", { name: "Mark unread" })).toBeVisible();
  await r.getByRole("button", { name: "Mark unread" }).click();
  await expect(r.getByRole("button", { name: "Mark read" })).toBeVisible();
  await r.getByRole("button", { name: "Dismiss" }).click();
  await expect(r).toHaveCount(0);
  await expect(page.getByText("Notification dismissed")).toBeVisible();
  await page.reload();
  await bell(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(row(page, title)).toHaveCount(0);
});

test("snooze via keyboard hides the row; snoozed-until-soon reappears", async ({ page }) => {
  const title = `Snooze ${uid()}`;
  await openWith(page, title);
  const r = row(page, title);
  await r.getByRole("button", { name: "Snooze" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /1 hour/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Tomorrow/ })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(r).toHaveCount(0);
  await expect(page.getByText(/Snoozed until/)).toBeVisible();

  const later = `Wake ${uid()}`;
  await insertNotification({ category: "FYI", title: later, snoozedUntil: new Date(Date.now() + 3000) });
  await page.reload();
  await bell(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(row(page, later)).toHaveCount(0);
  await expect(row(page, later)).toBeVisible({ timeout: 10_000 });
});

test("Open follows safe actionUrl; unsafe renders no Open", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const safe = `Safe ${uid()}`;
  const evil = `Evil ${uid()}`;
  await insertNotification({ category: "IMPORTANT", title: evil, actionUrl: "//evil.example" });
  await openWith(page, safe, { actionUrl: "/settings" });
  await expect(row(page, evil)).toBeVisible();
  await expect(row(page, evil).getByRole("button", { name: "Open" })).toHaveCount(0);
  await row(page, safe).getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(drawer(page)).toBeHidden();
});

test("category filter and mark all read", async ({ page }) => {
  const fyi = `Fyi ${uid()}`;
  const imp = `Imp ${uid()}`;
  await insertNotification({ category: "IMPORTANT", title: imp });
  await openWith(page, fyi, { category: "FYI" });
  await expect(row(page, imp)).toBeVisible();
  const group = drawer(page).getByRole("group", { name: "Filter by category" });
  await group.getByRole("button", { name: "FYI" }).click();
  await expect(group.getByRole("button", { name: "FYI" })).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, imp)).toHaveCount(0);
  await expect(row(page, fyi)).toBeVisible();
  await group.getByRole("button", { name: "All" }).click();
  await expect(row(page, imp)).toBeVisible();

  await drawer(page).getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("All notifications marked read")).toBeVisible();
  await expect(row(page, imp).getByRole("button", { name: "Mark unread" })).toBeVisible();
  await expect(row(page, fyi).getByRole("button", { name: "Mark unread" })).toBeVisible();
});

test("desktop: Esc closes and returns focus to the bell", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await openWith(page, `Esc ${uid()}`);
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
  await expect(bell(page)).toBeFocused();
});

test("mobile: bell opens a floating sheet; bell reopens it after close", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await openWith(page, `Sheet ${uid()}`);
  const box = await drawer(page).boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) - 25);
  await drawer(page).getByRole("button", { name: "Close notifications" }).click();
  await expect(drawer(page)).toBeHidden();
  await bell(page).click();
  await expect(drawer(page)).toBeVisible();
});
