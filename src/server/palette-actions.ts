"use server";

import { z } from "zod";
import type { PaletteData } from "@/shell/palette-items";
import { db } from "./db/client";
import { addDaysYmd, sydneyYmd } from "./calendar/free-slots";
import { listEvents, loadTasks } from "./calendar/queries";
import { log } from "./log";
import { requireOwner } from "./session";
import { formatHM, sydneyParts } from "./time";

const EMPTY: PaletteData = { events: [], tasks: [] };
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
    const [events, open] = await Promise.all([
      listEvents(db(), addDaysYmd(today, -7), addDaysYmd(today, 60), q, 4),
      loadTasks(db(), "open", now),
    ]);
    return {
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
        .map((t) => {
          const due = t.dueAt ? new Date(t.dueAt) : null;
          return {
            id: t.id,
            title: t.title,
            subtitle: due ? `Due ${sydneyParts(due).weekday} ${formatHM(due)}` : "No due date",
            href: "/organization#tasks",
          };
        }),
    };
  } catch (err) {
    log.error({ err }, "palette search failed"); // never log the query
    return EMPTY;
  }
}
