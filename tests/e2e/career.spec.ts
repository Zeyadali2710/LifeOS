import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DB_URL, signIn } from "./owner";

const uid = randomBytes(4).toString("hex");
const repoId = 9_000_000 + Math.floor(Math.random() * 900_000);
const repoName = `e2e-${uid}`;

// Test-only seed for the throwaway lifeos_e2e database.
async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: E2E_DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const clear = () =>
  withDb(async (c) => {
    await c.query("delete from github_repos where id = $1", [repoId]);
    await c.query("delete from connections where id = 'github_read'");
  });

test.describe.configure({ mode: "serial" });
test.beforeAll(clear);
test.afterAll(clear);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("not connected: honest empty state with Open Settings", async ({ page }) => {
  await page.goto("/career");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Career");
  await expect(page.getByText("GitHub isn't connected").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Settings" }).filter({ visible: true })).toBeVisible();
});

test("connected: repo card opens the repo detail", async ({ page }) => {
  await withDb(async (c) => {
    await c.query(
      `insert into connections (id, ciphertext, last4, login, status, repos, last_sync_at)
       values ('github_read', 'v1.e2e.e2e.e2e', 'e2e1', 'owner-test', 'connected', '[]'::jsonb, now())
       on conflict (id) do update set status = 'connected', last_sync_error = null, last_sync_at = now()`,
    );
    await c.query(
      `insert into github_repos (id, full_name, owner, name, private, html_url, default_branch, archived, pushed_at, synced_at)
       values ($1, $2, 'e2eowner', $3, false, $4, 'main', false, now(), now())`,
      [repoId, `e2eowner/${repoName}`, repoName, `https://github.com/e2eowner/${repoName}`],
    );
  });
  await page.goto("/career");
  await page.getByRole("link", { name: `e2eowner/${repoName}` }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(`/career/e2eowner/${repoName}`);
  await expect(page.getByText("OPEN PULL REQUESTS").filter({ visible: true })).toBeVisible();
});

test("invalid owner segment 404s", async ({ page }) => {
  const res = await page.goto("/career/bad%20owner/x");
  expect(res?.status()).toBe(404);
});
