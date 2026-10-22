"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { OutreachEventDTO } from "@/lib/outreach-types";
import { createFollowUpsAction } from "@/server/outreach-pipeline-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Field, Input } from "@/legacy-ui/field";
import { Icon } from "@/legacy-ui/icon";
import { followUpDue } from "./fmt";

type Ev = Pick<OutreachEventDTO, "id" | "title" | "startAt" | "endAt" | "allDay">;
type Line = { key: number; title: string; due: string };
const MAX_LINES = 10;

export function FollowUpDialog({ open, event, onClose }: { open: boolean; event: Ev; onClose: () => void }) {
  if (!open) return null;
  return <Form event={event} onClose={onClose} />;
}

function Form({ event, onClose }: { event: Ev; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([{ key: 0, title: `Follow up: ${event.title}`.slice(0, 200), due: followUpDue(event) }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const edit = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (busy) return;
    const local: Record<string, string> = {};
    lines.forEach((l, i) => {
      if (!l.title.trim()) local[`lines.${i}.title`] = "Add a title.";
    });
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await createFollowUpsAction(
      event.id,
      lines.map((l) => ({ title: l.title, dueDate: l.due || null })),
    ).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (r.ok) {
      toast(r.count === 1 ? "1 follow-up task created" : `${r.count} follow-up tasks created`);
      router.refresh();
      return onClose();
    }
    if ("errors" in r) return setErrors(r.errors);
    toast("Couldn't save that. Try again.", "error");
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Follow up"
      sheet
      width={520}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {lines.length === 1 ? "Create follow-up task" : "Create follow-up tasks"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>{`Create tasks for after "${event.title}".`}</p>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-1 items-end gap-2 tab:grid-cols-[minmax(0,1fr)_160px_auto]">
            <Field label={i === 0 ? "Title" : `Task ${i + 1} title`} error={errors[`lines.${i}.title`]}>
              <Input value={l.title} maxLength={200} aria-label={`Task ${i + 1} title`} onChange={(e) => edit(l.key, { title: e.target.value })} />
            </Field>
            <Field label={i === 0 ? "Due date" : `Task ${i + 1} due date`} error={errors[`lines.${i}.dueDate`]}>
              <Input type="date" value={l.due} aria-label={`Task ${i + 1} due date`} onChange={(e) => edit(l.key, { due: e.target.value })} />
            </Field>
            <div className="flex h-9 items-center gap-2">
              <Badge kind="tag" tone="neutral">
                P2
              </Badge>
              {lines.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove task ${i + 1}`}
                  onClick={() => {
                    setLines((ls) => ls.filter((x) => x.key !== l.key));
                    setErrors({}); // errors are keyed by row index, which shifts on removal; the next submit re-checks (WR-U07)
                  }}
                  className="grid size-8 place-items-center rounded-full text-text-2 hover:bg-white/[.06] hover:text-text max-tab:size-11"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {lines.length < MAX_LINES && (
          <div>
            <Button variant="ghost" size="xs" onClick={() => setLines((ls) => [...ls, { key: nextKey.current++, title: "", due: "" }])}>
              <Icon name="add" size={14} />
              Add another task
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
