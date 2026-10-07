import type { Page } from "@playwright/test";
import { Client } from "pg";

// Test-only owner for the throwaway lifeos_e2e database.
export const E2E_OWNER = { email: "owner@lifeos.test", password: "e2e-password-123", name: "Ada Owner" };

const admin = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres");
export const E2E_DB_URL = Object.assign(new URL(admin), { pathname: "/lifeos_e2e" }).toString();

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: E2E_DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

// Random client IP avoids the 5/min/IP sign-in limit across tests.
export async function signIn(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 250)}` });
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER.email);
  await page.getByLabel("Password").fill(E2E_OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

// The e2e stack runs no worker, so fake a fresh heartbeat.
export async function seedHeartbeat() {
  await withDb((c) =>
    c.query(
      `insert into settings (key, value) values ('worker.heartbeat', $1::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(new Date().toISOString())],
    ),
  );
}

// Assert on unique titles, not global counts: desktop and mobile projects share the DB.
export async function insertNotification(f: {
  category: "URGENT" | "IMPORTANT" | "FYI";
  title: string;
  body?: string;
  actionUrl?: string;
  snoozedUntil?: Date;
}): Promise<string> {
  return withDb(async (c) => {
    const r = await c.query(
      `insert into notifications (category, source, title, body, action_url, snoozed_until)
       values ($1, 'test', $2, $3, $4, $5) returning id`,
      [f.category, f.title, f.body ?? null, f.actionUrl ?? null, f.snoozedUntil ?? null],
    );
    const id = r.rows[0].id as string;
    await c.query("select pg_notify('lifeos_events', $1)", [JSON.stringify({ k: "notification", id })]);
    return id;
  });
}
