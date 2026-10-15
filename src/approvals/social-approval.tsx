"use client";

import { startTransition, useEffect, useState } from "react";
import type { z } from "zod";
import type { ApprovalDTO } from "@/lib/agent-types";
import { socialPublishPayload } from "@/lib/approval-kinds";
import { checkVariant } from "@/lib/social-types";
import { approveAction, rejectAction, saveEditAction } from "@/server/approval-actions";
import { socialReviewFacts } from "@/server/socials-actions";
import { useLiveEvents } from "@/shell/live-provider";
import { useShell } from "@/shell/shell-provider";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Disclosure } from "@/ui/disclosure";
import { Field, Input, Textarea } from "@/ui/field";
import { Fact } from "./event-approval";

export type SocialPayload = z.infer<typeof socialPublishPayload>;
export type SocialDraft = Pick<SocialPayload, "text" | "imageUrl" | "linkUrl" | "publishAt">;
export const socialOf = (a: Pick<ApprovalDTO, "original" | "edited">) => (a.edited ?? a.original) as SocialPayload;
const draftFields = (p: SocialDraft): SocialDraft => ({ text: p.text, imageUrl: p.imageUrl, linkUrl: p.linkUrl, publishAt: p.publishAt });
export const toSocialDraft = draftFields;
export const sameSocial = (a: SocialDraft, b: SocialDraft) => a.text === b.text && a.imageUrl === b.imageUrl && a.linkUrl === b.linkUrl && a.publishAt === b.publishAt;
export function validateSocialDraft(base: SocialPayload, draft: SocialDraft) {
  return socialPublishPayload.safeParse({ ...base, ...draftFields(draft) });
}
type Facts = Awaited<ReturnType<typeof socialReviewFacts>>;
export function socialResolved(a: ApprovalDTO, facts: Facts): string {
  if (a.status === "rejected") return "Rejected. Nothing was posted.";
  if (a.status === "expired" || a.status === "cancelled") return "Request expired or cancelled. Nothing was posted by this request.";
  if (a.status === "failed") return a.error ?? "Approval failed. Review in Socials.";
  if (!facts) return "Approved · checking publish status…";
  switch (facts.status) {
    case "scheduled": return `Scheduled for ${new Date(facts.scheduledAt!).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} (Sydney).`;
    case "publishing": return "Publishing…";
    case "published": return facts.isMock ? "MOCK · published inside LifeOS. Nothing left LifeOS." : "Published.";
    case "failed": return facts.lastError ?? "Publishing failed. Review in Socials before retrying.";
    default: return "This request is no longer active. View the current variant in Socials.";
  }
}

function Preview({ p }: { p: SocialDraft }) {
  return <div className="flex flex-col gap-2 break-words rounded-14 border border-white/[.08] p-4 text-[13.5px]">
    <p className="whitespace-pre-wrap">{p.text}</p>
    {p.imageUrl && <p className="break-all text-text-2">Image URL: {p.imageUrl}</p>}
    {p.linkUrl && <p className="break-all text-text-2">Link URL: {p.linkUrl}</p>}
    <p className="text-text-3">{p.publishAt ? `Publish at ${new Date(p.publishAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} (Sydney)` : "Immediately after approval"}</p>
  </div>;
}

export function SocialApprovalBody({ approval: a, draft, editing, onDraft, facts }: { approval: ApprovalDTO; draft: SocialDraft; editing: boolean; onDraft: (d: SocialDraft) => void; facts: Facts }) {
  const p = socialOf(a);
  const checks = checkVariant(p.platform, draft);
  const validation = validateSocialDraft(p, draft);
  return <div className="flex flex-col gap-4 px-5 py-5">
    <Badge kind="tag" tone={p.providerMode === "mock" ? "amber" : "neutral"}>{p.providerMode === "mock" ? "MOCK · nothing leaves LifeOS" : "REAL · public post"}</Badge>
    <Fact k="LOCKED DESTINATION">{p.platform} · {facts?.destination ?? "Checking account…"} · variant {p.variantId}</Fact>
    <p className="text-[12.5px] text-text-3">Platform, account binding and provider mode are locked. The text, image URL and link URL below are the exact data sent.</p>
    {facts?.draftedFromContent && <p role="note" className="text-[13px] text-amber">Drafted from project/event/repo content (untrusted). Check it before approving.</p>}
    {editing ? <div className="flex flex-col gap-3">
      <Field label="Post text"><Textarea rows={8} value={draft.text} onChange={(e) => onDraft({ ...draft, text: e.target.value })} /></Field>
      <Field label="Image URL"><Input type="url" value={draft.imageUrl ?? ""} onChange={(e) => onDraft({ ...draft, imageUrl: e.target.value || null })} /></Field>
      <Field label="Link URL"><Input type="url" value={draft.linkUrl ?? ""} onChange={(e) => onDraft({ ...draft, linkUrl: e.target.value || null })} /></Field>
      <Field label="Publish at (ISO date with timezone; blank for now)"><Input value={draft.publishAt ?? ""} onChange={(e) => onDraft({ ...draft, publishAt: e.target.value || null })} /></Field>
    </div> : <Preview p={draft} />}
    {!validation.success && <div role="alert" className="text-[13px] text-red">{validation.error.issues.map((i) => i.message).join(" ")}</div>}
    {checks.warnings.map((w) => <p key={w} className="text-[13px] text-amber">{w}</p>)}
    {!sameSocial(draft, socialOf({ original: a.original, edited: null })) && <><Badge kind="tag" tone="amber">EDITED</Badge><Disclosure summary="View original"><Preview p={a.original as SocialPayload} /></Disclosure></>}
  </div>;
}

