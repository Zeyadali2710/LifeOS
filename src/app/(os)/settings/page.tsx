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
import { mailAccounts } from "@/server/mail/accounts";
import { formatHM, tzLabel } from "@/server/time";
import { ConnectionsSection } from "@/settings/connections-section";
import { OutreachSection } from "@/settings/outreach-section";
import { SettingsNav } from "@/settings/settings-nav";
import { SpendSection } from "@/settings/spend-section";
import { SignOut } from "../sign-out";

export const metadata = { title: "Settings · LifeOS" };
export const dynamic = "force-dynamic";

const GOOGLE_RESULTS = ["connected", "cancelled", "state", "scope", "failed", "not_configured"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string; google?: string; n?: string; gmail?: string; tiktok?: string }> }) {
  await requireOwner();
  const { section: raw, google: g, n, gmail, tiktok } = await searchParams;
  const section = raw === "ai" || raw === "outreach" ? raw : "connections";
  const googleResult = g && GOOGLE_RESULTS.includes(g) ? { google: g, n: n && /^\d{1,4}$/.test(n) ? Number(n) : null, gmail: gmail === "1" ? true : gmail === "0" ? false : null } : null;
  const now = new Date();
  const h = db();

  let body;
  if (section === "ai") {
    const [{ mtdUsd, capUsd }, by] = await Promise.all([capStatus(h, now), spendByModel(h, now)]);
    const { end, label } = sydneyMonthBounds(now);
    const day = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(end);
    body = (
      <SpendSection
        mtdUsd={mtdUsd}
        capUsd={capUsd}
        monthLabel={label}
        resetLabel={`${day} ${formatHM(end)} ${tzLabel(end)}`}
        rows={by.map((r) => ({ ...r, label: MODEL_LABELS[r.model] ?? r.model }))}
      />
    );
  } else if (section === "outreach") {
    const [row] = await h.select({ v: settings.value }).from(settings).where(eq(settings.key, INTERESTS_KEY));
    const stored = row?.v;
    body = <OutreachSection interests={Array.isArray(stored) && stored.every((x) => typeof x === "string") ? (stored as string[]) : DEFAULT_INTERESTS} />;
  } else {
    const [connections, eventSources, eventKeys] = await Promise.all([getConnections(h), listEventSources(h), eventKeyStatus(h)]);
    const names = connections.flatMap((c) => c.repos);
    const priv = names.length
      ? await h.select({ n: githubRepos.fullName, p: githubRepos.private }).from(githubRepos).where(inArray(githubRepos.fullName, names))
      : [];
    body = (
      <ConnectionsSection
        connections={connections}
        privacy={Object.fromEntries(priv.map((r) => [r.n, Boolean(r.p)]))}
        anthropic={Boolean(env().ANTHROPIC_API_KEY)}
        freePrivateOk={await getFreePrivateOk(h)}
        calendarConnections={await getCalendarConnections(h, { googleConfigured: Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET) })}
        googleResult={googleResult}
        mailAccounts={await mailAccounts(h)}
        eventSources={eventSources}
        eventKeys={eventKeys}
        socialConnections={await socialConnectionStatus(h)}
        socialRedirectUri={`${env().BETTER_AUTH_URL.replace(/\/$/, "")}/api/connections/tiktok/callback`}
        tiktokResult={tiktok && ["connected", "cancelled", "state", "scope", "failed", "not_configured"].includes(tiktok) ? tiktok : null}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium tracking-[.12em] text-text-2">SETTINGS</div>
          <h1 className="mt-2.5 font-display text-[clamp(34px,4.4vw,60px)] leading-[.95] font-normal tracking-[-0.015em]">
            {section === "ai" ? "AI and spend" : section === "outreach" ? "Outreach" : "Connections"}
          </h1>
        </div>
        <SignOut />
      </header>
      <div className="flex flex-col gap-6 tab:flex-row">
        <SettingsNav current={section} />
        <div className="min-w-0 flex-[1_1_560px]">{body}</div>
      </div>
    </div>
  );
}
