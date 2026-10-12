"use server";

import { z } from "zod";
import type { PaletteData } from "@/shell/palette-items";
import { db } from "./db/client";
import { addDaysYmd, sydneyYmd } from "./calendar/free-slots";
import { listEvents, loadTasks } from "./calendar/queries";
import { CATEGORY_LABEL, HEALTH_LABEL } from "@/lib/project-types";
import { log } from "./log";
import { searchProjects } from "./project-queries";
import { requireOwner } from "./session";
import { dueBody } from "./tasks";
import { formatHM, sydneyParts } from "./time";

const EMPTY: PaletteData = { events: [], tasks: [], projects: [] };
const Q = z.string().trim().min(2).max(100);

// Title-only search over a fixed window; both reads are parameterised drizzle queries.
export async function paletteSearchAction(raw: unknown): Promise<PaletteData> {
  await requireOwner();
  const parsed = Q.safeParse(raw);
  if (!parsed.success) return EMPTY;
  const q = parsed.data.toLowerCase();
  try {
    const now = new Date();
    const today = sydneyYmd(now);
    // 7 back + 55 ahead = the 62-day listEvents cap, so nothing is silently clamped (IN-C03).
    const [hits, open, found] = await Promise.all([
      listEvents(db(), addDaysYmd(today, -7), addDaysYmd(today, 55), q),
      loadTasks(db(), "open", now),
      searchProjects(db(), q),
    ]);
    // Upcoming/ongoing first (soonest first), then past (most recent first), so last week can't crowd out next week.
    const nowIso = now.toISOString();
    const upcoming = hits.filter((e) => e.end >= nowIso);
    const past = hits.filter((e) => e.end < nowIso).reverse();
    const events = [...upcoming, ...past].slice(0, 4);
    return {
      projects: found.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: `${(CATEGORY_LABEL as Record<string, string>)[p.category] ?? p.category}${p.health ? ` · ${HEALTH_LABEL[p.health]}` : ""}`,
        href: `/projects/${p.id}`,
      })),
      events: events.map((e) => {
        const d = new Date(e.start);
        const p = sydneyParts(d);
        const month = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", month: "short" }).format(d);
        return {
          id: e.key,
          title: e.title,
          subtitle: `${p.weekday} ${p.day} ${month}${e.allDay ? "" : ` ${formatHM(d)}`} · ${e.calendarName}`,
          href: `/organization?view=day&date=${sydneyYmd(d)}&event=${encodeURIComponent(e.eventId)}`,
        };
      }),
      tasks: open
        .filter((t) => t.title.toLowerCase().includes(q))
        .slice(0, 4)
        .map((t) => ({
          id: t.id,
          title: t.title,
          // Shared with reminders: day + month, time only when one was set (IN-C04).
          subtitle: dueBody({ ...t, dueAt: t.dueAt ? new Date(t.dueAt) : null }, now).replace(/\.$/, ""),
          href: "/organization#tasks",
        })),
    };
  } catch (err) {
    log.error({ err }, "palette search failed"); // never log the query
    return EMPTY;
  }
}
