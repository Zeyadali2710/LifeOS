import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

const ROUTES = [
  ["/career", "Career"],
  ["/socials", "Socials"],
  ["/outreach", "Outreach"],
  ["/organization", /^(Your calendar, in one place\.|Nothing scheduled\.|You're free .+\.|Your schedule is full .+\.)$/],
  ["/projects", "Projects"],
  ["/knowledge", "Knowledge"],
  ["/goals", "Goals"],
  ["/agents", "Your autonomous workforce."],
  ["/approvals", /decisions? (is|are) waiting|caught up/],
  ["/settings", "Connections"],
] as [string, string | RegExp][];

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("unauthenticated /career redirects to /login", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const p = await ctx.newPage();
  await p.goto("/career");
  await expect(p).toHaveURL(/\/login(\?|$)/);
  await ctx.close();
});

test("desktop: header nav reaches every domain page and shortcuts", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Primary" });
  const more = page.getByRole("banner").getByRole("button", { name: /^Account menu/ });
  for (const [href, name] of ROUTES) {
    if (["/knowledge", "/goals", "/settings"].includes(href)) {
      const label = href === "/knowledge" ? "Knowledge" : href === "/goals" ? "Goals" : "Settings";
      await more.click();
      await page.getByRole("menuitem", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      await more.click();
      await expect(page.getByRole("menuitem", { name: label })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      continue;
    }
    const link = nav.locator(`a[href="${href}"]`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(link).toHaveAttribute("aria-current", "page");
  }

  await page.goto("/");
  // First press can land before hydration; retry until the shortcut listener exists.
  await expect(async () => {
    if (!/\/career$/.test(page.url())) await page.keyboard.press("Alt+2");
    await expect(page).toHaveURL(/\/career$/, { timeout: 500 });
  }).toPass();

  // Compact mode is gone: Ctrl+\ changes nothing.
  await page.keyboard.press("Control+Backslash");
  await expect(page).toHaveURL(/\/career$/);
  await expect(nav).toBeVisible();

  // Account menu (avatar) is keyboard operable and holds Sign out.
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(more).toBeFocused();
});

test("mobile: tab bar and More reach domain pages", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await expect(page.getByRole("banner").getByRole("navigation", { name: "Primary" })).toBeHidden();
  const bar = page.getByRole("navigation", { name: "Primary" });
  for (const l of ["Home", "Approvals", "Agents"]) await expect(bar.getByRole("link", { name: l })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Open LifeOS assistant" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "More" })).toBeVisible();

  const dialog = page.getByRole("dialog", { name: "More" });
  await bar.getByRole("button", { name: "More" }).click();
  await dialog.getByRole("link", { name: "Organization" }).click();
  await expect(page).toHaveURL(/\/organization$/);
  await expect(dialog).toBeHidden();

  await bar.getByRole("button", { name: "More" }).click();
  await dialog.getByRole("link", { name: "Goals" }).click();
  await expect(page).toHaveURL(/\/goals$/);

  await bar.getByRole("link", { name: "Approvals" }).click();
  await expect(page).toHaveURL(/\/approvals$/);
});
