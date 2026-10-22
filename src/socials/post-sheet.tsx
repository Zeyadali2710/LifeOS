"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { deletePost, moveStage, savePost, togglePlatform } from "@/server/socials-actions";
import { useShell } from "@/features/shell/shell-provider";
import { useDialog } from "@/legacy-ui/use-dialog";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Field, Input, Textarea } from "@/legacy-ui/field";
import { editableVariant, type Card, type Post } from "./model";
import { PLATFORM } from "./platform";
import { VariantPanel } from "./variant-panel";

export function PostSheet({ post, cards, now, defaultDate, onClose }: { post: Post; cards: Card[]; now: Date; defaultDate: string; onClose(): void }) {
  const uid = useId(); const router = useRouter(); const { toast, openAI } = useShell();
  const [title, setTitle] = useState(post.title); const [body, setBody] = useState(post.body);
  const [variantDirty, setVariantDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<"discard" | "delete" | SocialPlatform | null>(null);
  const parentDirty = title !== post.title || body !== post.body; const dirty = parentDirty || Object.values(variantDirty).some(Boolean);
  const readOnly = post.variants.some((v) => !editableVariant(v.status));
  const blocked = post.variants.some((v) => ["pending_approval", "scheduled", "publishing"].includes(v.status));
  const close = () => { if (busy) return; if (dirty) setConfirm("discard"); else onClose(); };
  const ref = useDialog<HTMLDivElement>(true, close, { modal: true });
  const run = async (fn: () => Promise<{ ok: boolean }>, message: string) => {
    setBusy(true); const r = await fn().catch(() => ({ ok: false })); setBusy(false);
    toast(r.ok ? message : "Couldn't save that. Try again.", r.ok ? "success" : "error"); if (r.ok) router.refresh(); return r.ok;
  };
  const toggle = async (p: SocialPlatform) => {
    const v = post.variants.find((v) => v.platform === p);
    if (v && (v.text || variantDirty[v.id])) { setConfirm(p); return; }
    await run(() => togglePlatform(post.id, p, !v), v ? `${PLATFORM[p].label} variant removed` : "Changes saved");
  };
  const sourceHref = post.sourceKind === "project" ? `/projects/${encodeURIComponent(post.sourceId!)}` : post.sourceKind === "outreach_event" ? `/outreach/events/${encodeURIComponent(post.sourceId!)}` : `/career/${post.sourceId}`;
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-40 grid place-items-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} className="glass-menu h-dvh w-full overflow-y-auto p-5 tab:h-auto tab:max-h-[92dvh] tab:w-[min(1120px,94vw)] tab:rounded-30 tab:p-6">
    <header className="mb-5 flex items-center gap-3"><h2 id={`${uid}-title`} className="font-display text-[26px]">{post.title}</h2><Badge kind="status" tone="neutral">{post.stage}</Badge><Button variant="ghost" className="ml-auto" aria-label={`Close post ${post.title}`} onClick={close}>Close</Button></header>
    <div className="space-y-4"><Field label="Post title"><Input maxLength={200} value={title} readOnly={readOnly} onChange={(e) => setTitle(e.target.value)} /></Field>
      {post.sourceKind && <p className="text-[12.5px] text-text-2">From {post.sourceKind === "outreach_event" ? "event" : post.sourceKind} · {post.sourceKind === "repo" ? <span>{post.sourceId}</span> : <Link href={sourceHref} className="text-cyan">Open source</Link>}</p>}
      {post.draftedFromContent && <aside role="note" className="rounded-14 border border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)] p-4 text-[12.5px]"><p className="text-amber">Drafted from {post.sourceKind === "outreach_event" ? "event" : post.sourceKind ?? "source"} content (untrusted)</p><p>Part of this post came from text LifeOS didn&apos;t write. Check every variant before publishing.</p></aside>}
      <Field label="Idea"><Textarea rows={4} maxLength={10000} value={body} readOnly={readOnly} onChange={(e) => setBody(e.target.value)} /></Field>
      <div role="group" aria-label="Post stage" className="flex gap-2">{(["idea", "draft"] as const).map((stage) => <Button key={stage} size="sm" variant="secondary" disabled={readOnly || busy} aria-pressed={post.stage === stage} onClick={() => run(() => moveStage(post.id, stage), "Changes saved")}>{stage === "idea" ? "Idea" : "Draft"}</Button>)}</div>
      <div role="group" aria-label="Platforms for this post" className="flex flex-wrap gap-2">{PLATFORMS.map((p) => { const v = post.variants.find((v) => v.platform === p); return <Button key={p} size="sm" variant="secondary" aria-pressed={!!v} disabled={busy || parentDirty || !!v && !editableVariant(v.status)} aria-describedby={`${uid}-locked`} onClick={() => toggle(p)}>{PLATFORM[p].label}</Button>; })}</div><p id={`${uid}-locked`} className="text-[12.5px] text-text-3">Save changes first. Cancel the schedule or resolve the approval before changing a locked variant.</p>
      <div className="grid grid-cols-1 items-start gap-4 tab:grid-cols-2">{post.variants.map((v) => <VariantPanel key={`${v.id}:${v.updatedAt.toISOString()}`} variant={v} title={title} card={cards.find((c) => c.platform === v.platform)!} now={now} defaultDate={defaultDate} parentDirty={parentDirty} onDirty={(id, value) => setVariantDirty((old) => ({ ...old, [id]: value }))} />)}</div>
    </div>
    <footer className="mt-6 flex flex-wrap items-center gap-2"><Button variant="ai" disabled={busy || dirty || blocked || !post.variants.length} onClick={() => { onClose(); openAI(`Ask the Social agent to draft variants for social post ${post.id}, platforms ${post.variants.map((v) => v.platform).join(", ")}. Save drafts locally. Do not request publishing.`); }}>Draft with Social agent</Button><Button variant="destructive" className="tab:ml-auto" disabled={busy || blocked} aria-describedby={`${uid}-delete-reason`} onClick={() => setConfirm("delete")}>Delete post</Button><span id={`${uid}-delete-reason`} className="sr-only">Cancel the schedule or resolve the approval first.</span><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button loading={busy} disabled={readOnly || !parentDirty || !title.trim()} onClick={() => run(() => savePost({ id: post.id, title, body }), "Changes saved")}>Save changes</Button></footer>
    {confirm && <Dialog open title={confirm === "discard" ? "Discard changes?" : confirm === "delete" ? "Delete post" : `Remove ${PLATFORM[confirm].label} variant`} onClose={() => setConfirm(null)} actions={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>{confirm === "discard" ? "Keep editing" : confirm === "delete" ? "Keep post" : "Keep variant"}</Button><Button variant="destructive" loading={busy} onClick={async () => {
      if (confirm === "discard") { onClose(); return; }
      if (confirm === "delete") { if (await run(() => deletePost(post.id), "Post deleted")) onClose(); }
      else if (await run(() => togglePlatform(post.id, confirm, false), `${PLATFORM[confirm].label} variant removed`)) { setVariantDirty((old) => { const copy = { ...old }; const v = post.variants.find((v) => v.platform === confirm); if (v) delete copy[v.id]; return copy; }); setConfirm(null); }
    }}>{confirm === "discard" ? "Discard changes" : confirm === "delete" ? "Delete post" : "Remove variant"}</Button></>}><p>{confirm === "discard" ? `Your edits to "${post.title}" aren't saved.` : confirm === "delete" ? `Delete "${post.title}" and its ${post.variants.length} variants? Published posts stay on their platforms; LifeOS forgets them and their stats.` : `Remove the ${PLATFORM[confirm].label} text for "${post.title}"? You can add the platform again, but this text is gone.`}</p></Dialog>}
  </div></div>, document.body);
}
