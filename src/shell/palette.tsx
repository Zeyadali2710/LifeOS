"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "@/ui/icon";
import { Kbd } from "@/ui/kbd";
import { paletteSearchAction } from "@/server/palette-actions";
import { buildPalette } from "./palette-items";
import type { PaletteData, PaletteItem, PaletteScope } from "./palette-items";
import { useAgentStatus } from "./use-agent-status";
import { useShell } from "./shell-provider";
import { useDialog } from "./use-dialog";

export function Palette() {
  const { paletteOpen } = useShell();
  // Remount on each open so query/selection reset.
  return paletteOpen ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const router = useRouter();
  const { closePalette, openNotifications, openAI, signOut, isApple } = useShell();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const approvalsWaiting = useAgentStatus().status?.approvalsWaiting ?? 0;
  const ref = useDialog<HTMLDivElement>(true, closePalette, { modal: true, initialFocus: () => inputRef.current });

  const [data, setData] = useState<PaletteData | undefined>();
  const [scope, setScope] = useState<PaletteScope>("all");
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let stale = false;
    const t = setTimeout(() => {
      paletteSearchAction(q).then(
        (d) => !stale && setData(d),
        () => !stale && setData(undefined),
      );
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);
  const shown = query.trim().length >= 2 ? data : undefined;
  const hasData = Boolean(shown && (shown.events.length || shown.tasks.length));

  const { groups, noMatch } = useMemo(() => buildPalette(query, { approvalsWaiting, data: shown, scope }), [query, approvalsWaiting, shown, scope]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const rowId = (i: PaletteItem) => `${listId}-${i.id}`;
  const active = flat[Math.min(sel, flat.length - 1)];

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    const r = item.run;
    closePalette();
    switch (r.type) {
      case "nav":
        router.push(r.href);
        break;
      case "notifications":
        openNotifications();
        break;
      case "ai":
        openAI(r.prompt);
        break;
      case "signout":
        void signOut();
        break;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSel(Math.min(sel + 1, flat.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSel(Math.max(sel - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setSel(0);
        break;
      case "End":
        e.preventDefault();
        setSel(flat.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        run(active);
        break;
      case "Tab":
        e.preventDefault(); // D-06 scopes: All -> Events -> Tasks; no-op without search results
        if (hasData) {
          setScope(scope === "all" ? "events" : scope === "events" ? "tasks" : "all");
          setSel(0);
        }
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <div aria-hidden="true" className="absolute inset-0 animate-[lo-fade_120ms_ease-out] bg-black/30" onClick={closePalette} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="absolute glass-palette top-[12vh] left-1/2 z-[71] w-[min(680px,94vw)] -translate-x-1/2 animate-[lo-rise_.16s_ease-out] overflow-hidden rounded-30"
      >
        <div className="flex h-14 items-center gap-3 border-b border-white/[.06] px-4">
          <Icon name="search" size={20} className="text-text-3" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={active ? rowId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search pages or type a command"
            placeholder="Search pages or type a command…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // A new query drops the old hits and scope, so stale results can't be opened and Commands/Jump to come back (WR-B09).
              setScope("all");
              setData(undefined);
              // Default to the best match, not the Ask row; Ask stays one ArrowUp away (and is the only row when nothing matches).
              setSel(buildPalette(e.target.value, { approvalsWaiting, scope: "all" }).noMatch || !e.target.value.trim() ? 0 : 1);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-text-3"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-[min(420px,52vh)] overflow-y-auto px-2 pt-1.5 pb-2.5">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-labelledby={`${listId}-g-${g.label}`.replace(/\s/g, "-")}>
              <div id={`${listId}-g-${g.label}`.replace(/\s/g, "-")} className="px-2.5 pt-2.5 pb-1.5 font-mono text-[10.5px] tracking-[.12em] text-text-3 uppercase">
                {g.label}
              </div>
              {g.items.map((item) => {
                const selected = item === active;
                return (
                  <div
                    key={item.id}
                    id={rowId(item)}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setSel(flat.indexOf(item))}
                    onClick={() => run(item)}
                    className={`flex h-[42px] cursor-pointer items-center gap-3 rounded-14 px-3 text-[13.5px] ${selected ? "bg-white/[.10] text-text" : "text-text-2"}`}
                  >
                    <span
                      className={`grid size-[26px] shrink-0 place-items-center rounded-7 border border-white/[.06] bg-white/[.04] ${selected ? "text-text" : "text-text-3"}`}
                    >
                      <Icon name={item.icon} size={17} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="font-mono text-[11px] text-text-3">{item.hint}</span>}
                    <span aria-hidden="true" className={`font-mono text-[11px] text-text-3 ${selected ? "" : "invisible"}`}>
                      ↵
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {noMatch && <p className="px-4 py-7 text-center text-[13px] text-text-2">No commands or pages match. Press ↵ to ask LifeOS instead.</p>}
        </div>
        <div className="flex items-center gap-4 border-t border-white/[.06] px-4 py-2.5 font-mono text-[11px] text-text-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          {hasData && <span>tab {scope === "all" ? "events" : scope === "events" ? "tasks" : "all"}</span>}
          <span>esc close</span>
          <span className="flex-1" />
          <span className="text-cyan">{isApple ? "⌘ J" : "Ctrl J"} ask LifeOS</span>
        </div>
      </div>
    </div>
  );
}
