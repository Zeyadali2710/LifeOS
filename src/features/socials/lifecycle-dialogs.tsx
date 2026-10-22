"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPlatform } from "@/lib/social-types";
import { markPosted, requestPublish, reschedule } from "@/server/socials-actions";
import { formatHM } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";
import { dayKey, safePostUrl, scheduleInstant } from "./model";
import { PLATFORM } from "./platform";
import s from "./socials.module.css";

export function ScheduleDialog({ id, platform, scheduledAt, defaultDate, now, onClose }: { id: string; platform: SocialPlatform; scheduledAt: Date | null; defaultDate: string; now: Date; onClose(): void }) {
  const router = useRouter(); const { toast } = useShell();
  const [date, setDate] = useState(scheduledAt ? dayKey(scheduledAt) : defaultDate);
  const [time, setTime] = useState(scheduledAt ? formatHM(scheduledAt) : "10:00");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const at = scheduleInstant(date, time);
  const save = async () => {
    if (!at) { setError("Choose a valid Sydney date and time. This time may not exist during daylight savings."); return; }
    setBusy(true);
    const result = await (scheduledAt ? reschedule(id, at.toISOString()) : requestPublish(id, at.toISOString())).catch(() => ({ ok: false }) as const);
    setBusy(false);
    if (!result.ok) { setError("Couldn't save that. Try again."); return; }
    toast(scheduledAt ? "Rescheduled" : "Approval requested"); onClose(); router.refresh();
    if ("approvalId" in result) router.push(`/agents?view=approvals&id=${result.approvalId}`);
  };
  return <Dialog open title={`${scheduledAt ? "Reschedule" : "Schedule"} on ${PLATFORM[platform].label}`} onClose={() => { if (!busy) onClose(); }} footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>{scheduledAt ? "Save new time" : "Request approval"}</Button></>}>
    <div className={s.stack}><TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><TextField label="Time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
      <p className={s.muted}>Sydney time. {scheduledAt ? "Only the scheduled time changes. The approved text stays the same." : "Approving it schedules the post; nothing posts until then."}</p>
      {at && at <= now && <Alert tone="warn">That time has passed. {scheduledAt ? "The worker will publish as soon as it is ready." : "It will post as soon as you approve."}</Alert>}{error && <Alert>{error}</Alert>}</div>
  </Dialog>;
}

export function MarkPostedDialog({ id, platform, onClose }: { id: string; platform: SocialPlatform; onClose(): void }) {
  const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const { toast } = useShell(); const router = useRouter();
  const save = async () => {
    if (url.trim() && !safePostUrl(platform, url.trim())) { setError(`Use an https link ${PLATFORM[platform].host ? `on ${PLATFORM[platform].host}` : "to your live post"}.${platform === "tiktok" ? " Paste the full video URL containing /video/ and its ID." : ""}`); return; }
    setBusy(true); const result = await markPosted(id, url.trim() || undefined).catch(() => ({ ok: false })); setBusy(false);
    if (!result.ok) { setError("Couldn't save that. Try again."); return; }
    toast("Marked as posted"); onClose(); router.refresh();
  };
  return <Dialog open title={`Mark as posted on ${PLATFORM[platform].label}`} onClose={() => { if (!busy) onClose(); }} footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>Mark as posted</Button></>}><div className={s.stack}><TextField label="Post URL (optional)" help={platform === "tiktok" ? "Paste the video link so LifeOS can match its stats." : "Paste the live link to keep it with the post."} type="url" value={url} onChange={(e) => setUrl(e.target.value)} />{error && <Alert>{error}</Alert>}</div></Dialog>;
}
