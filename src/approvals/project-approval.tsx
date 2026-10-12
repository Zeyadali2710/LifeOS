"use client";

import { useEffect, useId, useRef, useState } from "react";
import { payloadSchemaFor } from "@/lib/approval-kinds";
import type { ApprovalDTO } from "@/lib/agent-types";
import { draftCounts, type DraftLink, type ProjectCreatePayload, type ProjectUpdatePayload } from "@/lib/project-payload";
import { CATEGORY_LABEL, PROJECT_CATEGORIES } from "@/lib/project-types";
import { PriorityTag } from "@/projects/status";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Disclosure } from "@/ui/disclosure";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Icon } from "@/ui/icon";

// Project approval bodies (create preview, update diff) and their edit form. Client-safe.
// Repo-derived text is untrusted: every string below renders as a React text node, never as HTML or Markdown.
export type ProjectPayload = ProjectCreatePayload | ProjectUpdatePayload;
const isUpdate = (p: ProjectPayload): p is ProjectUpdatePayload => "projectId" in p;

export const projectOf = (a: Pick<ApprovalDTO, "edited" | "original">) => (a.edited ?? a.original) as ProjectPayload;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (ymd?: string | null, year = false) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  return m ? `${+m[3]!} ${MONTHS[+m[2]! - 1]}${year ? ` ${m[1]}` : ""}` : "";
};
const PRI = (n?: number | null) => (n ? `P${n}` : "None");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// ---- edit draft ----
type Row = { rid: string; removed: boolean };
// `init` is what the form first showed and `orig` the draft's own value: an untouched field sends `orig` back as-is,
// so an omitted field (undefined = keep current on update) is never turned into null (= clear).
type Orig = { dueDate?: string | null; priority?: number | null; milestoneRef?: string | null };
export type MRow = Row & { id?: string; ref?: string; title: string; dueDate: string; init: { dueDate: string }; orig: Orig };
export type TRow = Row & { id?: string; ref?: string; title: string; dueDate: string; priority: string; milestone: string; blockedBy: string[]; init: { dueDate: string; priority: string; milestone: string }; orig: Orig };
export type LRow = Row & { link: DraftLink };
export type ProjectDraft = {
  name: string;
  description: string;
  context: string;
  category: string;
  priority: 1 | 2 | 3;
  targetDate: string;
  milestones: MRow[];
  tasks: TRow[];
  links: LRow[];
};
/** Keys: top-level field names, group names (milestones/tasks/links), or `${rid}.${field}` for rows. */
export type ProjectErrors = Record<string, string>;

export function toProjectDraft(p: ProjectPayload): ProjectDraft {
  const f = isUpdate(p) ? { ...p.before.fields, ...p.changes } : p;
  const ms = p.milestones as { id?: string; ref?: string; title: string; dueDate?: string | null }[];
  // An absent ref must not match milestones that also lack a ref/id (undefined === undefined).
  const keyOf = (k?: string | null) => {
    if (!k) return "";
    const m = ms.find((x) => x.ref === k || x.id === k);
    return m ? (m.ref ?? m.id ?? "") : k;
  };
  return {
    name: f.name ?? "",
    description: f.description ?? "",
    context: f.context ?? "",
    category: f.category ?? "personal",
    priority: (f.priority ?? 2) as 1 | 2 | 3,
    targetDate: f.targetDate ?? "",
    milestones: ms.map((m, i) => {
      // Update rows that omit a field show the current value from `before`.
      const b = m.id && isUpdate(p) ? p.before.milestones.find((x) => x.id === m.id) : undefined;
      const dueDate = (m.dueDate === undefined ? b?.dueDate : m.dueDate) ?? "";
      return { rid: `m${i}`, removed: false, id: m.id, ref: m.ref, title: m.title, dueDate, init: { dueDate }, orig: { dueDate: m.dueDate } };
    }),
    tasks: p.tasks.map((t, i) => {
      const x = t as { id?: string; ref?: string };
      const b = x.id && isUpdate(p) ? p.before.tasks.find((y) => y.id === x.id) : undefined;
      const init = {
        dueDate: (t.dueDate === undefined ? b?.dueDate : t.dueDate) ?? "",
        priority: String((t.priority === undefined ? b?.priority : t.priority) ?? ""),
        milestone: keyOf(t.milestoneRef === undefined ? b?.milestoneId : t.milestoneRef),
      };
      return { rid: `t${i}`, removed: false, id: x.id, ref: x.ref, title: t.title, ...init, blockedBy: t.blockedBy ?? [], init, orig: { dueDate: t.dueDate, priority: t.priority, milestoneRef: t.milestoneRef } };
    }),
    links: p.links.map((link, i) => ({ rid: `l${i}`, removed: false, link })),
  };
}

