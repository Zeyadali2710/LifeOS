"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { prevStage, nextStage, STAGE, STAGES, type OutreachEventDTO, type Stage } from "@/lib/outreach-types";
import { moveStageAction } from "@/server/outreach-pipeline-actions";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import { dateShort, hhmm, scoreColor } from "./fmt";
import { FollowUpDialog } from "./follow-up-dialog";

export function PipelineBoard({ events, onShowList }: { events: OutreachEventDTO[]; onShowList: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const uid = useId();
  const sig = events.map((e) => `${e.id}:${e.stage}`).join(",");
  const [seen, setSeen] = useState(sig);
  const [stages, setStages] = useState<Record<string, Stage | null>>(() => Object.fromEntries(events.map((e) => [e.id, e.stage])));
  const [followUp, setFollowUp] = useState<OutreachEventDTO | null>(null);
  if (seen !== sig) {
    setSeen(sig);
    setStages(Object.fromEntries(events.map((e) => [e.id, e.stage])));
  }

  const move = async (id: string, to: Stage | null) => {
    const from = stages[id] ?? null;
    setStages((s) => ({ ...s, [id]: to }));
    const r = await moveStageAction(id, from, to).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setStages((s) => ({ ...s, [id]: from }));
      toast("Couldn't update the event. Try again.", "error");
    }
    router.refresh();
  };

  if (events.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title="Nothing saved yet"
        body="Save an event from the list to start tracking it here."
        action={
          <Button variant="secondary" onClick={onShowList}>
            Show list
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(5,minmax(240px,1fr))] items-start gap-3 overflow-x-auto">
        {STAGES.map((st) => {
          const col = events.filter((e) => stages[e.id] === st);
          const hid = `${uid}-${st}`;
          return (
            <section key={st} aria-labelledby={hid} className="glass-card rounded-24 p-2">
              <header className="flex items-center gap-2 px-3 py-2.5">
                <h3 id={hid} className="text-[11px] font-medium tracking-[.14em] text-text-3 uppercase">
                  {STAGE[st].label}
                </h3>
                <Badge kind="count" tone="neutral">
                  {col.length}
                </Badge>
              </header>
              {col.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-text-3">Nothing here yet.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {col.map((e) => {
                    const back = prevStage(st);
                    const next = nextStage(st);
                    return (
                      <li key={e.id} className="flex flex-col gap-2 rounded-16 border border-white/[.06] bg-white/[.03] p-3">
                        <p className="text-[12.5px] text-text-3">{`${dateShort(e.startAt)} · ${hhmm(e.startAt)}`}</p>
                        <Link href={`/outreach/events/${e.id}`} className="line-clamp-2 text-[13.5px] font-medium text-text">
                          {e.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-medium" style={{ color: scoreColor(e.score) }}>
                            <span className="sr-only">Relevance </span>
                            {e.score}
                          </span>
                          {e.isMock && (
                            <Badge kind="tag" tone="amber">
                              MOCK
                            </Badge>
                          )}
                          {e.calendarEventId && (
                            <Badge kind="status" tone="green">
                              On calendar
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {back && (
                            <Button variant="ghost" size="xs" aria-label={`Move ${e.title} back to ${STAGE[back].label}`} onClick={() => move(e.id, back)}>
                              <Icon name="arrow_back" size={14} />
                              Back
                            </Button>
                          )}
                          {next &&
                            (next === "FOLLOW_UP" ? (
                              <>
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  disabled={e.isMock}
                                  aria-describedby={e.isMock ? `${uid}-mock-${e.id}` : undefined}
                                  title={e.isMock ? "Mock events can't create follow-up tasks." : undefined}
                                  onClick={() => setFollowUp(e)}
                                >
                                  Follow up
                                </Button>
                                {e.isMock && (
                                  <span id={`${uid}-mock-${e.id}`} className="sr-only">
                                    Mock events can&apos;t create follow-up tasks.
                                  </span>
                                )}
                              </>
                            ) : (
                              <Button variant="secondary" size="xs" aria-label={`Move ${e.title} to ${STAGE[next].label}`} onClick={() => move(e.id, next)}>
                                {STAGE[next].label === "Attending" ? "Attend" : STAGE[next].label}
                              </Button>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      {followUp && <FollowUpDialog open event={followUp} onClose={() => setFollowUp(null)} />}
    </>
  );
}
