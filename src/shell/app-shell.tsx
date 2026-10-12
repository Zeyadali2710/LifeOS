"use client";

import type { ReactNode } from "react";
import type { Health } from "@/server/health";
import { AIPanel } from "./ai-panel";
import { AskBar } from "./ask-bar";
import { Header } from "./header";
import { LiveProvider } from "./live-provider";
import { MoreSheet } from "./more-sheet";
import { NotificationsDrawer } from "./notifications-drawer";
import { Palette } from "./palette";
import { ShellProvider } from "./shell-provider";
import { TabBar } from "./tab-bar";

export function AppShell({
  owner,
  version,
  initialHealth,
  initialUnread,
  children,
}: {
  owner: { name: string; email: string };
  version: string;
  initialHealth: Health | null;
  initialUnread: number;
  children: ReactNode;
}) {
  return (
    <ShellProvider>
      <LiveProvider initialHealth={initialHealth} initialUnread={initialUnread}>
        <div className="relative h-dvh overflow-hidden">
          <div aria-hidden="true" className="canvas-glow pointer-events-none fixed inset-0 -z-10" />
          <a
            href="#main"
            className="glass-menu fixed top-2 left-2 z-[100] -translate-y-[200%] rounded-10 px-3 py-2 text-[13px] text-text focus:translate-y-0"
          >
            Skip to content
          </a>
          <Header owner={owner} version={version} />
          <main id="main" tabIndex={-1} className="absolute inset-0 overflow-x-hidden overflow-y-auto pt-[80px] outline-none tab:pt-[70px]">
            <div className="px-5 pt-3 pb-[calc(112px+env(safe-area-inset-bottom))] tab:px-8 tab:pt-9 tab:pb-[170px]">{children}</div>
          </main>
          <TabBar />
          <AskBar />
          <MoreSheet version={version} />
          <AIPanel />
          <NotificationsDrawer />
          <Palette />
        </div>
      </LiveProvider>
    </ShellProvider>
  );
}
