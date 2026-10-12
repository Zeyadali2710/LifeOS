import { CareerView } from "@/career/career-view";
import { loadCareer } from "@/server/career";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";
import { PageHeader } from "@/ui/page-header";

export const metadata = { title: "Career · LifeOS" };
export const dynamic = "force-dynamic";

export default async function CareerPage() {
  await requireOwner();
  const now = new Date();
  const data = await loadCareer(db(), now);
  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <PageHeader
        eyebrow={{ text: "CAREER", className: "text-amber" }}
        title="Career"
        lead="Your repositories and engineering activity, live from GitHub."
      />
      <CareerView data={data} now={now.toISOString()} />
    </div>
  );
}
