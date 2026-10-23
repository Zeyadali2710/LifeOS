"use client";
import s from "./settings.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarDTO } from "@/lib/calendar-types";
import type { RosterConfig } from "@/server/roster/apply";
import { saveRosterConfigAction } from "@/server/roster-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Checkbox, SelectField, TextArea, TextField } from "@/ui/controls";
import { Section } from "@/ui/layout";

const toLines = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k} = ${v}`).join("\n");
function toMap(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [k, v, ...rest] = line.split("=").map((x) => x.trim());
    if (!k || !v || rest.length) return null;
    out[k] = v;
  }
  return out;
}

export function RosterSection({ config, calendars }: { config: RosterConfig; calendars: CalendarDTO[] }) {
  const router = useRouter();
  const { toast } = useShell();
  const [enabled, setEnabled] = useState(config.enabled);
  const [calendarId, setCalendarId] = useState(config.calendarId ?? "");
  const [sender, setSender] = useState(config.sender);
  const [branches, setBranches] = useState(toLines(config.branches));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function save() {
    const map = toMap(branches);
    if (!map) return setError("Write one branch per line, like: TG Warring = TG Warringah");
    setError(undefined);
    setBusy(true);
    const r = await saveRosterConfigAction({ enabled, calendarId: calendarId || null, sender: sender.trim(), branches: map }).catch(() => ({ ok: false as const, error: "Couldn't save that. Try again." }));
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(enabled ? "Work roster on" : "Work roster saved");
    router.refresh();
  }
  return (<Section id="roster-h" label="Work roster">
    <p className={s.body}>Roster emails from this sender become calendar events, read by rule from the email&apos;s table. No AI model sees them. An updated roster replaces that week&apos;s shifts; LifeOS only changes events it made from a roster. Each change arrives as a notification.</p>
    <div className={s.stack}>
      <Checkbox label="Add my shifts to my calendar" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <SelectField label="Calendar" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} help={calendars.length ? undefined : "Connect a calendar and choose its category first (Connections)."}>
        <option value="">Choose…</option>
        {calendars.map((c) => <option key={c.id} value={c.id}>{c.account ? `${c.name} · ${c.account}` : c.name}</option>)}
      </SelectField>
      <TextField label="Roster sender" type="email" maxLength={200} value={sender} onChange={(e) => setSender(e.target.value)} />
      <TextArea label="Branch names (optional)" rows={3} value={branches} error={error} onChange={(e) => { setBranches(e.target.value); setError(undefined); }} help="The roster cuts names short. One per line, roster name = name on your events, e.g. TG Warring = TG Warringah." />
      <div>
        <Button variant="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save roster settings"}</Button>
      </div>
    </div>
  </Section>);
}
