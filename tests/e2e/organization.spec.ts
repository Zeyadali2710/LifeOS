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
  await expect(page.getByText("No calendar connected.")).toBeVisible();
  await expect(page.getByText("Connect a calendar to see your week. Tasks work without one.")).toBeVisible();
});

test("quick add shows the task under TASKS · TODAY and the checkbox toggles it", async ({ page }) => {
  const title = `E2E task ${uid()}`;
  await page.goto("/organization");
  await expect(page.getByRole("heading", { name: "TASKS · TODAY" })).toBeVisible();
  const input = page.getByLabel("New task", { exact: true });
  // The task also shows in Today's plan, so assert inside the Tasks card. Retry only covers Enter before hydration:
  // never resubmit once the task exists, or each retry adds a duplicate.
  const box = page.getByRole("region", { name: "Tasks" }).getByRole("checkbox", { name: title });
  await expect(async () => {
    if ((await box.count()) === 0) {
      await input.fill(title);
      await input.press("Enter");
    }
    await expect(box).toBeVisible({ timeout: 2000 });
  }).toPass();
  await box.check();
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
  await expect(page).toHaveURL(/\/organization\?view=week/);
});

test("view switch updates ?view=", async ({ page }) => {
  await page.goto("/organization?view=week");
  const radio = (n: string) => page.getByRole("radiogroup", { name: "Calendar view" }).getByRole("radio", { name: n });
  await radio("Day").click();
  await expect(page).toHaveURL(/view=day/);
  await radio("Month").click();
  await expect(page).toHaveURL(/view=month/);
  await radio("Week").click();
  await expect(page).toHaveURL(/view=week/);
});

test("seeded overlapping events render with the Conflict marking and header count", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const tag = uid();
  // tomorrow keeps both events in the future; ponytail: flakes only if tomorrow falls in next week (Sunday), then the header count is 0
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await seedOverlap(day, tag);
  try {
    await page.goto(`/organization?view=day&date=${day}`);
    const blocks = page.locator('[aria-label$=", Conflict"]');
    await expect(blocks).toHaveCount(2);
    await expect(page.getByText(`E2E overlap 1 ${tag}`).first()).toBeVisible();
    await expect(page.getByText(`E2E overlap 2 ${tag}`).first()).toBeVisible();
    await expect(page.getByText(/[1-9]\d* conflicts?/).first()).toBeVisible();
  } finally {
    await clearCalendar();
  }
});
