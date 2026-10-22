import { z } from "zod";
import { EventDetail } from "@/features/outreach/events";
import { pickDefaultCalendar, writableCalendars } from "@/server/calendar/queries";
import { db } from "@/server/db/client";
import { loadEvent } from "@/server/outreach/queries";
import { requireOwner } from "@/server/session";
import { EmptyState } from "@/ui/feedback";
import { Page } from "@/ui/layout";
import { ButtonLink } from "@/ui/button";

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
      <Page>
        <EmptyState
          icon="event_busy"
          title="Event not found"
          body="It may have been pruned after it ended. Saved events are always kept."
          action={
            <ButtonLink href="/outreach?tab=discover">Back to events</ButtonLink>
          }
        />
      </Page>
    );
  }

  const [cals, defaultCalendarId] = await Promise.all([writableCalendars(h), pickDefaultCalendar(h)]);
  return (
    <>
      <EventDetail event={event} calendars={cals.map((c) => ({ id: c.id, name: c.name }))} defaultCalendarId={defaultCalendarId} />
    </>
  );
}
