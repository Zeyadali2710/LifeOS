import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { knowledgeItems, settings } from "@/server/db/schema";
import { embedPending, getKnowledgeItem, loadKnowledge, searchKnowledge, semanticStatus, setSemanticEnabled } from "@/server/knowledge";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const allowed = vi.hoisted(() => ({ owner: true }));
vi.mock("@/server/session", () => ({ requireOwner: async () => { if (!allowed.owner) throw new Error("Not owner"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/queue", async (orig) => ({ ...(await orig<object>()), enqueue: async () => {} }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), db: () => t.handle() }));
import { deleteKnowledgeAction, markKnowledgeViewedAction, saveKnowledgeAction, setKnowledgeSemanticAction, uploadKnowledgeAction } from "@/server/knowledge-actions";

const h = () => t.handle();
const key = async () => "sk-test";
// Deterministic fake embedding: one hot dimension per topic word, so cosine similarity is predictable.
const TOPICS = ["database", "running", "approval"];
const vec = (text: string) => { const v = new Array(1536).fill(0.001); TOPICS.forEach((w, i) => { if (text.toLowerCase().includes(w)) v[i] = 1; }); return v; };
const fakeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
  const { input } = JSON.parse(String(init!.body)) as { input: string[] };
  return new Response(JSON.stringify({ data: input.map((s, index) => ({ index, embedding: vec(s) })) }), { status: 200 });
}) as unknown as typeof fetch;
const save = async (v: Record<string, unknown>) => { const r = await saveKnowledgeAction({ kind: "note", tags: [], ...v }); if (!r.ok) throw new Error(r.error); return r.id!; };

beforeEach(async () => {
  allowed.owner = true;
  await h().delete(knowledgeItems);
  await h().delete(settings).where(eq(settings.key, "knowledge.semantic"));
  vi.mocked(fakeFetch).mockClear();
});

describe("knowledge items", () => {
  it("creates, edits, views and deletes with validation", async () => {
    expect(await saveKnowledgeAction({ kind: "bookmark", title: "Docs", url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(await saveKnowledgeAction({ kind: "bookmark", title: "Docs" })).toMatchObject({ ok: false, error: "Bookmarks need a link." });
    expect(await saveKnowledgeAction({ kind: "note", title: " " })).toMatchObject({ ok: false });
    expect(await saveKnowledgeAction({ kind: "note", title: "x", tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })).toMatchObject({ ok: false });
    const id = await save({ title: "Event log", body: "Append only", tags: ["#LifeOS", "lifeos", "Event Sourcing"] });
    expect((await getKnowledgeItem(h(), id))?.tags).toEqual(["lifeos", "event-sourcing"]);
    const before = (await getKnowledgeItem(h(), id))!.updatedAt;
    await markKnowledgeViewedAction(id);
    const viewed = (await getKnowledgeItem(h(), id))!;
    expect(viewed.viewedAt).not.toBeNull();
    expect(viewed.updatedAt).toBe(before);
    expect(await saveKnowledgeAction({ kind: "idea", title: "Event log v2", body: "", tags: [] }, id)).toMatchObject({ ok: true });
    expect((await getKnowledgeItem(h(), id))?.kind).toBe("idea");
    expect(await deleteKnowledgeAction(id)).toMatchObject({ ok: true });
    expect(await deleteKnowledgeAction(id)).toMatchObject({ ok: false });
  });

  it("uploads UTF-8 markdown as a document titled from its heading and rejects invalid files", async () => {
    const form = (name: string, bytes: Uint8Array<ArrayBuffer> | string) => { const f = new FormData(); f.set("file", new File([bytes], name)); f.set("tags", "unsw, notes"); return f; };
    expect(await uploadKnowledgeAction(form("a.pdf", "x"))).toMatchObject({ ok: false });
    expect(await uploadKnowledgeAction(form("a.md", new Uint8Array([0xff, 0xfe, 0x00])))).toMatchObject({ ok: false, error: "The file isn't valid UTF-8 text." });
    const r = await uploadKnowledgeAction(form("proposal.md", "﻿intro\n# Capstone proposal\nBody"));
    expect(r.ok).toBe(true);
    const item = await getKnowledgeItem(h(), (r as { id: string }).id);
    expect(item).toMatchObject({ kind: "document", title: "Capstone proposal", source: "upload", tags: ["unsw", "notes"] });
  });

  it("keyword search uses safe prefixes, tags and filters", async () => {
    await save({ title: "Approval UX principles", body: "Show what will happen", tags: ["ux"] });
    await save({ kind: "research", title: "Cloud IAM paths", body: "privilege escalation", tags: ["security"] });
    await save({ title: "Coffee notes", body: "nothing here", tags: ["approval"] });
    const titles = async (q: string, extra: object = {}) => (await searchKnowledge(h(), { q, mode: "keyword", kind: null, tags: [], ...extra })).hits.map((x) => x.title);
    expect(await titles("approv")).toEqual(expect.arrayContaining(["Approval UX principles"]));
    expect(await titles("approval")).toContain("Coffee notes"); // tag match
    expect(await titles("privil escal")).toEqual(["Cloud IAM paths"]);
    expect(await titles("approval", { kind: "research" })).toEqual([]);
    expect(await titles("", { tags: ["security"] })).toEqual(["Cloud IAM paths"]);
    for (const nasty of ["'); drop table knowledge_items; --", "a & | ! :* <->", "***"]) await expect(searchKnowledge(h(), { q: nasty, mode: "keyword", kind: null, tags: [] })).resolves.toBeDefined();
    expect(await h().select().from(knowledgeItems)).toHaveLength(3);
  });

  it("semantic search is off by default, then embeds changed items and ranks by meaning", async () => {
    await save({ title: "Postgres notes", body: "database indexing" });
    await save({ title: "Half marathon plan", body: "running 25 km a week" });
    expect(await searchKnowledge(h(), { q: "database", mode: "semantic", kind: null, tags: [] }, { fetch: fakeFetch, key })).toMatchObject({ semanticError: "disabled" });
    expect(await embedPending(h(), { fetch: fakeFetch, key })).toMatchObject({ embedded: 0, skipped: "disabled" });
    expect(fakeFetch).not.toHaveBeenCalled();

    expect(await setKnowledgeSemanticAction(true)).toMatchObject({ ok: true });
    expect(await embedPending(h(), { fetch: fakeFetch, key })).toEqual({ embedded: 2 });
    expect(await embedPending(h(), { fetch: fakeFetch, key })).toEqual({ embedded: 0 });
    expect(await semanticStatus(h())).toMatchObject({ enabled: true, indexed: 2, total: 2 });
    const hits = (await searchKnowledge(h(), { q: "running shoes", mode: "semantic", kind: null, tags: [] }, { fetch: fakeFetch, key })).hits;
    expect(hits[0]?.title).toBe("Half marathon plan");
    expect(hits[0]!.score!).toBeGreaterThan(hits[1]!.score!);

    const id = hits[1]!.id;
    await saveKnowledgeAction({ kind: "note", title: "Postgres notes", body: "approval queue design", tags: [] }, id);
    expect(await semanticStatus(h())).toMatchObject({ indexed: 1, total: 2 });
    expect(await embedPending(h(), { fetch: fakeFetch, key })).toEqual({ embedded: 1 });
  });

  it("keeps items pending when the provider fails or returns a malformed body", async () => {
    await setSemanticEnabled(h(), true);
    await save({ title: "A", body: "database" });
    const broken = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await embedPending(h(), { fetch: broken, key })).toMatchObject({ embedded: 0, skipped: "error" });
    const down = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await embedPending(h(), { fetch: down, key })).toMatchObject({ skipped: "error" });
    expect(await embedPending(h(), { fetch: fakeFetch, key: async () => null })).toMatchObject({ skipped: "no_key" });
    expect(await semanticStatus(h())).toMatchObject({ indexed: 0, total: 1 });
  });

  it("loads counts, tags, recent and detail for the page", async () => {
    const a = await save({ title: "One", tags: ["x", "y"] });
    await save({ kind: "idea", title: "Two", tags: ["x"] });
    await markKnowledgeViewedAction(a);
    const d = await loadKnowledge(h(), { q: "", mode: "keyword", kind: null, tags: [], selected: a });
    expect(d.counts).toMatchObject({ note: 1, idea: 1, document: 0 });
    expect(d.total).toBe(2);
    expect(d.tags[0]).toEqual({ tag: "x", n: 2 });
    expect(d.recent.map((r) => r.id)).toEqual([a]);
    expect(d.detail?.title).toBe("One");
  });

  it("checks the owner on every action", async () => {
    allowed.owner = false;
    for (const call of [() => saveKnowledgeAction({}), () => uploadKnowledgeAction(new FormData()), () => deleteKnowledgeAction("x"), () => markKnowledgeViewedAction("x"), () => setKnowledgeSemanticAction(true)]) {
      await expect(call()).rejects.toThrow("Not owner");
    }
  });
});
