import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Knowledge · LifeOS" };

export default function KnowledgePage() {
  return (
    <DomainPage
      title="Knowledge"
      lead="Notes, documents and bookmarks."
      icon="library_books"
      emptyTitle="Knowledge is empty."
      emptyBody="Notes, documents and bookmarks live here once Knowledge is built."
    />
  );
}
