"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FollowUpDTO } from "@/lib/outreach-types";
import { toggleTaskAction } from "@/server/task-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Checkbox } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { InlineError } from "@/ui/inline-error";
import { SectionHeader } from "@/ui/section-header";
import { dateShort, sydneyYmd } from "./fmt";

const day = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

function due(ymd: string | null, today: string): { text: string; cls: string } {
  if (!ymd) return { text: "No due date", cls: "text-text-3" };
  const diff = Math.round((day(ymd) - day(today)) / 86_400_000);
  return { text: dateShort(`${ymd}T12:00:00Z`), cls: diff < 0 ? "text-red" : diff <= 3 ? "text-amber" : "text-text-3" };
}

export function FollowUps({ items, onDraft }: { items: FollowUpDTO[] | null; onDraft: (mailId: string) => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [today] = useState(() => sydneyYmd(new Date().toISOString()));
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [say, setSay] = useState("");

  if (!items) {
    return (
      <InlineError
        label="ERROR · FOLLOW-UPS"
        title="Couldn't load follow-ups."
        what="The follow-up list could not be read."
        why="The database may be unreachable."
        fix="Try again in a moment."
        action={{ label: "Try again", onClick: () => router.refresh() }}
      />
    );
  }

  const rows = items.filter((t) => !gone.has(t.id));
  const complete = async (t: FollowUpDTO) => {
    setGone((s) => new Set(s).add(t.id));
    setSay(`${t.title} done`);
    const r = await toggleTaskAction(t.id, true).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setGone((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
      return toast("Couldn't update. Try again.", "error");
    }
    router.refresh();
  };

  return (
    <section aria-labelledby="follow-ups-h" className="flex flex-col">
      <SectionHeader id="follow-ups-h" label="FOLLOW-UPS" meta={`${rows.length} open · from events and email`} />
      {rows.length === 0 ? (
        <EmptyState icon="task_alt" title="No follow-ups" body="Follow up on an event you attended, or add an email's action item as a task. They collect here." />
      ) : (
        <ul className="glass-card flex flex-col rounded-24 p-2">
          {rows.map((t) => {
            const d = due(t.dueDate, today);
            const c = t.context;
            return (
              <li key={t.id} className="grid animate-[lo-in_.2s_ease-out] grid-cols-[22px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-16 px-3 py-2.5 hover:bg-white/[.03]">
                <Checkbox hitArea aria-label={`Mark ${t.title} done`} checked={false} onChange={() => void complete(t)} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-medium break-words">{t.title}</span>
                  <Link
                    href={c.kind === "event" ? `/outreach/events/${c.id}` : `/outreach?tab=email&mail=${c.id}`}
                    className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text"
                  >
                    <Icon name={c.kind === "event" ? "event" : "mail"} size={14} className="shrink-0" />
                    <span className="truncate">{c.kind === "event" ? `From event · ${c.title}` : `From email · ${c.subject} · ${c.sender}`}</span>
                  </Link>
                </div>
                <span className={`text-[12.5px] whitespace-nowrap ${d.cls}`}>{d.text}</span>
                {c.kind === "email" ? (
                  <Button variant="ghost" size="xs" onClick={() => onDraft(c.id)}>
                    <Icon name="auto_awesome" size={14} />
                    Draft with agent
                  </Button>
                ) : (
                  <Link href={`/outreach/events/${c.id}`} className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] text-text-2 hover:bg-white/[.06] hover:text-text">
                    Open event
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {say}
      </div>
    </section>
  );
}
