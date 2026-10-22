"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import type { AgentStatusDTO } from "@/lib/agent-types";
import type { Health } from "@/server/health";
import { MOTION_KEY } from "@/ui/motion";
import { AgentStatusProvider } from "./agent-status";
import { AskDrawer } from "./ask-drawer";
import { LiveProvider } from "./live-provider";
import { Masthead, MoreSheet, TabBar } from "./masthead";
import { NotificationsDrawer } from "./notifications-drawer";
import { Palette } from "./palette";
import { ShellProvider } from "./shell-provider";
import s from "./shell.module.css";

export function AppShell({
  owner,
  version,
  initialHealth,
  initialUnread,
  initialStatus,
  children,
}: {
  owner: { name: string; email: string };
  version: string;
  initialHealth: Health | null;
  initialUnread: number;
  initialStatus: AgentStatusDTO | null;
  children: ReactNode;
}) {
  // Restore the in-page Motion toggle (Agents) before anything animates.
  useEffect(() => {
    try {
      if (localStorage.getItem(MOTION_KEY) === "off") document.documentElement.dataset.motion = "off";
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <ShellProvider>
      <LiveProvider initialHealth={initialHealth} initialUnread={initialUnread}>
        <AgentStatusProvider initial={initialStatus}>
          <div className={s.root}>
            <a href="#main" className={s.skip}>
              Skip to content
            </a>
            <Masthead owner={owner} version={version} />
            <main id="main" tabIndex={-1} className={s.main}>
              {children}
            </main>
            <TabBar />
            <MoreSheet version={version} />
            <Palette />
            <AskDrawer />
            <NotificationsDrawer />
          </div>
        </AgentStatusProvider>
      </LiveProvider>
    </ShellProvider>
  );
}
