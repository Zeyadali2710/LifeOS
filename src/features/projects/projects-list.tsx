"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ProjectCardDTO, ProjectCategory, ProjectStatus } from "@/lib/project-types";
import { CATEGORY_LABEL, HEALTH_LABEL, STATUS_LABEL } from "@/lib/project-types";
import type { ProjectsPageData } from "@/server/projects-view";
import { toggleTaskAction } from "@/server/task-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { SearchField, Segmented } from "@/ui/controls";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { Page, PageHeader } from "@/ui/layout";
import { ProjectDialog } from "./dialogs";
import s from "./projects.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
const short = (ymd: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${+m[3]!} ${MONTHS[+m[2]! - 1]}` : "—";
};
const at = (ymd: string) => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);

export type Health = "on_track" | "at_risk" | "behind" | "paused" | "done";
export const HEALTH: Record<Health, { color: string; mark: string; light: string; label: string }> = {
  on_track: { color: "var(--status-working)", mark: "●", light: "var(--status-working-bg)", label: "On track" },
  at_risk: { color: "var(--status-approval)", mark: "▲", light: "var(--status-approval-bg)", label: "At risk" },
  behind: { color: "var(--status-failed)", mark: "▲", light: "var(--status-failed-bg)", label: "Behind" },
  paused: { color: "var(--ink-3)", mark: "II", light: "repeating-linear-gradient(135deg, var(--wash) 0 5px, var(--rule-soft) 5px 10px)", label: "Paused" },
  done: { color: "var(--ink)", mark: "✓", light: "var(--wash)", label: "Done" },
};
export function healthOf(c: Pick<ProjectCardDTO, "health" | "project">): Health {
  if (c.project.status === "paused") return "paused";
  if (c.project.status === "done" || c.project.status === "archived") return "done";
  return c.health ?? "on_track";
}
export const healthLabel = (c: Pick<ProjectCardDTO, "health" | "project">) => (c.health && c.project.status === "active" ? HEALTH_LABEL[c.health] : HEALTH[healthOf(c)].label);

const TINT: Record<ProjectCategory, [string, string]> = {
  technical: ["var(--accent-wash)", "var(--accent)"],
  career: ["var(--status-working-bg)", "var(--status-working)"],
  personal: ["var(--status-approval-bg)", "var(--status-approval)"],
  startup: ["var(--status-merged-bg)", "var(--status-merged)"],
  social: ["var(--status-failed-bg)", "var(--status-failed)"],
  learning: ["var(--wash)", "var(--ink)"],
};
const PILL: Record<ProjectStatus, [string, string]> = {
  active: ["var(--status-working-bg)", "var(--status-working)"],
  paused: ["var(--status-approval-bg)", "var(--status-approval)"],
  done: ["var(--wash)", "var(--ink)"],
  archived: ["var(--wash)", "var(--ink-2)"],
};
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

function Kpi({ icon, label, value, sub, tone }: { icon: IconName; label: string; value: string; sub: string; tone: [string, string] }) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiHead}>
        <span className={s.chip} style={{ background: tone[0], color: tone[1] }}>
          <Icon name={icon} size={18} />
        </span>
        <span className={s.kpiLabel}>{label}</span>
      </div>
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiSub}>{sub}</div>
    </div>
  );
}

function Timeline({ live, data, today }: { live: ProjectCardDTO[]; data: ProjectsPageData; today: string }) {
  const router = useRouter();
  const t0 = Math.min(at(today) - 30 * DAY, ...live.map((c) => at(c.project.createdAt)));
  const ends = live.flatMap((c) => [c.project.targetDate, ...data.milestones.filter((m) => m.projectId === c.project.id).map((m) => m.dueDate)]).filter((d): d is string => !!d);
  const t1 = Math.max(at(today) + 45 * DAY, ...ends.map(at).filter((x) => x - at(today) < 150 * DAY));
  const span = t1 - t0;
  const pos = (t: number) => Math.max(0, Math.min(100, ((t - t0) / span) * 100));
  const months: { label: string; left: number }[] = [];
  const d = new Date(t0);
  for (let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); m.getTime() < t1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push({ label: MONTHS[m.getUTCMonth()]!, left: pos(m.getTime()) });
  const labelW = "clamp(118px, 22%, 190px)";
  return (
    <div className={s.tl}>
      <div aria-hidden="true" className={s.tlGrid} style={{ left: labelW }}>
        {months.map((m) => (
          <div key={m.label + m.left} className={s.month} style={{ left: `${m.left}%` }}>
            <span className={s.monthLabel}>{m.label}</span>
          </div>
        ))}
        <div className={s.today} style={{ left: `${pos(at(today))}%` }}>
          <span className={s.todayLabel}>Today {short(today)}</span>
        </div>
      </div>
      <div className={s.tlRows}>
        {live.map((c) => {
          const h = HEALTH[healthOf(c)];
          const ms = data.milestones.filter((m) => m.projectId === c.project.id && m.dueDate);
          const start = at(c.project.createdAt);
          const endRaw = Math.max(c.project.targetDate ? at(c.project.targetDate) : 0, ...ms.map((m) => at(m.dueDate!)));
          const end = endRaw || t1;
          const over = end > t1;
          const left = pos(start);
          const width = Math.max(2, pos(Math.min(end, t1)) - left);
          const pct = c.project.status === "paused" ? 0 : (c.progress.pct ?? 0);
          const open = () => router.push(`/projects/${c.project.id}`);
          return (
            <div key={c.project.id} className={s.tlRow} style={{ gridTemplateColumns: `${labelW} minmax(0,1fr)` }}>
              <button type="button" className={s.tlName} onClick={open}>
                <span className={s.tlNameText}>{c.project.name}</span>
                <span className={s.tlSub} style={{ color: h.color }}>
                  {h.mark} {healthLabel(c)} · {c.progress.pct ?? 0}%
                </span>
              </button>
              <div className={s.track}>
                <button
                  type="button"
                  className={s.bar}
                  title={`${c.project.name} · ${c.progress.pct ?? 0}% · target ${short(c.project.targetDate)}`}
                  aria-label={`${c.project.name}, ${c.progress.pct ?? 0}% done, target ${short(c.project.targetDate)}`}
                  style={{ left: `${left}%`, width: `${width}%`, borderColor: h.color, background: h.light }}
                  onClick={open}
                >
                  <span className={s.barFill} style={{ width: `${pct}%`, background: h.color }} />
                  {ms.map((m) => {
                    const ml = ((Math.min(at(m.dueDate!), t1) - start) / (Math.min(end, t1) - start || 1)) * 100;
                    const current = !m.done && m === ms.find((x) => !x.done);
                    return (
                      <span
                        key={m.title}
                        title={`${m.title} · ${short(m.dueDate)}`}
                        className={s.ms}
                        style={{ left: `${Math.max(0, Math.min(100, ml))}%`, background: m.done ? "var(--ink)" : "var(--paper-3)", borderColor: current ? "var(--accent)" : "var(--ink)" }}
                      />
                    );
                  })}
                </button>
                {over && <span className={s.over}>→ {short(c.project.targetDate)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Gauge({ live }: { live: ProjectCardDTO[] }) {
  const done = live.reduce((a, c) => a + c.progress.done, 0);
  const total = live.reduce((a, c) => a + c.progress.total, 0);
  const paused = live.filter((c) => c.project.status === "paused").reduce((a, c) => a + c.progress.total - c.progress.done, 0);
  const open = total - done - paused;
  const L = 251.33;
  const seg = (n: number) => (total ? (n / total) * L : 0).toFixed(2);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const path = "M20,100 A80,80 0 0 1 180,100";
  return (
    <>
      <div className={s.gauge} role="img" aria-label={`${pct}% of tasks done: ${done} done, ${open} open, ${paused} paused`}>
        <svg viewBox="0 0 200 112" width="100%" aria-hidden="true">
          <path d={path} fill="none" stroke="var(--wash)" strokeWidth="22" />
          <path d={path} fill="none" stroke="var(--border)" strokeWidth="22" strokeDasharray={`${seg(paused)} ${L}`} strokeDashoffset={`-${seg(done + open)}`} />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="22" strokeDasharray={`${seg(open)} ${L}`} strokeDashoffset={`-${seg(done)}`} />
          <path d={path} fill="none" stroke="var(--ink)" strokeWidth="22" strokeDasharray={`${seg(done)} ${L}`} />
        </svg>
        <div className={s.gaugeText}>
          <div className={s.gaugePct}>{pct}%</div>
          <div className={s.gaugeKey}>tasks done</div>
        </div>
      </div>
      <div className={s.gLegend}>
        {(
          [
            ["Done", done, "var(--ink)"],
            ["Open", open, "var(--accent)"],
            ["Paused", paused, "var(--border)"],
          ] as const
        ).map(([l, n, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={s.dot} style={{ background: c }} />
            {l} <strong>{n}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

const FILTERS: [ProjectStatus | "all", string][] = [
  ["active", "Active"],
  ["paused", "Paused"],
  ["done", "Done"],
  ["archived", "Archived"],
  ["all", "All"],
];

export function ProjectsList({ data, today }: { data: ProjectsPageData; today: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useShell();
  const [filter, setFilter] = useState<ProjectStatus | "all">((FILTERS.find(([k]) => k === sp.get("status"))?.[0] as ProjectStatus) ?? "active");
  const [view, setView] = useState<"table" | "board">(sp.get("view") === "board" ? "board" : "table");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(sp.get("new") === "project");
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const cards = data.cards;
  const live = cards.filter((c) => c.project.status === "active" || c.project.status === "paused");
  const count = (k: ProjectStatus | "all") => cards.filter((c) => k === "all" || c.project.status === k).length;
  const name = (id: string) => cards.find((c) => c.project.id === id)?.project.name ?? "";
  const match = (c: ProjectCardDTO) => !q.trim() || `${c.project.name} ${CATEGORY_LABEL[c.project.category]} ${c.nextTask?.title ?? ""}`.toLowerCase().includes(q.trim().toLowerCase());
  const rows = cards.filter((c) => (filter === "all" || c.project.status === filter) && match(c));
  const atRisk = cards.filter((c) => c.project.status === "active" && (c.health === "at_risk" || c.health === "behind")).length;
  const onTrack = cards.filter((c) => c.project.status === "active" && c.health === "on_track").length;
  const nextMs = data.milestones.filter((m) => !m.done && m.dueDate && m.dueDate >= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  const weekEnd = new Date(at(today) + 7 * DAY).toISOString().slice(0, 10);
  const dueWeek = data.nextUp.filter((t) => t.dueDate && t.dueDate <= weekEnd).length;
  const dueToday = data.nextUp.filter((t) => t.dueDate && t.dueDate <= today).length;
  const tasksDone = live.reduce((a, c) => a + c.progress.done, 0);
  const tasksTotal = live.reduce((a, c) => a + c.progress.total, 0);

  const toggle = async (id: string) => {
    const done = !doneIds.includes(id);
    setDoneIds((l) => (done ? [...l, id] : l.filter((x) => x !== id)));
    const r = await toggleTaskAction(id, done).catch(() => ({ ok: false }) as const);
    if (!r.ok) {
      setDoneIds((l) => l.filter((x) => x !== id));
      return toast("Couldn't update that task. Try again.", "error");
    }
    if (done) toast("Task done. Logged in Activity.");
    router.refresh();
  };

  const prow = (c: ProjectCardDTO) => {
    const h = HEALTH[healthOf(c)];
    const [tint, tintFg] = TINT[c.project.category];
    const [pb, pf] = PILL[c.project.status];
    return { h, tint, tintFg, pb, pf };
  };

  return (
    <Page label="Projects">
      <PageHeader
        title="Projects"
        sub={`${count("active")} active · ${atRisk} at risk${nextMs ? ` · next milestone ${nextMs.title} on ${short(nextMs.dueDate)}` : ""}`}
        actions={
          <Button variant="primary" size="lg" icon="add" onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />

      <div className={s.kpis}>
        <Kpi icon="folder_open" label="Active projects" value={String(count("active"))} sub={`${onTrack} on track · ${atRisk} at risk`} tone={["var(--wash)", "var(--ink)"]} />
        <Kpi icon="task_alt" label="Tasks done" value={String(tasksDone)} sub={`of ${tasksTotal} in active and paused projects`} tone={["var(--status-working-bg)", "var(--status-working)"]} />
        <Kpi icon="event_upcoming" label="Due this week" value={String(dueWeek)} sub={`${dueToday} due today`} tone={["var(--accent-wash)", "var(--accent)"]} />
        <Kpi icon="flag" label="Next milestone" value={nextMs ? short(nextMs.dueDate) : "—"} sub={nextMs ? `${name(nextMs.projectId)} · ${nextMs.title}` : "No upcoming milestones"} tone={["var(--status-approval-bg)", "var(--status-approval)"]} />
      </div>

      {live.length > 0 && (
        <div className={s.row}>
          <section className={s.panel} style={{ flex: "2 1 560px" }} aria-labelledby="p-tl">
            <div className={s.panelHead}>
              <div className={s.panelTitle}>
                <span className={s.chipBig}>
                  <Icon name="view_timeline" size={19} />
                </span>
                <div>
                  <h2 id="p-tl" className={s.h2}>
                    Timeline
                  </h2>
                  <div className={s.hsub}>Active and paused projects · milestones as dots · click a bar to open</div>
                </div>
              </div>
              <div className={s.legend}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className={s.dot} style={{ background: "var(--ink)" }} />
                  Milestone done
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className={s.dot} style={{ border: "2px solid var(--accent)", background: "var(--paper-3)" }} />
                  Current
                </span>
              </div>
            </div>
            <Timeline live={live} data={data} today={today} />
          </section>
          <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <section className={s.panel} style={{ gap: 12 }} aria-labelledby="p-prog">
              <div className={s.panelTitle}>
                <span className={s.chipBig}>
                  <Icon name="donut_large" size={19} />
                </span>
                <div>
                  <h2 id="p-prog" className={s.h2}>
                    Overall progress
                  </h2>
                  <div className={s.hsub}>Tasks across active and paused projects</div>
                </div>
              </div>
              <Gauge live={live} />
            </section>
            <section className={s.panel} style={{ gap: 6, flex: 1 }} aria-labelledby="p-next">
              <div className={s.panelTitle}>
                <span className={s.chipBig}>
                  <Icon name="checklist" size={19} />
                </span>
                <div>
                  <h2 id="p-next" className={s.h2}>
                    Next up
                  </h2>
                  <div className={s.hsub}>Unblocked tasks, soonest first</div>
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                {data.nextUp.slice(0, 5).map((t) => {
                  const done = doneIds.includes(t.id);
                  const late = t.dueDate && t.dueDate < today;
                  return (
                    <div key={t.id} className={s.next}>
                      <button type="button" role="checkbox" aria-checked={done} aria-label={t.title} className={s.check} onClick={() => void toggle(t.id)}>
                        {done ? "✓" : ""}
                      </button>
                      <span style={{ minWidth: 0 }}>
                        <span className={[s.nextTitle, done && s.tdone].filter(Boolean).join(" ")}>{t.title}</span>
                        <Link href={`/projects/${t.projectId}`} className={s.nextProj}>
                          {name(t.projectId)}
                        </Link>
                      </span>
                      <span className={[s.due, t.dueDate === today && s.dueToday, late && s.dueLate].filter(Boolean).join(" ")}>
                        {t.priority ? `P${t.priority}` : "—"} · {t.dueDate === today ? "Today" : late ? `Overdue · ${short(t.dueDate)}` : short(t.dueDate)}
                      </span>
                    </div>
                  );
                })}
                {data.nextUp.length === 0 && <p className={s.small} style={{ padding: "12px 0" }}>Nothing unblocked. Nice.</p>}
              </div>
            </section>
          </div>
        </div>
      )}

      <section className={s.all} aria-labelledby="p-all">
        <div className={s.allHead}>
          <div className={s.allLeft}>
            <h2 id="p-all" className={s.h2}>
              All projects
            </h2>
            <Segmented
              label="View"
              role="tablist"
              small
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: "Table", icon: "table_rows" },
                { value: "board", label: "Board", icon: "view_kanban" },
              ]}
            />
          </div>
          <SearchField label="Search projects" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} className={s.search} />
        </div>
        {view === "table" ? (
          <>
            <div role="tablist" aria-label="Status" className={s.filters}>
              {FILTERS.map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={s.filter} onClick={() => setFilter(k)}>
                  {l} <span className={s.filterN}>{count(k)}</span>
                </button>
              ))}
            </div>
            <div className={`${s.thead} ${s.cols}`} aria-hidden="true">
              <span>NAME</span>
              <span>STATUS</span>
              <span>NEXT TASK</span>
              <span>PROGRESS</span>
              <span style={{ textAlign: "right" }}>TARGET</span>
            </div>
            <ul role="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {rows.map((c) => {
                const v = prow(c);
                const pct = c.progress.pct ?? 0;
                return (
                  <li key={c.project.id}>
                    <Link href={`/projects/${c.project.id}`} className={`${s.prow} ${s.cols}`}>
                      <span className={s.pname}>
                        <span className={s.initials} style={{ background: v.tint, color: v.tintFg }} aria-hidden="true">
                          {initialsOf(c.project.name)}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span className={s.pnameText}>{c.project.name}</span>
                          <span className={s.pmeta}>
                            {CATEGORY_LABEL[c.project.category]} · P{c.project.priority} ·{" "}
                            <span style={{ color: v.h.color }}>
                              {v.h.mark} {healthLabel(c)}
                            </span>
                          </span>
                        </span>
                      </span>
                      <span className={s.hideMobile}>
                        <span className={s.pill} style={{ background: v.pb, color: v.pf }}>
                          {STATUS_LABEL[c.project.status]}
                        </span>
                      </span>
                      <span className={`${s.nextCell} ${s.hideMobile}`}>{c.nextTask?.title ?? "—"}</span>
                      <span className={s.prog}>
                        <span className={s.progTrack}>
                          <span className={s.progFill} style={{ width: `${pct}%`, background: v.h.color }} />
                        </span>
                        <span className={s.pct}>{pct}%</span>
                      </span>
                      <span className={`${s.target} ${s.hideMobile}`}>{short(c.project.targetDate)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {rows.length === 0 && <p className={s.none}>No {q ? "matching" : filter === "all" ? "" : filter} projects.</p>}
          </>
        ) : (
          <div className={s.board}>
            {(
              [
                ["active", "Active", "var(--status-working)"],
                ["paused", "Paused", "var(--status-approval)"],
                ["done", "Done", "var(--ink)"],
              ] as const
            ).map(([k, l, dot]) => {
              const items = cards.filter((c) => c.project.status === k && match(c));
              return (
                <div key={k} className={s.col}>
                  <div className={s.colHead}>
                    <span className={s.dot} style={{ background: dot }} />
                    {l}
                    <span className={s.filterN}>{items.length}</span>
                  </div>
                  {items.map((c) => {
                    const v = prow(c);
                    return (
                      <Link key={c.project.id} href={`/projects/${c.project.id}`} className={s.card}>
                        <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                          <span className={s.initials} style={{ width: 28, height: 28, background: v.tint, color: v.tintFg }} aria-hidden="true">
                            {initialsOf(c.project.name)}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{c.project.name}</span>
                        </span>
                        <span className={s.small} style={{ fontSize: 12.5 }}>
                          Next: {c.nextTask?.title ?? "—"}
                        </span>
                        <span className={s.prog}>
                          <span className={s.progTrack} style={{ height: 5 }}>
                            <span className={s.progFill} style={{ height: 5, width: `${c.progress.pct ?? 0}%`, background: v.h.color }} />
                          </span>
                          <span className={s.pct}>
                            {c.progress.done}/{c.progress.total}
                          </span>
                        </span>
                        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: v.h.color }}>
                            {v.h.mark} {healthLabel(c)}
                          </span>
                          <span className={s.target}>{short(c.project.targetDate)}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>
      {creating && <ProjectDialog open objectives={data.objectives} onClose={() => setCreating(false)} />}
    </Page>
  );
}
