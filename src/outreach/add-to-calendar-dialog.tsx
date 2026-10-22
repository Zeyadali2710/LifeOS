"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutreachEventDTO } from "@/lib/outreach-types";
import { addToCalendarAction } from "@/server/outreach-pipeline-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Field, Select } from "@/legacy-ui/field";
import { dateShort, hhmm } from "./fmt";

export type CalendarOption = { id: string; name: string };
type Ev = Pick<OutreachEventDTO, "id" | "title" | "startAt" | "endAt">;

export function AddToCalendarDialog({
  open,
  event,
  calendars,
  defaultCalendarId,
  onClose,
}: {
  open: boolean;
  event: Ev;
  calendars: CalendarOption[];
  defaultCalendarId: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return <Form event={event} calendars={calendars} defaultCalendarId={defaultCalendarId} onClose={onClose} />;
}

function Form({ event, calendars, defaultCalendarId, onClose }: Omit<Parameters<typeof AddToCalendarDialog>[0], "open">) {
  const router = useRouter();
  const { toast } = useShell();
  const [cal, setCal] = useState(calendars.find((c) => c.id === defaultCalendarId)?.id ?? calendars[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const none = calendars.length === 0;

  const submit = async () => {
    if (busy || none) return;
    setBusy(true);
    const r = await addToCalendarAction(event.id, cal || null).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) return toast("Couldn't update the event. Try again.", "error");
    toast(`Added to ${r.calendarName}`);
    router.refresh();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add to calendar"
      sheet
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={none} onClick={submit}>
            Add to calendar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>{`${event.title} · ${dateShort(event.startAt)}, ${hhmm(event.startAt)}${event.endAt ? `–${hhmm(event.endAt)}` : ""}`}</p>
        {none ? (
          <p>
            No calendar is connected. Connect one in Settings.{" "}
            <Link href="/settings?section=connections" className="text-cyan">
              Open Settings
            </Link>
          </p>
        ) : (
          <Field label="Calendar" helper="The event's link goes in the description. Moving the event back later doesn't remove it from your calendar.">
            <Select value={cal} onChange={(e) => setCal(e.target.value)}>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Dialog>
  );
}
