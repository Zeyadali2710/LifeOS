// Pure explainable relevance score (D-14). No db/next imports.
import type { Signal } from "@/lib/outreach-types";
import type { SchedItem } from "../calendar/conflicts";
import { sydneyParts } from "../time";

export type ScoreProject = { name: string; category: string; keywords: string[] };

const STOPWORDS = new Set(
  "this that with from have will your about into when what which there their then than them they been were also only more some such each over just like make using used team build".split(" "),
);

/** Distinct lower-case words (>= 4 chars) of a project context, markdown stripped, stopwords removed, first-occurrence order. */
export function projectKeywords(context: string, cap = 20): string[] {
  const out = new Set<string>();
  for (const w of context.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (out.size >= cap) break;
    if (w.length >= 4 && !STOPWORDS.has(w)) out.add(w);
  }
  return [...out];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// \b fails next to symbols ("C++"), so use lookarounds on letters/digits; the pattern is a escaped literal (no ReDoS).
const has = (text: string, term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(term)}(?![\\p{L}\\p{N}])`, "iu").test(text);

const DAYS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

type EventIn = { title: string; description: string; categories: string[]; startAt: Date; endAt: Date | null; allDay: boolean };

export function scoreEvent(
  e: EventIn,
  ctx: { interests: string[]; projects: ScoreProject[]; busy: SchedItem[] | null },
): { score: number; signals: Signal[]; why: string } {
  const head = [e.title, ...e.categories].join("\n");
  const interestTerms: string[] = [];
  let iv = 0;
  for (const t of ctx.interests) {
    if (!t.trim()) continue;
    const v = has(head, t) ? 25 : has(e.description, t) ? 12 : 0;
    if (v) {
      iv += v;
      interestTerms.push(t);
    }
  }
  iv = Math.min(iv, 60);

  const all = `${head}\n${e.description}`;
  const projTerms: string[] = [];
  const projNames: string[] = [];
  let pv = 0;
  for (const p of ctx.projects) {
    const hit = [p.name.length >= 3 ? p.name : "", p.category, ...p.keywords].find((w) => w && has(all, w));
    if (!hit) continue;
    pv += 10;
    projNames.push(p.name);
    projTerms.push(`project ${p.name}`);
    if (hit !== p.name) projTerms.push(hit);
  }
  pv = Math.min(pv, 20);

  let sv = 10;
  let note = "calendar not connected";
  if (ctx.busy) {
    const s = e.startAt.getTime();
    const end = e.endAt?.getTime() ?? s + 2 * 3600000;
    const over = ctx.busy.filter((b) => !b.allDay && !b.declined && b.status !== "cancelled" && b.start < end && b.end > s);
    if (over.some((b) => b.transparency === "opaque" && b.status === "confirmed")) [sv, note] = [0, "conflicts with your calendar"];
    else if (over.length) [sv, note] = [10, "overlaps an optional event"];
    else {
      const p = sydneyParts(e.startAt);
      [sv, note] = [20, `fits your ${DAYS[p.weekday] ?? p.weekday} ${p.hour < 12 ? "morning" : p.hour < 17 ? "afternoon" : "evening"}`];
    }
  }

  const signals: Signal[] = [
    { label: "INTERESTS", value: iv, max: 60, terms: interestTerms },
    { label: "PROJECTS", value: pv, max: 20, terms: projTerms },
    { label: "SCHEDULE", value: sv, max: 20, terms: [], note },
  ];
  const why = [
    interestTerms.length ? `Matches ${interestTerms.map((t, i) => (i ? t.toLowerCase() : t)).join(", ")}` : "",
    ctx.busy ? note : "",
    projNames.length ? `related to ${projNames.map((n) => `project ${n}`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { score: iv + pv + sv, signals, why };
}
