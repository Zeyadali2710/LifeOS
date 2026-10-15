import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { boardColumn, PLATFORMS, type VariantStatus } from "@/lib/social-types";
import type { DB } from "../db/client";
import { githubRepos, outreachEvents, projects, socialAccountSnapshots, socialPosts, socialVariants } from "../db/schema";
import { socialConnection, socialConnectionStatus } from "./connections";
import { getProvider } from "./providers";

export async function listBoard(h: DB) {
  const posts = await h.select().from(socialPosts).orderBy(desc(socialPosts.updatedAt));
  const variants = await h.select().from(socialVariants);
  return posts.map((post) => {
    const items = variants.filter((v) => v.postId === post.id);
    return { ...post, variants: items, column: boardColumn(post.stage as "idea" | "draft", items.map((v) => v.status as VariantStatus)) };
  });
}

export async function getPost(h: DB, id: string) {
  const [post] = await h.select().from(socialPosts).where(eq(socialPosts.id, id));
  if (!post) return null;
  return { ...post, variants: await h.select().from(socialVariants).where(eq(socialVariants.postId, id)) };
}

export async function calendarItems(h: DB, from: Date, to: Date) {
  const rows = await h.select().from(socialVariants).where(and(inArray(socialVariants.status, ["scheduled", "published", "posted_manually"]),
    or(and(gte(socialVariants.scheduledAt, from), lt(socialVariants.scheduledAt, to)), and(gte(socialVariants.publishedAt, from), lt(socialVariants.publishedAt, to)))));
  return rows.filter((v) => {
    const at = v.publishedAt ?? v.scheduledAt;
    return at && at >= from && at < to;
  });
}

export async function analytics(h: DB) {
  const snapshots = await h.select().from(socialAccountSnapshots).orderBy(socialAccountSnapshots.date);
  const variants = await h.select().from(socialVariants).where(inArray(socialVariants.status, ["published", "posted_manually"]));
  const real = variants.filter((v) => !v.isMock);
  const totals: Record<string, number> = {};
  for (const v of real) for (const [key, value] of Object.entries(v.metrics ?? {})) if (typeof value === "number") totals[key] = (totals[key] ?? 0) + value;
  return { snapshots, totals, variants: real };
}

export async function platformCards(h: DB) {
  const statuses = await socialConnectionStatus(h);
  const variants = await h.select().from(socialVariants).where(inArray(socialVariants.status, ["published", "posted_manually"])).orderBy(desc(socialVariants.publishedAt));
  const snapshots = await h.select().from(socialAccountSnapshots).orderBy(desc(socialAccountSnapshots.date));
  return Promise.all(PLATFORMS.map(async (platform) => {
    const connection = platform === "portfolio" ? null : await socialConnection(h, platform);
    const provider = getProvider(platform, connection);
    return { platform, label: provider.label, isMock: provider.isMock, capabilities: provider.capabilities,
      connection: platform === "portfolio" ? null : statuses[platform],
      followers: snapshots.find((s) => s.platform === platform)?.followers ?? null,
      latest: variants.find((v) => v.platform === platform) ?? null };
  }));
}

export async function listSources(h: DB) {
  const [p, e, r] = await Promise.all([
    h.select({ id: projects.id, title: projects.name, description: projects.description }).from(projects).where(eq(projects.status, "active")),
    h.select({ id: outreachEvents.id, title: outreachEvents.title, description: outreachEvents.description }).from(outreachEvents).where(isNotNull(outreachEvents.stage)),
    h.select({ id: githubRepos.id, title: githubRepos.fullName, description: githubRepos.description }).from(githubRepos).orderBy(desc(githubRepos.pushedAt)).limit(50),
  ]);
  return { projects: p, events: e, repos: r };
}

export async function buildStarter(h: DB, kind: "project" | "outreach_event" | "repo", id: string) {
  if (kind === "project") {
    const [row] = await h.select().from(projects).where(eq(projects.id, id));
    return row ? { title: row.name, body: row.description || row.context, sourceKind: kind, sourceId: id, draftedFromContent: true } : null;
  }
  if (kind === "outreach_event") {
    const [row] = await h.select().from(outreachEvents).where(and(eq(outreachEvents.id, id), isNotNull(outreachEvents.stage)));
    return row ? { title: row.title, body: row.description, sourceKind: kind, sourceId: id, draftedFromContent: true } : null;
  }
  const [row] = await h.select().from(githubRepos).where(eq(githubRepos.id, Number(id)));
  return row ? { title: row.fullName, body: row.description ?? "", sourceKind: kind, sourceId: id, draftedFromContent: true } : null;
}
