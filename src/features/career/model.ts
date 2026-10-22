import { sydneyYmd } from "@/lib/project-rules";

export const CI = {
  passing: { tone: "working", glyph: "✓", label: "Passing" },
  failing: { tone: "failed", glyph: "×", label: "Failed" },
  running: { tone: "approval", glyph: "…", label: "Running" },
  none: { tone: "idle", glyph: "–", label: "No CI" },
} as const;

export function relativeTime(iso: string | null, now: string): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export type Contribution = { repoId: number; at: string };
export function contributionDays(items: Contribution[], now: string, repoId?: number) {
  const end = new Date(`${sydneyYmd(new Date(now))}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - end.getUTCDay() - 52 * 7);
  const counts = new Map<string, number>();
  for (const item of items) {
    if (repoId !== undefined && item.repoId !== repoId) continue;
    const day = sydneyYmd(new Date(item.at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: 371 }, (_, i) => {
    const day = new Date(start.getTime() + i * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    return { date, count: counts.get(date) ?? 0, future: day > end };
  });
}

export function weeklyCommits(items: Contribution[], now: string, repoId: number) {
  const days = contributionDays(items, now, repoId);
  return Array.from({ length: 12 }, (_, i) => days.slice((41 + i) * 7, (42 + i) * 7).reduce((n, d) => n + (d.future ? 0 : d.count), 0));
}

export const repoPath = (fullName: string) => `/career/${fullName.split("/").map(encodeURIComponent).join("/")}`;
