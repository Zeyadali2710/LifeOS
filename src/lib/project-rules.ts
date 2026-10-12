// Client-safe: no server imports. Pure: callers pass now/today, nothing reads the clock here.
import {
  type BlockerDTO,
  type CiChip,
  type Health,
  type LanguageSlice,
  type Progress,
  type ProjectDTO,
  type ProjectStatus,
  HEALTH_LABEL,
  STATUS_LABEL,
} from "./project-types";

// --- dates (client-safe copies of free-slots' sydneyYmd/addDaysYmd) ---
const SYD = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });
export function sydneyYmd(d: Date): string {
  return SYD.format(d);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayNum(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86400000;
}

// --- CI ---
export type RunRow = { branch: string | null; status: string | null; conclusion: string | null; at: string | null };
const FAILING = new Set(["failure", "timed_out", "startup_failure", "action_required"]);

export function ciHealth(runs: RunRow[], defaultBranch: string | null): { state: "passing" | "failing" | "none"; running: boolean } {
  const rs = runs
    .filter((r) => defaultBranch === null || r.branch === defaultBranch)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const running = rs.length > 0 && rs[0]!.status !== "completed";
  for (const r of rs) {
    if (r.status !== "completed") continue;
    if (r.conclusion === "success") return { state: "passing", running };
    if (r.conclusion && FAILING.has(r.conclusion)) return { state: "failing", running };
  }
  return { state: "none", running };
}

export function ciChip(runs: RunRow[], defaultBranch: string | null): CiChip {
  const h = ciHealth(runs, defaultBranch);
  return h.running ? "running" : h.state;
}

// --- languages ---
const PALETTE = ["#64d2ff", "#30d158", "#ff9f0a", "#ff6482", "#bf5af2", "#0a84ff"];
const OTHER = "#8e8e93";
const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
};

