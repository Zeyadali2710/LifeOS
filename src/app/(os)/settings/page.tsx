import { eq, inArray } from "drizzle-orm";
import { DEFAULT_INTERESTS, INTERESTS_KEY } from "@/lib/outreach-types";
import { getCalendarConnections } from "@/server/calendar/connections";
import { getFreePrivateOk } from "@/server/agents/routing";
import { MODEL_LABELS } from "@/server/agents/registry";
import { sydneyMonthBounds } from "@/server/agents/pricing";
import { capStatus, spendByModel } from "@/server/agents/spend";
import { db } from "@/server/db/client";
import { githubRepos, settings } from "@/server/db/schema";
import { env } from "@/server/env";
import { getConnections } from "@/server/github/connections";
import { eventKeyStatus } from "@/server/outreach/connections";
import { listEventSources } from "@/server/outreach/sources";
import { socialConnectionStatus } from "@/server/socials/connections";
import { requireOwner } from "@/server/session";
import { settingsModelTurns } from "@/server/settings-view";
import { mailAccounts } from "@/server/mail/accounts";
import { formatHM, tzLabel } from "@/server/time";
import { ConnectionsSection } from "@/features/settings/connections-section";
import { OutreachSection } from "@/features/settings/outreach-section";
import { SettingsNav } from "@/features/settings/settings-nav";
import { SpendSection } from "@/features/settings/spend-section";
import { BriefingsSection } from "@/features/settings/briefings-section";
import { getSchedule } from "@/server/briefings";
import { SettingsSignOut } from "@/features/settings/settings-sign-out";
import { Page, PageHeader } from "@/ui/layout";
import styles from "@/features/settings/settings.module.css";
export const metadata = { title: "Settings · LifeOS" };
export const dynamic = "force-dynamic";
const GOOGLE_RESULTS = ["connected", "cancelled", "state", "scope", "failed", "not_configured"];
export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{
    section?: string;
    google?: string;
    n?: string;
    gmail?: string;
    tiktok?: string;
  }>;
}) {
  await requireOwner();
  const { section: raw, google: g, n, gmail, tiktok } = await searchParams;
  const section = raw === "ai" || raw === "outreach" || raw === "briefings" ? raw : "connections";
  const googleResult = g && GOOGLE_RESULTS.includes(g) ? { google: g, n: n && /^\d{1,4}$/.test(n) ? Number(n) : null, gmail: gmail === "1" ? true : gmail === "0" ? false : null } : null;
  const now = new Date();
  const h = db();
  let body;
  if (section === "ai") {
    const [{ mtdUsd, capUsd }, by, turns] = await Promise.all([capStatus(h, now), spendByModel(h, now), settingsModelTurns(h, now)]);
    const { end, label } = sydneyMonthBounds(now);
    const day = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(end);
    body = (<SpendSection freePrivateOk={await getFreePrivateOk(h)} mtdUsd={mtdUsd} capUsd={capUsd} monthLabel={label} resetLabel={`${day} ${formatHM(end)} ${tzLabel(end)}`} rows={by.map((r) => ({ ...r, label: MODEL_LABELS[r.model] ?? r.model, turns: turns.find((t) => t.model === r.model)?.turns ?? 0 }))} />);
  }
  else if (section === "briefings") {
    body = <BriefingsSection schedule={await getSchedule(h)} />;
  }
  else if (section === "outreach") {
    const [row] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, INTERESTS_KEY));
    const stored = row?.v;
    body = <OutreachSection interests={Array.isArray(stored) && stored.every((x) => typeof x === "string") ? (stored as string[]) : DEFAULT_INTERESTS} />;
  }
  else {
    const [connections, eventSources, eventKeys] = await Promise.all([getConnections(h), listEventSources(h), eventKeyStatus(h)]);
    const names = connections.flatMap((c) => c.repos);
    const priv = names.length
      ? await h.select({ n: githubRepos.fullName, p: githubRepos.private }).from(githubRepos).where(inArray(githubRepos.fullName, names))
      : [];
    body = (<ConnectionsSection connections={connections} privacy={Object.fromEntries(priv.map((r) => [r.n, Boolean(r.p)]))} anthropic={Boolean(env().ANTHROPIC_API_KEY)} calendarConnections={await getCalendarConnections(h, { googleConfigured: Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET) })} googleResult={googleResult} mailAccounts={await mailAccounts(h)} eventSources={eventSources} eventKeys={eventKeys} socialConnections={await socialConnectionStatus(h)} socialRedirectUri={`${env().BETTER_AUTH_URL.replace(/\/$/, "")}/api/connections/tiktok/callback`} tiktokResult={tiktok && ["connected", "cancelled", "state", "scope", "failed", "not_configured"].includes(tiktok) ? tiktok : null} />);
  }
  return <Page label="Settings" className={styles.page}>
    <PageHeader title="Settings" actions={<SettingsSignOut />} />
    <div className={styles.bodyLayout}>
      <SettingsNav current={section} />
      <div key={section} className={styles.content}>
        {body}
      </div>
    </div>
  </Page>;
}
