import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ConnectionDTO, ConnectionId } from "../../lib/agent-types";
import { audit } from "../audit";
import { decrypt, encrypt } from "../crypto";
import { db, type DB } from "../db/client";
import { connections } from "../db/schema";
import { createGithub, GithubError } from "./client";

const IDS: ConnectionId[] = ["github_read", "github_write"];
const User = z.object({ login: z.string() });
const Repo = z.object({ full_name: z.string() });

export type SaveResult = { ok: true; login: string; repos: number; expiresAt: string | null } | { ok: false; error: "invalid" | "rejected" | "no_repos" | "unreachable" };

// No over-permission warning: fine-grained PATs expose no scope header (RESEARCH Pitfall 5 / Open Question 1);
// only verified facts (login, last4, repo count, expiry if the header is present) are surfaced.
export async function saveToken(
  h: DB = db(),
  id: ConnectionId,
  raw: string,
  opts: { fetch?: typeof fetch; now?: Date; key?: Buffer } = {},
): Promise<SaveResult> {
  const token = raw.trim();
  if (!token || token.length > 255) return { ok: false, error: "invalid" };
  const gh = createGithub({ token, fetch: opts.fetch });
  let login: string;
  let expiresAt: Date | null;
  let repos: string[];
  try {
    const me = await gh.get("/user", User);
    if (me.status !== 200) return { ok: false, error: "unreachable" };
    login = me.data.login;
    expiresAt = gh.tokenExpiry(me.headers);
    repos = (await gh.paginate("/user/repos?per_page=100", Repo, 3)).map((r) => r.full_name);
  } catch (e) {
    if (e instanceof GithubError) return { ok: false, error: e.kind === "auth" ? "rejected" : "unreachable" };
    throw e;
  }
  if (repos.length === 0) return { ok: false, error: "no_repos" };
  const row = { ciphertext: encrypt(token, opts.key), last4: token.slice(-4), login, expiresAt, status: "connected", lastError: null, repos };
  await h.insert(connections).values({ id, ...row }).onConflictDoUpdate({ target: connections.id, set: { ...row, updatedAt: opts.now ?? new Date() } });
  await audit({ actor: "owner", action: "connection.save", target: id, metadata: { id, last4: row.last4 } });
  return { ok: true, login, repos: repos.length, expiresAt: expiresAt?.toISOString() ?? null };
}

export async function removeToken(h: DB = db(), id: ConnectionId): Promise<void> {
  await h.delete(connections).where(eq(connections.id, id));
  await audit({ actor: "owner", action: "connection.remove", target: id, metadata: { id } });
}

async function tokenFor(h: DB, id: ConnectionId, key?: Buffer): Promise<string | null> {
  const [r] = await h.select({ c: connections.ciphertext }).from(connections).where(eq(connections.id, id));
  return r ? decrypt(r.c, key) : null;
}

// Separate functions on purpose (D-02): the read path can never obtain the write token.
export async function readToken(h: DB = db(), key?: Buffer): Promise<string | null> {
  return tokenFor(h, "github_read", key);
}
export async function writeToken(h: DB = db(), key?: Buffer): Promise<string | null> {
  return tokenFor(h, "github_write", key);
}

export async function markConnectionError(h: DB = db(), id: ConnectionId, message: string): Promise<void> {
  await h.update(connections).set({ status: "error", lastError: message, updatedAt: new Date() }).where(eq(connections.id, id));
}

export async function recordSync(h: DB = db(), s: { at: Date; error: string | null; repos?: string[] }): Promise<void> {
  await h
    .update(connections)
    .set({ lastSyncAt: s.at, lastSyncError: s.error, ...(s.repos ? { repos: s.repos } : {}), updatedAt: new Date() })
    .where(eq(connections.id, "github_read"));
}

export async function getConnections(h: DB = db()): Promise<ConnectionDTO[]> {
  const rows = await h.select().from(connections);
  return IDS.map((id) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return { id, status: "none", login: null, last4: null, expiresAt: null, repos: [], lastSyncAt: null, lastSyncError: null };
    return {
      id,
      status: r.status === "error" ? "error" : "connected",
      login: r.login,
      last4: r.last4,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      repos: r.repos,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      lastSyncError: r.lastSyncError,
    };
  });
}
