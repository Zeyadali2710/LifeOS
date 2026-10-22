"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { draftCounts, type DraftLink, type ProjectCreatePayload, type ProjectUpdatePayload } from "@/lib/project-payload";
import { CATEGORY_LABEL, PROJECT_CATEGORIES } from "@/lib/project-types";
import { approveAction, rejectAction, retryApprovalAction, saveEditAction } from "@/server/approval-actions";
import { formatHM } from "@/server/time";
import { Button, IconButton } from "@/ui/button";
import { Segmented, SelectField, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import { useDecide } from "./decide";
import { projectOf, projectResolved, sameProject, toProjectDraft, validateProjectDraft, type MRow, type ProjectDraft, type ProjectErrors, type ProjectPayload } from "./model/project";
import { since, stamp, TIER_OF } from "./summary";
import { getAgent } from "@/server/agents/registry";
import s from "./approvals.module.css";

const isUpdate = (p: ProjectPayload): p is ProjectUpdatePayload => "projectId" in p;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (ymd?: string | null, year = false) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  return m ? `${+m[3]!} ${MONTHS[+m[2]! - 1]}${year ? ` ${m[1]}` : ""}` : "";
};
const PRI = (n?: number | null) => (n ? `P${n}` : "None");
const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};

type Task = { id?: string; ref?: string; title: string; dueDate?: string | null; priority?: number | null; milestoneRef?: string | null; blockedBy?: string[] };

function LinkRow({ l, tag }: { l: DraftLink; tag?: string }) {
  return (
    <li>
      <Icon name="link" size={16} />
      {l.kind === "repo" ? (
        <>
          <span className={s.mono}>{l.repo}</span>
          <span className={s.rowMeta}>Repository</span>
        </>
      ) : (
        <>
          <span>{l.label}</span>
          <span className={s.rowMeta}>{host(l.url)}</span>
        </>
      )}
      {tag && <span className={s.rowMeta}>{tag}</span>}
    </li>
  );
}

function TaskRow({ t, all, tag, detail }: { t: Task; all: Task[]; tag?: string; detail?: string }) {
  const blockers = (t.blockedBy ?? []).map((b) => all.find((x) => x.ref === b || x.id === b)?.title).filter(Boolean);
  return (
    <li>
      <Icon name="task_alt" size={16} />
      <span>{t.title}</span>
      {t.priority ? <span className={s.mono}>P{t.priority}</span> : null}
      {t.dueDate && <span className={s.rowMeta}>Due {day(t.dueDate)}</span>}
      {blockers.map((b) => (
        <span key={b} className={s.rowMeta}>
          Blocked by “{b}”
        </span>
      ))}
      {tag && <span className={s.rowMeta}>{tag}</span>}
      {detail && <span className={s.rowMeta}>{detail}</span>}
    </li>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className={s.eyebrow}>{label}</span>
      <ul className={s.rows}>{children}</ul>
    </div>
  );
}

function CreatePreview({ p }: { p: ProjectCreatePayload }) {
  const mKey = (t: Task) => p.milestones.findIndex((m) => m.ref !== undefined && m.ref === t.milestoneRef);
  const groups = [...p.milestones.map((m, i) => ({ label: m.title, items: p.tasks.filter((t) => mKey(t) === i) })), { label: "No milestone", items: p.tasks.filter((t) => mKey(t) < 0) }].filter((g) => g.items.length);
  return (
    <div className={s.preview}>
      <span className={s.previewTitle}>{p.name}</span>
      <span className={s.rowMeta}>
        {CATEGORY_LABEL[p.category]} · P{p.priority} · {p.targetDate ? `Target ${day(p.targetDate, true)}` : "No target date"}
      </span>
      {p.description && <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>}
      {p.context && (
        <details className={s.details}>
          <summary>Context ({p.context.length} characters)</summary>
          <p style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{p.context}</p>
        </details>
      )}
      {p.milestones.length > 0 && (
        <Group label="Milestones">
          {p.milestones.map((m, i) => (
            <li key={i}>
              <Icon name="flag" size={16} />
              <span>{m.title}</span>
              <span className={s.rowMeta}>{m.dueDate ? `Due ${day(m.dueDate)}` : "No due date"}</span>
              <span className={s.rowMeta}>{p.tasks.filter((t) => mKey(t) === i).length} tasks</span>
            </li>
          ))}
        </Group>
      )}
      {groups.map((g) => (
        <Group key={g.label} label={`Tasks · ${g.label}`}>
          {g.items.map((t, i) => (
            <TaskRow key={i} t={t} all={p.tasks} />
          ))}
        </Group>
      ))}
      {p.links.length > 0 && (
        <Group label="Links">
          {p.links.map((l, i) => (
            <LinkRow key={i} l={l} />
          ))}
        </Group>
      )}
    </div>
  );
}

