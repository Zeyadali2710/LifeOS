import { BriefingsScreen } from "@/features/briefings/briefings-screen";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Briefing ? LifeOS" };
export const dynamic = "force-dynamic";

export default async function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  return <BriefingsScreen selectedId={(await params).id} />;
}
