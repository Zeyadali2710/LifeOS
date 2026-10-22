"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ToastView } from "@/ui/overlay";
import { matchShortcut } from "./shortcuts";

type ToastState = { id: number; message: string; kind: "success" | "error"; action?: { label: string; onClick: () => void } } | null;

type Shell = {
  paletteOpen: boolean;
  openPalette(): void;
  closePalette(): void;
  aiOpen: boolean;
  aiPrompt: string | null;
  openAI(prompt?: string): void;
  closeAI(): void;
  consumeAIPrompt(): string | null;
  notifOpen: boolean;
  openNotifications(): void;
  closeNotifications(): void;
  moreOpen: boolean;
  setMoreOpen(v: boolean): void;
  toast(message: string, kind?: "success" | "error", action?: { label: string; onClick: () => void }): void;
  signOut(): Promise<void>;
  isApple: boolean;
};

const Ctx = createContext<Shell | null>(null);

export function useShell(): Shell {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell must be used inside <ShellProvider>");
  return v;
}

const noopSubscribe = () => () => {};
const detectApple = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export function ShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toastState, setToastState] = useState<ToastState>(null);
  const isApple = useSyncExternalStore(noopSubscribe, detectApple, () => false);

  const promptRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastId = useRef(0);

  const closeAll = useCallback(() => {
    setPaletteOpen(false);
    setAiOpen(false);
    setNotifOpen(false);
    setMoreOpen(false);
  }, []);
  const openPalette = useCallback(() => {
    closeAll();
    setPaletteOpen(true);
  }, [closeAll]);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openAI = useCallback(
    (prompt?: string) => {
      promptRef.current = prompt ?? null;
      setAiPrompt(prompt ?? null);
      closeAll();
      setAiOpen(true);
    },
    [closeAll],
  );
  const closeAI = useCallback(() => setAiOpen(false), []);
  const consumeAIPrompt = useCallback(() => {
    const p = promptRef.current;
    promptRef.current = null;
    setAiPrompt(null);
    return p;
  }, []);
  const openNotifications = useCallback(() => {
    closeAll();
    setNotifOpen(true);
  }, [closeAll]);
  const closeNotifications = useCallback(() => setNotifOpen(false), []);

  const toast = useCallback((message: string, kind: "success" | "error" = "success", action?: { label: string; onClick: () => void }) => {
    clearTimeout(toastTimer.current);
    setToastState({ id: ++toastId.current, message, kind, action });
    toastTimer.current = setTimeout(() => setToastState(null), kind === "error" ? 5000 : 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const signOut = useCallback(async () => {
    // better-auth reports failures as { error }; a throw (network) counts too. Never pretend we signed out.
    const res = await authClient.signOut().catch(() => null);
    if (!res || res.error) {
      toast("Couldn't sign out. Try again.", "error");
      return;
    }
    router.replace("/login");
    router.refresh();
  }, [router, toast]);

  // Route changes close overlays and reset the main scroll to the top.
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    document.getElementById("main")?.scrollTo({ top: 0 });
    const t = setTimeout(closeAll, 0);
    return () => clearTimeout(t);
  }, [pathname, closeAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a dialog or list already handled it
      const a = matchShortcut(e);
      if (!a) return;
      if (a.type === "escape") {
        // Native dialogs handle their own Esc; this covers the menus and sheets.
        if (moreOpen) setMoreOpen(false);
        return;
      }
      e.preventDefault();
      switch (a.type) {
        case "palette":
          if (paletteOpen) setPaletteOpen(false);
          else openPalette();
          break;
        case "ai":
          if (aiOpen) setAiOpen(false);
          else openAI();
          break;
        case "nav":
          closeAll();
          router.push(a.href);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, aiOpen, moreOpen, openPalette, openAI, closeAll, router]);

  const value = useMemo<Shell>(
    () => ({
      paletteOpen, openPalette, closePalette, aiOpen, aiPrompt, openAI, closeAI, consumeAIPrompt,
      notifOpen, openNotifications, closeNotifications, moreOpen, setMoreOpen, toast, signOut, isApple,
    }),
    [paletteOpen, openPalette, closePalette, aiOpen, aiPrompt, openAI, closeAI, consumeAIPrompt, notifOpen, openNotifications, closeNotifications, moreOpen, toast, signOut, isApple],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite">
        {toastState && <ToastView key={toastState.id} message={toastState.message} tone={toastState.kind} action={toastState.action} />}
      </div>
    </Ctx.Provider>
  );
}
