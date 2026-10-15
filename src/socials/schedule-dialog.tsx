"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPlatform } from "@/lib/social-types";
import { requestPublish, reschedule } from "@/server/socials-actions";
import { formatHM } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/field";
import { dayKey, scheduleInstant } from "./model";
import { PLATFORM } from "./platform";

export function ScheduleDialog({ id, platform, scheduledAt, defaultDate, now, onClose }: { id: string; platform: SocialPlatform; scheduledAt: Date | null; defaultDate: string; now: Date; onClose(): void }) {
  const router = useRouter(); const { toast } = useShell();
  const [date, setDate] = useState(scheduledAt ? dayKey(scheduledAt) : defaultDate); const [time, setTime] = useState(scheduledAt ? formatHM(scheduledAt) : "10:00");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const at = scheduleInstant(date, time);
  const save = async () => {
    if (!at) { setError("Choose a valid Sydney date and time. This time may not exist during daylight savings."); return; }
    setBusy(true);
    const r = await (scheduledAt ? reschedule(id, at.toISOString()) : requestPublish(id, at.toISOString())).catch(() => ({ ok: false }) as const);
    setBusy(false);
    if (!r.ok) { setError("Couldn't save that. Try again."); return; }
    toast(scheduledAt ? "Rescheduled" : "Approval requested"); onClose(); router.refresh();
    if ("approvalId" in r) router.push(`/approvals?id=${r.approvalId}`);
  };
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={`${scheduledAt ? "Reschedule" : "Schedule"} on ${PLATFORM[platform].label}`} sheet actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{scheduledAt ? "Save new time" : "Request approval"}</Button></>}>
    <div className="mt-4 space-y-4"><Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Time"><Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} /></Field><p>Sydney time. {scheduledAt ? "Only the scheduled time changes. The approved text stays the same." : "Approving it schedules the post; nothing posts until then."}</p>{at && at <= now && <p className="text-amber">{scheduledAt ? "That time has passed. The post will run as soon as the worker is ready." : "That time has passed. It will post as soon as you approve."}</p>}{error && <p role="alert" className="text-red">{error}</p>}</div>
  </Dialog>;
}
