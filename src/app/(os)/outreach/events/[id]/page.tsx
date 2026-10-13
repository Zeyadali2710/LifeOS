import Link from "next/link";
import { z } from "zod";
import { EventDetail } from "@/outreach/event-detail";
import { pickDefaultCalendar, writableCalendars } from "@/server/calendar/queries";
import { db } from "@/server/db/client";
import { loadEvent } from "@/server/outreach/queries";
import { requireOwner } from "@/server/session";
import { EmptyState } from "@/ui/empty-state";

export const metadata = { title: "Event · Outreach · LifeOS" };
export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const valid = z.uuid().safeParse(id);
  const h = db();
  const event = valid.success ? await loadEvent(h, valid.data) : null;

  if (!event) {
    return (
      <div className="mx-auto flex max-w-[1480px] flex-col">
        <EmptyState
          icon="event_busy"
          title="Event not found"
          body="It may have been pruned after it ended. Saved events are always kept."
          action={
            <Link href="/outreach" className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[.03] px-3.5 text-[13px] font-medium text-text hover:bg-white/[.06]">
              Back to events
            </Link>
          }
        />
      </div>
    );
  }

  const [cals, defaultCalendarId] = await Promise.all([writableCalendars(h), pickDefaultCalendar(h)]);
  return (
    <div className="mx-auto flex max-w-[1480px] flex-col">
      <EventDetail event={event} calendars={cals.map((c) => ({ id: c.id, name: c.name }))} defaultCalendarId={defaultCalendarId} />
    </div>
  );
}