const changedFields = (before: ProjectUpdatePayload["before"]["fields"], d: ProjectDraft) => {
  const cur: Record<string, unknown> = { name: d.name, description: d.description, context: d.context, category: d.category, priority: d.priority, targetDate: d.targetDate || null };
  const bf = before as Record<string, unknown>;
  return Object.fromEntries(Object.entries(cur).filter(([k, v]) => v !== bf[k]));
};

/** Same schema the server re-runs on approve (D-14). Locked fields (sources, projectId, before) come from `base` untouched. */
export function validateProjectDraft(tool: string, base: ProjectPayload, d: ProjectDraft): { payload: ProjectPayload } | { errors: ProjectErrors } {
  const goneM = new Set(d.milestones.filter((m) => m.removed).flatMap((m) => [m.ref, m.id].filter((x): x is string => !!x)));
  const goneT = new Set(d.tasks.filter((t) => t.removed).flatMap((t) => [t.ref, t.id].filter((x): x is string => !!x)));
  const km = d.milestones.filter((m) => !m.removed);
  const kt = d.tasks.filter((t) => !t.removed);
  const kl = d.links.filter((l) => !l.removed);
  const milestones = km.map((m) => ({ ...(m.id ? { id: m.id } : {}), ...(m.ref ? { ref: m.ref } : {}), title: m.title, dueDate: m.dueDate === m.init.dueDate ? m.orig.dueDate : m.dueDate || null }));
  const tasks = kt.map((t) => {
    const deps = t.blockedBy.filter((b) => !goneT.has(b));
    return {
      ...(t.id ? { id: t.id } : {}),
      ...(t.ref ? { ref: t.ref } : {}),
      title: t.title,
      dueDate: t.dueDate === t.init.dueDate ? t.orig.dueDate : t.dueDate || null,
      priority: t.priority === t.init.priority ? t.orig.priority : t.priority ? Number(t.priority) : null,
      milestoneRef: t.milestone && goneM.has(t.milestone) ? null : t.milestone === t.init.milestone ? t.orig.milestoneRef : t.milestone || null,
      ...(deps.length ? { blockedBy: deps } : {}),
    };
  });
  const links = kl.map((l) => l.link);
  const next = isUpdate(base)
    ? { ...base, changes: changedFields(base.before.fields, d), milestones, tasks, links }
    : { ...base, name: d.name, description: d.description, context: d.context, category: d.category, priority: d.priority, targetDate: d.targetDate || null, milestones, tasks, links };
  const r = payloadSchemaFor(tool).safeParse(next);
  if (r.success) return { payload: r.data as ProjectPayload };
  const errors: ProjectErrors = {};
  const rows = { milestones: km, tasks: kt, links: kl } as Record<string, Row[]>;
  for (const i of r.error.issues) {
    const [g, idx, f] = i.path;
    if (g === "changes" && typeof idx === "string") errors[idx] ??= i.message;
    else if (typeof g === "string" && typeof idx === "number" && rows[g]?.[idx]) {
      const col = g === "links" ? "link" : f === "milestoneRef" ? "milestone" : f === "blockedBy" ? "title" : String(f ?? "title");
      errors[`${rows[g][idx]!.rid}.${col}`] ??= i.message;
    } else if (typeof g === "string") errors[g] ??= i.message;
  }
  if (!Object.keys(errors).length) errors.name = "Check the project details.";
  return { errors };
}

// Null/undefined/empty arrays are the same as absent: the stored original omits what a re-validated draft spells out.
const norm = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => [k, norm(x)] as const)
        .filter(([, x]) => x != null && !(Array.isArray(x) && x.length === 0))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
  return v;
};
export const sameProject = (a: ProjectPayload, b: ProjectPayload) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