export function languageBar(languages: Record<string, number> | null, fallback: string | null): LanguageSlice[] {
  if (languages === null) return fallback ? [{ name: fallback, pct: 100, color: colorFor(fallback) }] : [];
  const sorted = Object.entries(languages)
    .filter(([, b]) => b > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = sorted.reduce((n, [, b]) => n + b, 0);
  if (total === 0) return [];
  const rest = sorted.slice(5).reduce((n, [, b]) => n + b, 0);
  const parts: [string, number, string][] = sorted.slice(0, 5).map(([n, b]) => [n, b, colorFor(n)]);
  if (rest > 0) parts.push(["Other", rest, OTHER]);
  const out = parts.map(([name, b, color]) => ({ name, pct: Math.round((b / total) * 100), color }));
  out[0]!.pct += 100 - out.reduce((n, s) => n + s.pct, 0); // remainder on the largest (first)
  return out;
}

// --- sparkline ---
export function sparkline(dates: (string | Date | null)[], now: Date, days = 14): number[] {
  const out = Array<number>(days).fill(0);
  const today = dayNum(sydneyYmd(now));
  for (const d of dates) {
    if (d === null) continue;
    const ago = today - dayNum(sydneyYmd(new Date(d)));
    if (ago >= 0 && ago < days) out[days - 1 - ago]!++;
  }
  return out;
}

// --- progress / overdue ---
export function progress(i: { tasks: { completedAt: string | null }[]; milestones: { completedAt: string | null }[] }): Progress {
  const [list, basis] = i.tasks.length > 0 ? [i.tasks, "tasks" as const] : i.milestones.length > 0 ? [i.milestones, "milestones" as const] : [[], "none" as const];
  const done = list.filter((x) => x.completedAt !== null).length;
  return { pct: list.length ? Math.round((done / list.length) * 100) : null, done, total: list.length, basis };
}

export function isTaskOverdue(t: { completedAt: string | null; dueAt: string | null }, now: Date): boolean {
  return t.completedAt === null && t.dueAt !== null && new Date(t.dueAt).getTime() < now.getTime();
}

export function isMilestoneOverdue(m: { completedAt: string | null; dueDate: string | null }, today: string): boolean {
  return m.completedAt === null && m.dueDate !== null && m.dueDate < today;
}

// --- health ---
// D-10 order, plus A2 (target passed and not Done = Behind) and A4 (CI failing alone = At risk).
export function health(i: {
  status: ProjectStatus;
  targetDate: string | null;
  today: string;
  progressPct: number | null;
  overdue: number;
  failingRepos: string[];
}): { health: Health | null; reason: string } {
  if (i.status !== "active") return { health: null, reason: "" };
  if (i.overdue > 0) return { health: "behind", reason: `Behind: ${i.overdue} overdue ${i.overdue === 1 ? "item" : "items"}` };
  const left = i.targetDate ? dayNum(i.targetDate) - dayNum(i.today) : null;
  if (left !== null && left < 0) return { health: "behind", reason: "Behind: target date passed" };
  const pct = i.progressPct ?? 0;
  if (left !== null && left <= 7 && pct < 80) {
    return { health: "at_risk", reason: `At risk: target in ${left} ${left === 1 ? "day" : "days"} at ${pct}%` };
  }
  if (i.failingRepos.length > 0) return { health: "at_risk", reason: `At risk: CI failing on ${i.failingRepos[0]}` };
  return { health: "on_track", reason: HEALTH_LABEL.on_track };
}

// --- blockers ---
export function blockers(i: {
  tasks: { id: string; title: string; completedAt: string | null }[];
  taskDeps: { taskId: string; blockedById: string; blockedByTitle: string; blockedByDone: boolean }[];
  projectDeps: { id: string; name: string; status: ProjectStatus }[];
  milestones: { id: string; title: string; dueDate: string | null; completedAt: string | null }[];
  failingRepos: string[];
  today: string;
  projectId: string;
}): BlockerDTO[] {
  const out: BlockerDTO[] = [];
  const open = new Map(i.tasks.filter((t) => t.completedAt === null).map((t) => [t.id, t.title]));
  const seen = new Set<string>();
  for (const d of i.taskDeps) {
    const title = open.get(d.taskId);
    if (title === undefined || d.blockedByDone || seen.has(d.taskId)) continue;
    seen.add(d.taskId);
    out.push({ kind: "task_blocked", refId: d.taskId, label: `Task "${title}" is blocked by "${d.blockedByTitle}"`, href: `/projects/${i.projectId}?task=${d.taskId}` });
  }
  for (const p of i.projectDeps) {
    if (p.status !== "active" && p.status !== "paused") continue; // A3: done/archived deps no longer block
    out.push({ kind: "project_blocked", refId: p.id, label: `Waiting on project "${p.name}" (${STATUS_LABEL[p.status]})`, href: `/projects/${p.id}` });
  }
  for (const m of i.milestones) {
    if (isMilestoneOverdue(m, i.today)) {
      out.push({ kind: "milestone_overdue", refId: m.id, label: `Milestone "${m.title}" is overdue`, href: `/projects/${i.projectId}#milestones` });
    }
  }
  for (const r of i.failingRepos) out.push({ kind: "ci_failing", refId: r, label: `CI failing on ${r}`, href: `/career/${r}` });
  return out;
}

// --- timeline ---
export function timelineBar(i: { startYmd: string; targetDate: string | null; today: string }): { pct: number; daysLeft: number } | null {
  if (!i.targetDate) return null;
  const total = dayNum(i.targetDate) - dayNum(i.startYmd);
  const daysLeft = dayNum(i.targetDate) - dayNum(i.today);
  const pct = total <= 0 ? 100 : Math.min(100, Math.max(0, Math.round(((dayNum(i.today) - dayNum(i.startYmd)) / total) * 100)));
  return { pct: daysLeft < 0 ? 100 : pct, daysLeft };
}

// --- launch command (copy-only; defence in depth on top of the payload refine) ---
export function launchCommand(path: string | null): string | null {
  const p = path?.trim();
  if (!p || /["`$\r\n]/.test(p)) return null;
  return `cd "${p}" && claude`;
}

// --- context brief ---
const LIST_CAP = 20;
const BRIEF_CAP = 8000;

export function buildBrief(i: {
  project: Pick<ProjectDTO, "name" | "description" | "status" | "priority" | "targetDate" | "blockerNote">;
  health: Health | null;
  progress: Progress;
  openTasks: { title: string; dueDate: string | null }[];
  blockers: BlockerDTO[];
  milestones: { title: string; dueDate: string | null; completedAt: string | null }[];
  repos: { fullName: string; ci: CiChip }[];
}): string {
  const list = (items: string[]) => (items.length ? items.slice(0, LIST_CAP).map((s) => `- ${s}`).join("\n") : "None.");
  const p = i.project;
  const prog = i.progress.pct === null ? "No progress data" : `${i.progress.pct}% (${i.progress.done}/${i.progress.total} ${i.progress.basis})`;
  const status = [
    `- Status: ${STATUS_LABEL[p.status]}`,
    `- Health: ${i.health ? HEALTH_LABEL[i.health] : "n/a"}`,
    `- Priority: P${p.priority}`,
    `- Progress: ${prog}`,
    `- Target: ${p.targetDate ?? "none"}`,
  ].join("\n");
  const out = [
    `# ${p.name}`,
    p.description,
    "## Status",
    status,
    "## Open tasks",
    list(i.openTasks.map((t) => (t.dueDate ? `${t.title} (due ${t.dueDate})` : t.title))),
    "## Blockers",
    list([...(p.blockerNote ? [p.blockerNote] : []), ...i.blockers.map((b) => b.label)]),
    "## Milestones",
    list(i.milestones.map((m) => `${m.completedAt ? "[x]" : "[ ]"} ${m.title}${m.dueDate ? ` (due ${m.dueDate})` : ""}`)),
    "## Repositories",
    list(i.repos.map((r) => `${r.fullName} (CI ${r.ci})`)),
  ]
    .filter((s) => s !== "")
    .join("\n\n");
  return out.length > BRIEF_CAP ? out.slice(0, BRIEF_CAP) : out;
}

