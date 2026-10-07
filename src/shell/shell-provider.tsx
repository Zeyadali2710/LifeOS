"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { matchShortcut } from "./shortcuts";
import { Toast } from "./toast";
import type { ToastState } from "./toast";

type Shell = {
  compact: boolean;
  toggleCompact(): void;
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
  toast(message: string, kind?: "success" | "error"): void;
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

export function ShellProvider({ initialCompact, children }: { initialCompact: boolean; children: ReactNode }) {
  const router = useRouter();
  const [compact, setCompact] = useState(initialCompact);
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

  const toggleCompact = useCallback(() => {
    if (window.innerWidth < 1100) return;
    const next = !compact;
    document.cookie = `lo_nav=${next ? "compact" : "full"}; path=/; max-age=31536000; samesite=lax`;
    setCompact(next);
  }, [compact]);

  const openPalette = useCallback(() => {
    setAiOpen(false);
    setNotifOpen(false);
    setMoreOpen(false);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openAI = useCallback((prompt?: string) => {
    promptRef.current = prompt ?? null;
    setAiPrompt(prompt ?? null);
    setPaletteOpen(false);
    setMoreOpen(false);
    setAiOpen(true);
  }, []);
  const closeAI = useCallback(() => setAiOpen(false), []);
  const consumeAIPrompt = useCallback(() => {
    const p = promptRef.current;
    promptRef.current = null;
    setAiPrompt(null);
    return p;
  }, []);
  const openNotifications = useCallback(() => {
    setPaletteOpen(false);
    setMoreOpen(false);
    setNotifOpen(true);
  }, []);
  const closeNotifications = useCallback(() => setNotifOpen(false), []);

  const toast = useCallback((message: string, kind: "success" | "error" = "success") => {
    clearTimeout(toastTimer.current);
    setToastState({ id: ++toastId.current, message, kind });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a dialog already handled it
      const a = matchShortcut(e);
      if (!a) return;
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
        case "compact":
          toggleCompact();
          break;
        case "nav":
          setPaletteOpen(false);
          setNotifOpen(false);
          setMoreOpen(false);
          router.push(a.href);
          break;
        case "escape":
          if (paletteOpen) setPaletteOpen(false);
          else if (notifOpen) setNotifOpen(false);
          else if (aiOpen) setAiOpen(false);
          else if (moreOpen) setMoreOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, aiOpen, notifOpen, moreOpen, openPalette, openAI, toggleCompact, router]);

  const value = useMemo<Shell>(
    () => ({
      compact, toggleCompact, paletteOpen, openPalette, closePalette, aiOpen, aiPrompt, openAI, closeAI, consumeAIPrompt,
      notifOpen, openNotifications, closeNotifications, moreOpen, setMoreOpen, toast, signOut, isApple,
    }),
    [compact, toggleCompact, paletteOpen, openPalette, closePalette, aiOpen, aiPrompt, openAI, closeAI, consumeAIPrompt, notifOpen, openNotifications, closeNotifications, moreOpen, toast, signOut, isApple],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toast toast={toastState} />
    </Ctx.Provider>
  );
}
