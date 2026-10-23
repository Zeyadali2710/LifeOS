// Work roster emails (Phase 13): deterministic read of the week table. Anything that doesn't line up is an error, never a guess.
import { decodeEntities } from "../text";
import { sydneyInstant } from "../time";

export type Shift = { date: string; branch: string; start: string; end: string; time: string; break: string | null };
export type Roster = { weekStart: string; weekEnd: string; updated: boolean; rosterId: string | null; shifts: Shift[] };
export type ParseResult = { ok: true; roster: Roster } | { ok: false; error: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEK = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const DAY = /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+(\d{1,2})[-\s]([a-z]{3})/i;
const RANGE = /(?<![\d:])(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})(?![\d:])/;
const BREAK = new RegExp(`brk\\w*\\s*\\(?\\s*${RANGE.source}\\s*\\)?`, "i");

const pad = (n: number) => String(n).padStart(2, "0");
const text = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const rows = (table: string) => [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((m) => cells(m[1]!));
function cells(row: string) {
  return [...row.matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1\s*>/gi)].map((m) => ({ text: text(m[3]!), span: Math.max(1, Number(/colspan\s*=\s*["']?(\d+)/i.exec(m[2]!)?.[1] ?? 1)) }));
}
type Cell = ReturnType<typeof cells>[number];

/** [h1, m1, h2, m2] of the first valid "HH:MM - HH:MM" in s, or null. */
function range(m: RegExpExecArray | null): [number, number, number, number] | null {
  if (!m) return null;
  const n = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
  return n[0] < 24 && n[2] < 24 && n[1] < 60 && n[3] < 60 ? n : null;
}
const hm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

export function parseRoster(subject: string, html: string): ParseResult {
  const w = WEEK.exec(subject) ?? WEEK.exec(text(html));
  if (!w) return { ok: false, error: "No roster week found." };
  const [d1, m1, y1, d2, m2, y2] = w.slice(1).map(Number) as [number, number, number, number, number, number];
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  // Exactly one week: a shorter range would make the rest of an applied week look removed.
  if (to - from !== 6 * 86_400_000 || new Date(from).getUTCDate() !== d1 || new Date(to).getUTCDate() !== d2) return { ok: false, error: "No roster week found." };
  const week = Array.from({ length: (to - from) / 86_400_000 + 1 }, (_, i) => new Date(from + i * 86_400_000));
  const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

  // Innermost tables only (the email may sit in layout tables); the roster is the one with day rows.
  const tables = [...html.matchAll(/<table\b[^>]*>((?:(?!<table\b)[\s\S])*?)<\/table\s*>/gi)].map((m) => rows(m[1]!));
  const grid = tables.find((t) => t.some((r) => DAY.test(r[0]?.text ?? "")));
  if (!grid) return { ok: false, error: "No roster table found." };
  const first = grid.findIndex((r) => DAY.test(r[0]?.text ?? ""));
  // The branch header is the nearest row above the days that names something (spacer rows are skipped).
  const header = grid.slice(0, first).findLast((r) => r.length > 1 && r.slice(1).some((c) => c.text));
  if (!header) return { ok: false, error: "No roster table found." };
  // Header column -> branch, with colspan expanded.
  const cols = header.slice(1).flatMap((c) => Array<string>(c.span).fill(c.text));
  const branches = [...new Set(cols)];

  const shifts: Shift[] = [];
  const seen = new Set<string>();
  for (const r of grid.slice(first)) {
    const label = r[0]?.text ?? "";
    const day = DAY.exec(label);
    if (!day) continue;
    const name = label.slice(0, day[0].length);
    const date = week.find((d) => d.getUTCDate() === Number(day[2]) && MONTHS[d.getUTCMonth()] === day[3]!.toLowerCase() && WEEKDAYS[d.getUTCDay()] === day[1]!.toLowerCase());
    if (!date) return { ok: false, error: `${name} is outside the roster week.` };
    // A row may use the header's columns or a whole multiple of them (e.g. time + break per branch under one header cell).
    const width = r.slice(1).reduce((n, c) => n + c.span, 0);
    const scale = width / cols.length;
    if (!Number.isInteger(scale) || scale < 1) return { ok: false, error: `Row ${name} doesn't line up with the branch columns.` };
    const byBranch = new Map<string, Cell[]>();
    let col = 0;
    for (const c of r.slice(1)) {
      const covered = new Set(cols.slice(Math.floor(col / scale), Math.ceil((col + c.span) / scale)));
      col += c.span;
      if (covered.size > 1 && c.text) return { ok: false, error: `Row ${name} doesn't line up with the branch columns.` };
      const b = [...covered][0]!;
      byBranch.set(b, [...(byBranch.get(b) ?? []), c]);
    }
    if (seen.has(ymd(date))) return { ok: false, error: `${name} is listed twice.` };
    seen.add(ymd(date));
    for (const branch of branches) {
      const s = (byBranch.get(branch) ?? []).map((c) => c.text).join(" ").trim();
      if (!s) continue;
      const brk = BREAK.exec(s);
      const rest = brk ? s.replace(brk[0], " ") : s;
      const t = range(RANGE.exec(rest));
      const b = brk ? range(RANGE.exec(brk[0])) : null;
      // Exactly one shift and at most one break per cell; a second time range (split shift) isn't guessed at.
      const extra = rest.replace(RANGE, " ");
      if (!t || (brk && !b) || RANGE.test(extra) || BREAK.test(extra)) return { ok: false, error: `Couldn't read the ${branch} shift on ${name}.` };
      const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
      const start = sydneyInstant(y, m, d, t[0], t[1]);
      // An end at or before the start runs past midnight.
      const end = sydneyInstant(y, m, t[2] * 60 + t[3] <= t[0] * 60 + t[1] ? d + 1 : d, t[2], t[3]);
      shifts.push({ date: ymd(date), branch, start: start.toISOString(), end: end.toISOString(), time: `${hm(t[0], t[1])}–${hm(t[2], t[3])}`, break: b ? `${hm(b[0], b[1])}–${hm(b[2], b[3])}` : null });
    }
  }
  // Missing shifts later count as removed, so a partial table must never pass.
  if (seen.size !== week.length) return { ok: false, error: "The roster table doesn't list every day of the week." };
  return { ok: true, roster: { weekStart: ymd(week[0]!), weekEnd: ymd(week.at(-1)!), updated: /\bupdated\b/i.test(subject), rosterId: /\((ID[\w-]+)\)/i.exec(subject)?.[1] ?? null, shifts } };
}
