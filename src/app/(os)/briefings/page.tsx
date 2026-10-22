import { BriefingsScreen } from "@/features/briefings/briefings-screen";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Briefings ? LifeOS" };
export const dynamic = "force-dynamic";

export default async function BriefingsPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  await requireOwner();
  const { id } = await searchParams;
  return <BriefingsScreen selectedId={Array.isArray(id) ? id[0] : id} />;
}
