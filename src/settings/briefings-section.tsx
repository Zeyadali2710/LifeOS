"use client";

import { useState } from "react";
import { BRIEFING_KINDS, BRIEFING_LABEL, type BriefingSchedule } from "@/lib/digest";
import { saveBriefingScheduleAction } from "@/server/briefing-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Checkbox, Input } from "@/legacy-ui/field";

const WHEN = { morning: "Today's events, tasks and priorities", midday: "What's left today", evening: "Done today, still open, tomorrow", weekly: "Sundays: goals, budgets, the week ahead" };

export function BriefingsSection({ schedule }: { schedule: BriefingSchedule }) {
  const { toast } = useShell();
  const [s, setS] = useState(schedule);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await saveBriefingScheduleAction(s);
    setBusy(false);
    if (r.ok) toast("Briefing schedule saved"); else toast(r.error, "error");
  }
  return (
    <section aria-labelledby="briefings-h" className="glass-card flex flex-col gap-4 rounded-24 p-5">
      <div>
        <h2 id="briefings-h" className="text-[15px] font-medium">Briefings</h2>
        <p className="mt-1 text-[13px] text-text-2">Built from your LifeOS data at these Sydney times. Nothing is sent to an AI model or outside LifeOS. Each one arrives as a notification.</p>
      </div>
      <ul className="flex flex-col divide-y divide-white/[.06]">
        {BRIEFING_KINDS.map((k) => (
          <li key={k} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[200px] flex-1">
              <Checkbox label={BRIEFING_LABEL[k]} checked={s[k].on} onChange={(e) => setS({ ...s, [k]: { ...s[k], on: e.target.checked } })} />
              <p className="mt-0.5 pl-7 text-[12px] text-text-3">{WHEN[k]}</p>
            </div>
            <Input type="time" aria-label={`${BRIEFING_LABEL[k]} time`} value={s[k].time} onChange={(e) => setS({ ...s, [k]: { ...s[k], time: e.target.value } })} className="w-32" />
          </li>
        ))}
      </ul>
      <div><Button loading={busy} onClick={save}>Save schedule</Button></div>
    </section>
  );
}
