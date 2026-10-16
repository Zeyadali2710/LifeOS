import Link from "next/link";
import { notFound } from "next/navigation";
import { BRIEFING_LABEL, type BriefingKind } from "@/lib/digest";
import { BriefingSections } from "@/briefings/briefing-view";
import { getBriefing } from "@/server/briefings";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Briefing · LifeOS" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const b = UUID.test(id) ? await getBriefing(db(), id) : null;
  if (!b) notFound();
  const when = new Date(b.createdAt).toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <header className="flex flex-col gap-2.5">
        <Link href="/briefings" className="text-[12px] text-text-3 hover:text-text">← All briefings</Link>
        <p className="text-[11px] tracking-[.12em] text-text-3">{BRIEFING_LABEL[b.kind as BriefingKind].toUpperCase()} · {when.toUpperCase()}</p>
        <h1 className="font-display text-[clamp(32px,4vw,52px)] leading-[1]">{b.headline}</h1>
      </header>
      <BriefingSections id={b.id} body={b.body} />
    </div>
  );
}
