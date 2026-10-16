import Link from "next/link";
import { BRIEFING_LABEL, type BriefingKind } from "@/lib/digest";
import { BuildNow } from "@/briefings/briefing-view";
import { listBriefings } from "@/server/briefings";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";
import { EmptyState } from "@/ui/empty-state";

export const metadata = { title: "Briefings · LifeOS" };
export const dynamic = "force-dynamic";

const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function BriefingsPage() {
  await requireOwner();
  const rows = await listBriefings(db());
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] tracking-[.12em] text-text-3">BRIEFINGS</p>
          <h1 className="font-display text-[clamp(36px,4.4vw,60px)] leading-[.95]">Your day, summarised.</h1>
          <p className="text-[13px] text-text-2">Built from your LifeOS data on a schedule. <Link href="/settings?section=briefings" className="text-text hover:underline">Change times →</Link></p>
        </div>
      </header>
      <section aria-label="Build a briefing now" className="flex flex-col gap-2">
        <span className="text-[10.5px] tracking-[.12em] text-text-3">BUILD NOW</span>
        <BuildNow />
      </section>
      {rows.length === 0 ? (
        <EmptyState icon="event_note" title="No briefings yet." body="The first one arrives at the next scheduled time, or build one now." />
      ) : (
        <ul aria-label="Recent briefings" className="glass-card flex flex-col rounded-24 p-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/briefings/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-16 px-3 py-3 text-text hover:bg-white/[.03]">
                <span className={`size-2 rounded-full ${b.readAt ? "bg-transparent" : "bg-accent"}`} aria-label={b.readAt ? undefined : "Unread"} />
                <span className="flex-1 text-[13.5px] font-medium tab:w-36 tab:flex-none">{BRIEFING_LABEL[b.kind as BriefingKind]}</span>
                <span className="order-last min-w-0 basis-full pl-6 text-[13px] text-text-2 tab:order-none tab:basis-auto tab:flex-1 tab:pl-0">{b.headline}</span>
                <span className="text-[12px] text-text-3">{day(b.period)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
