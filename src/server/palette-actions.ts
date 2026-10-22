"use server";

import { and, desc, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { STAGE } from "@/lib/outreach-types";
import { PALETTE_SCOPES, type PaletteData, type PaletteScope } from "@/lib/palette-types";
import { db } from "./db/client";
import { addDaysYmd, sydneyYmd } from "./calendar/free-slots";
import { listEvents, loadTasks } from "./calendar/queries";
import { CATEGORY_LABEL, HEALTH_LABEL } from "@/lib/project-types";
import { AGENTS } from "./agents/registry";
import { githubRepos, knowledgeItems, mailMessages, outreachEvents, socialPosts } from "./db/schema";
import { log } from "./log";
import { searchProjects } from "./project-queries";
import { requireOwner } from "./session";
import { dueBody } from "./tasks";
import { formatHM, sydneyParts } from "./time";

const EMPTY: PaletteData = { events: [], outreach: [], tasks: [], projects: [], posts: [], emails: [], people: [], notes: [], repos: [], agents: [] };
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const Input = z.object({ q: z.string().trim().max(100), scope: z.enum(PALETTE_SCOPES) });
const month = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", month: "short" }).format(d);
const dayLabel = (d: Date) => {
  const p = sydneyParts(d);
  return `${p.weekday} ${p.day} ${month(d)}`;
};

/**
 * Title-only search over a fixed window; every read is a parameterised drizzle query.
 * "all" needs 2+ characters; a single scope with an empty query lists that scope's most recent items.
 */
export async function paletteSearchAction(raw: unknown): Promise<PaletteData> {
  await requireOwner();
  const parsed = Input.safeParse(typeof raw === "string" ? { q: raw, scope: "all" } : raw);
  if (!parsed.success) return EMPTY;
  const { q: query, scope } = parsed.data;
  if (scope === "all" && query.length < 2) return EMPTY;
  const q = query.toLowerCase();
  const like = `%${escapeLike(q)}%`;
  const want = (s: PaletteScope) => scope === "all" || scope === s;
  const n = scope === "all" ? 4 : 12;
  try {
    const h = db();
    const now = new Date();
    const today = sydneyYmd(now);
    const none = Promise.resolve([] as never[]);
    // 7 back + 55 ahead = the 62-day listEvents cap, so nothing is silently clamped (IN-C03).
    const [hits, open, found, outreach, posts, mails, people, notes, repos] = await Promise.all([
      want("events") ? listEvents(h, addDaysYmd(today, -7), addDaysYmd(today, 55), q || undefined) : none,
      want("tasks") ? loadTasks(h, "open", now) : none,
      want("projects") ? searchProjects(h, q, n, now) : none,
      want("events")
        ? h
            .select({ id: outreachEvents.id, title: outreachEvents.title, startAt: outreachEvents.startAt, stage: outreachEvents.stage, score: outreachEvents.score, isMock: outreachEvents.isMock })
            .from(outreachEvents)
            .where(and(isNull(outreachEvents.dismissedAt), ilike(outreachEvents.title, like)))
            .orderBy(sql`${outreachEvents.stage} is null`, desc(outreachEvents.score))
            .limit(n)
        : none,
      scope === "all"
        ? h.select({ id: socialPosts.id, title: socialPosts.title }).from(socialPosts).where(ilike(socialPosts.title, like)).orderBy(desc(socialPosts.updatedAt)).limit(4)
        : none,
      want("emails")
        ? h
            .select({ id: mailMessages.id, subject: mailMessages.subject, fromName: mailMessages.fromName, fromAddress: mailMessages.fromAddress, receivedAt: mailMessages.receivedAt })
            .from(mailMessages)
            .where(or(ilike(mailMessages.subject, like), ilike(mailMessages.fromName, like)))
            .orderBy(desc(mailMessages.receivedAt))
            .limit(n)
        : none,
      want("people")
        ? h
            .select({ name: mailMessages.fromName, address: mailMessages.fromAddress, last: sql<Date>`max(${mailMessages.receivedAt})`, id: sql<string>`(array_agg(${mailMessages.id} order by ${mailMessages.receivedAt} desc))[1]` })
            .from(mailMessages)
            .where(and(sql`${mailMessages.bulk} = false`, or(ilike(mailMessages.fromName, like), ilike(mailMessages.fromAddress, like))))
            .groupBy(mailMessages.fromName, mailMessages.fromAddress)
            .orderBy(sql`max(${mailMessages.receivedAt}) desc`)
            .limit(n)
        : none,
      want("notes")
        ? h.select({ id: knowledgeItems.id, title: knowledgeItems.title, kind: knowledgeItems.kind }).from(knowledgeItems).where(ilike(knowledgeItems.title, like)).orderBy(desc(knowledgeItems.updatedAt)).limit(n)
        : none,
      want("github")
        ? h.select({ fullName: githubRepos.fullName, language: githubRepos.language }).from(githubRepos).where(ilike(githubRepos.fullName, like)).orderBy(desc(githubRepos.pushedAt)).limit(n)
        : none,
    ]);
    // Upcoming/ongoing first (soonest first), then past (most recent first), so last week can't crowd out next week.
    const nowIso = now.toISOString();
    const upcoming = hits.filter((e) => e.end >= nowIso);
    const past = hits.filter((e) => e.end < nowIso).reverse();
    return {
      posts: posts.map((p) => ({ id: p.id, title: p.title, subtitle: "Social post", href: `/socials?post=${p.id}` })),
      projects: found.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: `${(CATEGORY_LABEL as Record<string, string>)[p.category] ?? p.category}${p.health ? ` · ${HEALTH_LABEL[p.health]}` : ""}`,
        href: `/projects/${p.id}`,
      })),
      events: [...upcoming, ...past].slice(0, n).map((e) => {
        const d = new Date(e.start);
        return {
          id: e.key,
          title: e.title,
          subtitle: `${dayLabel(d)}${e.allDay ? "" : ` ${formatHM(d)}`} · ${e.calendarName}`,
          href: `/organization?view=day&date=${sydneyYmd(d)}&event=${encodeURIComponent(e.eventId)}`,
        };
      }),
      outreach: outreach.map((e) => {
        const label = e.stage ? STAGE[e.stage as keyof typeof STAGE].label : `${e.score}/100`;
        return { id: e.id, title: e.title, subtitle: `${dayLabel(e.startAt)} · ${label}${e.isMock ? " · Mock" : ""}`, href: `/outreach/events/${e.id}` };
      }),
      tasks: open
        .filter((t) => t.title.toLowerCase().includes(q))
        .slice(0, n)
        .map((t) => ({
          id: t.id,
          title: t.title,
          // Shared with reminders: day + month, time only when one was set (IN-C04).
          subtitle: dueBody({ ...t, dueAt: t.dueAt ? new Date(t.dueAt) : null }, now).replace(/\.$/, ""),
          href: "/organization#tasks",
        })),
      emails: mails.map((m) => ({ id: m.id, title: m.subject || "(no subject)", subtitle: m.fromName || m.fromAddress, href: `/outreach?mail=${m.id}` })),
      people: people.map((p) => ({ id: p.address, title: p.name || p.address, subtitle: p.name ? p.address : "", href: `/outreach?mail=${p.id}` })),
      notes: notes.map((k) => ({ id: k.id, title: k.title, subtitle: k.kind, href: `/knowledge?item=${k.id}` })),
      repos: repos.map((r) => ({ id: r.fullName, title: r.fullName, subtitle: r.language ?? "", href: `/career/${r.fullName}` })),
      agents: want("agents")
        ? AGENTS.filter((a) => a.name.toLowerCase().includes(q)).map((a) => ({ id: a.id, title: a.name, subtitle: a.purpose, href: `/agents?id=${a.id}` }))
        : [],
    };
  } catch (err) {
    log.error({ err }, "palette search failed"); // never log the query
    return EMPTY;
  }
}
