// Moved from the pre-Almanac approval UI: logic only, unchanged.
import { payloadSchemaFor } from "@/lib/approval-kinds";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { DraftLink, ProjectCreatePayload, ProjectUpdatePayload } from "@/lib/project-payload";

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
