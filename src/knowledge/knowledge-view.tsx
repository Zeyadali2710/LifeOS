"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KIND_META, KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, type KnowledgeKind } from "@/lib/knowledge";
import type { KnowledgeData } from "@/server/knowledge";
import { deleteKnowledgeAction, markKnowledgeViewedAction, setKnowledgeSemanticAction } from "@/server/knowledge-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { EmptyState } from "@/ui/empty-state";
import { Icon } from "@/ui/icon";
import { ItemDialog, UploadDialog } from "./item-dialog";

const when = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

export function KnowledgeView({ data }: { data: KnowledgeData }) {
  const router = useRouter(), sp = useSearchParams(), { toast, openAI } = useShell();
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const detail = data.detail;
  const f = data.filter;

  useEffect(() => { if (detail) void markKnowledgeViewedAction(detail.id); }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.push(`/knowledge${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  const toggleTag = (tag: string) => go({ tags: (f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag]).join(",") || null });

  async function semantic(on: boolean) {
    setBusy(true);
    const r = await setKnowledgeSemanticAction(on);
    setBusy(false);
    if (r.ok) { toast(on ? "Semantic search on · indexing in the background" : "Semantic search off"); router.refresh(); }
    else toast(r.error, "error");
  }
  async function remove() {
    if (!detail) return;
    setBusy(true);
    const r = await deleteKnowledgeAction(detail.id);
    setBusy(false); setDeleting(false);
    if (r.ok) { toast("Deleted"); go({ item: null }); } else toast(r.error, "error");
  }

  const s = data.semantic;
  const semanticMode = f.mode === "semantic";
  const resultLabel = f.q
    ? `${data.hits.length} RESULT${data.hits.length === 1 ? "" : "S"} · ${f.mode.toUpperCase()}`
    : `${f.kind ? KIND_META[f.kind].section.toUpperCase() : "ALL ITEMS"} · ${data.hits.length}`;

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] tracking-[.12em] text-purple-text">KNOWLEDGE</p>
          <h1 className="font-display text-[clamp(36px,4.4vw,60px)] leading-[.95]">Everything you&apos;ve read, written and saved.</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openAI("Ask the Knowledge agent about my saved notes: ")}><Icon name="auto_awesome" size={16} />Ask Knowledge</Button>
          <Button variant="secondary" onClick={() => setUploading(true)}><Icon name="upload_file" size={16} />Upload</Button>
          <Button onClick={() => setEditing("new")}><Icon name="add" size={16} />New item</Button>
        </div>
      </header>

      <form role="search" className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() || null }); }}>
        <div className="glass-card flex h-12 items-center gap-2.5 rounded-22 pr-2 pl-3.5">
          <Icon name="search" size={20} className="text-text-3" />
          <input
            key={f.q} name="q" defaultValue={f.q} maxLength={KNOWLEDGE_LIMITS.query} aria-label="Search knowledge"
            placeholder={semanticMode ? "Search by meaning: “how did I decide on the sync design?”" : "Search by keyword"}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-3"
          />
          <div role="radiogroup" aria-label="Search mode" className="flex gap-0.5 rounded-full bg-white/[.04] p-[3px]">
            {(["keyword", "semantic"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={f.mode === m} onClick={() => go({ mode: m === "keyword" ? null : m })}
                className={`h-7 rounded-full px-2.5 text-[12px] capitalize ${f.mode === m ? "bg-white/10 text-text" : "text-text-3 hover:text-text"}`}>{m}</button>
            ))}
          </div>
        </div>
        {data.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] tracking-[.12em] text-text-3">TAGS</span>
            {data.tags.map(({ tag, n }) => {
              const on = f.tags.includes(tag);
              return <button key={tag} type="button" aria-pressed={on} onClick={() => toggleTag(tag)}
                className={`h-[26px] rounded-full border px-2.5 text-[11.5px] ${on ? "border-cyan/45 bg-cyan/12 text-text" : "border-white/[.08] text-text-2 hover:text-text"}`}>#{tag} <span className="text-text-3">{n}</span></button>;
            })}
          </div>
        )}
      </form>

      {semanticMode && (!s.enabled || !s.connected) && (
        <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-16 border border-purple/30 bg-purple/[.06] p-4">
          <Icon name="info" size={20} className="text-purple-text" />
          <div className="flex min-w-[260px] flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-medium">{!s.connected ? "Semantic search needs an OpenRouter key." : "Semantic search is off."}</span>
            <span className="text-[12.5px] leading-normal text-text-2">
              {!s.connected
                ? "Add your OpenRouter key in Settings → Connections. Keyword search works without it."
                : "Turning it on sends the title and text of each item to OpenRouter (OpenAI text-embedding-3-small) to build a meaning index, and each search query when you search by meaning. Keyword search never leaves LifeOS."}
            </span>
          </div>
          {!s.connected ? <Link href="/settings" className="text-[12.5px] text-purple-text hover:underline">Open Settings →</Link>
            : <Button size="sm" loading={busy} onClick={() => semantic(true)}>Turn on semantic search</Button>}
        </div>
      )}
      {data.semanticError === "unavailable" && <p role="alert" className="text-[13px] text-red">Semantic search is unavailable right now. Try again, or switch to keyword search.</p>}

      <div className="flex flex-wrap items-start gap-5">
        <nav aria-label="Knowledge sections" className="-mx-1 flex w-full gap-0.5 overflow-x-auto px-1 md:mx-0 md:w-[190px] md:flex-none md:flex-col md:overflow-visible md:px-0">
          {([null, ...KNOWLEDGE_KINDS] as (KnowledgeKind | null)[]).map((k) => {
            const on = f.kind === k;
            return (
              <button key={k ?? "all"} type="button" aria-current={on ? "page" : undefined} onClick={() => go({ kind: k })}
                className={`flex h-9 shrink-0 items-center gap-2.5 rounded-full px-2.5 text-left text-[13.5px] whitespace-nowrap ${on ? "bg-white/5 text-text" : "text-text-2 hover:text-text"}`}>
                <Icon name={k ? KIND_META[k].icon as never : "apps"} size={18} />
                <span className="flex-1">{k ? KIND_META[k].section : "All"}</span>
                <span className="text-[11px] text-text-3">{k ? data.counts[k] : data.total}</span>
              </button>
            );
          })}
          {data.recent.length > 0 && <div className="hidden flex-col gap-0.5 md:flex">
            <div className="mx-1.5 my-3 h-px bg-white/[.06]" />
            <span className="px-2.5 py-1 text-[10px] tracking-[.14em] text-text-3">RECENTLY VIEWED</span>
            {data.recent.map((r) => (
              <button key={r.id} type="button" onClick={() => go({ item: r.id })} className="flex flex-col gap-0.5 rounded-8 px-2.5 py-1.5 text-left hover:bg-white/[.03]">
                <span className="truncate text-[12.5px]">{r.title}</span><span className="text-[10.5px] text-text-3">{when(r.viewedAt)}</span>
              </button>
            ))}
          </div>}
        </nav>

        <section aria-label="Results" className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5">
            <span className="flex-1 text-[10.5px] tracking-[.12em] text-text-3">{resultLabel}</span>
            {s.enabled && s.connected && (
              <span className="text-[11px] text-text-3">
                Semantic index {s.indexed}/{s.total} ·{" "}
                <button type="button" disabled={busy} onClick={() => semantic(false)} className="text-text-2 hover:text-text">Turn off</button>
              </span>
            )}
          </div>
          {data.total === 0 ? (
            <EmptyState icon="library_books" title="Nothing saved yet." body="Add a note, upload a Markdown or text document, or save a bookmark. Everything here is searchable by keyword, and by meaning once you turn semantic search on." />
          ) : data.hits.length === 0 ? (
            <div className="flex flex-col gap-1.5 rounded-16 border border-dashed border-white/10 px-5 py-8">
              <span className="text-[14.5px]">{f.q ? `Nothing found for “${f.q}”.` : "Nothing in this view."}</span>
              <span className="text-[13px] leading-normal text-text-2">{semanticMode ? "Try keyword search, or different words." : "Try semantic search to match by meaning, or fewer words."}</span>
            </div>
          ) : data.hits.map((h) => {
            const on = detail?.id === h.id;
            return (
              <button key={h.id} type="button" onClick={() => go({ item: h.id })} aria-current={on ? "true" : undefined}
                className={`glass-card flex flex-col gap-1.5 rounded-16 p-3.5 text-left ${on ? "!border-purple/45 bg-purple/[.05]" : "hover:!border-white/20"}`}>
                <span className="flex w-full items-center gap-2">
                  <Icon name={KIND_META[h.kind].icon as never} size={16} className="text-text-3" />
                  <span className="flex-1 text-[14px] font-medium">{h.title}</span>
                  {h.score !== null && <span className="text-[10.5px] text-purple-text">{Math.round(h.score * 100)}% match</span>}
                </span>
                {h.excerpt && <span className="line-clamp-2 text-[12.5px] leading-normal text-text-2">{h.excerpt}</span>}
                <span className="flex flex-wrap gap-2 text-[10.5px] text-text-3">
                  <span>{KIND_META[h.kind].label.toUpperCase()}</span><span>·</span><span>{when(h.updatedAt)}</span>
                  {h.tags.map((t) => <span key={t} className="text-cyan">#{t}</span>)}
                </span>
              </button>
            );
          })}
        </section>

        {detail && (
          <article aria-label={detail.title} className="glass-card order-first flex min-w-0 flex-[1.3_1_380px] flex-col gap-3.5 rounded-24 p-5 md:order-none md:sticky md:top-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-3">
              <span>{KIND_META[detail.kind].label.toUpperCase()}</span><span>·</span><span>updated {when(detail.updatedAt)}</span>
              <span className="flex-1" />
              <Button variant="ghost" size="xs" onClick={() => setEditing("edit")}><Icon name="edit" size={14} />Edit</Button>
              <Button variant="ghost" size="xs" onClick={() => setDeleting(true)}><Icon name="delete" size={14} />Delete</Button>
              <Button variant="ghost" size="xs" aria-label="Close item" onClick={() => go({ item: null })}><Icon name="close" size={14} /></Button>
            </div>
            <h2 className="font-display text-[30px] leading-[1.05] break-words">{detail.title}</h2>
            {detail.url && <a href={detail.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 self-start text-[13px] break-all text-cyan hover:underline"><Icon name="open_in_new" size={14} />{detail.url}</a>}
            {detail.body && <div className="text-[14px] leading-[1.7] break-words whitespace-pre-wrap text-text-2">{detail.body}</div>}
            {(detail.projectName || detail.tags.length > 0) && (
              <div className="flex flex-col gap-2 border-t border-white/[.06] pt-3">
                <span className="text-[10px] tracking-[.14em] text-text-3">LINKED</span>
                {detail.projectName && detail.projectId && <Link href={`/projects/${detail.projectId}`} className="flex items-center gap-2 text-[13px] hover:underline"><Icon name="deployed_code" size={15} className="text-cyan" />{detail.projectName}</Link>}
                {detail.tags.length > 0 && <div className="flex flex-wrap gap-2 text-[12px] text-cyan">{detail.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
              </div>
            )}
          </article>
        )}
      </div>

      {editing && <ItemDialog key={editing === "edit" ? detail?.id : "new"} open onClose={() => setEditing(null)} item={editing === "edit" ? detail : null} projects={data.projects}
        defaultKind={f.kind ?? "note"} onSaved={(id) => { setEditing(null); go({ item: id }); }} />}
      {uploading && <UploadDialog open onClose={() => setUploading(false)} onSaved={(id) => { setUploading(false); go({ item: id }); }} />}
      <Dialog open={deleting} onClose={() => setDeleting(false)} title="Delete this item?" width={420}
        actions={<><Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button><Button variant="destructive" loading={busy} onClick={remove}>Delete</Button></>}>
        <p className="text-[13.5px] text-text-2">“{detail?.title}” will be permanently removed from Knowledge. This can&apos;t be undone.</p>
      </Dialog>
    </div>
  );
}
