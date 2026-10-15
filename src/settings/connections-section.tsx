"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConnectionDTO } from "@/lib/agent-types";
import type { CalendarConnectionDTO } from "@/lib/calendar-types";
import { setFreePrivateAction, syncNowAction } from "@/server/settings-actions";
import { formatHM } from "@/server/time";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Disclosure } from "@/ui/disclosure";
import { Icon } from "@/ui/icon";
import type { EventSourceDTO } from "@/lib/outreach-types";
import { CalendarConnectionRow } from "./calendar-connection-row";
import { ConnectionRow, type RowStatus } from "./connection-row";
import { SocialConnections, type SocialConnectionsData } from "./social-connections";
import { OutreachConnections, type EventKeys } from "./outreach-connections";

const SYNC_MS = 15 * 60_000;
const expiry = (iso: string | null) =>
  iso ? ` · expires ${new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" })}` : "";
const mono = "font-mono";
const GOOGLE_NOTES: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. Nothing was saved.",
  scope: "Google didn't grant calendar access. Connect again and allow calendar access.",
  not_configured: "Google sign-in isn't set up on the server yet.",
};

export function ConnectionsSection({
  connections,
  privacy,
  anthropic,
  freePrivateOk,
  calendarConnections,
  googleResult,
  eventSources,
  eventKeys,
  socialConnections, socialRedirectUri, tiktokResult,
}: {
  connections: ConnectionDTO[];
  privacy: Record<string, boolean>;
  anthropic: boolean;
  freePrivateOk: boolean;
  calendarConnections: CalendarConnectionDTO[];
  googleResult: { google: string; n: number | null; gmail: boolean | null } | null;
  eventSources: EventSourceDTO[];
  eventKeys: EventKeys;
  socialConnections: SocialConnectionsData; socialRedirectUri: string; tiktokResult: string | null;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [syncing, setSyncing] = useState(false);
  const [priv, setPriv] = useState(freePrivateOk);
  const or = connections.find((c) => c.id === "openrouter")!;
  const g = googleResult?.google;
  const [googleNote] = useState(() => GOOGLE_NOTES[g ?? ""]);
  const [googleOpen] = useState(g === "connected");

  // Announce the OAuth return once, then drop the params from the URL.
  useEffect(() => {
    if (!googleResult) return;
    if (g === "connected") toast(googleResult.gmail === null ? `Google Calendar connected · ${googleResult.n ?? 0} calendars` : `Google reconnected · Gmail ${googleResult.gmail ? "allowed" : "not allowed"}`);
    else if (!GOOGLE_NOTES[g ?? ""]) toast("Couldn't save that. Try again.", "error");
    router.replace("/settings?section=connections");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function togglePrivate(next: boolean) {
    setPriv(next);
    const r = await setFreePrivateAction(next).catch(() => ({ ok: false }));
    if (!r.ok) {
      setPriv(!next);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast(next ? "Private data allowed on free models" : "Private data kept off free models");
    router.refresh();
  }
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

  const readDetail =
    read.status === "none" ? (
      "Add a fine-grained read-only token to sync repositories, pull requests, issues and CI."
    ) : (
      <span className={mono}>
        @{read.login} · ····{read.last4} · read-only{expiry(read.expiresAt)} · {read.repos.length} repositories
      </span>
    );
  const writeDetail =
    write.status === "none" ? (
      "Optional. Without it, LifeOS can read GitHub but can't create issues."
    ) : (
      <span className={mono}>
        ····{write.last4} · issues: write · {write.repos.length} repositories{expiry(write.expiresAt)}
      </span>
    );
  const last = read.lastSyncAt ? new Date(read.lastSyncAt) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[14px] text-text-2">Accounts LifeOS reads from and, with your approval, acts on. Tokens are encrypted and never shown again.</p>
      <div className="flex flex-col gap-3">
        <ConnectionRow
          id="github_read"
          tile="GH"
          name="GitHub · read access"
          detail={readDetail}
          status={st(read)}
          noun="read"
          removeBody="Syncing stops and synced GitHub data stays until you reconnect."
          onChanged={refresh}
        >
          {read.status !== "none" && (
            <div className="glass-card rounded-24 p-4">
              <Disclosure summary={<span className="text-[13px] text-text-2">{read.repos.length} repositories</span>}>
                <ul className="mt-2 max-h-[240px] overflow-y-auto">
                  {read.repos.map((r) => (
                    <li key={r} className={`flex items-center gap-1.5 py-1 text-[12px] ${mono}`}>
                      {r}
                      {privacy[r] && <Icon name="lock" size={13} className="text-text-3" />}
                    </li>
                  ))}
                </ul>
              </Disclosure>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[rgba(255,255,255,.07)] pt-3">
                {read.lastSyncError ? (
                  <span className={`text-[11px] text-red ${mono}`}>
                    Last sync failed {last ? formatHM(last) : ""}: {read.lastSyncError}
                  </span>
                ) : (
                  <span className={`text-[11px] text-text-3 ${mono}`}>
                    {last ? `Last synced ${formatHM(last)} · next about ${formatHM(new Date(last.getTime() + SYNC_MS))}` : "Not synced yet"}
                  </span>
                )}
                <Button variant="secondary" size="xs" loading={syncing} onClick={sync}>
                  <Icon name="refresh" size={14} />
                  Sync now
                </Button>
              </div>
            </div>
          )}
        </ConnectionRow>
        <ConnectionRow
          id="github_write"
          tile="GH"
          name="GitHub · create issues"
          detail={writeDetail}
          status={st(write)}
          noun="write"
          removeBody="LifeOS can no longer create issues."
          onChanged={refresh}
        />
        <ConnectionRow
          id="openrouter"
          tile="OR"
          name="OpenRouter · free models"
          title="OpenRouter key"
          detail={
            or.status === "none" ? (
              "Optional. Routine agent work runs on a free model at US$0. Without a key every run uses Anthropic, as today."
            ) : (
              <span className={mono}>····{or.last4} · free model routing on</span>
            )
          }
          status={st(or)}
          removeBody="Agent runs go back to Anthropic models only."
          onChanged={refresh}
        >
          {or.status !== "none" && (
            <div className="flex items-start gap-3 glass-card rounded-24 p-4">
              <input
                id="free-private"
                type="checkbox"
                role="switch"
                className="mt-1 size-4 shrink-0"
                checked={priv}
                onChange={(e) => togglePrivate(e.target.checked)}
              />
              <div className="max-w-[520px]">
                <label htmlFor="free-private" className="text-[14.5px] font-medium">
                  Allow private data (private repos, calendar and tasks) to be sent to free models (may be logged by provider)
                </label>
                <p className="text-[12.5px] text-text-3">
                  Off: any run that touches a private repository, your calendar or your tasks switches to Claude Sonnet before private data is sent. Free providers may log or train on prompts.
                </p>
              </div>
            </div>
          )}
        </ConnectionRow>
        <ConnectionRow
          tile="AI"
          name="Anthropic API"
          readOnly
          status={anthropic ? "connected" : "none"}
          detail={
            <>
              Set in the server environment (<span className={mono}>ANTHROPIC_API_KEY</span>). Not editable here.
              {anthropic && " Default model Opus 5.5"}
            </>
          }
        />
        {calendarConnections.map((c) => (
          <CalendarConnectionRow key={c.id} conn={c} notice={c.id === "google_calendar" ? googleNote : undefined} open={c.id === "google_calendar" && googleOpen} />
        ))}
        <OutreachConnections sources={eventSources} keys={eventKeys} />
        <SocialConnections key={socialConnections.instagram?.credentialGeneration ?? "mock"} connections={socialConnections} redirectUri={socialRedirectUri} result={tiktokResult} />
      </div>
    </div>
  );
}