// ---- resolved texts (UI-SPEC) ----
export function projectResolved(a: ApprovalDTO, at: string): { text: string; href: string | null } | null {
  const p = projectOf(a);
  const upd = a.kind === "project_update";
  const r = (a.result ?? {}) as { projectId?: unknown; name?: unknown };
  const fallback = isUpdate(p) ? (p.changes.name ?? p.before.name) : p.name;
  const name = typeof r.name === "string" ? r.name : fallback;
  if (a.status === "executed") {
    const ok = typeof r.projectId === "string" && UUID.test(r.projectId);
    return { text: `Project ${upd ? "updated" : "created"}: ${name}. Approved at ${at}.`, href: ok ? `/projects/${r.projectId}` : null };
  }
  if (a.status === "failed") {
    const err = (a.error ?? "unknown error").replace(/\.$/, "");
    return { text: `Approved, but it couldn't be saved: ${err}. ${upd ? "Nothing was changed." : "Nothing was created."}`, href: null };
  }
  return null;
}

// ---- views ----
const Fact = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-1 text-[10px] tracking-[0.14em] text-text-3">{k}</div>
    <div className="text-[13.5px] leading-normal break-words">{children}</div>
  </div>
);
const Eyebrow = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`mb-2 text-[10px] tracking-[0.14em] text-text-3 ${className}`}>{children}</div>;
const panel = "rounded-14 border border-white/[.08] bg-white/[.03] p-4";

function Untrusted({ sources }: { sources: string[] }) {
  const shown = sources.slice(0, 8);
  const rest = sources.slice(8);
  const li = (s: string) => (
    <li key={s} title={s} className="truncate font-code text-[11.5px] text-text-2">
      {s}
    </li>
  );
  return (
    <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
      <div role="note" className="rounded-14 border border-[rgba(255,159,10,.30)] bg-[rgba(255,159,10,.06)] p-4">
        <div className="flex items-center gap-2 text-[13.5px]">
          <Icon name="warning" size={18} className="shrink-0 text-amber" />
          Drafted from repository files (untrusted)
        </div>
        <p className="mt-1 text-[12.5px] text-text-2">These files are written by others. Check the draft before approving; nothing happens until you do.</p>
        <ul className="mt-2 flex flex-col gap-1">{shown.map(li)}</ul>
        {rest.length > 0 && (
          <div className="mt-2 text-[12.5px] text-text-2">
            <Disclosure summary={<span>Show {rest.length} more files</span>}>
              <ul className="flex flex-col gap-1 pt-2">{rest.map(li)}</ul>
            </Disclosure>
          </div>
        )}
      </div>
    </section>
  );
}

function ContextText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!text) return null;
  return (
    <div className="mt-4">
      <Eyebrow>CONTEXT</Eyebrow>
      <p id={id} className={`${open ? "" : "line-clamp-6"} text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2`}>
        {text}
      </p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="mt-1 text-[12.5px] text-cyan hover:text-cyan-soft">
        {open ? "Show less" : "Show full context"}
      </button>
    </div>
  );
}

const LinkRow = ({ l, tag }: { l: DraftLink; tag?: string }) => (
  <li className="flex min-h-8 items-center gap-2.5 text-[13.5px]">
    <Icon name="link" size={16} className="shrink-0 text-text-3" />
    {l.kind === "repo" ? (
      <>
        <span className="font-code break-all">{l.repo}</span>
        <span className="text-[12.5px] text-text-3">Repository</span>
      </>
    ) : (
      <>
        <span className="break-words">{l.label}</span>
        <span className="text-[12.5px] break-all text-text-3">{host(l.url)}</span>
      </>
    )}
    {tag && (
      <Badge kind="tag" tone="neutral">
        {tag}
      </Badge>
    )}
  </li>
);
const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};

type Task = { id?: string; ref?: string; title: string; dueDate?: string | null; priority?: number | null; milestoneRef?: string | null; blockedBy?: string[] };

function TaskRow({ t, all, tag, detail }: { t: Task; all: Task[]; tag?: string; detail?: string }) {
  const blockers = (t.blockedBy ?? []).map((b) => all.find((x) => x.ref === b || x.id === b)?.title).filter(Boolean);
  return (
    <li className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px]">
      <Icon name="task_alt" size={16} className="shrink-0 text-text-3" />
      <span title={t.title} className="min-w-0 break-words">
        {t.title}
      </span>
      {t.priority ? <PriorityTag priority={t.priority as 1 | 2 | 3} /> : null}
      {t.dueDate && <span className="text-[12.5px] text-text-3">Due {day(t.dueDate)}</span>}
      {blockers.map((b) => (
        <span key={b} className="text-[12.5px] text-text-3">
          Blocked by &quot;{b}&quot;
        </span>
      ))}
      {tag && (
        <Badge kind="tag" tone="neutral">
          {tag}
        </Badge>
      )}
      {detail && <span className="text-[12.5px] text-text-3">{detail}</span>}
    </li>
  );
}

