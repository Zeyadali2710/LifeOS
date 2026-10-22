import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("desktop: skip link, landmarks, live region", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  // Retry until hydrated: focus the document start, then Tab.
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();

  await expect(page.getByRole("banner").getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("status").and(page.locator('[aria-live="polite"]'))).toBeAttached();
});

test("desktop: palette and drawer trap focus and restore it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Search or jump" });
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await trigger.focus();
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible({ timeout: 500 });
  }).toPass();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await palette.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();

  const bell = page.getByRole("banner").getByRole("button", { name: /^Notifications/ });
  await bell.click();
  const drawer = page.getByRole("dialog", { name: /Notifications/ });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(bell).toBeFocused();
});

test("desktop: nav shortcut hint; reduced motion stops overlay animation", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Home", exact: true }).focus();
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("title", "Alt+1");

  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect.poll(() => palette.evaluate((e) => getComputedStyle(e).animationName)).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => palette.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("mobile: bottom bar is labelled and touch-sized", async ({ page }, info) => {
  test.skip(info.project.name === "desktop");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  const controls = nav.locator("a, button");
  expect(await controls.count()).toBeGreaterThan(0);
  const header = page.getByRole("banner").getByRole("button");
  for (const c of [...(await controls.all()), ...(await header.all())]) {
    const box = await c.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
