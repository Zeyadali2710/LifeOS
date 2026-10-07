"use client";

import type { ReactNode } from "react";
import type { Health } from "@/server/health";
import { AIPanel } from "./ai-panel";
import { BottomBar } from "./bottom-bar";
import { CommandBar } from "./command-bar";
import { LiveProvider } from "./live-provider";
import { MoreSheet } from "./more-sheet";
import { NotificationsDrawer } from "./notifications-drawer";
import { Palette } from "./palette";
import { ShellProvider } from "./shell-provider";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({
  owner,
  version,
  initialCompact,
  initialHealth,
  initialUnread,
  children,
}: {
  owner: { name: string; email: string };
  version: string;
  initialCompact: boolean;
  initialHealth: Health | null;
  initialUnread: number;
  children: ReactNode;
}) {
  return (
    <ShellProvider initialCompact={initialCompact}>
      <LiveProvider initialHealth={initialHealth} initialUnread={initialUnread}>
        <div className="flex h-dvh overflow-hidden">
          <a
            href="#main"
            className="fixed top-2 left-2 z-[100] -translate-y-[200%] rounded-8 border border-[rgba(255,255,255,.10)] bg-raised px-3 py-2 text-[13px] text-text focus:translate-y-0"
          >
            Skip to content
          </a>
          <Sidebar version={version} />
          <div className="@container/main flex min-w-0 flex-1 flex-col">
            <TopBar owner={owner} />
            <main id="main" tabIndex={-1} className="relative min-h-0 flex-1 outline-none">
              <div className="h-full overflow-x-hidden overflow-y-auto pb-[calc(var(--bottombar-h)+env(safe-area-inset-bottom))] tab:pb-0">{children}</div>
              <CommandBar />
              <NotificationsDrawer />
            </main>
          </div>
          <AIPanel />
          <BottomBar />
          <MoreSheet />
          <Palette />
        </div>
      </LiveProvider>
    </ShellProvider>
  );
}
