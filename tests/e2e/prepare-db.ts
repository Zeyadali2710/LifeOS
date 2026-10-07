// Runs before the e2e web server starts: fresh database, migrations, test owner.
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { runMigrations } from "../../src/server/db/migrate";
import { E2E_OWNER } from "./owner";

const url = process.env.DATABASE_URL!;
const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
await admin.connect();
await admin.query("drop database if exists lifeos_e2e with (force)");
await admin.query("create database lifeos_e2e");
await admin.end();

await runMigrations(url);
execFileSync("npx", ["tsx", "src/scripts/create-owner.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, OWNER_EMAIL: E2E_OWNER.email, OWNER_PASSWORD: E2E_OWNER.password, OWNER_NAME: E2E_OWNER.name },
});
