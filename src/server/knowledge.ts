import { and, arrayOverlaps, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { embeddingText, KNOWLEDGE_KINDS, prefixQuery, type KnowledgeKind, type KnowledgeSearchMode } from "@/lib/knowledge";
import type { DB } from "./db/client";
import { connections, knowledgeItems, knowledgeSearchText, projects, settings } from "./db/schema";
import { openrouterKey } from "./github/connections";
import { log } from "./log";

export const SEMANTIC_KEY = "knowledge.semantic";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBED_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBED_BATCH = 32;
const contentHash = sql<string>`md5(${knowledgeItems.title} || E'\\n' || ${knowledgeItems.body})`;

export async function semanticEnabled(h: DB): Promise<boolean> {
  const [r] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, SEMANTIC_KEY));
  return r?.v === true;
}

export async function setSemanticEnabled(h: DB, on: boolean): Promise<void> {
  await h.insert(settings).values({ key: SEMANTIC_KEY, value: on }).onConflictDoUpdate({ target: settings.key, set: { value: on } });
}

async function openrouterConnected(h: DB): Promise<boolean> {
  const [r] = await h.select({ s: connections.status }).from(connections).where(eq(connections.id, "openrouter"));
  return r?.s === "connected";
}

type EmbedFetch = typeof fetch;

/** Embeds texts through OpenRouter. Throws on any non-conforming response so nothing half-written is stored. */
export async function embed(key: string, inputs: string[], f: EmbedFetch = fetch): Promise<number[][]> {
  const res = await f(EMBED_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`embeddings http ${res.status}`);
  const body = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const data = body.data ?? [];
  const out = inputs.map((_, i) => data.find((d) => d.index === i)?.embedding);
  if (out.some((v) => !Array.isArray(v) || v.length !== 1536 || !v.every(Number.isFinite))) throw new Error("embeddings bad body");
  return out as number[][];
}

/** Worker job: embed items whose content changed since their last embedding. Edits re-index; deletes need nothing. */
export async function embedPending(h: DB, opts: { fetch?: EmbedFetch; key?: () => Promise<string | null> } = {}): Promise<{ embedded: number; skipped?: string }> {
  if (!(await semanticEnabled(h))) return { embedded: 0, skipped: "disabled" };
  const key = await (opts.key ?? (() => openrouterKey(h)))();
  if (!key) return { embedded: 0, skipped: "no_key" };
  let embedded = 0;
  for (let round = 0; round < 10; round++) {
    // Re-checked every batch: switching semantic search off must stop further item text leaving LifeOS.
    if (round > 0 && !(await semanticEnabled(h))) return { embedded, skipped: "disabled" };
    const rows = await h.select({ id: knowledgeItems.id, title: knowledgeItems.title, body: knowledgeItems.body, hash: contentHash }).from(knowledgeItems)
      .where(sql`${knowledgeItems.embeddedHash} is distinct from ${contentHash}`).limit(EMBED_BATCH);
    if (!rows.length) break;
    let vectors: number[][];
    try {
      vectors = await embed(key, rows.map((r) => embeddingText(r.title, r.body)), opts.fetch);
    } catch (err) {
      log.warn({ err: String(err) }, "knowledge embedding failed; retrying next run");
      return { embedded, skipped: "error" };
    }
    for (let i = 0; i < rows.length; i++) {
      // Only store if the text is still what was embedded; an edit during the call leaves it pending.
      await h.update(knowledgeItems).set({ embedding: vectors[i]!, embeddedHash: rows[i]!.hash })
        .where(and(eq(knowledgeItems.id, rows[i]!.id), sql`${contentHash} = ${rows[i]!.hash}`));
    }
    embedded += rows.length;
  }
  return { embedded };
}

export type SemanticStatus = { enabled: boolean; connected: boolean; indexed: number; total: number };

export async function semanticStatus(h: DB): Promise<SemanticStatus> {
  const [enabled, connected, [totals]] = await Promise.all([
    semanticEnabled(h),
    openrouterConnected(h),
    h.select({ total: count(), indexed: sql<number>`count(*) filter (where ${knowledgeItems.embeddedHash} = ${contentHash})::int` }).from(knowledgeItems),
  ]);
  return { enabled, connected, indexed: totals?.indexed ?? 0, total: totals?.total ?? 0 };
}

export type KnowledgeFilter = { q: string; mode: KnowledgeSearchMode; kind: KnowledgeKind | null; tags: string[]; limit?: number };
export type KnowledgeHit = { id: string; kind: KnowledgeKind; title: string; excerpt: string; tags: string[]; url: string | null; updatedAt: string; score: number | null };

const excerpt = (body: string, url: string | null) => (body.replace(/\s+/g, " ").trim().slice(0, 220) || url || "");

