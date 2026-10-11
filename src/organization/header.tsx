"use client";

import { useRef, useState } from "react";
import { syncCalendarsNowAction } from "@/server/calendar-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";

export type ViewKey = "day" | "week" | "month";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function Lead({ text }: { text: string }) {
  const m = /(\d+ conflicts?)/.exec(text);
  if (!m) return <>{text}</>;
  const i = m.index;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-red">{m[1]}</span>
      {text.slice(i + m[1]!.length)}
    </>
  );
}

export function OrganizationHeader({
  headline,
  lead,
  view,
  rangeText,
  showToday,
  canWrite,
  connected,
  onNav,
  onToday,
  onView,
  onNewEvent,
  onConnect,
}: {
  headline: string;
  lead: string;
  view: ViewKey;
  rangeText: string;
  showToday: boolean;
  canWrite: boolean;
  connected: boolean;
  onNav(dir: -1 | 1): void;
  onToday(): void;
  onView(v: ViewKey): void;
  onNewEvent(): void;
  onConnect(): void;
}) {
  const { toast } = useShell();
  const [sync, setSync] = useState<"idle" | "pending" | "ok" | "fail">("idle");
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const runSync = async () => {
    setSync("pending");
    try {
      const r = await syncCalendarsNowAction();
      setSync(r.ok ? "ok" : "fail");
      if (!r.ok) toast("Calendar sync failed. Try again.", "error");
    } catch {
      setSync("fail");
      toast("Calendar sync failed. Try again.", "error");
    }
  };

  const onRadioKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + VIEWS.length) % VIEWS.length;
    onView(VIEWS[n]!.key);
    radios.current[n]?.focus();
  };

  const iconBtn =
    "grid size-8 place-items-center rounded-8 border border-[rgba(255,255,255,.1)] bg-fill-1 text-text-2 hover:bg-[rgba(255,255,255,.06)] hover:text-text max-tab:size-11";
  const unit = view;

  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="font-mono text-[11px] font-medium tracking-[0.12em] text-[#4fd1a1]">ORGANIZATION</div>
        <h1 className="mt-2 text-[clamp(28px,3vw,40px)] leading-[1.1] font-medium tracking-[-0.025em]">{headline}</h1>
        <p className="mt-2 text-[14px] leading-normal text-text-2">
          <Lead text={lead} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showToday && (
          <Button variant="ghost" className="h-8" onClick={onToday}>
            Today
          </Button>
        )}
        <button type="button" className={iconBtn} aria-label={`Previous ${unit}`} onClick={() => onNav(-1)}>
          <Icon name="chevron_left" size={18} />
        </button>
        <button type="button" className={iconBtn} aria-label={`Next ${unit}`} onClick={() => onNav(1)}>
          <Icon name="chevron_right" size={18} />
        </button>
        <span aria-live="polite" className="min-w-[120px] text-center font-mono text-[12px] text-text-2">
          {rangeText}
        </span>
        <div role="radiogroup" aria-label="Calendar view" className="flex rounded-9 border border-[rgba(255,255,255,.1)] bg-fill-1 p-0.5">
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              ref={(el) => {
                radios.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={view === v.key}
              tabIndex={view === v.key ? 0 : -1}
              onClick={() => onView(v.key)}
              onKeyDown={(e) => onRadioKey(e, i)}
              className={`h-7 rounded-7 px-3 text-[12.5px] font-medium max-tab:h-11 ${view === v.key ? "bg-fill-3 text-text" : "text-text-2 hover:text-text"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {connected && (
          <button type="button" className={iconBtn} aria-label="Sync calendars" disabled={sync === "pending"} onClick={runSync}>
            <Icon name="refresh" size={17} className={sync === "pending" ? "animate-[lo-spin_.7s_linear_infinite]" : ""} />
          </button>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {sync === "ok" ? "Sync started" : sync === "fail" ? "Sync failed" : ""}
        </span>
        {canWrite ? (
          <Button variant="primary" className="h-8 max-tab:fixed max-tab:right-4 max-tab:bottom-[calc(76px+env(safe-area-inset-bottom))] max-tab:z-30 max-tab:size-14 max-tab:rounded-full max-tab:p-0" aria-label="New event" onClick={onNewEvent}>
            <Icon name="add" size={18} />
            <span className="max-tab:hidden">New event</span>
          </Button>
        ) : (
          <Button variant="secondary" className="h-8" onClick={onConnect}>
            Connect a calendar
          </Button>
        )}
      </div>
    </header>
  );
}
