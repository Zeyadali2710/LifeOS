"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { deletePost, moveStage, savePost, togglePlatform } from "@/server/socials-actions";
import type { SocialReview } from "@/server/socials-view";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink } from "@/ui/button";
import { Tabs, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Section } from "@/ui/layout";
import { ConfirmDialog } from "@/ui/overlay";
import { editableVariant, type Card, type Post } from "./model";
import { PostStatus } from "./post-preview";
import { PLATFORM } from "./platform";
import { VariantPanel } from "./variant-panel";
import s from "./socials.module.css";

export function PostReview({ post, cards, now, defaultDate, initialPlatform, onClose, onDirtyChange, reviews }: { post: Post; cards: Card[]; now: Date; defaultDate: string; initialPlatform?: string | null; onClose(): void; onDirtyChange?(dirty: boolean): void; reviews?: Record<string, SocialReview> }) {
  const router = useRouter(); const { toast, openAI } = useShell();
  const [title, setTitle] = useState(post.title); const [body, setBody] = useState(post.body);
  const [platform, setPlatform] = useState(initialPlatform || post.variants[0]?.platform || "");
  const [variantDirty, setVariantDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<"discard" | "delete" | SocialPlatform | null>(null);
  const parentDirty = title !== post.title || body !== post.body; const dirty = parentDirty || Object.values(variantDirty).some(Boolean);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const readOnly = post.variants.some((v) => !editableVariant(v.status));
  const blocked = post.variants.some((v) => ["pending_approval", "scheduled", "publishing"].includes(v.status));
  const run = async (fn: () => Promise<{ ok: boolean }>, message: string) => {
    setBusy(true); const result = await fn().catch(() => ({ ok: false })); setBusy(false);
    toast(result.ok ? message : "Couldn't save that. Try again.", result.ok ? "success" : "error"); if (result.ok) router.refresh(); return result.ok;
  };
  const toggle = async (p: SocialPlatform) => {
    const variant = post.variants.find((v) => v.platform === p);
    if (variant && (variant.text || variantDirty[variant.id])) { setConfirm(p); return; }
    await run(() => togglePlatform(post.id, p, !variant), variant ? `${PLATFORM[p].label} variant removed` : "Changes saved");
  };
  return <Section className={s.panelSection} id="social-review" label={post.createdBy === "agent" ? "Proposed by Social agent" : "Drafted by you"}>
    <div className={s.stack}>
      <div className={s.toolbar}><h2 className={s.title}>{post.title}</h2><Button onClick={() => { if (dirty) setConfirm("discard"); else onClose(); }} disabled={busy}>Close</Button></div>
      {post.sourceKind && <p className={s.muted}>From {post.sourceKind === "outreach_event" ? "event" : post.sourceKind} · {post.sourceKind === "repo" ? post.sourceId : <ButtonLink variant="text" href={post.sourceKind === "project" ? `/projects/${encodeURIComponent(post.sourceId!)}` : `/outreach/events/${encodeURIComponent(post.sourceId!)}`}>Open source</ButtonLink>}</p>}
      {post.draftedFromContent && <Alert tone="warn">Drafted from {post.sourceKind === "outreach_event" ? "event" : post.sourceKind ?? "source"} content (untrusted). Check every variant before publishing.</Alert>}
      {!!post.variants.length && <Tabs className={s.variantTabs} label="Post variants" value={post.variants.some((v) => v.platform === platform) ? platform : post.variants[0]!.platform} items={post.variants.map((v) => ({ value: v.platform, label: <span className={s.variantLabel}><strong>{PLATFORM[v.platform as SocialPlatform].label}</strong><PostStatus status={v.status} /></span> }))} onChange={setPlatform} />}
      {post.variants.map((v) => <div key={`${v.id}:${v.updatedAt.toISOString()}:${JSON.stringify(reviews?.[v.id]?.approval.edited)}`} hidden={v.platform !== (post.variants.some((v) => v.platform === platform) ? platform : post.variants[0]?.platform)}><VariantPanel review={reviews?.[v.id]} variant={v} title={title} card={cards.find((c) => c.platform === v.platform)!} now={now} defaultDate={defaultDate} parentDirty={parentDirty} onDirty={(id, value) => setVariantDirty((old) => ({ ...old, [id]: value }))} /></div>)}
      {!post.variants.length && <p className={s.muted}>Choose a platform above to start a variant.</p>}
      <details className={s.postSettings}><summary>Post details and platforms</summary><div className={s.stack}>
      <TextField label="Post title" maxLength={200} readOnly={readOnly} value={title} onChange={(e) => setTitle(e.target.value)} />

        <TextArea label="Idea" rows={4} maxLength={10000} readOnly={readOnly} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className={s.actions} role="group" aria-label="Post stage">{(["idea", "draft"] as const).map((stage) => <Button key={stage} disabled={readOnly || busy || dirty} aria-pressed={stage === post.stage} onClick={() => run(() => moveStage(post.id, stage), "Changes saved")}>{stage === "idea" ? "Idea" : "Draft"}</Button>)}</div>
        <div className={s.actions} role="group" aria-label="Platforms for this post">{PLATFORMS.map((p) => { const v = post.variants.find((v) => v.platform === p); return <Button key={p} aria-pressed={!!v} disabled={busy || parentDirty || !!v && !editableVariant(v.status)} onClick={() => toggle(p)}>{PLATFORM[p].label}</Button>; })}</div>
        <p className={s.muted}>Save changes first. Cancel the schedule or resolve the approval before changing a locked variant.</p>
      <div className={s.actions}><Button variant="primary" disabled={busy || readOnly || !parentDirty || !title.trim()} onClick={() => run(() => savePost({ id: post.id, title, body }), "Changes saved")}>Save post changes</Button><Button icon="auto_awesome" disabled={busy || dirty || blocked || !post.variants.length} onClick={() => openAI(`Ask the Social agent to draft variants for social post ${post.id}, platforms ${post.variants.map((v) => v.platform).join(", ")}. Save drafts locally. Do not request publishing.`)}>Ask Social for variants</Button></div>
      </div></details>
      <Button variant="text" destructive disabled={busy || blocked} onClick={() => setConfirm("delete")}>Delete post</Button>
    </div>
    <ConfirmDialog open={!!confirm} title={confirm === "discard" ? "Discard changes?" : confirm === "delete" ? "Delete post" : `Remove ${confirm ? PLATFORM[confirm].label : ""} variant`} body={confirm === "discard" ? `Your edits to “${post.title}” aren't saved.` : confirm === "delete" ? `Delete “${post.title}” and its ${post.variants.length} variants? Published posts stay on their platforms; LifeOS forgets them and their stats.` : "This platform's text will be removed. You can add the platform again, but this text is gone."} confirmLabel={confirm === "discard" ? "Discard changes" : confirm === "delete" ? "Delete post" : "Remove variant"} danger busy={busy} onClose={() => { if (!busy) setConfirm(null); }} onConfirm={async () => {
      if (confirm === "discard") { onClose(); return; }
      if (confirm === "delete") { if (await run(() => deletePost(post.id), "Post deleted")) onClose(); }
      else if (confirm && await run(() => togglePlatform(post.id, confirm, false), `${PLATFORM[confirm].label} variant removed`)) { const removed = post.variants.find((v) => v.platform === confirm); if (removed) setVariantDirty((old) => ({ ...old, [removed.id]: false })); setConfirm(null); }
    }} />
  </Section>;
}
