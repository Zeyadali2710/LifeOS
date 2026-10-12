import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const ALLOWED = /\/(api\/(events|activity|notifications|health)|_next)(\/|\?|$)/;

test("desktop: palette navigates, closes, and asks", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const dialog = page.getByRole("dialog", { name: "Command palette" });

  // First press can land before hydration; retry until the shortcut listener exists.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.keyboard.type("goa");
  await expect(page.getByRole("option", { name: /Goals/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/goals$/);
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const assistant = page.getByRole("complementary", { name: "LifeOS assistant" });
  await page.keyboard.press("Control+k");
  await page.keyboard.type("zzzz");
  await expect(page.getByText("No commands or pages match.")).toBeVisible();
  const requests: { method: string; url: string }[] = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.keyboard.press("Enter");
  await expect(assistant).toBeVisible();
  await expect(assistant.getByRole("alert")).toContainText("LifeOS can't answer yet.");
  await page.waitForTimeout(300);
  expect(requests.filter((r) => r.method === "POST")).toEqual([]);
  expect(requests.filter((r) => !ALLOWED.test(new URL(r.url).pathname) && !new URL(r.url).searchParams.has("_rsc"))).toEqual([]);

  await page.keyboard.press("Control+j");
  await expect(assistant).toBeHidden();
  await page.keyboard.press("Control+j");
  await expect(assistant).toBeVisible();
  await page.keyboard.press("Control+j");
  await expect(assistant).toBeHidden();

  await page.getByRole("button", { name: "Plan my week" }).click();
  await expect(assistant.getByRole("alert").last()).toContainText("LifeOS can't answer yet.");

  // Alt+digit while typing must not navigate away; from the page it does.
  await assistant.getByRole("textbox", { name: "Message LifeOS" }).focus();
  await page.keyboard.press("Alt+2");
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/goals$/);
  await page.locator("main").first().click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Alt+2");
  await expect(page).toHaveURL(/\/career$/);
});

test("mobile: assistant opens as a floating sheet and answers honestly", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.getByRole("button", { name: "Open LifeOS assistant" }).click();
  const assistant = page.getByRole("dialog", { name: "LifeOS assistant" });
  await expect(assistant).toBeVisible();
  const box = await assistant.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 24);
  // With no API key the composer is disabled and the panel says why.
  await expect(page.getByLabel("Message LifeOS")).toBeDisabled();
  await expect(assistant.getByRole("alert")).toContainText("LifeOS can't answer yet.");
});
