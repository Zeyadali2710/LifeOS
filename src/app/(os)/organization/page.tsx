import { OrganizationView } from "@/organization/organization-view";
import { db } from "@/server/db/client";
import { humanRule } from "@/server/calendar/expand";
import { addDaysYmd, sydneyYmd } from "@/server/calendar/free-slots";
import { organizationData, type View } from "@/server/calendar/queries";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Organization · LifeOS" };
export const dynamic = "force-dynamic";

const VIEWS: readonly string[] = ["day", "week", "month"];

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; event?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const now = new Date();
  const today = sydneyYmd(now);
  const view = (VIEWS.includes(sp.view ?? "") ? sp.view : "week") as View;
  // clamp to the sync window (now - 30 d .. now + 365 d); YYYY-MM-DD only
  const lo = sydneyYmd(new Date(now.getTime() - 30 * 86400000));
  const hi = sydneyYmd(new Date(now.getTime() + 365 * 86400000));
  const raw = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && addDaysYmd(sp.date, 0) === sp.date ? sp.date : today;
  const date = raw < lo ? lo : raw > hi ? hi : raw;

  const data = await organizationData(db(), { view, date, now });
  const instances = data.instances.map((i) => ({ ...i, repeatText: i.rrule ? humanRule(i.rrule) : null }));

  return (
    <div className="max-w-[1480px]">
      <OrganizationView
        data={{ ...data, instances }}
        view={view}
        hasViewParam={Boolean(sp.view)}
        date={date}
        today={today}
        nowIso={now.toISOString()}
        eventParam={typeof sp.event === "string" ? sp.event : null}
      />
    </div>
  );
}
