"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KIND_META, KNOWLEDGE_LIMITS, knowledgeInput, normaliseTags } from "@/lib/knowledge";
import type { KnowledgeDetail } from "@/server/knowledge";
import { saveKnowledgeAction } from "@/server/knowledge-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Tag, Status } from "@/ui/display";
import { Alert } from "@/ui/feedback";
import { ItemMetadata } from "./item-form";
import { itemDraft, itemInput, when, type ItemDraft } from "./model";
import s from "./knowledge.module.css";

export function ItemEditor({ item, projects, onDirty, onDelete, onClose }: {
  item: KnowledgeDetail; projects: { id: string; name: string }[]; onDirty: (dirty: boolean) => void; onDelete: () => void; onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [draft, setDraft] = useState(() => itemDraft(item));
  const [saved, setSaved] = useState(() => JSON.stringify(itemDraft(item)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = JSON.stringify(draft);
  const dirty = snapshot !== saved;
  const edit = (value: ItemDraft) => { setDraft(value); setError(null); };

  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", unload);
    const leave = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a[href]");
      if (link && link.getAttribute("target") !== "_blank" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); event.stopPropagation();
        toast("Wait for your changes to save, or fix the save error first.", "error");
      }
    };
    document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", leave, true); };
  }, [dirty, toast]);

  useEffect(() => {
    if (!dirty || busy || error) return;
    const timer = setTimeout(async () => {
      const parsed = knowledgeInput.safeParse(itemInput(draft));
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the entered values."); return; }
      setBusy(true);
      const result = await saveKnowledgeAction(parsed.data, item.id).catch(() => ({ ok: false, error: "Could not save this item. Try again." }) as const);
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      setSaved(snapshot);
      toast("Saved");
      router.refresh();
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, snapshot, saved, dirty, busy, error, item.id, router, toast]);

  const project = projects.find((p) => p.id === draft.projectId)?.name ?? (draft.projectId === item.projectId ? item.projectName : null);
  return <article className={s.editor} aria-label="Knowledge editor">
    <div className={s.editorHead}>
      <span className={s.meta}>{KIND_META[draft.kind].label.toUpperCase()} · UPDATED {when(item.updatedAt).toUpperCase()}</span>
      <Button variant="text" size="sm" disabled={dirty || busy} onClick={onClose}>Close item</Button>
    </div>
    <input className={s.title} aria-label="Title" value={draft.title} maxLength={KNOWLEDGE_LIMITS.title} onChange={(e) => edit({ ...draft, title: e.target.value })} />
    <div className={s.tags}>
      {normaliseTags(draft.tags).map((tag) => <Tag key={tag} variant="topic">#{tag}</Tag>)}
      {project && draft.projectId && <span className={s.linked}>· Linked to <Button variant="text" size="sm" disabled={dirty || busy} onClick={() => router.push(`/projects/${draft.projectId}`)}>{project}</Button></span>}
    </div>
    {draft.url && <div className={s.bookmark}>
      {item.url === draft.url ? <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">{draft.url}</a> : <span>{draft.url}</span>} · LifeOS never fetches this page
    </div>}
    <details className={s.details}>
      <summary>Edit type, tags, link and project</summary>
      <ItemMetadata draft={draft} onChange={edit} projects={projects} />
    </details>
    <label className={s.srOnly} htmlFor="knowledge-body">{draft.kind === "bookmark" ? "Bookmark note" : "Text"}</label>
    <textarea id="knowledge-body" className={s.body} rows={12} value={draft.body} maxLength={KNOWLEDGE_LIMITS.body} onChange={(e) => edit({ ...draft, body: e.target.value })} />
    <div className={s.editorFoot}>
      <span>{draft.body.length.toLocaleString()} / 200,000 characters · <span role="status"><Status tone={error ? "failed" : dirty || busy ? "approval" : "working"} glyph={error ? "×" : dirty || busy ? "…" : "✓"}>{error ? "Not saved" : dirty || busy ? "Saving…" : "Saved automatically"}</Status></span></span>
      <Button variant="text" destructive size="sm" disabled={busy || dirty} onClick={onDelete}>Delete item</Button>
    </div>
    {error && <Alert action={<Button variant="text" onClick={() => setError(null)}>Retry save</Button>}>{error} Your changes are still in the editor.</Alert>}
  </article>;
}