function UpdateDiff({ p }: { p: ProjectUpdatePayload }) {
  const f = p.before.fields;
  const c = p.changes;
  const rows: [string, string, string][] = [];
  if (c.name !== undefined && c.name !== f.name) rows.push(["Name", f.name, c.name]);
  if (c.description !== undefined && c.description !== f.description) rows.push(["Description", f.description || "None", c.description || "None"]);
  if (c.context !== undefined && c.context !== f.context) rows.push(["Context", `${f.context.length} characters`, c.context || "None"]);
  if (c.category !== undefined && c.category !== f.category) rows.push(["Category", CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category, CATEGORY_LABEL[c.category]]);
  if (c.priority !== undefined && c.priority !== f.priority) rows.push(["Priority", PRI(f.priority), PRI(c.priority)]);
  if (c.targetDate !== undefined && c.targetDate !== f.targetDate) rows.push(["Target date", day(f.targetDate, true) || "No target date", day(c.targetDate, true) || "No target date"]);
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
  if (!rows.length && !ms.length && !ts.length && !p.links.length) return <div className={s.preview}>No fields change.</div>;
  return (
    <div className={s.preview}>
      {rows.map(([k, from, to]) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className={s.eyebrow}>{k}</span>
          <span className={s.strike}>{from}</span>
          <span style={{ whiteSpace: "pre-wrap" }}>{to}</span>
        </div>
      ))}
      {ms.length > 0 && (
        <Group label="Milestones">
          {ms.map(({ m, tag, detail }, i) => (
            <li key={i}>
              <Icon name="flag" size={16} />
              <span>{m.title}</span>
              <span className={s.rowMeta}>{tag}</span>
              {detail && <span className={s.rowMeta}>{detail}</span>}
            </li>
          ))}
        </Group>
      )}
      {ts.length > 0 && (
        <Group label="Tasks">
          {ts.map(({ t, tag, detail }, i) => (
            <TaskRow key={i} t={t} all={p.tasks} tag={tag} detail={detail} />
          ))}
        </Group>
      )}
      {p.links.length > 0 && (
        <Group label="Links">
          {p.links.map((l, i) => (
            <LinkRow key={i} l={l} tag="NEW" />
          ))}
        </Group>
      )}
    </div>
  );
}

function Removed({ title, note, onRestore }: { title: string; note?: string; onRestore: () => void }) {
  return (
    <div className={s.removed}>
      <span style={{ flex: 1, minWidth: 0 }}>
        “{title}” removed{note ? `. ${note}` : ""}
      </span>
      <Button variant="ghost" size="sm" aria-label={`Restore ${title}`} onClick={onRestore}>
        Restore
      </Button>
    </div>
  );
}

