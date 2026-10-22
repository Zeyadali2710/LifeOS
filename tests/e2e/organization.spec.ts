import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DB_URL, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");

// Test-only seed for the throwaway lifeos_e2e database (workers: 1, so no other spec sees it).
async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: E2E_DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function seedOverlap(day: string, tag: string) {
  await withDb(async (c) => {
    await c.query(
      `insert into connections (id, ciphertext, last4, login, status)
       values ('google_calendar', 'v1.e2e.e2e.e2e', 'e2e1', 'owner@example.test', 'connected')
       on conflict (id) do update set status = 'connected'`,
    );
    const cal = await c.query(
      `insert into calendars (connection_id, remote_id, name, account, access, kind, enabled, category, is_default)
       values ('google_calendar', $1, 'E2E Work', 'owner@example.test', 'owner', 'primary', true, 'work', true) returning id`,
      [`e2e-${tag}`],
    );
    // 00:00Z is 10:00 or 11:00 Sydney the same day, so both events land on `day` in Sydney.
    for (const [i, [s, e]] of [["00:00", "01:00"], ["00:30", "01:30"]].entries()) {
      await c.query(
        `insert into calendar_events (calendar_id, remote_id, title, start_at, end_at, tz, raw)
         values ($1, $2, $3, $4, $5, 'Australia/Sydney', '{}'::jsonb)`,
        [cal.rows[0].id, `e2e-ev-${tag}-${i}`, `E2E overlap ${i + 1} ${tag}`, `${day}T${s}:00Z`, `${day}T${e}:00Z`],
      );
    }
  });
}

const clearCalendar = () => withDb((c) => c.query("delete from connections where id = 'google_calendar'")); // cascades to calendars and events

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("no calendar connected: empty state and tasks-only lead", async ({ page }) => {
  await page.goto("/organization");
  // During a navigation/refresh Next can briefly keep a hidden copy of the previous route tree, so match the visible one.
  await expect(page.getByText("No calendar connected").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Connect Google Calendar or iCloud to see your events here and let LifeOS plan around them. Tasks work without a calendar.").filter({ visible: true })).toBeVisible();
});

test("quick add shows the task under Tasks · today and the checkbox toggles it", async ({ page }) => {
  const title = `E2E task ${uid()}`;
  await page.goto("/organization");
  await expect(page.getByRole("heading", { name: /^Tasks · today · \d+ open$/ })).toBeVisible();
  const input = page.getByLabel("New task", { exact: true });
  // The task also shows in Today's plan, so assert inside the Tasks card. Retry only covers Enter before hydration:
  // never resubmit once the task exists, or each retry adds a duplicate.
  const box = page.getByRole("region", { name: /^Tasks · today · \d+ open$/ }).getByRole("checkbox", { name: title });
  await expect(async () => {
    if ((await box.count()) === 0) {
      await input.fill(title);
      await input.press("Enter");
    }
    await expect(box).toBeVisible({ timeout: 2000 });
  }).toPass();
  await box.check();
  await expect(box).toBeChecked();
  // A completed task collapses out of the list after 4s (UI-SPEC); reopen it from "Show completed" so slow runners don't race the timer.
  await expect(box).toHaveCount(0, { timeout: 10_000 });
  const tasks = page.getByRole("region", { name: /^Tasks · today · \d+ open$/ });
  await tasks.getByRole("button", { name: "Show completed" }).click();
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
});

test("task dialog asks for a title", async ({ page }) => {
  await page.goto("/organization");
  await page.getByRole("button", { name: "Add task with details" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(dialog.getByText("Add a title.")).toBeVisible();
});

test("palette New task command opens the task dialog", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/organization?new=task");
  await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
  await expect(page).toHaveURL(/\/organization\?view=week&date=\d{4}-\d{2}-\d{2}$/);
});

test("view switch updates ?view=", async ({ page }) => {
  await page.goto("/organization?view=week");
  const tab = (n: string) => page.getByRole("tablist", { name: "Calendar view (D, W, M)" }).getByRole("tab", { name: n, exact: true });
  await tab("Day").click();
  await expect(page).toHaveURL(/view=day/);
  await tab("Month").click();
  await expect(page).toHaveURL(/view=month/);
  await tab("Week").click();
  await expect(page).toHaveURL(/view=week/);
});

test("seeded overlapping events render with the Conflict marking and header count", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const tag = uid();
  // The conflict count follows the selected range, so tomorrow is safe across week boundaries.
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await seedOverlap(day, tag);
  try {
    await page.goto(`/organization?view=day&date=${day}`);
    const blocks = page.getByRole("region", { name: "Calendar", exact: true }).getByRole("button", { name: /, Conflict$/ });
    await expect(blocks).toHaveCount(2);
    await expect(page.getByText(`E2E overlap 1 ${tag}`).first()).toBeVisible();
    await expect(page.getByText(`E2E overlap 2 ${tag}`).first()).toBeVisible();
    await expect(page.getByText(/[1-9]\d* conflicts?/).first()).toBeVisible();
  } finally {
    await clearCalendar();
  }
});
