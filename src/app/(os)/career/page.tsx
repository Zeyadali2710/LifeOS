import { CareerView } from "@/features/career/career-view";
import { RouteState } from "@/features/shell/route-state";
import { loadCareerView } from "@/server/career-view";
import { loadCareer } from "@/server/career";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Career · LifeOS" };
export const dynamic = "force-dynamic";

export default async function CareerPage() {
  await requireOwner();
  const now = new Date();
  const data = await loadCareer(db(), now);
  if (data.connection.status === "none") return <RouteState route="career" kind="disconnected" />;
  const extra = await loadCareerView(db(), now);
  return <CareerView data={data} extra={extra} now={now.toISOString()} />;
}