/** Keyword (FTS prefix + tag match) or semantic (cosine) search, both honouring kind/tag filters. */
export async function searchKnowledge(h: DB, f: KnowledgeFilter, opts: { fetch?: EmbedFetch; key?: () => Promise<string | null> } = {}): Promise<{ hits: KnowledgeHit[]; semanticError?: string }> {
  const limit = f.limit ?? 50;
  const filters = and(
    f.kind ? eq(knowledgeItems.kind, f.kind) : undefined,
    f.tags.length ? arrayOverlaps(knowledgeItems.tags, f.tags) : undefined,
  );
  const cols = { id: knowledgeItems.id, kind: knowledgeItems.kind, title: knowledgeItems.title, body: knowledgeItems.body, tags: knowledgeItems.tags, url: knowledgeItems.url, updatedAt: knowledgeItems.updatedAt };
  const toHit = (r: { id: string; kind: string; title: string; body: string; tags: string[]; url: string | null; updatedAt: Date }, score: number | null): KnowledgeHit =>
    ({ id: r.id, kind: r.kind as KnowledgeKind, title: r.title, excerpt: excerpt(r.body, r.url), tags: r.tags, url: r.url, updatedAt: r.updatedAt.toISOString(), score });
  const q = f.q.trim();

  if (q && f.mode === "semantic") {
    if (!(await semanticEnabled(h))) return { hits: [], semanticError: "disabled" };
    const key = await (opts.key ?? (() => openrouterKey(h)))();
    if (!key) return { hits: [], semanticError: "no_key" };
    let vector: number[];
    try {
      [vector] = (await embed(key, [q], opts.fetch)) as [number[]];
    } catch (err) {
      log.warn({ err: String(err) }, "knowledge query embedding failed");
      return { hits: [], semanticError: "unavailable" };
    }
    const distance = sql<number>`${knowledgeItems.embedding} <=> ${JSON.stringify(vector)}::vector`;
    const rows = await h.select({ ...cols, distance }).from(knowledgeItems).where(and(filters, isNotNull(knowledgeItems.embedding), sql`${knowledgeItems.embeddedHash} = ${contentHash}`)).orderBy(distance).limit(limit);
    return { hits: rows.map((r) => toHit(r, Math.max(0, Math.min(1, 1 - Number(r.distance))))) };
  }

  const tsq = prefixQuery(q);
  if (q && !tsq) return { hits: [] };
  if (!tsq) {
    const rows = await h.select(cols).from(knowledgeItems).where(filters).orderBy(desc(knowledgeItems.updatedAt)).limit(limit);
    return { hits: rows.map((r) => toHit(r, null)) };
  }
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tagHit = arrayOverlaps(knowledgeItems.tags, tokens);
  const match = sql`(${knowledgeSearchText} @@ to_tsquery('simple', ${tsq}) or ${tagHit})`;
  const rank = sql<number>`ts_rank(${knowledgeSearchText}, to_tsquery('simple', ${tsq})) + case when ${tagHit} then 0.5 else 0 end`;
  const rows = await h.select(cols).from(knowledgeItems).where(and(filters, match)).orderBy(desc(rank), desc(knowledgeItems.updatedAt)).limit(limit);
  return { hits: rows.map((r) => toHit(r, null)) };
}

export async function getKnowledgeItem(h: DB, id: string) {
  const [r] = await h.select({ item: knowledgeItems, projectName: projects.name }).from(knowledgeItems)
    .leftJoin(projects, eq(projects.id, knowledgeItems.projectId)).where(eq(knowledgeItems.id, id));
  if (!r) return null;
  const item = r.item;
  return { id: item.id, title: item.title, body: item.body, url: item.url, tags: item.tags, source: item.source, projectId: item.projectId, kind: item.kind as KnowledgeKind, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), viewedAt: item.viewedAt?.toISOString() ?? null, projectName: r.projectName };
}
export type KnowledgeDetail = NonNullable<Awaited<ReturnType<typeof getKnowledgeItem>>>;

export async function loadKnowledge(h: DB, f: KnowledgeFilter & { selected: string | null }) {
  const [search, kinds, tagRows, recent, status, projectRows, detail] = await Promise.all([
    searchKnowledge(h, f),
    h.select({ kind: knowledgeItems.kind, n: count() }).from(knowledgeItems).groupBy(knowledgeItems.kind),
    h.execute<{ tag: string; n: number }>(sql`select tag, count(*)::int as n from knowledge_items, unnest(tags) as tag group by tag order by n desc, tag limit 40`),
    h.select({ id: knowledgeItems.id, title: knowledgeItems.title, viewedAt: knowledgeItems.viewedAt }).from(knowledgeItems).where(isNotNull(knowledgeItems.viewedAt)).orderBy(desc(knowledgeItems.viewedAt)).limit(5),
    semanticStatus(h),
    h.select({ id: projects.id, name: projects.name }).from(projects).where(sql`${projects.status} <> 'archived'`).orderBy(projects.name),
    f.selected ? getKnowledgeItem(h, f.selected) : Promise.resolve(null),
  ]);
  const counts = Object.fromEntries(KNOWLEDGE_KINDS.map((k) => [k, kinds.find((r) => r.kind === k)?.n ?? 0])) as Record<KnowledgeKind, number>;
  return {
    filter: { q: f.q, mode: f.mode, kind: f.kind, tags: f.tags },
    hits: search.hits, semanticError: search.semanticError ?? null,
    counts, total: Object.values(counts).reduce((a, b) => a + b, 0),
    tags: tagRows.rows.map((r) => ({ tag: r.tag, n: Number(r.n) })),
    recent: recent.map((r) => ({ id: r.id, title: r.title, viewedAt: r.viewedAt!.toISOString() })),
    semantic: status, projects: projectRows, detail,
  };
}
export type KnowledgeData = Awaited<ReturnType<typeof loadKnowledge>>;
