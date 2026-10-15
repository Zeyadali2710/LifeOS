import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { Client } from "pg";

// Test-only owner for the throwaway lifeos_e2e database.
export const E2E_OWNER = { email: "owner@lifeos.test", password: "e2e-password-123", name: "Ada Owner" };

const admin = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres");
export const E2E_DB_URL = Object.assign(new URL(admin), { pathname: "/lifeos_e2e" }).toString();

export async function insertSocialSource(title: string) {
  return withDb(async (c) => (await c.query("insert into projects (name, description) values ($1, 'A project source for a social post') returning id", [title])).rows[0].id as string);
}
export async function socialPostState(id: string) {
  return withDb(async (c) => (await c.query("select platform, status, text, is_mock, remote_id, remote_url, last_error from social_variants where post_id = $1", [id])).rows as { platform: string; status: string; text: string; is_mock: boolean; remote_id: string | null; remote_url: string | null; last_error: string | null }[]);
}
export async function deleteSocialPost(id: string) {
  await withDb(async (c) => {
    await c.query("delete from agent_runs where id in (select a.run_id from approvals a join social_variants v on v.approval_id = a.id where v.post_id = $1)", [id]);
    await c.query("delete from social_posts where id = $1", [id]);
  });
}
export function runSocialMockExecutor(mode: "publish" | "removed-real", postId?: string): { postId: string; status: string; remoteId: string | null } {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url)), fileURLToPath(new URL("./social-executor.ts", import.meta.url)), mode, ...(postId ? [postId] : [])], {
    encoding: "utf8", timeout: 30_000, env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, DATABASE_URL: E2E_DB_URL },
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

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

// Seeds a projects.create / projects.update approval (APPROVE tier). The e2e stack has no worker: nothing executes it.
export async function insertProjectApproval(o: { payload: unknown; tool?: "projects.create" | "projects.update"; status?: string; result?: unknown }): Promise<string> {
  return withDb(async (c) => {
    const tool = o.tool ?? "projects.create";
    const run = await c.query(
      `insert into agent_runs (agent_id, prompt, model, status, started_at) values ('projects', 'Draft a project', 'claude-sonnet-5-5', 'waiting_approval', now()) returning id`,
    );
    const tc = await c.query(
      `insert into tool_calls (run_id, tool_use_id, seq, tool, tier, status, input, started_at)
       values ($1, 'toolu_proj', 1, $2, 'APPROVE', 'waiting_approval', $3::jsonb, now()) returning id`,
      [run.rows[0].id, tool, JSON.stringify(o.payload)],
    );
    const status = o.status ?? "pending";
    const a = await c.query(
      `insert into approvals (run_id, tool_call_id, agent_id, tool, status, original_payload, payload_hash, reason, result, decided_at, expires_at)
       values ($1, $2, 'projects', $3, $4, $5::jsonb, $6, 'You asked for it.', $7::jsonb, $8, now() + interval '7 days') returning id`,
      [run.rows[0].id, tc.rows[0].id, tool, status, JSON.stringify(o.payload), `e2e-proj-${randomBytes(8).toString("hex")}`, o.result === undefined ? null : JSON.stringify(o.result), status === "pending" ? null : new Date()],
    );
    const id = a.rows[0].id as string;
    await c.query("select pg_notify('lifeos_events', $1)", [JSON.stringify({ k: "approval", id })]);
    return id;
  });
}

/** Reads back the stored approval row (edited payload + status) for assertions. */
export async function readApproval(id: string): Promise<{ status: string; edited: Record<string, unknown> | null }> {
  return withDb(async (c) => {
    const r = await c.query("select status, edited_payload from approvals where id = $1", [id]);
    return { status: r.rows[0].status as string, edited: r.rows[0].edited_payload as Record<string, unknown> | null };
  });
}

/** Raw-SQL project with context, a milestone, tasks and a repo link (stands in for what an executed approval created). */
export async function insertSeededProject(o: { name: string; context: string; milestone: string; tasks: string[]; repo: { id: number; fullName: string } }): Promise<string> {
  return withDb(async (c) => {
    const [owner, name] = o.repo.fullName.split("/");
    await c.query(
      `insert into github_repos (id, full_name, owner, name, private, html_url) values ($1, $2, $3, $4, false, $5) on conflict do nothing`,
      [o.repo.id, o.repo.fullName, owner, name, `https://github.com/${o.repo.fullName}`],
    );
    const p = await c.query("insert into projects (name, context) values ($1, $2) returning id", [o.name, o.context]);
    const pid = p.rows[0].id as string;
    const m = await c.query("insert into milestones (project_id, title) values ($1, $2) returning id", [pid, o.milestone]);
    for (const t of o.tasks) await c.query("insert into tasks (title, project_id, milestone_id) values ($1, $2, $3)", [t, pid, m.rows[0].id]);
    await c.query("insert into project_links (project_id, kind, repo_id) values ($1, 'repo', $2)", [pid, o.repo.id]);
    return pid;
  });
}

export async function deleteProject(id: string) {
  await withDb(async (c) => {
    await c.query("delete from tasks where project_id = $1", [id]);
    await c.query("delete from projects where id = $1", [id]);
  });
}

// ---- Phase 6 seed helpers (test-only). The e2e server has no worker, LLM or outbound network. ----