function CreatePreview({ p }: { p: ProjectCreatePayload }) {
  const mKey = (t: Task) => p.milestones.findIndex((m) => m.ref !== undefined && m.ref === t.milestoneRef);
  const groups = [...p.milestones.map((m, i) => ({ label: m.title, items: p.tasks.filter((t) => mKey(t) === i) })), { label: "No milestone", items: p.tasks.filter((t) => mKey(t) < 0) }].filter((g) => g.items.length);
  return (
    <div className={panel}>
      <div className="text-[15px] font-medium break-words">{p.name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-text-2">
        {CATEGORY_LABEL[p.category]} · <PriorityTag priority={p.priority} /> · {p.targetDate ? `Target ${day(p.targetDate, true)}` : "No target date"}
      </div>
      {p.description && <p className="mt-2 text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-text-2">{p.description}</p>}
      <ContextText text={p.context} />
      {p.milestones.length > 0 && (
        <div className="mt-4">
          <Eyebrow>MILESTONES</Eyebrow>
          <ul className="flex flex-col gap-2">
            {p.milestones.map((m, i) => (
              <li key={i} className="flex min-h-8 flex-wrap items-center gap-2.5 text-[13.5px]">
                <Icon name="flag" size={16} className="shrink-0 text-text-3" />
                <span className="min-w-0 break-words">{m.title}</span>
                <span className="text-[12.5px] text-text-3">{m.dueDate ? `Due ${day(m.dueDate)}` : "No due date"}</span>
                <span className="text-[12.5px] text-text-3">{p.tasks.filter((t) => mKey(t) === i).length} tasks</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.length > 0 && (
        <div className="mt-4">
          <Eyebrow>TASKS</Eyebrow>
          {groups.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <div className="mb-1 text-[12.5px] text-text-3">{g.label}</div>
              <ul className="flex flex-col gap-2">
                {g.items.map((t, i) => (
                  <TaskRow key={i} t={t} all={p.tasks} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {p.links.length > 0 && (
        <div className="mt-4">
          <Eyebrow>LINKS</Eyebrow>
          <ul className="flex flex-col gap-2">
            {p.links.map((l, i) => (
              <LinkRow key={i} l={l} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UpdateDiff({ p }: { p: ProjectUpdatePayload }) {
  const f = p.before.fields;
  const c = p.changes;
  const rows: [string, string, string, React.ReactNode?][] = [];
  if (c.name !== undefined && c.name !== f.name) rows.push(["NAME", f.name, c.name]);
  if (c.description !== undefined && c.description !== f.description) rows.push(["DESCRIPTION", f.description || "None", c.description || "None"]);
  if (c.context !== undefined && c.context !== f.context)
    rows.push([
      "CONTEXT",
      `${f.context.length} characters`,
      `${c.context.length} characters`,
      c.context ? (
        <div className="mt-1 text-[12.5px] text-text-2">
          <Disclosure summary={<span>Show new context</span>}>
            <p className="pt-2 text-[14px] leading-[1.65] break-words whitespace-pre-wrap">{c.context}</p>
          </Disclosure>
        </div>
      ) : null,
    ]);
  if (c.category !== undefined && c.category !== f.category) rows.push(["CATEGORY", CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category, CATEGORY_LABEL[c.category]]);
  if (c.priority !== undefined && c.priority !== f.priority) rows.push(["PRIORITY", PRI(f.priority), PRI(c.priority)]);
  if (c.targetDate !== undefined && c.targetDate !== f.targetDate) rows.push(["TARGET DATE", day(f.targetDate, true) || "No target date", day(c.targetDate, true) || "No target date"]);

  const ms = p.milestones.flatMap((m) => {
    if (!m.id) return [{ m, tag: "NEW", detail: "" }];
    const b = p.before.milestones.find((x) => x.id === m.id);
    const d = [b && b.title !== m.title && `${b.title} → ${m.title}`, b && m.dueDate !== undefined && b.dueDate !== m.dueDate && `${day(b.dueDate) || "No due date"} → ${day(m.dueDate) || "No due date"}`].filter(Boolean);
    return d.length ? [{ m, tag: "CHANGED", detail: d.join(" · ") }] : [];
  });
  const ts = p.tasks.flatMap((t) => {
    if (!t.id) return [{ t, tag: "NEW", detail: "" }];
    const b = p.before.tasks.find((x) => x.id === t.id);
    const d = [
      b && b.title !== t.title && `${b.title} → ${t.title}`,
      b && t.dueDate !== undefined && b.dueDate !== t.dueDate && `${day(b.dueDate) || "No due date"} → ${day(t.dueDate) || "No due date"}`,
      b && t.priority !== undefined && b.priority !== t.priority && `${PRI(b.priority)} → ${PRI(t.priority)}`,
      b && t.milestoneRef !== undefined && b.milestoneId !== t.milestoneRef && "milestone changes",
    ].filter(Boolean);
    return d.length ? [{ t, tag: "CHANGED", detail: d.join(" · ") }] : [];
  });
  if (!rows.length && !ms.length && !ts.length && !p.links.length) return <div className={`${panel} text-[13.5px] text-text-2`}>No fields change.</div>;
  return (
    <div className={`${panel} flex flex-col gap-3.5`}>
      {rows.map(([k, from, to, extra]) => (
        <div key={k}>
          <Eyebrow className="!mb-1">{k}</Eyebrow>
          <div className="text-[13px] break-words whitespace-pre-wrap text-text-3 line-through">{from}</div>
          <div className="text-[14px] break-words whitespace-pre-wrap">{to}</div>
          {extra}
        </div>
      ))}
      {ms.length > 0 && (
        <div>
          <Eyebrow>MILESTONES</Eyebrow>
          <ul className="flex flex-col gap-2">
            {ms.map(({ m, tag, detail }, i) => (
              <li key={i} className="flex min-h-8 flex-wrap items-center gap-2.5 text-[13.5px]">
                <Icon name="flag" size={16} className="shrink-0 text-text-3" />
                <span className="min-w-0 break-words">{m.title}</span>
                <Badge kind="tag" tone="neutral">
                  {tag}
                </Badge>
                {detail && <span className="text-[12.5px] text-text-3">{detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ts.length > 0 && (
        <div>
          <Eyebrow>TASKS</Eyebrow>
          <ul className="flex flex-col gap-2">
            {ts.map(({ t, tag, detail }, i) => (
              <TaskRow key={i} t={t} all={p.tasks} tag={tag} detail={detail} />
            ))}
          </ul>
        </div>
      )}
      {p.links.length > 0 && (
        <div>
          <Eyebrow>LINKS</Eyebrow>
          <ul className="flex flex-col gap-2">
            {p.links.map((l, i) => (
              <LinkRow key={i} l={l} tag="NEW" />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- edit form ----
const rowCls = "grid items-end gap-2 border-t border-white/[.06] py-2 first:border-t-0 max-[719px]:grid-cols-1";
const seg = (active: boolean) => `h-[26px] rounded-full px-3.5 text-[12.5px] ${active ? "bg-white/[.12] text-text" : "text-text-2"} max-tab:min-h-11`;
const Cap = ({ show, children }: { show: boolean; children: string }) => (show ? <span aria-hidden className="text-[12.5px] text-text-2">{children}</span> : null);

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-8 place-items-center justify-self-end rounded-full text-text-3 hover:bg-fill-2 hover:text-red [@media(pointer:coarse)]:size-11">
      <Icon name="close" size={16} />
    </button>
  );
}

function Removed({ rid, title, note, onRestore }: { rid: string; title: string; note?: string; onRestore: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-white/[.06] py-2 text-[12.5px] text-text-3 first:border-t-0">
      <span className="min-w-0 flex-1 break-words">
        &quot;{title}&quot; removed{note ? `. ${note}` : ""}
      </span>
      <Button size="xs" variant="ghost" aria-label={`Restore ${title}`} data-fk={`${rid}:restore`} onClick={onRestore}>
        Restore
      </Button>
    </div>
  );
}

function EditFields({ p, draft, errors, onDraft }: { p: ProjectPayload; draft: ProjectDraft; errors: ProjectErrors; onDraft: (d: ProjectDraft) => void }) {
  const upd = isUpdate(p);
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);
  const [say, setSay] = useState("");
  useEffect(() => {
    if (pending.current) {
      box.current?.querySelector<HTMLElement>(`[data-fk="${pending.current}"]`)?.focus();
      pending.current = null;
    }
  }, [draft]);
  useEffect(() => {
    if (Object.keys(errors).length) box.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const set = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => onDraft({ ...draft, [k]: v });
  const patch = <K extends "milestones" | "tasks" | "links">(k: K, rid: string, v: Partial<ProjectDraft[K][number]>) => onDraft({ ...draft, [k]: (draft[k] as Row[]).map((r) => (r.rid === rid ? { ...r, ...v } : r)) });
  const invalid = (k: string) => (errors[k] ? true : undefined);
  const live = draft.milestones.filter((m) => !m.removed);
  const removeM = (m: MRow) => {
    const k = [m.ref, m.id];
    const affected = draft.tasks.filter((t) => !t.removed && k.includes(t.milestone) && t.milestone);
    pending.current = `${m.rid}:restore`;
    setSay(`Removed "${m.title}"`);
    onDraft({
      ...draft,
      milestones: draft.milestones.map((x) => (x.rid === m.rid ? { ...x, removed: true } : x)),
      tasks: draft.tasks.map((t) => (t.milestone && k.includes(t.milestone) ? { ...t, milestone: "" } : t)),
    });
    mNote.current[m.rid] = affected.length;
  };
  const mNote = useRef<Record<string, number>>({});
  const toggle = (g: "milestones" | "tasks" | "links", rid: string, title: string, removed: boolean) => {
    pending.current = `${rid}:${removed ? "restore" : "title"}`;
    setSay(`${removed ? "Removed" : "Restored"} "${title}"`);
    patch(g, rid, { removed } as never);
  };

  return (
    <div ref={box} className="flex flex-col gap-4">
      <div role="status" className="sr-only">
        {say}
      </div>
      <Field label="Name" error={errors.name}>
        <Input value={draft.name} maxLength={80} required onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Description" error={errors.description}>
        <Textarea rows={3} maxLength={500} className="rounded-14" value={draft.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="Context" error={errors.context} helper={`${draft.context.length} / 4000 characters`}>
        <Textarea rows={8} maxLength={4000} className="rounded-14" value={draft.context} onChange={(e) => set("context", e.target.value)} />
      </Field>
      <Field label="Category">
        <Select value={draft.category} onChange={(e) => set("category", e.target.value)}>
          {PROJECT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] text-text-2">Priority</span>
        <div role="group" aria-label="Priority" className="flex w-fit rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
          {([1, 2, 3] as const).map((n) => (
            <button key={n} type="button" aria-pressed={draft.priority === n} className={seg(draft.priority === n)} onClick={() => set("priority", n)}>
              P{n}
            </button>
          ))}
        </div>
      </div>
      <Field label="Target date" error={errors.targetDate}>
        <Input type="date" value={draft.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
      </Field>

      {draft.milestones.length > 0 && (
        <fieldset>
          <legend className="mt-2 mb-2 text-[10px] tracking-[0.14em] text-text-3">Milestones</legend>
          {errors.milestones && <p className="mb-1 text-[12.5px] text-red">{errors.milestones}</p>}
          {draft.milestones.map((m, i) => {
            const n = i + 1;
            const first = draft.milestones.findIndex((x) => !x.removed) === i;
            if (m.removed) return <Removed key={m.rid} rid={m.rid} title={m.title} note={mNote.current[m.rid] ? `Its ${mNote.current[m.rid]} tasks stay, without a milestone.` : undefined} onRestore={() => toggle("milestones", m.rid, m.title, false)} />;
            return (
              <div key={m.rid}>
                <div className={`${rowCls} grid-cols-[minmax(0,1fr)_160px_auto]`}>
                  <label className="flex flex-col gap-1.5">
                    <Cap show={first}>Title</Cap>
                    <Input aria-label={`Milestone ${n} title`} data-fk={`${m.rid}:title`} aria-invalid={invalid(`${m.rid}.title`)} value={m.title} maxLength={120} onChange={(e) => patch("milestones", m.rid, { title: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <Cap show={first}>Due</Cap>
                    <Input type="date" aria-label={`Milestone ${n} due date`} aria-invalid={invalid(`${m.rid}.dueDate`)} value={m.dueDate} onChange={(e) => patch("milestones", m.rid, { dueDate: e.target.value })} />
                  </label>
                  {!upd || !m.id ? <RemoveBtn label={`Remove milestone ${m.title}`} onClick={() => removeM(m)} /> : <span />}
                </div>
                {(errors[`${m.rid}.title`] || errors[`${m.rid}.dueDate`]) && <p className="text-[12.5px] text-red">{errors[`${m.rid}.title`] ?? errors[`${m.rid}.dueDate`]}</p>}
              </div>
            );
          })}
        </fieldset>
      )}

      {draft.tasks.length > 0 && (
        <fieldset>
          <legend className="mt-2 mb-2 text-[10px] tracking-[0.14em] text-text-3">Tasks</legend>
          {errors.tasks && <p className="mb-1 text-[12.5px] text-red">{errors.tasks}</p>}
          {draft.tasks.map((t, i) => {
            const n = i + 1;
            const first = draft.tasks.findIndex((x) => !x.removed) === i;
            if (t.removed) return <Removed key={t.rid} rid={t.rid} title={t.title} onRestore={() => toggle("tasks", t.rid, t.title, false)} />;
            const err = [`${t.rid}.title`, `${t.rid}.dueDate`, `${t.rid}.priority`, `${t.rid}.milestone`].map((k) => errors[k]).find(Boolean);
            return (
              <div key={t.rid}>
                <div className={`${rowCls} grid-cols-[minmax(0,1fr)_150px_96px_180px_auto]`}>
                  <label className="flex flex-col gap-1.5">
                    <Cap show={first}>Title</Cap>
                    <Input aria-label={`Task ${n} title`} data-fk={`${t.rid}:title`} aria-invalid={invalid(`${t.rid}.title`)} value={t.title} maxLength={200} onChange={(e) => patch("tasks", t.rid, { title: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <Cap show={first}>Due</Cap>
                    <Input type="date" aria-label={`Task ${n} due date`} aria-invalid={invalid(`${t.rid}.dueDate`)} value={t.dueDate} onChange={(e) => patch("tasks", t.rid, { dueDate: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <Cap show={first}>Priority</Cap>
                    <Select aria-label={`Task ${n} priority`} value={t.priority} onChange={(e) => patch("tasks", t.rid, { priority: e.target.value })}>
                      <option value="">None</option>
                      <option value="1">P1</option>
                      <option value="2">P2</option>
                      <option value="3">P3</option>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <Cap show={first}>Milestone</Cap>
                    <Select aria-label={`Task ${n} milestone`} aria-invalid={invalid(`${t.rid}.milestone`)} value={t.milestone} onChange={(e) => patch("tasks", t.rid, { milestone: e.target.value })}>
                      <option value="">No milestone</option>
                      {/* An existing milestone outside this draft: show what will actually be sent. */}
                      {t.milestone && !live.some((m) => (m.ref ?? m.id) === t.milestone) && (
                        <option value={t.milestone}>{(upd && p.before.milestones.find((m) => m.id === t.milestone)?.title) || "Current milestone"}</option>
                      )}
                      {live.filter((m) => m.ref ?? m.id).map((m) => (
                        <option key={m.rid} value={m.ref ?? m.id}>
                          {m.title}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {!upd || !t.id ? <RemoveBtn label={`Remove task ${t.title}`} onClick={() => { pending.current = `${t.rid}:restore`; setSay(`Removed "${t.title}"`); patch("tasks", t.rid, { removed: true }); }} /> : <span />}
                </div>
                {err && <p className="text-[12.5px] text-red">{err}</p>}
              </div>
            );
          })}
        </fieldset>
      )}

      {draft.links.length > 0 && (
        <fieldset>
          <legend className="mt-2 mb-2 text-[10px] tracking-[0.14em] text-text-3">Links</legend>
          {errors.links && <p className="mb-1 text-[12.5px] text-red">{errors.links}</p>}
          {draft.links.map((l) => {
            const label = l.link.kind === "repo" ? l.link.repo : l.link.label;
            if (l.removed) return <Removed key={l.rid} rid={l.rid} title={label} onRestore={() => toggle("links", l.rid, label, false)} />;
            return (
              <div key={l.rid}>
                <div className={`${rowCls} grid-cols-[minmax(0,1fr)_auto] items-center`}>
                  <ul>
                    <LinkRow l={l.link} />
                  </ul>
                  <RemoveBtn label={`Remove link ${label}`} onClick={() => { pending.current = `${l.rid}:restore`; setSay(`Removed "${label}"`); patch("links", l.rid, { removed: true }); }} />
                </div>
                {errors[`${l.rid}.link`] && <p className="text-[12.5px] text-red">{errors[`${l.rid}.link`]}</p>}
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

function liveCounts(p: ProjectPayload, d: ProjectDraft) {
  const gone = new Set(d.tasks.filter((t) => t.removed).flatMap((t) => [t.ref, t.id].filter((x): x is string => !!x)));
  const kt = d.tasks.filter((t) => !t.removed);
  return {
    milestones: d.milestones.filter((m) => !m.removed).length,
    tasks: kt.length,
    links: d.links.filter((l) => !l.removed).length,
    deps: kt.reduce((n, t) => n + t.blockedBy.filter((b) => !gone.has(b)).length, 0),
    fields: isUpdate(p) ? Object.keys(changedFields(p.before.fields, d)).length : 0,
  };
}

type BodyProps = { approval: ApprovalDTO; editing: boolean; draft: ProjectDraft; errors: ProjectErrors; onDraft: (d: ProjectDraft) => void; edited?: boolean };

/** Everything between the header and the decision footer for project_create / project_update. */
export function ProjectApprovalBody({ approval: a, editing, draft, errors, onDraft, edited }: BodyProps) {
  const p = projectOf(a);
  const orig = a.original as ProjectPayload;
  const upd = isUpdate(p);
  const form = editing && a.status === "pending";
  const c = form ? liveCounts(p, draft) : draftCounts(p);
  const name = form ? draft.name : upd ? (p.changes.name ?? p.before.name) : p.name;
  const ctxLen = form ? draft.context.length : upd ? (p.changes.context ?? p.before.fields.context).length : p.context.length;
  const happen = upd
    ? (() => {
        const parts = [c.fields && `${c.fields} field changes`, c.tasks && `${c.tasks} tasks`, c.milestones && `${c.milestones} milestones`, c.links && `${c.links} links`].filter(Boolean) as string[];
        return `Changes project "${name}"${parts.length ? `: ${parts.join(", ")}` : ""}.`;
      })()
    : (() => {
        const parts = [c.milestones && `${c.milestones} milestones`, c.tasks && `${c.tasks} tasks`, c.links && `${c.links} links`].filter(Boolean) as string[];
        return `Creates project "${name}"${parts.length ? ` with ${list(parts)}` : ""} in LifeOS.${c.deps ? ` Adds ${c.deps} task dependencies.` : ""}`;
      })();
  const saved = [`Project details and context notes (${ctxLen} characters)`, ...(c.milestones + c.tasks + c.links ? [[c.milestones && `${c.milestones} milestones`, c.tasks && `${c.tasks} tasks`, c.links && `${c.links} links`].filter(Boolean).join(", ")] : [])];
  return (
    <>
      {p.sources.length > 0 && <Untrusted sources={p.sources} />}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-[18px] border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <Fact k="WHAT WILL HAPPEN">{happen}</Fact>
        <Fact k="WHERE">LifeOS only</Fact>
        <Fact k="WHEN">Immediately after approval</Fact>
      </section>
      <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <div className="mb-3 text-[10px] tracking-[0.14em] text-text-3">WHAT GETS SAVED</div>
        <ul className="flex flex-col gap-1.5 text-[13px]">
          {saved.map((t) => (
            <li key={t} className="flex items-center gap-2 break-words">
              <Icon name="check_circle" size={16} className="shrink-0 text-green" />
              {t}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-cyan" />
            Nothing is written to GitHub
          </li>
          <li className="flex items-center gap-2">
            <Icon name="shield" size={16} className="shrink-0 text-cyan" />
            All of it is created together, or not at all
          </li>
        </ul>
      </section>
      <section className="border-b border-[rgba(255,255,255,.06)] px-5 py-5">
        <div className="mb-3 flex items-center gap-2 text-[10px] tracking-[0.14em] text-text-3">
          {upd ? "CHANGES" : "PREVIEW"}
          {edited && (
            <Badge kind="tag" tone="amber">
              EDITED
            </Badge>
          )}
          <span className="flex-1" />
          <span>
            {c.tasks} tasks · {c.milestones} milestones
          </span>
        </div>
        {form ? <EditFields p={p} draft={draft} errors={errors} onDraft={onDraft} /> : upd ? <UpdateDiff p={p} /> : <CreatePreview p={p as ProjectCreatePayload} />}
        {edited && (
          <div className="mt-3 text-[12.5px] text-text-2">
            <Disclosure summary={<span>View agent&apos;s original</span>}>
              <div className="pt-2">{isUpdate(orig) ? <UpdateDiff p={orig} /> : <CreatePreview p={orig} />}</div>
            </Disclosure>
          </div>
        )}
      </section>
    </>
  );
}
