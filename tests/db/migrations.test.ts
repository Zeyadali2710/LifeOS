import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/server/db/migrate";

// Needs Postgres: `docker compose -f docker/compose.dev.yml up -d`.
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres";
const dbName = `lifeos_test_${randomBytes(4).toString("hex")}`;
const testUrl = Object.assign(new URL(ADMIN_URL), { pathname: `/${dbName}` }).toString();

async function admin(sql: string) {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

describe("migrations", () => {
  beforeAll(() => admin(`create database ${dbName}`));
  afterAll(() => admin(`drop database if exists ${dbName} with (force)`));

  it("apply cleanly to an empty database and are idempotent", async () => {
    await runMigrations(testUrl);
    await runMigrations(testUrl);

    const client = new Client({ connectionString: testUrl });
    await client.connect();
    const { rows } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    await client.end();

    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["users", "sessions", "accounts", "verifications", "rate_limits", "audit_log", "settings", "activity_events", "notifications", "run_turns", "calendars", "calendar_events", "tasks", "projects", "milestones", "task_dependencies", "project_dependencies", "project_links"]),
    );
  });

  it("adds projects.context (0007)", async () => {
    await runMigrations(testUrl);
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      const { rows } = await client.query(
        "select data_type, is_nullable, column_default from information_schema.columns where table_name = 'projects' and column_name = 'context'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].data_type).toBe("text");
      expect(rows[0].is_nullable).toBe("NO");
      expect(rows[0].column_default).toContain("''");
    } finally {
      await client.end();
    }
  });

  it("adds outreach and mail tables (0008)", async () => {
    await runMigrations(testUrl);
    await runMigrations(testUrl);
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      const t = await client.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_name in ('event_sources','outreach_events','mail_messages')",
      );
      expect(t.rows).toHaveLength(3);
      const c = await client.query(
        "select 1 from information_schema.columns where (table_name, column_name) in (('tasks','outreach_event_id'),('tasks','mail_message_id'),('connections','scopes'))",
      );
      expect(c.rows).toHaveLength(3);
      await expect(
        client.query("insert into outreach_events (title, title_key, start_at, is_mock, stage) values ('t','t', now(), true, 'BOGUS')"),
      ).rejects.toThrow(/outreach_events_stage_chk/);
    } finally {
      await client.end();
    }
  });

  it("backfills saw_private", async () => {
    await runMigrations(testUrl);
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      for (const [id, name, priv] of [[9001, "me/secret", true], [9002, "me/open", false], [9003, "me/unknown", null]] as const) {
        await client.query(`insert into github_repos (id, full_name, private) values ($1, $2, $3)`, [id, name, priv]);
      }
      const ids = { a: "00000000-0000-4000-8000-00000000000a", b: "00000000-0000-4000-8000-00000000000b", c: "00000000-0000-4000-8000-00000000000c" };
      const prompts = { a: "hi", b: "hi", c: "look at me/unknown" };
      for (const k of ["a", "b", "c"] as const) {
        await client.query(`insert into agent_runs (id, agent_id, prompt, model, saw_private) values ($1, 'projects', $2, 'm', false)`, [ids[k], prompts[k]]);
      }
      await client.query(`insert into tool_calls (run_id, tool_use_id, seq, tool, tier, status, output) values ($1, 't1', 1, 'github.list_repos', 'READ', 'done', $2)`, [ids.a, JSON.stringify([{ repo: "me/secret" }])]);
      await client.query(`insert into tool_calls (run_id, tool_use_id, seq, tool, tier, status, output) values ($1, 't1', 1, 'github.list_repos', 'READ', 'done', $2)`, [ids.b, JSON.stringify([{ repo: "me/open" }])]);

      const sqlText = readFileSync("drizzle/0002_model_routing.sql", "utf8");
      const stmts = sqlText.split("-- backfill: saw_private")[1]!.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);
      for (const st of stmts) await client.query(st);

      const { rows } = await client.query<{ id: string; saw_private: boolean }>("select id, saw_private from agent_runs");
      const got = Object.fromEntries(rows.map((r) => [r.id, r.saw_private]));
      expect([got[ids.a], got[ids.b], got[ids.c]]).toEqual([true, false, true]);
    } finally {
      await client.end();
    }
  });
});