function EditFields({ p, draft, errors, onDraft }: { p: ProjectPayload; draft: ProjectDraft; errors: ProjectErrors; onDraft: (d: ProjectDraft) => void }) {
  const upd = isUpdate(p);
  const box = useRef<HTMLDivElement>(null);
  const [say, setSay] = useState("");
  const [mNote, setMNote] = useState<Record<string, number>>({});
  useEffect(() => {
    if (Object.keys(errors).length) box.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  const set = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => onDraft({ ...draft, [k]: v });
  type Rows = "milestones" | "tasks" | "links";
  const patch = <K extends Rows>(k: K, rid: string, v: Partial<ProjectDraft[K][number]>) =>
    onDraft({ ...draft, [k]: (draft[k] as { rid: string }[]).map((r) => (r.rid === rid ? { ...r, ...v } : r)) });
  const toggle = (g: Rows, rid: string, title: string, removed: boolean) => {
    setSay(`${removed ? "Removed" : "Restored"} “${title}”`);
    patch(g, rid, { removed } as never);
  };
  const removeM = (m: MRow) => {
    const k = [m.ref, m.id];
    setMNote((n) => ({ ...n, [m.rid]: draft.tasks.filter((t) => !t.removed && t.milestone && k.includes(t.milestone)).length }));
    setSay(`Removed “${m.title}”`);
    onDraft({
      ...draft,
      milestones: draft.milestones.map((x) => (x.rid === m.rid ? { ...x, removed: true } : x)),
      tasks: draft.tasks.map((t) => (t.milestone && k.includes(t.milestone) ? { ...t, milestone: "" } : t)),
    });
  };
  const live = draft.milestones.filter((m) => !m.removed);
  const err = (k: string) => errors[k];

  return (
    <div ref={box} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="status" className="sr-only">
        {say}
      </div>
      <TextField label="Name" value={draft.name} maxLength={80} required error={err("name")} onChange={(e) => set("name", e.target.value)} data-edit />
      <TextArea label="Description" rows={3} maxLength={500} value={draft.description} error={err("description")} onChange={(e) => set("description", e.target.value)} />
      <TextArea label="Context" rows={8} maxLength={4000} value={draft.context} error={err("context")} help={`${draft.context.length} / 4000 characters`} onChange={(e) => set("context", e.target.value)} />
      <div className={s.fieldsRow}>
        <SelectField label="Category" value={draft.category} onChange={(e) => set("category", e.target.value)}>
          {PROJECT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Target date" type="date" value={draft.targetDate} error={err("targetDate")} onChange={(e) => set("targetDate", e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>Priority</span>
        <Segmented
          label="Priority"
          value={String(draft.priority) as "1" | "2" | "3"}
          onChange={(v) => set("priority", Number(v) as 1 | 2 | 3)}
          options={[
            { value: "1", label: "P1" },
            { value: "2", label: "P2" },
            { value: "3", label: "P3" },
          ]}
        />
      </div>

      {draft.milestones.length > 0 && (
        <fieldset className={s.fieldset}>
          <legend className={s.eyebrow} style={{ marginBottom: 6 }}>
            Milestones
          </legend>
          {errors.milestones && <p className={s.err}>{errors.milestones}</p>}
          {draft.milestones.map((m, i) =>
            m.removed ? (
              <Removed key={m.rid} title={m.title} note={mNote[m.rid] ? `Its ${mNote[m.rid]} tasks stay, without a milestone.` : undefined} onRestore={() => toggle("milestones", m.rid, m.title, false)} />
            ) : (
              <div key={m.rid} className={s.editGrid} style={{ gridTemplateColumns: "minmax(0,1fr) 160px 44px" }}>
                <TextField label={`Milestone ${i + 1} title`} hideLabel value={m.title} maxLength={120} error={err(`${m.rid}.title`)} onChange={(e) => patch("milestones", m.rid, { title: e.target.value })} />
                <TextField label={`Milestone ${i + 1} due date`} hideLabel type="date" value={m.dueDate} error={err(`${m.rid}.dueDate`)} onChange={(e) => patch("milestones", m.rid, { dueDate: e.target.value })} />
                {!upd || !m.id ? <IconButton icon="close" label={`Remove milestone ${m.title}`} small onClick={() => removeM(m)} /> : <span />}
              </div>
            ),
          )}
        </fieldset>
      )}

      {draft.tasks.length > 0 && (
        <fieldset className={s.fieldset}>
          <legend className={s.eyebrow} style={{ marginBottom: 6 }}>
            Tasks
          </legend>
          {errors.tasks && <p className={s.err}>{errors.tasks}</p>}
          {draft.tasks.map((t, i) => {
            if (t.removed) return <Removed key={t.rid} title={t.title} onRestore={() => toggle("tasks", t.rid, t.title, false)} />;
            const e = [`${t.rid}.title`, `${t.rid}.dueDate`, `${t.rid}.priority`, `${t.rid}.milestone`].map((k) => errors[k]).find(Boolean);
            return (
              <div key={t.rid}>
                <div className={s.editGrid} style={{ gridTemplateColumns: "minmax(0,1fr) 150px 96px 180px 44px" }}>
                  <TextField label={`Task ${i + 1} title`} hideLabel value={t.title} maxLength={200} onChange={(ev) => patch("tasks", t.rid, { title: ev.target.value })} aria-invalid={errors[`${t.rid}.title`] ? true : undefined} />
                  <TextField label={`Task ${i + 1} due date`} hideLabel type="date" value={t.dueDate} onChange={(ev) => patch("tasks", t.rid, { dueDate: ev.target.value })} />
                  <SelectField label={`Task ${i + 1} priority`} value={t.priority} onChange={(ev) => patch("tasks", t.rid, { priority: ev.target.value })} hideLabel>
                    <option value="">None</option>
                    <option value="1">P1</option>
                    <option value="2">P2</option>
                    <option value="3">P3</option>
                  </SelectField>
                  <SelectField label={`Task ${i + 1} milestone`} value={t.milestone} onChange={(ev) => patch("tasks", t.rid, { milestone: ev.target.value })} hideLabel>
                    <option value="">No milestone</option>
                    {t.milestone && !live.some((m) => (m.ref ?? m.id) === t.milestone) && (
                      <option value={t.milestone}>{(upd && p.before.milestones.find((m) => m.id === t.milestone)?.title) || "Current milestone"}</option>
                    )}
                    {live
                      .filter((m) => m.ref ?? m.id)
                      .map((m) => (
                        <option key={m.rid} value={m.ref ?? m.id}>
                          {m.title}
                        </option>
                      ))}
                  </SelectField>
                  {!upd || !t.id ? <IconButton icon="close" label={`Remove task ${t.title}`} small onClick={() => toggle("tasks", t.rid, t.title, true)} /> : <span />}
                </div>
                {e && <p className={s.err}>{e}</p>}
              </div>
            );
          })}
        </fieldset>
      )}

      {draft.links.length > 0 && (
        <fieldset className={s.fieldset}>
          <legend className={s.eyebrow} style={{ marginBottom: 6 }}>
            Links
          </legend>
          {errors.links && <p className={s.err}>{errors.links}</p>}
          {draft.links.map((l) => {
            const label = l.link.kind === "repo" ? l.link.repo : l.link.label;
            if (l.removed) return <Removed key={l.rid} title={label} onRestore={() => toggle("links", l.rid, label, false)} />;
            return (
              <div key={l.rid} className={s.editGrid} style={{ gridTemplateColumns: "minmax(0,1fr) 44px" }}>
                <ul className={s.rows}>
                  <LinkRow l={l.link} />
                </ul>
                <IconButton icon="close" label={`Remove link ${label}`} small onClick={() => toggle("links", l.rid, label, true)} />
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

/** Project create / update approvals: preview or diff, an edit form, then decide. */
export function ProjectBody({ approval: a, onChange }: { approval: ApprovalDTO; onChange: (a: ApprovalDTO) => void }) {
  const saved = projectOf(a);
  const [draft, setDraft] = useState<ProjectDraft>(() => toProjectDraft(saved));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<ProjectErrors>({});
  const { busy, guard } = useDecide(onChange, (e) => {
    setErrors(e);
    setEditing(true);
  });
  const upd = isUpdate(saved);
  const pending = a.status === "pending";
  const edited = a.edited != null && !sameProject(saved, a.original as ProjectPayload);
  const c = draftCounts(saved);
  const name = upd ? (saved.changes.name ?? saved.before.name) : saved.name;
  const check = () => {
    const v = validateProjectDraft(a.tool, saved, draft);
    if ("errors" in v) {
      setErrors(v.errors);
      setEditing(true);
      return null;
    }
    setErrors({});
    return v.payload;
  };
  const approve = () => {
    const payload = editing ? check() : saved;
    if (!payload) return;
    void guard("approve", () => approveAction(a.id, editing && !sameProject(payload, saved) ? payload : undefined), upd ? "Project updated" : "Project created");
  };
  const done = async () => {
    const payload = check();
    if (!payload) return;
    if (!sameProject(payload, saved) && !(await guard("save", () => saveEditAction(a.id, payload)))) return;
    setEditing(false);
  };
  const res = projectResolved(a, formatHM(new Date(a.decidedAt ?? a.createdAt)));
  const parts = [c.milestones && `${c.milestones} milestones`, c.tasks && `${c.tasks} tasks`, c.links && `${c.links} links`].filter(Boolean).join(", ");

  return (
    <>
      <div className={s.stateLine} style={{ color: pending ? "var(--status-approval)" : "var(--ink-3)" }}>
        {pending ? "! AWAITING YOUR APPROVAL" : `${a.status.toUpperCase()}${a.decidedAt ? ` · ${stamp(a.decidedAt)}` : ""}`}
      </div>
      <h2 className={s.title}>
        {upd ? "Change" : "Create"} project “{editing && !upd ? draft.name : name}”
      </h2>
      <dl className={s.facts}>
        <dt>Requested by</dt>
        <dd>
          {getAgent(a.agentId)?.name ?? a.agentId} agent · {since(a.createdAt)} ago
        </dd>
        <dt>Tool · tier</dt>
        <dd className={s.mono}>
          {a.tool} · {TIER_OF[a.kind]}
        </dd>
        <dt>Target</dt>
        <dd>LifeOS projects{parts ? ` · ${parts}` : ""} · nothing is written to GitHub</dd>
        <dt>Expires</dt>
        <dd>{pending ? `${stamp(a.expiresAt)} · the run is suspended until you decide` : "—"}</dd>
        {a.reason && (
          <>
            <dt>Why</dt>
            <dd>{a.reason}</dd>
          </>
        )}
      </dl>
      {saved.sources.length > 0 && (
        <div role="note" className={s.untrusted}>
          <span>Drafted from repository files (untrusted). Check the draft before approving; nothing happens until you do.</span>
          <ul>
            {saved.sources.slice(0, 8).map((f) => (
              <li key={f} title={f}>
                {f}
              </li>
            ))}
          </ul>
          {saved.sources.length > 8 && <span className={s.rowMeta}>and {saved.sources.length - 8} more files</span>}
        </div>
      )}
      <div className={s.fieldHead}>
        <span>{upd ? "CHANGES" : "PREVIEW"}</span>
        <span className={s.edited}>{edited ? "EDITED · RE-VALIDATED ON APPROVE" : ""}</span>
      </div>
      {editing && pending ? <EditFields p={saved} draft={draft} errors={errors} onDraft={setDraft} /> : upd ? <UpdateDiff p={saved} /> : <CreatePreview p={saved as ProjectCreatePayload} />}
      {edited && (
        <details className={s.details}>
          <summary>View the agent&apos;s original</summary>
          {isUpdate(a.original as ProjectPayload) ? <UpdateDiff p={a.original as ProjectUpdatePayload} /> : <CreatePreview p={a.original as ProjectCreatePayload} />}
        </details>
      )}
      {pending ? (
        <>
          {a.targetChanged && <Alert tone="warn">This project changed after the request was prepared, so it can&apos;t be applied. Reject it and ask again.</Alert>}
          <div className={s.actions}>
            <Button variant="primary" size="lg" disabled={a.targetChanged === true || busy !== null} onClick={approve} data-approve>
              {busy === "approve" ? "Approving…" : editing ? "Approve with edits" : "Approve"}
            </Button>
            <Button size="lg" disabled={busy !== null} onClick={() => (editing ? void done() : (setDraft(toProjectDraft(saved)), setErrors({}), setEditing(true)))}>
              {editing ? "Done editing" : "Edit"}
            </Button>
            <Button size="lg" disabled={busy !== null} style={{ color: "var(--status-failed)" }} onClick={() => void guard("reject", () => rejectAction(a.id), "Rejected. Nothing was changed.")}>
              Reject
            </Button>
            <Link href={upd ? `/projects/${saved.projectId}` : "/projects"} style={{ fontSize: 14, padding: "9px 8px" }}>
              Open project →
            </Link>
          </div>
          <p className={s.next}>Everything is created together, or not at all. Nothing is written to GitHub.</p>
        </>
      ) : (
        <div role="status" className={s.outcome}>
          <span>{res?.text ?? `${a.status === "rejected" ? "Rejected. Nothing was changed." : a.status === "expired" ? "Expired. Nothing was changed." : "Approved · running…"}`}</span>
          {res?.href && <Link href={res.href}>Open project</Link>}
          {a.status === "failed" && (
            <Button size="sm" disabled={busy !== null} onClick={() => void guard("retry", () => retryApprovalAction(a.id))}>
              Retry
            </Button>
          )}
        </div>
      )}
    </>
  );
}
