"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConnectionDTO } from "@/lib/agent-types";
import type { CalendarConnectionDTO } from "@/lib/calendar-types";
import { syncNowAction } from "@/server/settings-actions";
import { formatHM } from "@/server/time";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Section } from "@/ui/layout";
import { Alert } from "@/ui/feedback";
import s from "./settings.module.css";
import { Icon } from "@/ui/icon";
import type { EventSourceDTO } from "@/lib/outreach-types";
import { CalendarConnectionRow } from "./calendar-connection-row";
import { ConnectionRow, type RowStatus } from "./connection-row";
import { SocialConnections, type SocialConnectionsData } from "./social-connections";
import { OutreachConnections, type EventKeys } from "./outreach-connections";
import type { mailAccounts as loadMailAccounts } from "@/server/mail/accounts";
import { MailAccounts } from "./mail-accounts";
const SYNC_MS = 15 * 60000;
const expiry = (iso: string | null) => iso ? ` · expires ${new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" })}` : "";
const GOOGLE_NOTES: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. Nothing was saved.",
  scope: "Google didn't grant the required access. Reconnect your calendar account from Google Calendar, or add an email account and allow Gmail.",
  not_configured: "Google sign-in isn't set up on the server yet.",
};
export function ConnectionsSection({ connections, privacy, anthropic, calendarConnections, mailAccounts = [], googleResult, eventSources, eventKeys, socialConnections, socialRedirectUri, tiktokResult, }: {
  connections: ConnectionDTO[];
  privacy: Record<string, boolean>;
  anthropic: boolean;
  calendarConnections: CalendarConnectionDTO[];
  mailAccounts?: Awaited<ReturnType<typeof loadMailAccounts>>;
  googleResult: {
    google: string;
    n: number | null;
    gmail: boolean | null;
  } | null;
  eventSources: EventSourceDTO[];
  eventKeys: EventKeys;
  socialConnections: SocialConnectionsData;
  socialRedirectUri: string;
  tiktokResult: string | null;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [syncing, setSyncing] = useState(false);
  const or = connections.find((c) => c.id === "openrouter")!;
  const g = googleResult?.google;
  const [googleNote] = useState(() => GOOGLE_NOTES[g ?? ""]);
  const [googleOpen] = useState(g === "connected");
  // Announce the OAuth return once, then drop the params from the URL.
  useEffect(() => {
    if (!googleResult)
      return;
    if (g === "connected")
      toast(googleResult.gmail === null ? `Google Calendar connected · ${googleResult.n ?? 0} calendars` : `Google connected · Gmail replies ${googleResult.gmail ? "allowed" : "not allowed"}`);
    else if (!GOOGLE_NOTES[g ?? ""])
      toast("Couldn't save that. Try again.", "error");
    router.replace("/settings?section=connections");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const read = connections.find((c) => c.id === "github_read")!;
  const write = connections.find((c) => c.id === "github_write")!;
  const st = (c: ConnectionDTO): RowStatus => c.status;
  const refresh = () => router.refresh();
  async function sync() {
    setSyncing(true);
    const r = await syncNowAction();
    setSyncing(false);
    toast(r.ok ? "Sync started" : "Couldn't save that. Try again.", r.ok ? "success" : "error");
  }
  const readDetail = read.status === "none" ? ("Add a fine-grained read-only token to sync repositories, pull requests, issues and CI.") : (<span className={s.mono}>
    @{read.login} · ····{read.last4} · read-only{expiry(read.expiresAt)} · {read.repos.length} repositories
  </span>);
  const writeDetail = write.status === "none" ? ("Optional. Without it, LifeOS can read GitHub but can't create issues.") : (<span className={s.mono}>
    ····{write.last4} · issues: write · {write.repos.length} repositories{expiry(write.expiresAt)}
  </span>);
  const last = read.lastSyncAt ? new Date(read.lastSyncAt) : null;
  return <div className={s.groups}>
    <Section id="calendar-connections" label="Calendar">
      {calendarConnections.map(c => <CalendarConnectionRow key={c.id} conn={c} notice={c.id === "google_calendar" ? googleNote : undefined} open={c.id === "google_calendar" && googleOpen} />)}
    </Section>
    <MailAccounts accounts={mailAccounts} configured={calendarConnections.some(c => c.id === "google_calendar" && c.configured)} />
    <Section id="code-connections" label="Code">
      <ConnectionRow id="github_read" name="GitHub · read access" detail={readDetail} status={st(read)} noun="read" removeBody="Syncing stops and synced GitHub data stays until you reconnect." onChanged={refresh}>
        {read.status !== "none" && <details className={s.disclosure}>
          <summary>
            {read.repos.length} repositories</summary>
          <ul className={s.repoList}>
            {read.repos.map(repo => <li key={repo}>
              {repo}{privacy[repo] && <Icon name="lock" size={13} label="Private repository" />}
            </li>)}
          </ul>
          <div className={s.row}>
            {read.lastSyncError ? <Alert>Last sync failed {last ? formatHM(last) : ""}: {read.lastSyncError}
            </Alert> : <span className={s.note}>
              {last ? `Last synced ${formatHM(last)} · next about ${formatHM(new Date(last.getTime() + SYNC_MS))}` : "Not synced yet"}
            </span>}<Button size="sm" disabled={syncing} icon="refresh" onClick={sync}>
              {syncing ? "Starting…" : "Sync now"}
            </Button>
          </div>
        </details>}
      </ConnectionRow>
      <ConnectionRow id="github_write" name="GitHub · create issues" detail={writeDetail} status={st(write)} noun="write" removeBody="LifeOS can no longer create issues." onChanged={refresh} />
    </Section>
    <Section id="ai-connections" label="AI providers">
      <ConnectionRow name="Anthropic API" readOnly status={anthropic ? "connected" : "none"} detail={<>Set in the server environment (<span className={s.mono}>ANTHROPIC_API_KEY</span>). Not editable here.{anthropic && " Default model Opus 5.5"}
      </>} />
      <ConnectionRow id="openrouter" name="OpenRouter · free models" title="OpenRouter key" detail={or.status === "none" ? "Optional. Routine agent work runs on a free model at US$0. Without a key every run uses Anthropic, as today." : `••••${or.last4} · free model routing on`} status={st(or)} removeBody="Agent runs go back to Anthropic models only." onChanged={refresh} />
    </Section>
    <SocialConnections key={socialConnections.instagram?.credentialGeneration ?? "mock"} connections={socialConnections} redirectUri={socialRedirectUri} result={tiktokResult} />
    <Section id="outreach-connections" label="Outreach sources">
      <OutreachConnections sources={eventSources} keys={eventKeys} />
    </Section>
    <p className={s.note}>Tokens are encrypted and never shown again.</p>
  </div>;
}
