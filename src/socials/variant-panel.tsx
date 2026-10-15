"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { checkVariant, type SocialPlatform } from "@/lib/social-types";
import { cancelSchedule, requestPublish, retryVariant, saveVariant } from "@/server/socials-actions";
import { portfolioMarkdown } from "@/server/socials/markdown";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/ui/field";
import { canPublish, editableVariant, safePostUrl, stamp, type Card, type Variant } from "./model";
import { PLATFORM } from "./platform";
import { PlatformChip } from "./platform-chip";
import { ScheduleDialog } from "./schedule-dialog";
import { MarkPostedDialog } from "./mark-posted-dialog";

export function VariantPanel({ variant: v, title, card, now, defaultDate, parentDirty, onDirty }: { variant: Variant; title: string; card: Card; now: Date; defaultDate: string; parentDirty: boolean; onDirty(id: string, dirty: boolean): void }) {
  const platform = v.platform as SocialPlatform; const label = PLATFORM[platform].label; const uid = useId(); const router = useRouter(); const { toast } = useShell();
  const [text, setText] = useState(v.text); const [image, setImage] = useState(v.imageUrl ?? ""); const [link, setLink] = useState(v.linkUrl ?? "");
  const [busy, setBusy] = useState(false); const [dialog, setDialog] = useState<"schedule" | "cancel" | "manual" | "retry" | null>(null);
  const [retryChecked, setRetryChecked] = useState(false);
  const dirty = text !== v.text || image !== (v.imageUrl ?? "") || link !== (v.linkUrl ?? "");
  const editable = editableVariant(v.status); const publish = canPublish(card);
  const checks = checkVariant(platform, { title, text, imageUrl: image || null, linkUrl: link || null });
  const blocked = checks.errors.length > 0 || dirty || parentDirty; const reason = checks.errors.length ? "Fix the errors above first." : "Save changes first.";
  const change = (next: { text?: string; image?: string; link?: string }) => {
    if (next.text !== undefined) setText(next.text); if (next.image !== undefined) setImage(next.image); if (next.link !== undefined) setLink(next.link);
    onDirty(v.id, (next.text ?? text) !== v.text || (next.image ?? image) !== (v.imageUrl ?? "") || (next.link ?? link) !== (v.linkUrl ?? ""));
  };
  const run = async (fn: () => Promise<{ ok: boolean }>, message: string) => {
    setBusy(true); const r = await fn().catch(() => ({ ok: false })); setBusy(false);
    toast(r.ok ? message : "Couldn't save that. Try again.", r.ok ? "success" : "error"); if (r.ok) { onDirty(v.id, false); router.refresh(); } return r.ok;
  };
  const publishNow = async (acknowledged = false) => {
    setBusy(true);
    if (v.status === "failed") {
      const saved = await retryVariant(v.id, v.updatedAt.toISOString(), acknowledged).catch(() => ({ ok: false }));
      if (!saved.ok) { setBusy(false); toast("Couldn't request the approval. Try again.", "error"); return; }
      if ("published" in saved && saved.published) { setBusy(false); setDialog(null); toast("Previous publication reconciled", "success"); router.refresh(); return; }
    }
    const r = await requestPublish(v.id).catch(() => ({ ok: false }) as const); setBusy(false);
    if (r.ok) { toast("Approval requested"); router.push(`/approvals?id=${r.approvalId}`); } else toast("Couldn't request the approval. Try again.", "error");
  };
  let markdown = "";
  if (platform === "portfolio") { try { markdown = portfolioMarkdown({ title, text, date: defaultDate, imageUrl: image || null }); } catch { /* Invalid fields are listed by the checks below. */ } }
  const copy = async () => { try { await navigator.clipboard.writeText(platform === "portfolio" ? markdown : text); toast(platform === "portfolio" ? "Markdown copied" : "Copied"); } catch { toast("Couldn't copy. Select the text and copy it yourself.", "error"); } };
  const download = () => { const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${defaultDate}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "post"}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const url = !v.isMock && v.remoteUrl ? safePostUrl(platform, v.remoteUrl) : null;
  const manual = platform === "tiktok" || platform === "portfolio" || (platform === "linkedin" && v.status === "failed");
  return <section aria-labelledby={`${uid}-title`} className="rounded-14 border border-white/[.08] bg-white/[.03] p-4">
    <header className="mb-4 flex flex-wrap items-center gap-2"><h3 id={`${uid}-title`}><PlatformChip platform={platform} /></h3><Badge kind="status" tone={v.status === "failed" ? "red" : v.status === "published" || v.status === "posted_manually" ? "green" : v.status === "pending_approval" ? "amber" : "neutral"}>{v.status.replaceAll("_", " ")}</Badge>{(card.isMock && !["published", "posted_manually"].includes(v.status) || v.isMock) && <Badge kind="tag" tone="amber">MOCK</Badge>}</header>
    {editable ? <><Textarea aria-label={platform === "portfolio" ? "Portfolio body (Markdown)" : `${label} text`} aria-describedby={`${uid}-counter ${uid}-checks`} rows={8} maxLength={10000} value={text} onChange={(e) => change({ text: e.target.value })} />
      <div className="mt-3 space-y-3">{(platform === "instagram" || platform === "portfolio") && <Field label={platform === "instagram" ? "Public image URL" : "Image URL (optional)"} helper={platform === "instagram" ? "Instagram needs a public image link. LifeOS can't host images (it's private to your tailnet)." : undefined}><Input type="url" value={image} onChange={(e) => change({ image: e.target.value })} /></Field>}{platform === "linkedin" && <Field label="Link (optional)" helper="The URL is appended as plain commentary. A rich preview is not guaranteed."><Input type="url" value={link} onChange={(e) => change({ link: e.target.value })} /></Field>}</div></> : <div className="space-y-2"><p className="whitespace-pre-wrap break-words text-[14px]">{v.text}</p>{v.imageUrl && <p className="break-all text-[12.5px] text-text-3">Image: {v.imageUrl}</p>}{v.linkUrl && <p className="break-all text-[12.5px] text-text-3">Link: {v.linkUrl}</p>}</div>}
    <p id={`${uid}-counter`} className="mt-1 text-right text-[12.5px] text-text-3">{platform !== "portfolio" && `${[...text].length} / ${platform === "linkedin" ? "3,000" : "2,200"}`}</p>
    <div id={`${uid}-checks`} className="my-3 text-[12.5px]"><p className="sr-only" aria-live="polite">{checks.errors.length} problems in the {label} variant</p><ul aria-label={`${label} checks`} className="space-y-1">{checks.errors.map((e) => <li key={e} className="text-red">{e}</li>)}{checks.warnings.map((e) => <li key={e} className="text-amber">{e}</li>)}{!checks.errors.length && !checks.warnings.length && <li className="text-green">{publish ? "Ready to publish" : "Ready to post"}</li>}</ul></div>
    {platform === "portfolio" && <details className="mb-3"><summary>Preview Markdown</summary><pre aria-label="Portfolio Markdown preview" tabIndex={0} className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-14 bg-black/10 p-3 font-mono text-[11.5px]">{markdown || "Fix the title or image link to preview Markdown."}</pre></details>}
    {v.lastError && <p role="status" className="mb-3 text-[12.5px] text-red">{v.lastError}</p>}
    <div className="flex flex-wrap gap-2">
      {editable && <Button size="sm" variant="secondary" disabled={!dirty || busy} loading={busy} onClick={() => run(() => saveVariant({ id: v.id, text, imageUrl: image || null, linkUrl: link || null }), "Changes saved")}>Save {label} changes</Button>}
      {publish && editable && <><Button variant="secondary" size="sm" loading={busy} disabled={blocked} aria-describedby={blocked ? `${uid}-reason` : undefined} aria-label={`Publish ${title} to ${label} now`} onClick={() => publishNow()}>Publish now</Button>{card.capabilities.schedule && <Button variant="secondary" size="sm" disabled={busy || blocked} aria-describedby={blocked ? `${uid}-reason` : undefined} aria-label={`Schedule ${title} on ${label}`} onClick={() => setDialog("schedule")}>Schedule</Button>}<p id={`${uid}-reason`} className="w-full text-[12.5px] text-text-3">{blocked ? reason : card.isMock ? "MOCK: this publishes to a practice copy. Nothing leaves LifeOS." : "Publishing opens an approval. Nothing posts automatically."}</p></>}
      {v.status === "pending_approval" && <><Link href={`/approvals?id=${v.approvalId}`} className="text-cyan">Review approval</Link><p className="w-full">Edit the text in the approval.</p></>}
      {v.status === "scheduled" && <><Button variant="secondary" size="sm" aria-label={`Reschedule ${title} on ${label}`} onClick={() => setDialog("schedule")}>Reschedule</Button><Button variant="destructive" size="sm" aria-label={`Cancel the scheduled ${label} post`} onClick={() => setDialog("cancel")}>Cancel schedule</Button><p className="w-full text-[12.5px] text-text-3">Scheduled {v.scheduledAt && stamp(v.scheduledAt)}. Cancel the schedule to edit; a new approval is needed to post.</p></>}
      {v.status === "publishing" && <p role="status" aria-live="polite">Publishing to {label}…</p>}
      {manual && ["draft", "failed"].includes(v.status) && <><Button variant="secondary" size="sm" aria-label={`Copy the ${label} ${platform === "portfolio" ? "Markdown" : "caption"} for ${title}`} disabled={platform === "portfolio" && !markdown} onClick={copy}>{platform === "portfolio" ? "Copy Markdown" : "Copy text"}</Button>{platform === "portfolio" && <Button variant="secondary" size="sm" disabled={!markdown} aria-label={`Download ${title} as Markdown`} onClick={download}>Download .md</Button>}{PLATFORM[platform].appUrl && <a className="inline-flex min-h-9 items-center text-cyan" target="_blank" rel="noopener noreferrer" href={PLATFORM[platform].appUrl!}>Open {label}</a>}<Button variant="secondary" size="sm" disabled={dirty || parentDirty} aria-label={`Mark ${title} as posted on ${label}`} onClick={() => setDialog("manual")}>Mark as posted</Button><p className="w-full text-[12.5px] text-text-3">{platform === "tiktok" ? "TikTok doesn't let LifeOS post for you. Copy the caption and post it in the app." : platform === "portfolio" ? "Portfolio posts are Markdown you publish yourself." : "Check your LinkedIn profile before retrying."}</p></>}
      {v.status === "failed" && publish && <Button variant="secondary" size="sm" loading={busy} aria-label={`Retry publishing ${title} to ${label}`} onClick={() => { setRetryChecked(false); setDialog("retry"); }}>Review retry</Button>}
      {(v.status === "published" || v.status === "posted_manually") && <><p>{v.isMock ? "MOCK · nothing left LifeOS" : `${v.status === "posted_manually" ? "Posted" : "Published"} ${v.publishedAt ? stamp(v.publishedAt) : ""}`}</p>{url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-cyan" aria-label={`Open the ${label} post for ${title}`}>Open post</a>}<div className="flex w-full flex-wrap gap-3 text-[12.5px] text-text-2">{Object.entries(v.metrics ?? {}).filter(([, value]) => typeof value === "number").map(([key, value]) => <span key={key}>{value} {key}</span>)}</div></>}
      {!publish && platform === "instagram" && <p className="text-[12.5px] text-text-3">Real Instagram publishing is unavailable until the owner verifies the connection in Settings.</p>}
    </div>
    {dialog === "schedule" && <ScheduleDialog id={v.id} platform={platform} scheduledAt={v.status === "scheduled" ? v.scheduledAt : null} defaultDate={defaultDate} now={now} onClose={() => setDialog(null)} />}
    {dialog === "manual" && <MarkPostedDialog id={v.id} platform={platform} onClose={() => setDialog(null)} />}
    {dialog === "retry" && <Dialog open title="Review previous publish attempt" onClose={() => { if (!busy) setDialog(null); }} actions={<><Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Keep previous attempt</Button><Button disabled={busy || !retryChecked} loading={busy} onClick={() => publishNow(true)}>Reconcile or request new approval</Button></>}><p>Check your {label} profile first. LifeOS checks any stored publication evidence before starting a fresh approval. Retrying an unresolved remote request may create a duplicate post.</p><label className="mt-3 flex gap-2"><Checkbox checked={retryChecked} onChange={(e) => setRetryChecked(e.target.checked)} />I checked the platform. If LifeOS cannot reconcile the previous attempt, I confirm no post appeared and accept the duplicate risk of retrying.</label></Dialog>}
    {dialog === "cancel" && <Dialog open title="Cancel schedule" onClose={() => setDialog(null)} actions={<><Button variant="secondary" onClick={() => setDialog(null)}>Keep schedule</Button><Button variant="destructive" loading={busy} onClick={async () => { if (await run(() => cancelSchedule(v.id), "Schedule cancelled")) setDialog(null); }}>Cancel schedule</Button></>}><p>Cancel the {label} post scheduled for {v.scheduledAt && stamp(v.scheduledAt)}? It goes back to draft and needs a new approval to post.</p></Dialog>}
  </section>;
}
