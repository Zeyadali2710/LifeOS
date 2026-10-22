"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BRIEFING_KINDS, BRIEFING_LABEL, type BriefingBody, type BriefingKind } from "@/lib/digest";
import { briefingNowAction, markBriefingReadAction } from "@/server/briefing-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";

export function BriefingSections({ id, body }: { id: string; body: BriefingBody }) {
  useEffect(() => { void markBriefingReadAction(id); }, [id]);
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
      {body.sections.map((s) => (
        <section key={s.id} aria-labelledby={`b-${s.id}`} className="glass-card flex flex-col gap-2 rounded-22 p-4">
          <h2 id={`b-${s.id}`} className="text-[10.5px] tracking-[.12em] text-text-3">{s.label.toUpperCase()}</h2>
          {s.items.length === 0 ? <p className="text-[13px] text-text-3">{s.empty}</p> : (
            <ul className="flex flex-col gap-1.5">
              {s.items.map((it, i) => {
                const inner = <><span className="min-w-0 flex-1 break-words">{it.text}</span>{it.meta && <span className="shrink-0 text-[11.5px] text-text-3">{it.meta}</span>}</>;
                return <li key={i} className="text-[13.5px]">{it.href ? <Link href={it.href} className="flex gap-3 rounded-8 text-text hover:text-text-2">{inner}</Link> : <span className="flex gap-3">{inner}</span>}</li>;
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function BuildNow() {
  const router = useRouter(), { toast } = useShell();
  const [busy, setBusy] = useState<BriefingKind | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {BRIEFING_KINDS.map((k) => (
        <Button key={k} variant="secondary" size="sm" loading={busy === k} onClick={async () => {
          setBusy(k);
          const r = await briefingNowAction(k);
          setBusy(null);
          if (r.ok) router.push(`/briefings/${r.id}`); else toast(r.error, "error");
        }}>{BRIEFING_LABEL[k]}</Button>
      ))}
    </div>
  );
}
