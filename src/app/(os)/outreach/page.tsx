import Link from "next/link";
import { OutreachView } from "@/outreach/outreach-view";
import { writableCalendars, pickDefaultCalendar } from "@/server/calendar/queries";
import { db } from "@/server/db/client";
import { loadInterests, loadOutreachEvents, pipelineEvents, sourceStatus } from "@/server/outreach/queries";
import { requireOwner } from "@/server/session";
import { followUpCount, listFollowUps, loadMailView, mailCatOf, mailStatus, pendingReplyFor } from "@/server/mail/queries";
import { MAIL_CATEGORIES, type MailCat } from "@/lib/outreach-types";
import type { MailData } from "@/outreach/outreach-view";
import { PageHeader } from "@/ui/page-header";

export const metadata = { title: "Outreach · LifeOS" };
export const dynamic = "force-dynamic";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string; interest?: string; view?: string; mock?: string; import?: string; cat?: string; mail?: string; draft?: string }> }) {
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
    const valid = new Set<string>([...MAIL_CATEGORIES.map((c) => c.toLowerCase()), "untriaged", "archived"]);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const want = sp.mail && uuid.test(sp.mail) ? sp.mail : null;
    let cat: MailCat | null = sp.cat && valid.has(sp.cat) ? (sp.cat as MailCat) : null;
    if (!cat && want) cat = await mailCatOf(h, want);
    let view = await loadMailView(h, { cat: cat ?? "important" });
    if (!cat) {
      // default: IMPORTANT, else the first non-empty category
      const order = [...MAIL_CATEGORIES.map((c) => c.toLowerCase()), "untriaged"] as MailCat[];
      cat = view.counts.IMPORTANT > 0 ? "important" : (order.find((c) => view.counts[c.toUpperCase() as keyof typeof view.counts] > 0) ?? "important");
      if (cat !== "important") view = await loadMailView(h, { cat });
    }
    const selectedId = view.items.find((m) => m.id === want)?.id ?? view.items[0]?.id ?? null;
    const approval = selectedId ? await pendingReplyFor(h, selectedId) : null;
    mail = { status, ...view, cat, selectedId, approval, autoDraft: sp.draft === "1" };
    followUpN = await followUpCount(h);
    if (sp.tab === "follow-ups") followUps = await listFollowUps(h);
  } catch (e) {
    console.error("outreach: mail load failed", e instanceof Error ? e.name : "unknown");
  }

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col">
      <PageHeader eyebrow={{ text: "OUTREACH", className: "text-cyan" }} title="Outreach" lead="Sydney events worth your time, and the email that needs you." />
      {data ? (
        <OutreachView {...data} mail={mail} followUps={followUps} followUpCount={followUpN} />
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
