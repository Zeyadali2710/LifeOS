"use client";

import { useState } from "react";
import { KIND_META, KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, type KnowledgeKind } from "@/lib/knowledge";
import type { KnowledgeDetail } from "@/server/knowledge";
import { saveKnowledgeAction, uploadKnowledgeAction } from "@/server/knowledge-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";

export function ItemDialog({ open, onClose, item, projects, defaultKind, onSaved }: {
  open: boolean; onClose: () => void; item: KnowledgeDetail | null; projects: { id: string; name: string }[]; defaultKind: KnowledgeKind; onSaved: (id: string) => void;
}) {
  const { toast } = useShell();
  const [kind, setKind] = useState<KnowledgeKind>(item?.kind ?? defaultKind);
  const [title, setTitle] = useState(item?.title ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [projectId, setProjectId] = useState(item?.projectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError(null);
    const r = await saveKnowledgeAction({ kind, title, body, url: url.trim() || null, tags: tags.split(","), projectId: projectId || null }, item?.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(item ? "Saved" : "Added to Knowledge");
    onSaved(r.id!);
  }

  return (
    <Dialog open={open} onClose={onClose} title={item ? "Edit item" : "New knowledge item"} width={520}
      actions={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{item ? "Save" : "Add"}</Button></>}>
      <div className="flex flex-col gap-3.5">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as KnowledgeKind)}>
            {KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
          </Select>
        </Field>
        <Field label="Title"><Input value={title} maxLength={KNOWLEDGE_LIMITS.title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={kind === "bookmark" ? "Link" : "Link (optional)"} helper="https:// links only. LifeOS doesn't fetch the page.">
          <Input type="url" inputMode="url" value={url} maxLength={KNOWLEDGE_LIMITS.url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label={kind === "bookmark" ? "Notes (optional)" : "Text"}><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Field label="Tags" helper="Comma separated, e.g. lifeos, architecture"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        <Field label="Linked project (optional)">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        {error && <p role="alert" className="text-[13px] text-red">{error}</p>}
      </div>
    </Dialog>
  );
}

export function UploadDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const { toast } = useShell();
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) { setError("Choose a file."); return; }
    const form = new FormData();
    form.set("file", file); form.set("tags", tags);
    setBusy(true); setError(null);
    const r = await uploadKnowledgeAction(form);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast("Document added");
    onSaved(r.id!);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Upload a document" width={480}
      actions={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={upload}>Upload</Button></>}>
      <div className="flex flex-col gap-3.5">
        <Field label="Markdown or text file" helper="Up to 500 KB. The first “# Heading” becomes the title. PDFs aren't supported yet.">
          <Input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Tags" helper="Comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        {error && <p role="alert" className="text-[13px] text-red">{error}</p>}
      </div>
    </Dialog>
  );
}
