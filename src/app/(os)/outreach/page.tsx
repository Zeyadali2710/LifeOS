import { OutreachView } from "@/features/outreach/outreach-view";
import { writableCalendars, pickDefaultCalendar } from "@/server/calendar/queries";
import { db } from "@/server/db/client";
import { loadInterests, loadOutreachEvents, pipelineEvents, sourceStatus } from "@/server/outreach/queries";
import { requireOwner } from "@/server/session";
import { followUpCount, listFollowUps, mailStatus, pendingReplyFor } from "@/server/mail/queries";
import type { MailData } from "@/features/outreach/outreach-view";
import { outreachMailboxes } from "@/server/outreach-view";
import { RouteState } from "@/features/shell/route-state";

export const metadata = { title: "Outreach · LifeOS" };
export const dynamic = "force-dynamic";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ box?: string; when?: string; free?: string; sort?: string; q?: string; tab?: string; interest?: string; view?: string; mock?: string; import?: string; cat?: string; mail?: string; draft?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const now = new Date();

  let data = null;
  let mail: MailData | null = null;
  let followUps: Awaited<ReturnType<typeof listFollowUps>> | null = null;
  let followUpN = 0;
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

  try {
    const h = db();
    const status = await mailStatus(h);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const want = sp.mail && uuid.test(sp.mail) ? sp.mail : null;
    const boxes = await outreachMailboxes(h, sp.box ?? (sp.mail ? "all" : sp.cat && sp.tab !== "discover" ? sp.cat : "all"), want);
    const selectedId = boxes.items.find((m) => m.id === want)?.id ?? boxes.items[0]?.id ?? null;
    const approval = selectedId ? await pendingReplyFor(h, selectedId) : null;
    // ?draft=1 only ever drafts for the exact requested mail; never fall back to another one (CR-U01)
    const missing = sp.mail !== undefined && selectedId !== want;
    mail = { status, ...boxes, selectedId, approval, autoDraft: sp.draft === "1" && want !== null && selectedId === want, missing };
  } catch (e) {
    console.error("outreach: mail load failed", e instanceof Error ? e.name : "unknown");
  }

  // separate from mail: a Gmail/mail-table failure must not hide event follow-ups (WR-U09)
  try {
    const h = db();
    followUpN = await followUpCount(h);
    if (sp.tab === "follow-ups") followUps = await listFollowUps(h);
  } catch (e) {
    console.error("outreach: follow-ups load failed", e instanceof Error ? e.name : "unknown");
  }

  if (!data) return <RouteState route="outreach" kind="error" action={{ label: "Try again", href: "/outreach" }} />;
  return <OutreachView {...data} mail={mail} followUps={followUps} followUpCount={followUpN} now={now.toISOString()} />;
}
