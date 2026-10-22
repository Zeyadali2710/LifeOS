"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { PALETTE_SCOPES, type PaletteData, type PaletteScope } from "@/lib/palette-types";
import { paletteSearchAction } from "@/server/palette-actions";
import { Icon } from "@/ui/icon";
import { useApprovalCount } from "./agent-status";
import { buildPalette, SCOPE_LABEL } from "./palette-items";
import { trapTab } from "@/ui/overlay";
import type { PaletteItem } from "./palette-items";
import { useShell } from "./shell-provider";
import s from "./shell.module.css";

export function Palette() {
  const { paletteOpen } = useShell();
  // Remount on each open so the query, scope and selection reset.
  return paletteOpen ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const router = useRouter();
  const { closePalette, openNotifications, openAI, signOut, isApple } = useShell();
  const approvalsWaiting = useApprovalCount();
  const dlg = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<PaletteScope>("all");
  const [sel, setSel] = useState(0);
  const [result, setResult] = useState<{ key: string; data: PaletteData } | null>(null);
  const mod = isApple ? "⌘" : "Ctrl ";

  // The dialog unmounts instead of closing, so the browser's own focus restore never runs. Runs before showModal moves focus.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus();
  }, []);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      closePalette();
    };
    d?.addEventListener("cancel", cancel);
    return () => d?.removeEventListener("cancel", cancel);
  }, [closePalette]);

  const q = query.trim();
  const key = `${scope}|${q}`;
  const searchable = scope !== "all" || q.length >= 2;
  useEffect(() => {
    if (!searchable) return;
    let stale = false;
    const t = setTimeout(() => {
      paletteSearchAction({ q, scope }).then(
        (data) => !stale && setResult({ key, data }),
        () => !stale && setResult(null),
      );
    }, 180);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, scope, key, searchable]);

  const current = result?.key === key ? result : null;
  const data = current && searchable ? current.data : undefined;
  const groups = useMemo(() => buildPalette(query, { approvalsWaiting, data, scope, mod }), [query, approvalsWaiting, data, scope, mod]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const idx = Math.min(sel, Math.max(0, flat.length - 1));
  const rowId = (i: PaletteItem) => `${listId}-${i.id}`;

  useEffect(() => {
    const active = flat[idx];
    if (active) document.getElementById(rowId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowId is derived from listId
  }, [idx, flat]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) {
      if (q) {
        closePalette();
        openAI(q);
      }
      return;
    }
    const r = item.run;
    closePalette();
    if (r.type === "nav") router.push(r.href);
    else if (r.type === "notifications") openNotifications();
    else if (r.type === "ai") openAI(r.prompt);
    else void signOut();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.nativeEvent.isComposing) return;
    trapTab(e.nativeEvent, e.currentTarget);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel(Math.min(flat.length - 1, idx + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel(Math.max(0, idx - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[idx]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = PALETTE_SCOPES.indexOf(scope);
      setScope(PALETTE_SCOPES[(i + (e.shiftKey ? PALETTE_SCOPES.length - 1 : 1)) % PALETTE_SCOPES.length]!);
      setSel(0);
    }
  };

  let k = -1;
  return (
    <dialog ref={dlg} aria-label="Command palette" className={s.palette} onKeyDown={onKeyDown} onClick={(e) => e.target === e.currentTarget && closePalette()}>
      <div className={s.palHead}>
        <Icon name="search" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          placeholder="Search LifeOS or ask a question"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={flat[idx] ? rowId(flat[idx]) : undefined}
          className={s.palInput}
        />
        <span className={s.mono} aria-hidden="true">
          ESC
        </span>
      </div>
      <div role="tablist" aria-label="Scope" className={s.scopes}>
        {PALETTE_SCOPES.map((sc) => (
          <button
            key={sc}
            type="button"
            role="tab"
            tabIndex={-1}
            aria-selected={scope === sc}
            className={s.scope}
            onClick={() => {
              setScope(sc);
              setSel(0);
            }}
          >
            {SCOPE_LABEL[sc]}
          </button>
        ))}
      </div>
      <div id={listId} role="listbox" aria-label="Results" className={s.palList}>
        {groups.length === 0 && <p className={s.palEmpty}>{searchable && !current ? "Searching…" : `Nothing in ${SCOPE_LABEL[scope]} matches “${q}”.`}</p>}
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className={s.palGroup} aria-hidden="true">
              {g.label}
            </div>
            {g.items.map((it) => {
              const i = ++k;
              return (
                <button
                  key={it.id}
                  id={rowId(it)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === idx}
                  className={s.palItem}
                  onClick={() => run(it)}
                  onMouseMove={() => i !== idx && setSel(i)}
                >
                  <span className={s.palItemMain}>
                    <Icon name={it.icon} size={18} />
                    <span className={s.palLabel}>{it.label}</span>
                  </span>
                  {it.hint && <span className={s.palHint}>{it.hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className={s.palFoot} aria-hidden="true">
        <span>↑↓ MOVE</span>
        <span>↵ OPEN</span>
        <span>TAB SCOPE</span>
        <span>{mod.trim()}J ASK</span>
      </div>
    </dialog>
  );
}
