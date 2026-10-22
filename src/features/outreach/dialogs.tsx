"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { importEventUrlAction } from "@/server/outreach-actions";
import { addToCalendarAction, createFollowUpsAction } from "@/server/outreach-pipeline-actions";
import type { OutreachEventDTO } from "@/lib/outreach-types";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink, IconButton } from "@/ui/button";
import { SelectField, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";
import { dateShort, followUpDue, timeRange } from "./fmt";
import s from "./outreach.module.css";

export type CalendarOption = { id: string; name: string };
export type CalendarProps = { calendars: CalendarOption[]; defaultCalendarId: string | null };
const IMPORT_ERRORS: Record<string, string> = { invalid: "Enter a full https:// address.", blocked: "That address isn't allowed. Use a public https link.", unreachable: "Couldn't reach that page. Try again later.", too_large: "That page is too large to read.", no_event: "No event data found on that page." };

export function ImportUrlDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const r = await importEventUrlAction(url).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) return setError(IMPORT_ERRORS[r.error] ?? "Couldn't import the event. Try again.");
    toast(r.existed ? "Already in your events" : "Event saved");
    onClose();
    router.push(`/outreach/events/${r.id}`);
  };
  return <Dialog open onClose={onClose} title="Import an event" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void submit()}>Import event</Button></>}>
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className={s.stack}>
      <TextField label="Event page URL" type="url" inputMode="url" autoFocus placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} help="Works with Eventbrite, Humanitix, Meetup and Luma pages that publish event details." />
      {error && <Alert>{error}</Alert>}
    </form>
  </Dialog>;
}

export function AddToCalendarDialog({ event, calendars, defaultCalendarId, onClose }: CalendarProps & { event: OutreachEventDTO; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [cal, setCal] = useState(calendars.find((c) => c.id === defaultCalendarId)?.id ?? calendars[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy || !cal) return;
    setBusy(true);
    const r = await addToCalendarAction(event.id, cal).catch(() => ({ ok: false }) as const);
    setBusy(false);
    if (!r.ok) return setError("Couldn't update the event. Try again.");
    toast(`Added to ${r.calendarName}`);
    router.refresh();
    onClose();
  };
  return <Dialog open onClose={onClose} title="Add to calendar" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !cal} onClick={() => void submit()}>Add to calendar</Button></>}>
    <div className={s.stack}><p>{event.title} · {dateShort(event.startAt)}, {timeRange(event)}</p>
      {calendars.length ? <SelectField label="Calendar" value={cal} onChange={(e) => setCal(e.target.value)} help="Moving the event back later doesn't remove it from your calendar.">{calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField> : <><p>No calendar is connected.</p><ButtonLink href="/settings?section=connections">Open Settings</ButtonLink></>}
      {error && <Alert>{error}</Alert>}
    </div>
  </Dialog>;
}

export function FollowUpDialog({ event, onClose }: { event: OutreachEventDTO; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const key = useRef(1);
  const [lines, setLines] = useState([{ key: 0, title: `Follow up: ${event.title}`.slice(0, 200), due: followUpDue(event) }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    const local = Object.fromEntries(lines.flatMap((l, i) => l.title.trim() ? [] : [[`lines.${i}.title`, "Add a title."]]));
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await createFollowUpsAction(event.id, lines.map((l) => ({ title: l.title, dueDate: l.due || null }))).catch(() => ({ ok: false }) as const);
    setBusy(false);
    if (!r.ok) { if ("errors" in r) setErrors(r.errors); else setError("Couldn't save that. Try again."); return; }
    toast(`${r.count} follow-up ${r.count === 1 ? "task" : "tasks"} created`);
    router.refresh();
    onClose();
  };
  return <Dialog open onClose={onClose} title="Follow up" wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void submit()}>Create follow-up tasks</Button></>}>
    <div className={s.stack}><p>Create tasks for after “{event.title}”.</p>
      {lines.map((l, i) => <div key={l.key} className={s.formRow}><TextField label={`Task ${i + 1} title`} value={l.title} maxLength={200} error={errors[`lines.${i}.title`]} onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, title: e.target.value } : x))} /><TextField label={`Task ${i + 1} due date`} type="date" value={l.due} error={errors[`lines.${i}.dueDate`]} onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, due: e.target.value } : x))} />{lines.length > 1 && <IconButton icon="close" label={`Remove task ${i + 1}`} onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setErrors({}); }} />}</div>)}
      {lines.length < 10 && <Button icon="add" onClick={() => setLines((ls) => [...ls, { key: key.current++, title: "", due: "" }])}>Add another task</Button>}
      {Object.keys(errors).length > 0 && <Alert>Check the task fields before saving.</Alert>}{error && <Alert>{error}</Alert>}
    </div>
  </Dialog>;
}
