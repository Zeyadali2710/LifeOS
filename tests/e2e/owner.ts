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

// Random client IP (100-249, clear of the fixed IPs in auth.spec) avoids the 5/min/IP sign-in limit across tests.
export async function signIn(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${100 + Math.floor(Math.random() * 150)}` });
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

// ---- Phase 3 seed helpers (test-only; never imported by app code) ----

export async function insertRun(o: { prompt: string; agentId?: string; tokensIn?: number; tokensOut?: number; costUsd?: number; ms?: number }): Promise<string> {
  return withDb(async (c) => {
    const ms = o.ms ?? 4200;
    const r = await c.query(
      `insert into agent_runs (agent_id, prompt, model, status, input_tokens, output_tokens, cost_usd, tool_call_count, active_ms, started_at, ended_at, answer)
       values ($1, $2, 'claude-opus-5-5', 'completed', $3, $4, $5, 1, $6::int, now() - ($6::int * interval '1 millisecond'), now(), 'Seeded answer.') returning id`,
      [o.agentId ?? "orchestrator", o.prompt, o.tokensIn ?? 1200, o.tokensOut ?? 340, o.costUsd ?? 0.0421, ms],
    );
    const id = r.rows[0].id as string;
    await c.query(
      `insert into tool_calls (run_id, tool_use_id, seq, tool, tier, status, input, output, input_summary, output_summary, duration_ms, started_at)
       values ($1, 'toolu_e2e', 1, 'github.list_repos', 'READ', 'done', '{"limit":5}'::jsonb, '{"repos":[]}'::jsonb, 'limit 5', '0 repos', 310, now())`,
      [id],
    );
    await c.query("select pg_notify('lifeos_events', $1)", [JSON.stringify({ k: "run", id })]);
    return id;
  });
}

export async function insertApproval(o: { title: string; body?: string }): Promise<string> {
  return withDb(async (c) => {
    await c.query(
      `insert into github_repos (id, full_name, owner, name, private, html_url) values (424242, 'octo/app', 'octo', 'app', false, 'https://github.com/octo/app')
       on conflict do nothing`,
    );
    const run = await c.query(
      `insert into agent_runs (agent_id, prompt, model, status, started_at) values ('projects', 'Create an issue', 'claude-sonnet-5-5', 'waiting_approval', now()) returning id`,
    );
    const payload = { repo: "octo/app", title: o.title, body: o.body ?? "Seeded body.", labels: ["bug"] };
    const tc = await c.query(
      `insert into tool_calls (run_id, tool_use_id, seq, tool, tier, status, input, started_at)
       values ($1, 'toolu_appr', 1, 'github.create_issue', 'APPROVE', 'waiting_approval', $2::jsonb, now()) returning id`,
      [run.rows[0].id, JSON.stringify(payload)],
    );
    const a = await c.query(
      `insert into approvals (run_id, tool_call_id, agent_id, tool, status, original_payload, payload_hash, reason, expires_at)
       values ($1, $2, 'projects', 'github.create_issue', 'pending', $3::jsonb, $4, 'You asked for it.', now() + interval '7 days') returning id`,
      [run.rows[0].id, tc.rows[0].id, JSON.stringify(payload), `e2e-${o.title}`],
    );
    const id = a.rows[0].id as string;
    await c.query("select pg_notify('lifeos_events', $1)", [JSON.stringify({ k: "approval", id })]);
    return id;
  });
}

export async function insertWriteConnection() {
  await withDb((c) =>
    c.query(
      `insert into connections (id, ciphertext, last4, login, status, repos)
       values ('github_write', 'v1.e2e.e2e.e2e', 'e2e1', 'owner-test', 'connected', '["octo/app"]'::jsonb)
       on conflict (id) do update set status = 'connected', login = 'owner-test', last4 = 'e2e1'`,
    ),
  );
}

export async function removeWriteConnection() {
  await withDb((c) => c.query("delete from connections where id = 'github_write'"));
}

// Deleting the run cascades to its tool_calls and approvals; keeps seeded pending approvals from leaking into global counts.
export async function deleteApprovalRun(approvalId: string) {
  await withDb((c) => c.query("delete from agent_runs where id = (select run_id from approvals where id = $1)", [approvalId]));
}
