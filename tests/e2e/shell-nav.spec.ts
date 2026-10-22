import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

const PRIMARY = ["Home", "Agents", "Projects", "Organization", "Outreach", "Socials", "Finances", "Career"];
const MORE = ["Knowledge", "Goals", "Briefings", "Automations", "Settings"];
const hrefOf = (label: string) => label === "Home" ? "/" : `/${label.toLowerCase()}`;

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
  await page.setViewportSize({ width: 1800, height: 1000 });
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Primary" });
  const more = nav.getByRole("button", { name: "More", exact: true });
  for (const label of [...PRIMARY.slice(1), ...MORE]) {
    const href = hrefOf(label);
    const inMore = MORE.includes(label);
    if (inMore) await more.click();
    const link = inMore
      ? page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: new RegExp(`^${label}($| )`) })
      : nav.getByRole("link", { name: new RegExp(`^${label}($| )`) });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1, name: label, exact: true })).toBeVisible();
    if (inMore) await more.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    if (inMore) await page.keyboard.press("Escape");
  }

  for (const [i, label] of PRIMARY.entries()) {
    await page.getByRole("main").focus();
    await page.keyboard.press(`Alt+${i + 1}`);
    await expect(page).toHaveURL(new RegExp(`${hrefOf(label)}$`));
    await expect(nav.getByRole("link", { name: new RegExp(`^${label}($| )`) })).toHaveAttribute("aria-current", "page");
  }

  await page.keyboard.press("Control+Backslash");
  await expect(page).toHaveURL(/\/career$/);
  await expect(nav).toBeVisible();

  const account = page.getByRole("banner").getByRole("button", { name: /^Account:/ });
  await account.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Account", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(account).toBeFocused();
});

test("mobile: tab bar and More reach domain pages", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await expect(page.getByRole("banner").getByRole("navigation", { name: "Primary" })).toBeHidden();
  const bar = page.getByRole("navigation", { name: "Primary" });
  for (const label of ["Home", "Agents", "Outreach", "Socials"]) {
    const link = bar.getByRole("link", { name: new RegExp(`^${label}($| )`) });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${hrefOf(label)}$`));
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  const sheet = page.getByRole("menu", { name: "More", exact: true });
  for (const label of ["Projects", "Organization", "Finances", "Career", ...MORE]) {
    await bar.getByRole("button", { name: "More", exact: true }).click();
    await sheet.getByRole("menuitem", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${hrefOf(label)}$`));
    await expect(page.getByRole("heading", { level: 1, name: label, exact: true })).toBeVisible();
    await expect(sheet).toBeHidden();
    await bar.getByRole("button", { name: "More", exact: true }).click();
    await expect(sheet.getByRole("menuitem", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu", exact: true }).click();
  }
  await bar.getByRole("link", { name: /^Agents($| )/ }).click();
  await page.getByRole("navigation", { name: "View", exact: true }).getByRole("link", { name: /^Approvals/ }).click();
  await expect(page).toHaveURL(/\/agents\?view=approvals$/);
});

test("legacy approvals links redirect into Agents and preserve selection", async ({ page }) => {
  await page.goto("/approvals");
  await expect(page).toHaveURL(/\/agents\?view=approvals$/);
  await expect(page.getByRole("heading", { level: 1, name: "Agents", exact: true })).toBeVisible();
  const id = "00000000-0000-4000-8000-000000000001";
  await page.goto(`/approvals?id=${id}`);
  await expect(page).toHaveURL(new RegExp(`/agents\\?view=approvals&id=${id}$`));
});
