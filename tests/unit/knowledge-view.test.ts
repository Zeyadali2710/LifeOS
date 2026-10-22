import { describe, expect, it } from "vitest";
import { knowledgeInput } from "@/lib/knowledge";
import { itemDraft, itemInput, knowledgeUrl } from "@/features/knowledge/model";
import type { KnowledgeDetail } from "@/server/knowledge";

describe("Knowledge editor payload", () => {
  it("retains all editable fields, including an archived project and optional note link", () => {
    const item: KnowledgeDetail = {
      id: "00000000-0000-4000-8000-000000000001", kind: "note", title: "A decision", body: "Full text\nwith paragraphs",
      tags: ["architecture", "lifeos"], url: "https://example.com/reference", projectId: "00000000-0000-4000-8000-000000000002",
      source: "upload", projectName: "Archived project", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", viewedAt: null,
    };
    expect(knowledgeInput.parse(itemInput(itemDraft(item)))).toEqual({ kind: item.kind, title: item.title, body: item.body, tags: item.tags, url: item.url, projectId: item.projectId });
  });

  it("normalises comma-separated tags and clears optional links and projects", () => {
    const draft = { ...itemDraft(null), title: "Note", tags: "UX, #agents, UX", url: "  " };
    expect(knowledgeInput.parse(itemInput(draft))).toEqual({ kind: "note", title: "Note", body: "", url: null, projectId: null, tags: ["ux", "agents"] });
  });

  it("keeps bookmark, URL, tag and text validation for both new items and autosaves", () => {
    const draft = { ...itemDraft(null, "bookmark"), title: "Bookmark" };
    expect(knowledgeInput.safeParse(itemInput(draft)).success).toBe(false);
    expect(knowledgeInput.safeParse(itemInput({ ...draft, url: "javascript:alert(1)" })).success).toBe(false);
    expect(knowledgeInput.safeParse(itemInput({ ...draft, url: "https://example.com", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`).join(",") })).success).toBe(false);
    expect(knowledgeInput.safeParse(itemInput({ ...draft, url: "https://example.com", body: "x".repeat(200_001) })).success).toBe(false);
    expect(knowledgeInput.safeParse(itemInput({ ...draft, url: "https://example.com", body: "A bookmark note" })).success).toBe(true);
  });
});

describe("Knowledge URL state", () => {
  it("changes selection without dropping query, kind, semantic mode, tags or unknown params", () => {
    const url = knowledgeUrl("q=sync+design&kind=research&mode=semantic&tags=lifeos,agents&custom=keep&item=old", { item: "new" });
    const params = new URL(url, "https://lifeos.local").searchParams;
    expect(Object.fromEntries(params)).toEqual({ q: "sync design", kind: "research", mode: "semantic", tags: "lifeos,agents", custom: "keep", item: "new" });
  });

  it("clears only requested filters and avoids a trailing question mark", () => {
    expect(knowledgeUrl("mode=semantic&item=selected", { mode: null })).toBe("/knowledge?item=selected");
    expect(knowledgeUrl("q=search", { q: null })).toBe("/knowledge");
  });
});
