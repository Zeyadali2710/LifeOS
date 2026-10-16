import { z } from "zod";
import { isSafeUrl } from "./safe-url";

export const KNOWLEDGE_KINDS = ["note", "document", "bookmark", "idea", "research"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
export const KIND_META: Record<KnowledgeKind, { label: string; section: string; icon: string }> = {
  note: { label: "Note", section: "Notes", icon: "sticky_note_2" },
  document: { label: "Document", section: "Documents", icon: "description" },
  bookmark: { label: "Bookmark", section: "Bookmarks", icon: "bookmark" },
  idea: { label: "Idea", section: "Ideas", icon: "lightbulb" },
  research: { label: "Research", section: "Research", icon: "biotech" },
};

export const KNOWLEDGE_LIMITS = { title: 200, body: 200_000, tags: 12, tag: 40, url: 2000, query: 200, uploadBytes: 500_000 } as const;
export const KNOWLEDGE_SEARCH_MODES = ["keyword", "semantic"] as const;
export type KnowledgeSearchMode = (typeof KNOWLEDGE_SEARCH_MODES)[number];

/** Lower-case, trimmed, de-duplicated tags; "#" prefixes and inner spaces are dropped. */
export function normaliseTags(raw: string[] | string): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[,\n]/);
  const out = list.map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase()).filter(Boolean);
  return [...new Set(out)];
}

export const knowledgeInput = z
  .object({
    kind: z.enum(KNOWLEDGE_KINDS),
    title: z.string().trim().min(1, "Add a title.").max(KNOWLEDGE_LIMITS.title),
    body: z.string().max(KNOWLEDGE_LIMITS.body, "Text is too long (200,000 characters max).").default(""),
    url: z.string().trim().max(KNOWLEDGE_LIMITS.url).nullable().default(null),
    tags: z.array(z.string()).default([]).transform(normaliseTags)
      .refine((t) => t.length <= KNOWLEDGE_LIMITS.tags, `Up to ${KNOWLEDGE_LIMITS.tags} tags.`)
      .refine((t) => t.every((x) => x.length <= KNOWLEDGE_LIMITS.tag), `Tags are up to ${KNOWLEDGE_LIMITS.tag} characters.`),
    projectId: z.uuid().nullable().default(null),
  })
  .transform((v) => ({ ...v, url: v.url ? v.url : null }))
  .superRefine((v, ctx) => {
    if (v.url && !isSafeUrl(v.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "Use an https:// link." });
    if (v.kind === "bookmark" && !v.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Bookmarks need a link." });
  });
export type KnowledgeInput = z.infer<typeof knowledgeInput>;

/** Safe prefix tsquery: only letter/number tokens reach to_tsquery, joined with AND. Empty means no keyword filter. */
export function prefixQuery(q: string): string {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.slice(0, 12).map((t) => `${t}:*`).join(" & ");
}

/**
 * Text sent for embedding: title plus the start of the body. 8,000 characters can never exceed the model's
 * 8,192-token input limit (a token is at least one character), so one dense item can't fail every batch.
 */
export const embeddingText = (title: string, body: string) => `${title}\n\n${body}`.slice(0, 8000);
