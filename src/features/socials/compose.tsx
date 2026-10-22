"use client";

import { useEffect, useState } from "react";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { createPost, moveStage, togglePlatform } from "@/server/socials-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Checkbox, SelectField, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Section } from "@/ui/layout";
import { ConfirmDialog } from "@/ui/overlay";
import { PLATFORM } from "./platform";
import type { SocialsData } from "./socials-view";
import s from "./socials.module.css";

export function Compose({ sources, cards, agent, stage, defaultDate, source, sourceId, onClose, onCreated, onDirtyChange }: { sources: SocialsData["sources"]; cards: SocialsData["cards"]; agent: boolean; stage: "idea" | "draft"; defaultDate: string; source?: string | null; sourceId?: string | null; onClose(): void; onCreated(id: string, date: string): void; onDirtyChange?(dirty: boolean): void }) {
  const { toast, openAI } = useShell();
  const [kind, setKind] = useState(source === "project" || source === "outreach_event" || source === "repo" ? source : "");
  const initialRows = source === "project" ? sources?.projects : source === "outreach_event" ? sources?.events : sources?.repos;
  const initialTitle = initialRows?.find((r) => String(r.id) === sourceId)?.title ?? "";
  const [id, setId] = useState(sourceId ?? ""); const [title, setTitle] = useState(initialTitle); const [body, setBody] = useState("");
  const [date, setDate] = useState(defaultDate); const [platforms, setPlatforms] = useState<SocialPlatform[]>(cards.some((c) => !c.isMock && c.connection?.status === "connected") ? cards.filter((c) => c.platform === "portfolio" || !c.isMock && c.connection?.status === "connected").map((c) => c.platform) : [...PLATFORMS]);
  const [created, setCreated] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [discard, setDiscard] = useState(false);
  const rows = kind === "project" ? sources?.projects : kind === "outreach_event" ? sources?.events : sources?.repos;
  const dirty = title !== initialTitle || !!body;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const create = async (withAgent: boolean) => {
    if (!title.trim() || !platforms.length || (kind && !id)) { setError(!title.trim() ? "Add a title." : !platforms.length ? "Pick at least one platform." : "Choose a source."); return; }
    setBusy(true); setError("");
    try {
      let postId = created;
      if (!postId) { const result = await createPost({ title, body, ...(kind ? { sourceKind: kind, sourceId: id } : {}) }); if (!result.ok) throw new Error(); postId = result.id; setCreated(postId); }
      for (const platform of platforms) { const result = await togglePlatform(postId, platform, true); if (!result.ok) throw new Error(); }
      if (stage === "draft") { const result = await moveStage(postId, "draft"); if (!result.ok) throw new Error(); }
      toast("Post created"); onCreated(postId, date);
      if (withAgent) openAI(`Ask the Social agent to draft variants for social post ${postId}, platforms ${platforms.join(", ")}${kind ? `, source ${kind} id ${id}` : ""}. Save the drafts locally; do not request publishing.`);
    } catch { setError("Couldn't save that. Try again."); } finally { setBusy(false); }
  };
  return <Section id="social-compose" label="New post · draft"><div className={s.stack}>
    <TextField label="Working title" maxLength={200} value={title} disabled={!!created || busy} onChange={(e) => setTitle(e.target.value)} />
    <div className={s.actions} role="group" aria-label="Draft platforms">{PLATFORMS.map((p) => <Checkbox key={p} label={PLATFORM[p].label} disabled={busy || !!created} checked={platforms.includes(p)} onChange={(e) => setPlatforms((old) => e.target.checked ? [...old, p] : old.filter((v) => v !== p))} />)}</div>
    <TextArea label="Post text / idea" rows={9} maxLength={10000} value={body} disabled={!!created || busy} onChange={(e) => setBody(e.target.value)} /><p className={s.counter}>{[...body].length.toLocaleString()} characters</p>
    <SelectField label="Start from" disabled={!!created || busy} value={kind} onChange={(e) => { setKind(e.target.value); setId(""); }}><option value="">Blank</option><option value="project">From project</option><option value="outreach_event">From event</option><option value="repo">From repo</option></SelectField>
    {kind && <SelectField label="Source" help={!rows?.length ? "No available sources yet." : undefined} value={id} disabled={!!created || busy} onChange={(e) => { setId(e.target.value); const row = rows?.find((r) => String(r.id) === e.target.value); if (row) setTitle(row.title); }}><option value="">Choose a source</option>{rows?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</SelectField>}
    <TextField label="Date" help="Default Sydney date for scheduling. This does not schedule anything." type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} />
    {error && <Alert>{error}{created && ` Draft ${created} is saved. Retry to finish adding its variants.`}</Alert>}
    <div className={s.actions}><Button variant="primary" disabled={busy} onClick={() => create(agent)}>Save draft</Button><Button icon="auto_awesome" disabled={busy} onClick={() => create(true)}>Ask Social for variants</Button><Button disabled={busy} onClick={() => { if (title !== initialTitle || body || created) setDiscard(true); else onClose(); }}>Cancel</Button></div>
    <ConfirmDialog open={discard} title="Leave this draft?" body={created ? "Your partial draft is already saved. Open it from Posts to finish editing." : "Your draft has not been saved."} confirmLabel="Leave draft" onClose={() => setDiscard(false)} onConfirm={onClose} />
  </div></Section>;
}
