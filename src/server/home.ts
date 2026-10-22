import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { composeBriefing, rankPriorities, type Digest, type Priority } from "@/lib/digest";
import type { ApprovalDTO, RunDTO } from "@/lib/agent-types";
import type { ActivityDTO } from "@/lib/live-types";
import type { ProjectCardDTO } from "@/lib/project-types";
import type { DB } from "./db/client";
import { briefings, mailMessages } from "./db/schema";
import { listApprovals } from "./agents/approvals";
import { agentsOverview } from "./agents/queries";
import { loadDigest } from "./digest";
import { recentActivity } from "./events";
import { loadFinance } from "./finance";
import { listFollowUps } from "./mail/queries";
import { loadActiveProjects } from "./project-queries";
import { clock, greeting, sydneyParts, TZ, tzLabel } from "./time";

export type HomeAgent = { id: string; name: string; status: string; live: boolean; lastRun: RunDTO | null; task: string | null };

export type HomeData = {
  dateLine: string;
  briefing: { id: string; at: string } | null;
  greeting: string;
  headline: string;
  digest: Digest;
  priorities: Priority[];
  approvals: ApprovalDTO[];
  agents: HomeAgent[];
  activity: ActivityDTO[];
  finance: { month: string; spent: number; net: number; over: { category: string; actual: number; limit: number } | null; uncategorised: number; hasData: boolean } | null;
  projects: ProjectCardDTO[];
  outreach: { important: number; mails: { id: string; from: string; subject: string; at: string }[]; tonight: { title: string; start: string; stage: string } | null; followUps: { n: number; first: string | null } };
};

const soft = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

/** Everything Home shows. Each source fails soft; only the digest is required. */
export async function loadHome(h: DB, now: Date, ownerName: string): Promise<HomeData> {
  const p = sydneyParts(now);
  const month = `${p.year}-${String(p.month).padStart(2, "0")}`;
  const unread = sql`'UNREAD' = any(${mailMessages.labelIds})`;
  const live = and(isNull(mailMessages.archivedAt), sql`'INBOX' = any(${mailMessages.labelIds})`, unread, inArray(mailMessages.category, ["IMPORTANT", "OPPORTUNITIES"]));
  const [digest, approvals, overview, activity, fin, projects, mails, [mailN], follow, [brief]] = await Promise.all([
    loadDigest(h, now),
    soft(listApprovals(h, "pending"), []),
    soft(agentsOverview(h, now), null),
    soft(recentActivity(h, 40), []),
    soft(loadFinance(h, { month, account: "", category: "", search: "", page: 0 }), null),
    soft(loadActiveProjects(h, now), []),
    soft(
      h.select({ id: mailMessages.id, fromName: mailMessages.fromName, fromAddress: mailMessages.fromAddress, subject: mailMessages.subject, at: mailMessages.receivedAt }).from(mailMessages).where(live).orderBy(desc(mailMessages.receivedAt)).limit(3),
      [],
    ),
    soft(h.select({ n: sql<number>`count(*)::int` }).from(mailMessages).where(live), [{ n: 0 }]),
    soft(listFollowUps(h), []),
    soft(h.select({ id: briefings.id, at: briefings.createdAt }).from(briefings).where(eq(briefings.period, digest0(now))).orderBy(desc(briefings.createdAt)).limit(1), []),
  ]);

  const first = ownerName.trim().split(/\s+/)[0] ?? "";
  const over = fin?.budgets
    .filter((b) => b.limit !== null && b.actual > b.limit)
    .sort((a, b) => b.actual - b.limit! - (a.actual - a.limit!))[0];
  const today = digest.today;
  const tonight = digest.outreach.find((e) => e.start.slice(0, 10) <= today && ["ATTENDING", "INTERESTED"].includes(e.stage)) ?? null;

  return {
    dateLine: homeDateLine(now),
    briefing: brief ? { id: brief.id, at: clock(brief.at) } : null,
    greeting: `${greeting(now)}${first ? `, ${first}` : ""}.`,
    headline: composeBriefing("morning", today, digest).headline,
    digest,
    priorities: rankPriorities(digest),
    approvals,
    agents: (overview?.agents ?? []).map((a) => ({ id: a.id, name: a.name, status: a.status, live: a.live, lastRun: a.stats?.last ?? null, task: a.currentTask })),
    activity: activity.filter((a) => a.type.startsWith("agent.")).slice(0, 4),
    finance: fin
      ? {
          month,
          spent: fin.summary.spending,
          net: fin.summary.cashflow,
          over: over ? { category: over.category, actual: over.actual, limit: over.limit! } : null,
          uncategorised: fin.summary.unclassified,
          hasData: fin.summary.count > 0,
        }
      : null,
    projects,
    outreach: {
      important: mailN?.n ?? 0,
      mails: mails.map((m) => ({ id: m.id, from: m.fromName || m.fromAddress, subject: m.subject, at: m.at.toISOString() })),
      tonight: tonight ? { title: tonight.title, start: tonight.start, stage: tonight.stage } : null,
      followUps: { n: follow.length, first: follow[0] ? `${follow[0].context.kind === "event" ? follow[0].title : follow[0].context.sender}${follow[0].dueDate ? ` · due ${follow[0].dueDate}` : ""}` : null },
    },
  };
}

/** "THURSDAY 22 OCTOBER · SYDNEY · 9:41 AEDT" */
export function homeDateLine(now: Date): string {
  const day = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now).replace(",", "");
  return `${day} · SYDNEY · ${clock(now)} ${tzLabel(now)}`.toUpperCase();
}

// The briefing period key for today (morning/midday/evening share the Sydney date).
function digest0(now: Date) {
  const p = sydneyParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
