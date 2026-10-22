import { expect, test } from "@playwright/test";
import { signIn } from "./owner";

test("POST /api/chat without a session is 401", async ({ request }) => {
  const res = await request.post("/api/chat", { data: { message: "hi" }, headers: { "x-forwarded-for": "203.0.113.50" } });
  expect(res.status()).toBe(401);
});

test("no API key: panel is NOT CONNECTED and recent conversations toggles", async ({ page }, info) => {
  await signIn(page);
  const panel = page.getByRole("dialog", { name: "Ask LifeOS" });
  if (info.project.name === "mobile") {
    await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox", { name: "Search" }).fill("What needs me today?");
    await page.getByRole("option", { name: /^Ask LifeOS:/ }).click();
  }
  else
    // First press can land before hydration; retry until the shortcut listener exists.
    await expect(async () => {
      if (!(await panel.isVisible())) await page.keyboard.press("Control+j");
      await expect(panel).toBeVisible({ timeout: 500 });
    }).toPass();
  await expect(panel.getByText("ORCHESTRATOR · NOT CONNECTED")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Message", exact: true })).toHaveAttribute("placeholder", "New runs are unavailable");
  await expect(panel.getByRole("textbox", { name: "Message", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Recent conversations" }).click();
  await expect(panel.getByText("No conversations yet.")).toBeVisible();
  await panel.getByRole("button", { name: "Recent conversations" }).click();
  await expect(panel.getByRole("alert")).toContainText("LifeOS can't answer yet:");
});