export function SocialApprovalShell({ approval: a, onChange }: { approval: ApprovalDTO; onChange: (a: ApprovalDTO) => void }) {
  const { toast } = useShell();
  const saved = socialOf(a);
  const [draft, setDraft] = useState(() => toSocialDraft(saved));
  const [base, setBase] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState<Facts>(null);
  const load = () => startTransition(async () => { setFacts(await socialReviewFacts(a.id).catch(() => null)); });
  useEffect(() => { let active = true; startTransition(async () => { const f = await socialReviewFacts(a.id).catch(() => null); if (active) setFacts(f); }); return () => { active = false; }; }, [a.id, a.status]);
  useLiveEvents("socials", load);
  const shown = editing ? draft : toSocialDraft(saved);
  const validation = validateSocialDraft(saved, shown);
  async function decide(kind: "approve" | "reject" | "save") {
    if (kind !== "reject" && (!validation.success || (editing && !sameSocial(base, saved)))) {
      toast("The draft changed or is invalid. Reopen Edit and check it.", "error"); return;
    }
    setBusy(true);
    const payload = validation.success ? validation.data : undefined;
    const result = await (kind === "reject" ? rejectAction(a.id) : kind === "save" ? saveEditAction(a.id, payload) : approveAction(a.id, editing ? payload : undefined)).catch(() => ({ ok: false, approval: undefined }));
    setBusy(false);
    if (!result.ok) return toast("Couldn't record that decision. Try again.", "error");
    if (result.approval) onChange(result.approval);
    setEditing(false); load();
    toast(kind === "save" ? "Edits saved" : kind === "reject" ? "Approval rejected" : "Social post approved · queued");
  }
  return <article aria-label="Approval detail" className="glass-card overflow-hidden rounded-24">
    <header className="border-b border-white/[.06] px-5 py-5"><h2 className="font-display text-[26px]">Social wants to publish to {saved.platform}</h2>{a.reason && <p className="text-[13px] text-text-2">{a.reason}</p>}</header>
    <SocialApprovalBody approval={a} draft={shown} editing={editing && a.status === "pending"} onDraft={setDraft} facts={facts} />
    <footer className="flex flex-wrap items-center gap-3 border-t border-white/[.06] px-5 py-4">
      {a.status === "pending" ? <><Button disabled={busy || !validation.success || !facts?.bindingMatches} onClick={() => void decide("approve")}>APPROVE</Button><Button variant="secondary" disabled={busy} onClick={() => { if (editing) void decide("save"); else { setBase(saved); setDraft(toSocialDraft(saved)); setEditing(true); } }}>{editing ? "DONE" : "EDIT"}</Button><Button variant="destructive" disabled={busy} onClick={() => void decide("reject")}>REJECT</Button><span className="text-[11px] text-text-3">Expires {new Date(a.expiresAt).toLocaleString("en-AU")}</span></> : <p role="status" className="text-[13px]">{socialResolved(a, facts)}</p>}
      {facts && <a className="text-[13px] text-cyan" href={`/socials?post=${facts.postId}`}>View in Socials</a>}
      {facts?.remoteUrl && <a className="text-[13px] text-cyan" href={facts.remoteUrl} target="_blank" rel="noopener noreferrer">Open post</a>}
    </footer>
  </article>;
}
