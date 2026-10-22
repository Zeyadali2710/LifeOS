import { db } from "@/server/db/client";
import { loadHome } from "@/server/home";
import { requireOwner } from "@/server/session";
import { HomeView } from "@/features/home/home-view";
import { RouteState } from "@/features/shell/route-state";

export default async function HomePage() {
  const { user } = await requireOwner();
  const data = await loadHome(db(), new Date(), user.name);
  const d = data.digest;
  const nothing = !d.events.length && !d.tasks.length && !data.approvals.length && !data.priorities.length && !data.projects.length && !data.outreach.mails.length;
  if (nothing) return <RouteState route="home" kind={d.calendarConnected ? "empty" : "disconnected"} action={d.calendarConnected ? { label: "Open Organization", href: "/organization" } : undefined} />;
  return <HomeView data={data} />;
}
