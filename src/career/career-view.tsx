"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CareerDTO } from "@/lib/project-types";
import { syncNowAction } from "@/server/settings-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { EmptyState } from "@/legacy-ui/empty-state";
import { Icon } from "@/legacy-ui/icon";
import { SectionHeader } from "@/legacy-ui/section-header";
import { StatusTile } from "@/legacy-ui/status-tile";
import { ActivityFeed } from "./activity-feed";
import { RepoCard, relativeTime } from "./repo-card";

const SEG = "h-[26px] rounded-full px-3.5 text-[12.5px]";

export function CareerView({ data, now }: { data: CareerDTO; now: string }) {
  const router = useRouter();
  const { toast } = useShell();
  const [syncing, setSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { connection, tiles } = data;

  if (connection.status === "none") {
    return (
      <EmptyState
        icon="deployed_code"
        title="GitHub isn't connected"
        body="Connect GitHub to see your repositories, pull requests and CI here. LifeOS only reads; it never changes anything on GitHub."
        action={
          <Link href="/settings" className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[.03] px-3.5 text-[13px] font-medium text-text hover:bg-white/[.06]">
            Open Settings
          </Link>
        }
      />
    );
  }

  async function sync() {
    setSyncing(true);
    const r = await syncNowAction();
    setSyncing(false);
    if (r.ok) router.refresh();
    else toast("Couldn't sync. Try again.", "error");
  }

  const repos = data.repos.filter((r) => showArchived || !r.archived);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-3">
          <StatusTile label="Repositories" value={String(tiles.repos)} dot="amber" />
          <StatusTile label="Open PRs" value={String(tiles.openPrs)} dot="indigo" />
          <StatusTile label="Your open issues" value={String(tiles.openIssues)} dot="indigo" />
          <StatusTile label="CI failing" value={String(tiles.ciFailing)} dot={tiles.ciFailing > 0 ? "red" : "green"} />
        </div>
        <div className="ml-auto flex h-8 items-center gap-2">
          <Link href="/projects" className="inline-flex items-center gap-1.5 text-[12.5px] text-cyan">
            View projects <Icon name="arrow_forward" size={14} />
          </Link>
          <Button variant="secondary" loading={syncing} onClick={sync}>
            <Icon name="refresh" size={15} />
            Sync now
          </Button>
        </div>
      </div>

      {connection.status === "error" && (
        <div role="alert" className="rounded-24 border border-[rgba(255,105,97,.3)] bg-[rgba(255,105,97,.06)] p-5 text-[13.5px] text-text-2">
          GitHub sync failed: {connection.lastSyncError}. Showing the last data we have. Try Sync now, or check the connection in Settings.
        </div>
      )}

      <div className="grid gap-6 desk:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="career-repos">
          <SectionHeader id="career-repos" label="REPOSITORIES" meta={`${repos.length} repos · synced ${relativeTime(connection.lastSyncAt, now)}`} />
          <div className="mb-3 inline-flex rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className={`${SEG} ${showArchived ? "bg-white/10 text-text" : "text-text-2"}`}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          </div>
          {repos.length === 0 ? (
            <EmptyState
              icon="deployed_code"
              title="No repositories synced yet"
              body="Your first sync may still be running. Use Sync now, or check that your token can see the repositories you expect."
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
              {repos.map((r) => (
                <RepoCard key={r.id} repo={r} now={now} />
              ))}
            </div>
          )}
        </section>
        <section aria-labelledby="career-live">
          <SectionHeader id="career-live" label="LIVE FROM GITHUB" meta="newest first" />
          <ActivityFeed items={data.activity} now={now} label="Live from GitHub" empty="No GitHub activity yet." />
        </section>
      </div>
    </>
  );
}
