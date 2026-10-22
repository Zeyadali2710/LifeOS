import { type KnowledgeKind } from "@/lib/knowledge";
import type { KnowledgeDetail } from "@/server/knowledge";

export function itemDraft(item: KnowledgeDetail | null, kind: KnowledgeKind = "note") {
  return {
    kind: item?.kind ?? kind,
    title: item?.title ?? "",
    body: item?.body ?? "",
    url: item?.url ?? "",
    tags: item?.tags.join(", ") ?? "",
    projectId: item?.projectId ?? "",
  };
}

export type ItemDraft = ReturnType<typeof itemDraft>;

export function itemInput(draft: ItemDraft) {
  return { ...draft, url: draft.url.trim() || null, tags: draft.tags.split(","), projectId: draft.projectId || null };
}

export function knowledgeUrl(params: string, patch: Record<string, string | null>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return `/knowledge${next.size ? `?${next}` : ""}`;
}

export function when(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
