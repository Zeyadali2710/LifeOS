"use client";

import { useState } from "react";
import { KIND_META, KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, knowledgeInput, type KnowledgeKind } from "@/lib/knowledge";
import { saveKnowledgeAction, uploadKnowledgeAction } from "@/server/knowledge-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { SelectField, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";
import { itemDraft, itemInput, type ItemDraft } from "./model";
import s from "./knowledge.module.css";

export function ItemMetadata({ draft, onChange, projects }: {
  draft: ItemDraft; onChange: (draft: ItemDraft) => void; projects: { id: string; name: string }[];
}) {
  return <div className={s.fields}>
    <SelectField label="Type" value={draft.kind} onChange={(e) => onChange({ ...draft, kind: e.target.value as KnowledgeKind })}>
      {KNOWLEDGE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_META[kind].label}</option>)}
    </SelectField>
    <TextField label={draft.kind === "bookmark" ? "Link" : "Link (optional)"} type="url" inputMode="url" maxLength={KNOWLEDGE_LIMITS.url}
      help="https:// links only. LifeOS never fetches this page." value={draft.url} placeholder="https://" onChange={(e) => onChange({ ...draft, url: e.target.value })} />
    <TextField label="Tags" help="Comma separated · up to 12 tags" value={draft.tags} onChange={(e) => onChange({ ...draft, tags: e.target.value })} />
    <SelectField label="Linked project (optional)" value={draft.projectId} onChange={(e) => onChange({ ...draft, projectId: e.target.value })}>
      <option value="">None</option>
      {draft.projectId && !projects.some((p) => p.id === draft.projectId) && <option value={draft.projectId}>Current linked project (archived)</option>}
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </SelectField>
  </div>;
}

export function NewItemDialog({ kind, projects, onClose, onSaved }: {
  kind: KnowledgeKind; projects: { id: string; name: string }[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const { toast } = useShell();
  const [draft, setDraft] = useState(() => itemDraft(null, kind));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(itemDraft(null, kind));
  const close = () => { if (!busy) { if (changed) setDiscard(true); else onClose(); } };

  async function save() {
    if (busy) return;
    const parsed = knowledgeInput.safeParse(itemInput(draft));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the entered values."); return; }
    setBusy(true); setError(null);
    const result = await saveKnowledgeAction(parsed.data).catch(() => ({ ok: false, error: "Could not save this item. Try again." }) as const);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    toast("Added to Knowledge");
    onSaved(result.id!);
  }

  return <Dialog open onClose={close} title="New knowledge item" footer={<>
    <Button onClick={close} disabled={busy}>Cancel</Button>
    <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Adding…" : draft.kind === "bookmark" ? "Save bookmark" : "Add item"}</Button>
  </>}>
    <form className={s.fields} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className={s.fields}>
        <TextField label="Title" autoFocus value={draft.title} maxLength={KNOWLEDGE_LIMITS.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <ItemMetadata draft={draft} onChange={setDraft} projects={projects} />
        <TextArea label={draft.kind === "bookmark" ? "Notes (optional)" : "Text"} rows={8} value={draft.body} maxLength={KNOWLEDGE_LIMITS.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
      </fieldset>
      {error && <Alert>{error}</Alert>}
      {discard && <Alert tone="warn" action={<span className={s.actions}><Button onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="text" destructive onClick={onClose}>Discard</Button></span>}>Discard this unsaved item?</Alert>}
    </form>
  </Dialog>;
}

export function UploadDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { toast } = useShell();
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload() {
    if (busy) return;
    if (!file || !/\.(md|markdown|txt)$/i.test(file.name) || !file.size || file.size > KNOWLEDGE_LIMITS.uploadBytes) { setError("Choose a .md or .txt file up to 500 KB."); return; }
    const form = new FormData();
    form.set("file", file); form.set("tags", tags);
    setBusy(true); setError(null);
    const result = await uploadKnowledgeAction(form).catch(() => ({ ok: false, error: "Could not upload this document. Try again." }) as const);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    toast("Document added"); onSaved(result.id!);
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title="Upload a document" footer={<>
    <Button onClick={onClose} disabled={busy}>Cancel</Button>
    <Button variant="primary" disabled={busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload"}</Button>
  </>}>
    <div className={s.fields}>
      <TextField label="Markdown or text file" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" disabled={busy}
        help="UTF-8, up to 500 KB. The first # Heading becomes the title. PDFs aren't supported." onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <TextField label="Tags" help="Comma separated" value={tags} disabled={busy} onChange={(e) => setTags(e.target.value)} />
      {error && <Alert>{error}</Alert>}
    </div>
  </Dialog>;
}
