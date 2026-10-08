import { inArray } from "drizzle-orm";
import { MODEL_LABELS } from "@/server/agents/registry";
import { sydneyMonthBounds } from "@/server/agents/pricing";
import { capStatus, spendByModel } from "@/server/agents/spend";
import { db } from "@/server/db/client";
import { githubRepos } from "@/server/db/schema";
import { env } from "@/server/env";
import { getConnections } from "@/server/github/connections";
import { requireOwner } from "@/server/session";
import { formatHM, tzLabel } from "@/server/time";
import { ConnectionsSection } from "@/settings/connections-section";
import { SettingsNav } from "@/settings/settings-nav";
import { SpendSection } from "@/settings/spend-section";
import { SignOut } from "../sign-out";

export const metadata = { title: "Settings · LifeOS" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  await requireOwner();
  const { section: raw } = await searchParams;
  const section = raw === "ai" ? "ai" : "connections";
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
  } else {
    const connections = await getConnections(h);
    const names = connections.flatMap((c) => c.repos);
    const priv = names.length
      ? await h.select({ n: githubRepos.fullName, p: githubRepos.private }).from(githubRepos).where(inArray(githubRepos.fullName, names))
      : [];
    body = (
      <ConnectionsSection
        connections={connections}
        privacy={Object.fromEntries(priv.map((r) => [r.n, Boolean(r.p)]))}
        anthropic={Boolean(env().ANTHROPIC_API_KEY)}
      />
    );
  }

  return (
    <div className="max-w-[1280px]">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-medium tracking-[0.12em] text-text-2">SETTINGS</div>
          <h1 className="mt-2 text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]">
            {section === "ai" ? "AI and spend" : "Connections"}
          </h1>
        </div>
        <SignOut />
      </header>
      <div className="flex flex-col gap-7 tab:flex-row">
        <SettingsNav current={section} />
        <div className="min-w-0 flex-1">{body}</div>
      </div>
    </div>
  );
}
