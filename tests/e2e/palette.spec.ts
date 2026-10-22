import { expect, test } from "@playwright/test";
import { seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const ALLOWED = /\/(api\/(events|activity|notifications|health|agents\/status)|_next)(\/|\?|$)/;

test("desktop: palette navigates, closes, and asks", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  const search = dialog.getByRole("combobox", { name: "Search", exact: true });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 500 });
  }).toPass();
  await search.fill("goa");
  const goals = dialog.getByRole("option", { name: "Goals", exact: true });
  await expect(goals).toBeVisible();
  // Ask is the first result for any query; select the page result with the keyboard.
  await page.keyboard.press("ArrowDown");
  await expect(goals).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/goals$/);
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("tab", { name: "Projects", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("tab", { name: "All", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const assistant = page.getByRole("dialog", { name: "Ask LifeOS", exact: true });
  await page.keyboard.press("Control+k");
  // Search now uses a read-only server action (POST); finish it before checking that Ask sends nothing.
  const searched = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await search.fill("zzzz");
  await (await searched).finished();
  await expect(dialog.getByRole("option", { name: /^Ask LifeOS:.*zzzz/ })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Jump to", exact: true })).toHaveCount(0);
  const requests: { method: string; url: string }[] = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(assistant).toBeVisible();
  await expect(assistant.getByRole("alert")).toContainText("LifeOS can't answer yet:");
  const message = assistant.getByRole("textbox", { name: "Message", exact: true });
  await expect(message).toHaveValue("zzzz");
  await expect(assistant.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.waitForTimeout(300);
  expect(requests.filter((r) => r.method === "POST")).toEqual([]);
  expect(requests.filter((r) => !ALLOWED.test(new URL(r.url).pathname) && !new URL(r.url).searchParams.has("_rsc"))).toEqual([]);

  await page.keyboard.press("Control+j");
  await expect(assistant).toBeHidden();
  await page.keyboard.press("Control+j");
  await expect(assistant).toBeVisible();
  await page.keyboard.press("Control+j");
  await expect(assistant).toBeHidden();

  await page.getByRole("banner").getByRole("button", { name: "Ask LifeOS", exact: true }).click();
  await expect(assistant.getByRole("alert")).toContainText("LifeOS can't answer yet:");
  await expect(assistant.getByRole("button", { name: "What needs me today?", exact: true })).toBeDisabled();

  await message.focus();
  await page.keyboard.press("Alt+2");
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/goals$/);
  // The modal makes the page inert; close it before testing a page navigation shortcut.
  await page.keyboard.press("Escape");
  await page.getByRole("main").focus();
  await page.keyboard.press("Alt+2");
  await expect(page).toHaveURL(/\/agents$/);
});

test("mobile: assistant opens as a full-width drawer and answers honestly", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
  await palette.getByRole("combobox", { name: "Search", exact: true }).fill("What needs me today?");
  await palette.getByRole("option", { name: /^Ask LifeOS:/ }).click();
  const assistant = page.getByRole("dialog", { name: "Ask LifeOS", exact: true });
  await expect(assistant).toBeVisible();
  await expect(palette).toBeHidden();
  await expect.poll(async () => (await assistant.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await expect(assistant.getByRole("textbox", { name: "Message", exact: true })).toBeDisabled();
  await expect(assistant.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(assistant.getByRole("alert")).toContainText("LifeOS can't answer yet:");
});
