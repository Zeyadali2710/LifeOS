"use server";

import { desc, ilike, isNull, and, sql } from "drizzle-orm";
import { z } from "zod";
import { STAGE } from "@/lib/outreach-types";
import type { PaletteData } from "@/shell/palette-items";
import { db } from "./db/client";
import { addDaysYmd, sydneyYmd } from "./calendar/free-slots";
import { listEvents, loadTasks } from "./calendar/queries";
import { CATEGORY_LABEL, HEALTH_LABEL } from "@/lib/project-types";
import { outreachEvents, socialPosts } from "./db/schema";
import { log } from "./log";
import { searchProjects } from "./project-queries";
import { requireOwner } from "./session";
import { dueBody } from "./tasks";
import { formatHM, sydneyParts } from "./time";

const EMPTY: PaletteData = { events: [], outreach: [], tasks: [], projects: [] };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
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
    const [hits, open, found, outreach, posts] = await Promise.all([
      listEvents(db(), addDaysYmd(today, -7), addDaysYmd(today, 55), q),
      loadTasks(db(), "open", now),
      searchProjects(db(), q),
      db()
        .select({ id: outreachEvents.id, title: outreachEvents.title, startAt: outreachEvents.startAt, stage: outreachEvents.stage, score: outreachEvents.score, isMock: outreachEvents.isMock })
        .from(outreachEvents)
        .where(and(isNull(outreachEvents.dismissedAt), ilike(outreachEvents.title, `%${escapeLike(q)}%`)))
        .orderBy(sql`${outreachEvents.stage} is null`, desc(outreachEvents.score))
        .limit(8),
      db().select({ id: socialPosts.id, title: socialPosts.title }).from(socialPosts).where(ilike(socialPosts.title, `%${escapeLike(q)}%`)).orderBy(desc(socialPosts.updatedAt)).limit(4),
    ]);
    // Upcoming/ongoing first (soonest first), then past (most recent first), so last week can't crowd out next week.
    const nowIso = now.toISOString();
    const upcoming = hits.filter((e) => e.end >= nowIso);
    const past = hits.filter((e) => e.end < nowIso).reverse();
    const events = [...upcoming, ...past].slice(0, 4);
    return {
      posts: posts.map((p) => ({ id: p.id, title: p.title, subtitle: "Social post", href: `/socials?post=${p.id}` })),
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
      outreach: outreach.map((e) => {
        const label = e.stage ? STAGE[e.stage as keyof typeof STAGE].label : `${e.score}/100`;
        const month = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", month: "short" }).format(e.startAt);
        const p = sydneyParts(e.startAt);
        return { id: e.id, title: e.title, subtitle: `${p.weekday} ${p.day} ${month} � ${label}${e.isMock ? " � Mock" : ""}`, href: `/outreach/events/${e.id}` };
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
