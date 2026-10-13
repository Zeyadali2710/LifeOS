import Link from "next/link";
import { OutreachView } from "@/outreach/outreach-view";
import { writableCalendars, pickDefaultCalendar } from "@/server/calendar/queries";
import { db } from "@/server/db/client";
import { loadInterests, loadOutreachEvents, pipelineEvents, sourceStatus } from "@/server/outreach/queries";
import { requireOwner } from "@/server/session";
import { PageHeader } from "@/ui/page-header";

export const metadata = { title: "Outreach · LifeOS" };
export const dynamic = "force-dynamic";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string; interest?: string; view?: string; mock?: string; import?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const now = new Date();

  let data = null;
  try {
    const h = db();
    const status = await sourceStatus(h);
    // `mock=1` shows mocks, `mock=0` hides them; by default they are hidden once a real source exists.
    const hideMock = sp.mock === "1" ? false : sp.mock === "0" ? true : status.hasRealSource;
    const [events, pipeline, interests, cals, defaultCalendarId] = await Promise.all([
      loadOutreachEvents(h, now, { hideMock }),
      pipelineEvents(h),
      loadInterests(h),
      writableCalendars(h),
      pickDefaultCalendar(h),
    ]);
    data = { events, pipeline, interests, status, hideMock, defaultCalendarId, calendars: cals.map((c) => ({ id: c.id, name: c.name })) };
  } catch (e) {
    console.error("outreach: load failed", e instanceof Error ? e.name : "unknown");
  }

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col">
      <PageHeader eyebrow={{ text: "OUTREACH", className: "text-cyan" }} title="Outreach" lead="Sydney events worth your time, and the email that needs you." />
      {data ? (
        <OutreachView {...data} />
      ) : (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-24 border border-[rgba(255,105,97,.3)] bg-[rgba(255,105,97,.06)] p-5 text-[13.5px] text-text-2">
          Couldn&apos;t load events.
          <Link href="/outreach" className="text-text underline">
            Try again
          </Link>
        </div>
      )}
    </div>
  );
}
