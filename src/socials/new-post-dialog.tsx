"use client";

import { useState } from "react";
import { PLATFORMS, type SocialPlatform } from "@/lib/social-types";
import { createPost, moveStage, togglePlatform } from "@/server/socials-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";
import { PLATFORM } from "./platform";
import type { SocialsData } from "./socials-view";

export function NewPostDialog({ sources, cards, agent, stage, defaultDate, source, sourceId, onClose, onCreated }: { sources: SocialsData["sources"]; cards: SocialsData["cards"]; agent: boolean; stage: "idea" | "draft"; defaultDate: string; source?: string | null; sourceId?: string | null; onClose(): void; onCreated(id: string, date: string): void }) {
  const { toast, openAI } = useShell();
  const [kind, setKind] = useState(source === "project" || source === "outreach_event" || source === "repo" ? source : "");
  const initialRows = source === "project" ? sources?.projects : source === "outreach_event" ? sources?.events : sources?.repos;
  const [id, setId] = useState(sourceId ?? ""); const [title, setTitle] = useState(initialRows?.find((r) => String(r.id) === sourceId)?.title ?? ""); const [body, setBody] = useState("");
  const [date, setDate] = useState(defaultDate); const [platforms, setPlatforms] = useState<SocialPlatform[]>(cards.some((c) => !c.isMock && c.connection?.status === "connected") ? cards.filter((c) => c.platform === "portfolio" || !c.isMock && c.connection?.status === "connected").map((c) => c.platform) : [...PLATFORMS]);
  const [created, setCreated] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const rows = kind === "project" ? sources?.projects : kind === "outreach_event" ? sources?.events : sources?.repos;
  const create = async (withAgent: boolean) => {
    if (!title.trim() || !platforms.length || (kind && !id)) { setError(!title.trim() ? "Add a title." : !platforms.length ? "Pick at least one platform." : "Choose a source."); return; }
    setBusy(true); setError("");
    try {
      let postId = created;
      if (!postId) {
        const r = await createPost({ title, body, ...(kind ? { sourceKind: kind, sourceId: id } : {}) });
        if (!r.ok) throw new Error(); postId = r.id; setCreated(postId);
      }
      for (const platform of platforms) { const r = await togglePlatform(postId, platform, true); if (!r.ok) throw new Error(); }
      if (stage === "draft") { const r = await moveStage(postId, "draft"); if (!r.ok) throw new Error(); }
      toast("Post created"); onCreated(postId, date);
      if (withAgent) openAI(`Ask the Social agent to draft variants for social post ${postId}, platforms ${platforms.join(", ")}${kind ? `, source ${kind} id ${id}` : ""}. Save the drafts locally; do not request publishing.`);
    } catch { setError("Couldn't save that. Try again."); } finally { setBusy(false); }
  };
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title="New post" sheet width={520} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="ai" loading={busy && agent} disabled={busy} onClick={() => create(true)}>Draft with Social agent</Button><Button loading={busy && !agent} disabled={busy} onClick={() => create(agent)}>Create post</Button></>}>
    <div className="mt-5 space-y-4"><Field label="Start from"><Select disabled={!!created} value={kind} onChange={(e) => { setKind(e.target.value); setId(""); }}><option value="">Blank</option><option value="project">From project</option><option value="outreach_event">From event</option><option value="repo">From repo</option></Select></Field>
      {kind && <Field label="Source" helper={!rows?.length ? kind === "project" ? "No projects yet." : kind === "repo" ? "No synced repos yet." : "No saved or attended events yet." : undefined}><Select value={id} disabled={!!created} onChange={(e) => { setId(e.target.value); const row = rows?.find((r) => String(r.id) === e.target.value); if (row) setTitle(row.title); }}><option value="">Choose a source</option>{rows?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></Field>}
      <Field label="Title"><Input value={title} maxLength={200} disabled={!!created} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Idea"><Textarea rows={4} maxLength={10000} value={body} disabled={!!created} onChange={(e) => setBody(e.target.value)} /></Field>
      <fieldset><legend className="mb-2 text-[12.5px]">Platforms</legend><div className="flex flex-wrap gap-3">{PLATFORMS.map((p) => <Checkbox key={p} label={PLATFORM[p].label} disabled={busy} checked={platforms.includes(p)} onChange={(e) => setPlatforms((old) => e.target.checked ? [...old, p] : old.filter((v) => v !== p))} />)}</div></fieldset>
      <Field label="Date" helper="Used as the default when you schedule. It doesn't schedule anything."><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {error && <p role="alert" className="text-red">{error}</p>}
    </div>
  </Dialog>;
}
