"use client";
import s from "./settings.module.css";
import { useState } from "react";
import { BRIEFING_KINDS, BRIEFING_LABEL, type BriefingSchedule } from "@/lib/digest";
import { saveBriefingScheduleAction } from "@/server/briefing-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Checkbox, TextField } from "@/ui/controls";
import { Section } from "@/ui/layout";
import { Status } from "@/ui/display";
const WHEN = { morning: "Today's events, tasks and priorities", midday: "What's left today", evening: "Done today, still open, tomorrow", weekly: "Sundays: goals, budgets, the week ahead" };
export function BriefingsSection({ schedule }: {
  schedule: BriefingSchedule;
}) {
  const { toast } = useShell();
  const [schedules, setS] = useState(schedule);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await saveBriefingScheduleAction(schedules);
    setBusy(false);
    if (r.ok)
      toast("Briefing schedule saved");
    else
      toast(r.error, "error");
  }
  return (<Section id="briefings-h" label="Briefings schedule">
    <p className={s.body}>Built from your LifeOS data at these Sydney times. Nothing is sent to an AI model or outside LifeOS. Each one arrives as a notification.</p>
    <ul className={s.list}>
      {BRIEFING_KINDS.map(k => <li key={k} className={s.scheduleRow}>
        <div>
          <Checkbox label={BRIEFING_LABEL[k]} checked={schedules[k].on} onChange={e => setS({ ...schedules, [k]: { ...schedules[k], on: e.target.checked } })} />
          <p className={s.note}>
            {WHEN[k]}
          </p>
        </div>
        <TextField label={`${BRIEFING_LABEL[k]} time`} hideLabel type="time" value={schedules[k].time} onChange={e => setS({ ...schedules, [k]: { ...schedules[k], time: e.target.value } })} />
        <Status tone={schedules[k].on ? "working" : "idle"} glyph={schedules[k].on ? "✓" : "○"}>
          {schedules[k].on ? "ON" : "OFF"}
        </Status>
      </li>)}
    </ul>
    <p className={s.note}>Sydney times. Missed periods are skipped; a late worker still builds within the period.</p>
    <div>
      <Button variant="primary" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save schedule"}
      </Button>
    </div>
  </Section>);
}
