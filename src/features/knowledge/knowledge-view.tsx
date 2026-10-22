"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KIND_META, KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, type KnowledgeKind } from "@/lib/knowledge";
import type { KnowledgeData } from "@/server/knowledge";
import { deleteKnowledgeAction, markKnowledgeViewedAction, setKnowledgeSemanticAction } from "@/server/knowledge-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink } from "@/ui/button";
import { FilterChip, SearchField, Segmented } from "@/ui/controls";
import { Alert, EmptyState, PageState } from "@/ui/feedback";
import { Page, PageHeader, Section } from "@/ui/layout";
import { ConfirmDialog } from "@/ui/overlay";
import { ItemEditor } from "./item-editor";
import { NewItemDialog, UploadDialog } from "./item-form";
import { knowledgeUrl, when } from "./model";
import s from "./knowledge.module.css";

export function KnowledgeView({ data }: { data: KnowledgeData }) {
  const router = useRouter(), sp = useSearchParams(), { toast, openAI } = useShell();
  const [creating, setCreating] = useState<KnowledgeKind | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [closed, setClosed] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const f = data.filter, semantic = data.semantic, detail = closed ? null : data.detail;
  const semanticMode = f.mode === "semantic";
  const viewedId = detail?.id;
  useEffect(() => {
    if (viewedId) void markKnowledgeViewedAction(viewedId).catch(() => undefined);
  }, [viewedId]);

  function ready() {
    if (!dirty) return true;
    toast("Wait for your changes to save, or fix the save error first.", "error");
    return false;
  }
  function go(patch: Record<string, string | null>) {
    if (!ready()) return;
    if (patch.item) setClosed(false);
    router.push(knowledgeUrl(sp.toString(), patch), { scroll: false });
  }
  function toggleTag(tag: string) {
    go({ tags: (f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag]).join(",") || null });
  }
  async function setSemantic(on: boolean) {
    if (busy) return;
    setBusy(true);
    const result = await setKnowledgeSemanticAction(on).catch(() => ({ ok: false, error: "Could not change semantic search. Try again." }) as const);
    setBusy(false);
    if (!result.ok) { toast(result.error, "error"); return; }
    toast(on ? "Semantic search on · indexing in the background" : "Semantic search off");
    router.refresh();
  }
  async function remove() {
    if (!detail || busy) return;
    setBusy(true);
    const result = await deleteKnowledgeAction(detail.id).catch(() => ({ ok: false, error: "Could not delete this item. Try again." }) as const);
    setBusy(false);
    if (!result.ok) { toast(result.error, "error"); return; }
    setDeleting(false); toast("Deleted"); go({ item: null }); router.refresh();
  }
  function listKey(event: KeyboardEvent<HTMLUListElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = ["ArrowDown", "ArrowUp", "j", "k", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-item]")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" || event.key === "j" ? 1 : buttons.length - 1)) % buttons.length;
    buttons[next]?.focus();
  }
  const focusId = data.hits.some((h) => h.id === focused) ? focused : data.hits.some((h) => h.id === detail?.id) ? detail?.id : data.hits[0]?.id;
  const saved = (id: string) => { setCreating(null); setUploading(false); go({ item: id }); router.refresh(); };

  return <Page label="Knowledge">
    <PageHeader title="Knowledge" sub={`${data.total} items · ${semanticMode ? `Semantic index ${semantic.indexed}/${semantic.total} · queries go to OpenRouter embeddings` : "Keyword search runs inside LifeOS"}`}
      actions={<>
        <Button onClick={() => { if (ready()) setUploading(true); }}>Upload .md</Button>
        <Button variant="primary" onClick={() => { if (ready()) setCreating(f.kind ?? "note"); }}>New item</Button>
      </>} />
    <form role="search" className={s.toolbar} onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() || null }); }}>
      <div className={s.searchWrap}>
        <span className={s.searchMode} aria-hidden="true">{semanticMode ? "SEM" : "KEY"}</span>
        <SearchField key={f.q} name="q" defaultValue={f.q} label="Search knowledge" maxLength={KNOWLEDGE_LIMITS.query} className={s.search} placeholder="Search titles, text and #tags" />
      </div>
      <Segmented label="Search mode" value={f.mode} className={s.modes} options={[{ value: "keyword", label: "Keyword" }, { value: "semantic", label: "Semantic" }]}
        onChange={(mode) => { if (!ready()) return; go({ mode: mode === "keyword" ? null : mode }); if (mode === "semantic") toast("Semantic search sends item text and queries to OpenRouter embeddings."); }} />
      <Button variant="text" onClick={() => openAI("Ask the Knowledge agent about my saved notes: ")}>Ask Knowledge →</Button>
    </form>
    <nav aria-label="Knowledge kinds" className={s.filters}>
      {([null, ...KNOWLEDGE_KINDS] as (KnowledgeKind | null)[]).map((kind) => <FilterChip key={kind ?? "all"} selected={f.kind === kind} count={kind ? data.counts[kind] : data.total} onClick={() => go({ kind })}>{kind ? KIND_META[kind].label : "All"}</FilterChip>)}
    </nav>
    {data.tags.length > 0 && <details className={s.tagFilters} open={f.tags.length > 0 || undefined}>
      <summary>Filter by tag{f.tags.length ? ` · ${f.tags.length} selected` : ""}</summary>
      <div className={s.filters}>{data.tags.map(({ tag, n }) => <FilterChip key={tag} selected={f.tags.includes(tag)} count={n} onClick={() => toggleTag(tag)}>#{tag}</FilterChip>)}</div>
    </details>}
    {semanticMode && <div className={s.notice}>
      {!semantic.connected ? <PageState inline kind="disconnected" agent="knowledge" title="Semantic search needs an OpenRouter key" body="Add your OpenRouter key in Settings → Connections. Keyword search works without it." action={{ label: "Open Connections", href: "/settings?section=connections" }} />
        : !semantic.enabled ? <PageState inline kind="disconnected" agent="knowledge" title="Semantic search is off" body="Turning it on sends item titles and text to OpenRouter (OpenAI text-embedding-3-small), and each semantic query. Keyword search stays inside LifeOS."
          action={{ label: busy ? "Turning on…" : "Turn on semantic search", onClick: () => void setSemantic(true) }} />
        : <Alert tone="info" action={<Button variant="text" disabled={busy} onClick={() => void setSemantic(false)}>Turn off semantic search</Button>}>Semantic index {semantic.indexed}/{semantic.total}. Item titles, text and semantic queries go to OpenRouter embeddings.</Alert>}
      {data.semanticError === "unavailable" && <Alert action={<Button variant="text" onClick={() => router.refresh()}>Retry search</Button>}>Semantic search is unavailable right now. Try again, or switch to keyword search.</Alert>}
    </div>}
    <div className={s.columns}>
      <div className={s.listPane}>
        <Section id="knowledge-results" label={f.q ? `${data.hits.length} results · ${f.mode}` : `All items · ${data.hits.length}`}>
          {data.total === 0 ? <PageState inline kind="empty" agent="knowledge" title="Nothing saved yet" body="Add a note, upload a .md file or save a bookmark." action={{ label: "Add a note", onClick: () => setCreating("note") }} />
            : data.hits.length === 0 ? <EmptyState icon="library_books" title={f.q ? `No items match “${f.q}”.` : "Nothing in this view."} body={semanticMode ? "Try keyword search, or different words." : "Try fewer words, another kind or tag, or semantic mode."} action={<Button onClick={() => go({ q: null, tags: null, kind: null, mode: null })}>Clear filters</Button>} />
              : <ul className={s.list} aria-label="Knowledge items" onKeyDown={listKey}>
                {data.hits.map((hit) => <li key={hit.id}>
                  <button type="button" data-item={hit.id} className={s.item} aria-pressed={detail?.id === hit.id} tabIndex={focusId === hit.id ? 0 : -1} onFocus={() => setFocused(hit.id)} onClick={() => go({ item: hit.id })}>
                    <span className={s.itemHead}><span className={s.itemTitle}>{hit.title}</span><span className={s.date}>{when(hit.updatedAt)}</span></span>
                    {hit.excerpt && <span className={s.excerpt}>{hit.excerpt}</span>}
                    <span className={s.itemMeta}>{hit.kind.toUpperCase()} · {hit.tags.map((tag) => `#${tag}`).join(" ")}{hit.score !== null ? ` · ${hit.score.toFixed(2)} match` : ""}</span>
                  </button>
                </li>)}
              </ul>}
        </Section>
        {data.recent.length > 0 && <details className={s.recent}>
          <summary>Recently viewed</summary>
          <ul className={s.list}>{data.recent.map((item) => <li key={item.id}><button type="button" className={s.recentItem} onClick={() => go({ item: item.id })}><span>{item.title}</span><span className={s.date}>{when(item.viewedAt)}</span></button></li>)}</ul>
        </details>}
        {!semanticMode && semantic.enabled && semantic.connected && <div className={s.index}>Semantic index {semantic.indexed}/{semantic.total} · <Button variant="text" size="sm" disabled={busy} onClick={() => void setSemantic(false)}>Turn off</Button></div>}
      </div>
      {detail ? <ItemEditor key={detail.id} item={detail} projects={data.projects} onDirty={setDirty} onDelete={() => setDeleting(true)} onClose={() => { if (ready()) { setClosed(true); go({ item: null }); } }} />
        : data.total > 0 && <div className={s.editor}><EmptyState icon="library_books" title={sp.get("item") && !data.detail ? "This item is unavailable" : "Choose an item"} body="Select an item from the list to read and edit it." /></div>}
    </div>
    <p className={s.privacy}>Ask Knowledge sends the items it reads to Anthropic through the Knowledge agent, never a free model. <ButtonLink variant="text" size="sm" href="/agents/knowledge">Open agent</ButtonLink></p>
    {creating && <NewItemDialog kind={creating} projects={data.projects} onClose={() => setCreating(null)} onSaved={saved} />}
    {uploading && <UploadDialog onClose={() => setUploading(false)} onSaved={saved} />}
    <ConfirmDialog open={deleting} onClose={() => { if (!busy) setDeleting(false); }} onConfirm={() => void remove()} title="Delete this item?" body={`“${detail?.title ?? "This item"}” will be permanently removed from Knowledge. This can't be undone.`} confirmLabel="Delete item" danger busy={busy} />
  </Page>;
}
