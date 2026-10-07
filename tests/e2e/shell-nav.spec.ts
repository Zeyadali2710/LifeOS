import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

const ROUTES = [
  ["/career", "Career"],
  ["/socials", "Socials"],
  ["/outreach", "Outreach"],
  ["/organization", "Organization"],
  ["/projects", "Projects"],
  ["/knowledge", "Knowledge"],
  ["/goals", "Goals"],
  ["/agents", "Agents"],
  ["/approvals", "Approvals"],
  ["/settings", "Settings"],
] as const;

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

test("desktop: sidebar reaches every domain page, shortcuts and compact persistence", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop");
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const [href, name] of ROUTES) {
    const link = nav.locator(`a[href="${href}"]`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  await expect(page.getByRole("complementary", { name: "Primary" })).not.toContainText("0.9");

  await page.goto("/");
  await page.keyboard.press("Alt+2");
  await expect(page).toHaveURL(/\/career$/);

  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(nav.getByText("Organization", { exact: true })).toBeHidden();
  expect((await context.cookies()).find((c) => c.name === "lo_nav")?.value).toBe("compact");
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

test("mobile: bottom bar and More reach domain pages", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await expect(page.getByRole("complementary", { name: "Primary" })).toBeHidden();
  const bar = page.getByRole("navigation", { name: "Primary" });
  for (const l of ["Home", "Organize", "Projects"]) await expect(bar.getByRole("link", { name: l })).toBeVisible();
  await expect(bar.getByRole("button", { name: "More" })).toBeVisible();

  await bar.getByRole("link", { name: "Organize" }).click();
  await expect(page).toHaveURL(/\/organization$/);

  const dialog = page.getByRole("dialog", { name: "More" });
  await bar.getByRole("button", { name: "More" }).click();
  await dialog.getByRole("link", { name: "Goals" }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(dialog).toBeHidden();

  await bar.getByRole("button", { name: "More" }).click();
  await dialog.getByRole("link", { name: "Approvals" }).click();
  await expect(page).toHaveURL(/\/approvals$/);
});
