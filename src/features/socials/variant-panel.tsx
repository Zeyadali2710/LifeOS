"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { checkVariant, type SocialPlatform } from "@/lib/social-types";
import { socialPublishPayload } from "@/lib/approval-kinds";
import { approveAction, rejectAction } from "@/server/approval-actions";
import type { SocialReview } from "@/server/socials-view";
import { cancelSchedule, requestPublish, retryVariant, saveVariant } from "@/server/socials-actions";
import { portfolioMarkdown } from "@/server/socials/markdown";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink } from "@/ui/button";
import { Checkbox, TextArea, TextField } from "@/ui/controls";
import { Tag } from "@/ui/display";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";
import { canPublish, editableVariant, safePostUrl, stamp, type Card, type Variant } from "./model";
import { PLATFORM } from "./platform";
import { PostPreview, PostStatus } from "./post-preview";
import { MarkPostedDialog, ScheduleDialog } from "./lifecycle-dialogs";
import s from "./socials.module.css";

export function VariantPanel({ variant: v, title, card, now, defaultDate, parentDirty, onDirty, review }: { variant: Variant; title: string; card: Card; now: Date; defaultDate: string; parentDirty: boolean; onDirty(id: string, dirty: boolean): void; review?: SocialReview }) {
  const platform = v.platform as SocialPlatform; const label = PLATFORM[platform].label; const uid = useId(); const router = useRouter(); const { toast } = useShell();
  const proposal = review ? socialPublishPayload.safeParse(review.approval.edited ?? review.approval.original) : null;
  const pending = v.status === "pending_approval" && proposal?.success && proposal.data.variantId === v.id ? proposal.data : null;
  const [text, setText] = useState(pending?.text ?? v.text); const [image, setImage] = useState((pending ? pending.imageUrl : v.imageUrl) ?? ""); const [link, setLink] = useState((pending ? pending.linkUrl : v.linkUrl) ?? "");
  const [busy, setBusy] = useState(false); const [dialog, setDialog] = useState<"schedule" | "cancel" | "manual" | "retry" | "reject" | null>(null); const [retryChecked, setRetryChecked] = useState(false);
  const dirty = text !== v.text || image !== (v.imageUrl ?? "") || link !== (v.linkUrl ?? "");
  const editable = editableVariant(v.status); const publish = canPublish(card);
  const checks = checkVariant(platform, { title, text, imageUrl: image || null, linkUrl: link || null });
  const blocked = checks.errors.length > 0 || dirty || parentDirty;
  const change = (next: { text?: string; image?: string; link?: string }) => {
    if (next.text !== undefined) setText(next.text); if (next.image !== undefined) setImage(next.image); if (next.link !== undefined) setLink(next.link);
    onDirty(v.id, (next.text ?? text) !== v.text || (next.image ?? image) !== (v.imageUrl ?? "") || (next.link ?? link) !== (v.linkUrl ?? ""));
  };
  const run = async (fn: () => Promise<{ ok: boolean }>, message: string) => {
    setBusy(true); const result = await fn().catch(() => ({ ok: false })); setBusy(false);
    toast(result.ok ? message : "Couldn't save that. Try again.", result.ok ? "success" : "error");
    if (result.ok) { onDirty(v.id, false); router.refresh(); } return result.ok;
  };
  const publishNow = async (acknowledged = false) => {
    setBusy(true);
    if (v.status === "failed") {
      const saved = await retryVariant(v.id, v.updatedAt.toISOString(), acknowledged).catch(() => ({ ok: false }));
      if (!saved.ok) { setBusy(false); toast("Couldn't request the approval. Try again.", "error"); return; }
      if ("published" in saved && saved.published) { setBusy(false); setDialog(null); toast("Previous publication reconciled"); router.refresh(); return; }
    }
    const result = await requestPublish(v.id).catch(() => ({ ok: false }) as const); setBusy(false);
    if (result.ok) { toast("Approval requested"); router.push(`/agents?view=approvals&id=${result.approvalId}`); } else toast("Couldn't request the approval. Try again.", "error");
  };
  let markdown = "";
  if (platform === "portfolio") { try { markdown = portfolioMarkdown({ title, text, date: defaultDate, imageUrl: image || null }); } catch { /* Validation errors appear below. */ } }
  const copy = async () => { try { await navigator.clipboard.writeText(platform === "portfolio" ? markdown : text); toast(platform === "portfolio" ? "Markdown copied" : "Copied"); } catch { toast("Couldn't copy. Select the text and copy it yourself.", "error"); } };
  const download = () => { const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${defaultDate}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "post"}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const url = !v.isMock && v.remoteUrl ? safePostUrl(platform, v.remoteUrl) : null;
  const manual = platform === "tiktok" || platform === "portfolio" || (platform === "linkedin" && v.status === "failed");
  return <section className={s.stack} aria-label={`${label} variant`}>
    <div className={s.actions}><PostStatus status={v.status} />{(pending ? pending.providerMode === "mock" : (card.isMock && !["published", "posted_manually"].includes(v.status)) || v.isMock) && <Tag>MOCK</Tag>}</div>
    {editable && <><TextArea label={platform === "portfolio" ? "Portfolio body (Markdown)" : `${label} text`} rows={8} maxLength={10000} value={text} aria-describedby={`${uid}-count`} onChange={(e) => change({ text: e.target.value })} />
      {(platform === "instagram" || platform === "portfolio") && <TextField label={platform === "instagram" ? "Public image URL" : "Image URL (optional)"} help={platform === "instagram" ? "Instagram needs one public HTTPS image. LifeOS cannot host media on your private tailnet." : undefined} type="url" value={image} onChange={(e) => change({ image: e.target.value })} />}
      {platform === "linkedin" && <TextField label="Link (optional)" help="Appended as commentary. A rich preview is not guaranteed." type="url" value={link} onChange={(e) => change({ link: e.target.value })} />}</>}
    <p id={`${uid}-count`} className={s.counter}>{[...text].length.toLocaleString()} {platform !== "portfolio" && `/ ${platform === "linkedin" ? "3,000" : "2,200"}`} characters</p>
    <div className={s.livePreview}><PostPreview title={title} text={text} imageUrl={image} linkUrl={link} platform={platform} account={pending && review ? review.facts.destination : platform === "tiktok" ? null : card.connection?.login} mock={pending ? pending.providerMode === "mock" : v.isMock} /></div>
    {!v.importedAccount && <ul className={s.checks} aria-label={`${label} checks`}>{checks.errors.map((error) => <li role="alert" className={s.error} key={error}>{error}</li>)}{checks.warnings.map((warning) => <li className={s.warning} key={warning}>{warning}</li>)}{!checks.errors.length && !checks.warnings.length && <li className={s.muted}>{publish ? "Ready to publish" : "Ready to post"}</li>}</ul>}
    {platform === "portfolio" && <details><summary>Preview Markdown</summary><pre tabIndex={0} className={s.markdown} aria-label="Portfolio Markdown preview">{markdown || "Fix the title or image link to preview Markdown."}</pre></details>}
    {v.importedAccount && <p className={s.muted}>Imported from {label}. Published {v.publishedAt ? stamp(v.publishedAt) : "on the platform"}.</p>}
    {v.lastError && <Alert>{v.lastError}</Alert>}
    <dl className={s.details}><dt>Media</dt><dd>{image || (platform === "tiktok" ? "Attach a 9:16 video in TikTok" : "None (text post)")}</dd><dt>Account</dt><dd>{pending && review ? review.facts.destination : platform === "portfolio" ? "Manual portfolio" : platform === "tiktok" ? card.isMock ? "TikTok practice account" : card.connection ? "TikTok connected account" : "TikTok not connected" : card.connection?.login || `${label} ${card.isMock ? "practice account" : "account"}`}</dd><dt>When</dt><dd>{pending ? pending.publishAt ? stamp(new Date(pending.publishAt)) : "As soon as approved" : v.publishedAt ? stamp(v.publishedAt) : v.scheduledAt ? stamp(v.scheduledAt) : "Not scheduled"} · Sydney</dd></dl>
    <div className={s.actions}>
      {editable && <Button disabled={!dirty || busy} onClick={() => run(() => saveVariant({ id: v.id, text, imageUrl: image || null, linkUrl: link || null }), "Changes saved")}>Save {label} changes</Button>}
      {publish && editable && <><Button variant="primary" disabled={busy || blocked} onClick={() => publishNow()}>Publish now</Button>{card.capabilities.schedule && <Button disabled={busy || blocked} onClick={() => setDialog("schedule")}>Schedule</Button>}</>}
      {v.status === "pending_approval" && <>{pending && review && <><Button variant="primary" disabled={busy || review.approval.status !== "pending" || review.facts.status !== "pending_approval" || !review.facts.bindingMatches || new Date(review.approval.expiresAt) <= now} onClick={() => run(() => approveAction(review.approval.id), "Approved · queued for publishing")}>{pending.publishAt ? "Approve & schedule" : "Approve & publish"}</Button><Button disabled={busy || review.approval.status !== "pending"} onClick={() => setDialog("reject")}>Back to draft</Button></>}<ButtonLink href={`/agents?view=approvals&id=${v.approvalId}`}>Review approval</ButtonLink></>}
      {v.status === "scheduled" && <><Button disabled={busy} onClick={() => setDialog("schedule")}>Reschedule</Button><Button variant="danger" disabled={busy} onClick={() => setDialog("cancel")}>Cancel schedule</Button></>}
      {v.status === "publishing" && <p role="status" aria-live="polite">Publishing to {label}…</p>}
      {manual && ["draft", "failed"].includes(v.status) && <><Button disabled={busy || platform === "portfolio" && !markdown} onClick={copy}>{platform === "portfolio" ? "Copy Markdown" : "Copy text"}</Button>{platform === "portfolio" && <Button disabled={!markdown} onClick={download}>Download .md</Button>}{PLATFORM[platform].appUrl && <ButtonLink external href={PLATFORM[platform].appUrl!}>Open {label}</ButtonLink>}<Button disabled={busy || dirty || parentDirty} onClick={() => setDialog("manual")}>Mark as posted</Button></>}
      {v.status === "failed" && publish && <Button disabled={busy} onClick={() => { setRetryChecked(false); setDialog("retry"); }}>Review retry</Button>}
      {url && ["published", "posted_manually"].includes(v.status) && <ButtonLink href={url} external>Open post</ButtonLink>}
    </div>
    {editable && publish && <p className={s.muted}>{blocked ? checks.errors.length ? "Fix the errors above first." : "Save changes first." : card.isMock ? "MOCK: this publishes to a practice copy. Nothing leaves LifeOS." : "Publishing opens an approval. Nothing posts automatically."}</p>}
    {v.status === "pending_approval" && <p className={s.muted}>Awaiting your approval. Edit the text or return it to draft in the approval.</p>}
    {pending && review && <p className={s.muted}>Proposal destination: {review.facts.destination}. {pending.publishAt ? `Publish at ${stamp(new Date(pending.publishAt))} · Sydney.` : "Publishes as soon as you approve."}</p>}
    {review && !review.facts.bindingMatches && <Alert tone="warn">The account binding changed. Return this proposal to draft and request approval again.</Alert>}
    {v.status === "scheduled" && <p className={s.muted}>Cancel the schedule to edit; a new approval is needed to post.</p>}
    {manual && <p className={s.muted}>{platform === "tiktok" ? "TikTok doesn't let LifeOS post for you. Copy the caption and post it in the app." : platform === "portfolio" ? "Portfolio posts are Markdown you publish yourself." : "Check your LinkedIn profile before retrying."}</p>}
    {!publish && platform === "instagram" && <p className={s.muted}>Real Instagram publishing is unavailable until the owner verifies the connection in Settings.</p>}
    {["published", "posted_manually"].includes(v.status) && <><p className={s.muted}>{v.isMock ? "MOCK · nothing left LifeOS" : `${v.status === "posted_manually" ? "Posted" : "Published"} ${v.publishedAt ? stamp(v.publishedAt) : ""}`}</p><div className={s.metrics}>{Object.entries(v.metrics ?? {}).filter(([, value]) => typeof value === "number").map(([key, value]) => <span key={key}>{value} {key}</span>)}</div></>}
    <div className={s.lifecycle} aria-label="Post lifecycle"><span className={s.meta}>LIFECYCLE</span><p>✓ Draft created</p>{v.status === "posted_manually" ? <p>✓ Posted manually · approval not required</p> : <><p>{v.status === "draft" ? "○ Approval not requested" : v.status === "pending_approval" ? "! Awaiting your approval" : "✓ Approval requested"}</p>{v.status === "scheduled" && <p>◷ Approved · scheduled</p>}{v.status === "publishing" && <p role="status">… Approved · publishing</p>}{v.status === "failed" && <p className={s.error}>× Publish failed · review previous attempt</p>}{v.status === "published" ? <p>✓ Published{v.isMock ? " to practice copy" : ""}</p> : <p>○ Not published</p>}</>}</div>
    {dialog === "schedule" && <ScheduleDialog id={v.id} platform={platform} scheduledAt={v.status === "scheduled" ? v.scheduledAt : null} defaultDate={defaultDate} now={now} onClose={() => setDialog(null)} />}
    {dialog === "manual" && <MarkPostedDialog id={v.id} platform={platform} onClose={() => setDialog(null)} />}
    {dialog === "reject" && review && <Dialog open title="Return proposal to draft?" onClose={() => { if (!busy) setDialog(null); }} footer={<><Button disabled={busy} onClick={() => setDialog(null)}>Keep proposal</Button><Button variant="primary" disabled={busy} onClick={async () => { if (await run(() => rejectAction(review.approval.id), "Proposal rejected · returned to draft")) setDialog(null); }}>Back to draft</Button></>}><p>This rejects the current approval. Nothing will be published by it. Request a new approval after editing the draft.</p></Dialog>}
    {dialog === "retry" && <Dialog open title="Review previous publish attempt" onClose={() => { if (!busy) setDialog(null); }} footer={<><Button disabled={busy} onClick={() => setDialog(null)}>Keep previous attempt</Button><Button variant="primary" disabled={busy || !retryChecked} onClick={() => publishNow(true)}>Reconcile or request new approval</Button></>}><div className={s.stack}><p>Check your {label} profile first. LifeOS checks stored publication evidence before starting a fresh approval. Retrying an unresolved request may create a duplicate post.</p><Checkbox checked={retryChecked} onChange={(e) => setRetryChecked(e.target.checked)} label="I checked the platform. If LifeOS cannot reconcile the previous attempt, I confirm no post appeared and accept the duplicate risk of retrying." /></div></Dialog>}
    {dialog === "cancel" && <Dialog open title="Cancel schedule" onClose={() => { if (!busy) setDialog(null); }} footer={<><Button disabled={busy} onClick={() => setDialog(null)}>Keep schedule</Button><Button variant="danger" disabled={busy} onClick={async () => { if (await run(() => cancelSchedule(v.id), "Schedule cancelled")) setDialog(null); }}>Cancel schedule</Button></>}><p>Cancel the {label} post scheduled for {v.scheduledAt && stamp(v.scheduledAt)}? It returns to draft and needs a new approval to post.</p></Dialog>}
  </section>;
}