/** Raw-SQL outreach event 5 days out. Pass a unique title; desktop and mobile share the DB. */
export async function insertOutreachEvent(o: { title: string; isMock?: boolean; stage?: string | null; score?: number; why?: string; startAt?: Date }): Promise<string> {
  return withDb(async (c) => {
    const start = o.startAt ?? new Date(Date.now() + 5 * 86_400_000);
    const kind = o.isMock ? "meetup_mock" : "ics";
    const r = await c.query(
      `insert into outreach_events (title, title_key, start_at, end_at, is_mock, sources, score, why, stage, location)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, 'Sydney NSW') returning id`,
      [
        o.title,
        o.title.toLowerCase(),
        start,
        new Date(+start + 2 * 3600_000),
        o.isMock ?? false,
        JSON.stringify([{ sourceId: "e2e", kind, remoteId: `e2e-${randomBytes(4).toString("hex")}` }]),
        o.score ?? 99,
        o.why ?? "Matches your interests.",
        o.stage ?? null,
      ],
    );
    return r.rows[0].id as string;
  });
}

export async function deleteOutreachEvent(id: string) {
  await withDb(async (c) => {
    await c.query("delete from tasks where outreach_event_id = $1", [id]);
    await c.query("delete from outreach_events where id = $1", [id]);
  });
}

/** A triaged INBOX message. */
export async function insertMailMessage(o: {
  subject: string;
  fromName: string;
  fromAddress: string;
  category?: string;
  importance?: string;
  summary: string;
  actionItems?: { text: string; due?: string | null }[];
}): Promise<string> {
  return withDb(async (c) => {
    const r = await c.query(
      `insert into mail_messages (gmail_id, thread_id, from_name, from_address, "to", subject, received_at, label_ids, snippet, category, importance, summary, action, action_items, triaged_at, triage_model)
       values ($1, $2, $3, $4, '[{"name":"Owner","address":"owner@example.test"}]'::jsonb, $5, now(), array['INBOX'], 'Snippet text', $6, $7, $8, 'Reply this week', $9::jsonb, now(), 'e2e') returning id`,
      [`g-${randomBytes(6).toString("hex")}`, `t${randomBytes(6).toString("hex")}`, o.fromName, o.fromAddress, o.subject, o.category ?? "IMPORTANT", o.importance ?? "HIGH", o.summary, JSON.stringify(o.actionItems ?? [])],
    );
    return r.rows[0].id as string;
  });
}

export async function deleteMailMessage(id: string) {
  await withDb(async (c) => {
    await c.query("delete from tasks where mail_message_id = $1", [id]);
    await c.query("delete from mail_messages where id = $1", [id]);
  });
}

/** Google connection with Gmail scopes and a dummy ciphertext: the e2e server never calls Google. */
export async function insertGmailConnection() {
  await withDb((c) =>
    c.query(
      `insert into connections (id, ciphertext, last4, login, status, scopes)
       values ('google_calendar', 'v1.e2e.e2e.e2e', 'e2e1', 'owner@example.test', 'connected', $1::jsonb)
       on conflict (id) do update set status = 'connected', scopes = excluded.scopes`,
      [JSON.stringify(["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"])],
    ),
  );
}

export async function removeGmailConnection() {
  await withDb((c) => c.query("delete from connections where id = 'google_calendar'")); // cascades to calendars and events
}

export type SeededMailPayload = {
  messageId: string;
  threadId: string;
  to: { name: string; address: string }[];
  cc: { name: string; address: string }[];
  inReplyTo: string | null;
  references: string | null;
  originalSubject: string;
  subject: string;
  body: string;
};

/** Pending mail.send_reply approval (APPROVE tier) for a seeded message. Remove with deleteApprovalRun. */
export async function insertMailApproval(o: { mailId: string; subject: string; body?: string }): Promise<{ id: string; payload: SeededMailPayload }> {
  return withDb(async (c) => {
    const payload: SeededMailPayload = {
      messageId: o.mailId,
      threadId: "thread-e2e",
      to: [{ name: "Lee Direct", address: "lee.direct@example.test" }],
      cc: [],
      inReplyTo: null,
      references: null,
      originalSubject: o.subject,
      subject: `Re: ${o.subject}`,
      body: o.body ?? "Thanks, I will send the slides on Friday.",
    };
    const run = await c.query(
      `insert into agent_runs (agent_id, prompt, model, status, started_at) values ('outreach', 'Draft a reply', 'claude-sonnet-5-5', 'waiting_approval', now()) returning id`,
    );
    const tc = await c.query(
      `insert into tool_calls (run_id, tool_use_id, seq, tool, tier, status, input, started_at)
       values ($1, 'toolu_mail', 1, 'mail.send_reply', 'APPROVE', 'waiting_approval', $2::jsonb, now()) returning id`,
      [run.rows[0].id, JSON.stringify(payload)],
    );
    const a = await c.query(
      `insert into approvals (run_id, tool_call_id, agent_id, tool, status, original_payload, payload_hash, reason, expires_at)
       values ($1, $2, 'outreach', 'mail.send_reply', 'pending', $3::jsonb, $4, 'You asked for a reply.', now() + interval '7 days') returning id`,
      [run.rows[0].id, tc.rows[0].id, JSON.stringify(payload), `e2e-mail-${randomBytes(8).toString("hex")}`],
    );
    const id = a.rows[0].id as string;
    await c.query("select pg_notify('lifeos_events', $1)", [JSON.stringify({ k: "approval", id })]);
    return { id, payload };
  });
}
