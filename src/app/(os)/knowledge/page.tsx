import { KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, normaliseTags, type KnowledgeKind } from "@/lib/knowledge";
import { KnowledgeView } from "@/knowledge/knowledge-view";
import { db } from "@/server/db/client";
import { loadKnowledge } from "@/server/knowledge";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Knowledge · LifeOS" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const p = await searchParams;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const kind = KNOWLEDGE_KINDS.includes(str("kind") as KnowledgeKind) ? (str("kind") as KnowledgeKind) : null;
  const data = await loadKnowledge(db(), {
    q: str("q").slice(0, KNOWLEDGE_LIMITS.query),
    mode: str("mode") === "semantic" ? "semantic" : "keyword",
    kind,
    tags: normaliseTags(str("tags")).slice(0, KNOWLEDGE_LIMITS.tags),
    selected: UUID.test(str("item")) ? str("item") : null,
  });
  return <KnowledgeView data={data} />;
}
