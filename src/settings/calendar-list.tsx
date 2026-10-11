"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CATEGORY, CATEGORY_KEYS, type CategoryKey } from "@/lib/calendar-categories";
import type { CalendarDTO } from "@/lib/calendar-types";
import { setCalendarCategoryAction, setCalendarSyncAction, setDefaultCalendarAction } from "@/server/calendar-settings-actions";
import { useShell } from "@/shell/shell-provider";
import { Disclosure } from "@/ui/disclosure";
import { Checkbox, Select } from "@/ui/field";

const meta = (c: CalendarDTO) => (c.kind === "subscribed" ? "Subscribed" : c.access === "reader" ? "Read only" : "Owner · read and write");

export function CalendarList({ calendars, defaultOpen = false }: { calendars: CalendarDTO[]; defaultOpen?: boolean }) {
  const router = useRouter();
  const { toast } = useShell();
  const [rows, setRows] = useState(calendars);
  const [prev, setPrev] = useState(calendars);
  if (calendars !== prev) {
    setPrev(calendars); // server data refreshed: adopt it
    setRows(calendars);
  }
  const [saved, setSaved] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Optimistic: apply, call, revert + toast on failure. No per-change toast on success.
  async function change(id: string, patch: (r: CalendarDTO[]) => CalendarDTO[], call: () => Promise<{ ok: boolean }>) {
    const before = rows;
    const want = patch(before);
    setRows((cur) => patch(cur));
    const r = await call().catch(() => ({ ok: false }));
    if (!r.ok) {
      // Undo only the fields this change set, so a concurrent edit to another row or field survives (WR-B12).
      setRows((cur) =>
        cur.map((x) => {
          const b = before.find((y) => y.id === x.id);
          const w = want.find((y) => y.id === x.id);
          if (!b || !w) return x;
          const o: Record<string, unknown> = { ...x };
          for (const k of Object.keys(w) as (keyof CalendarDTO)[]) if (w[k] !== b[k] && x[k] === w[k]) o[k] = b[k];
          return o as unknown as CalendarDTO;
        }),
      );
      return toast("Couldn't save that. Try again.", "error");
    }
    setSaved(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(undefined), 2000);
    router.refresh();
  }

  const patchOne = (id: string, p: Partial<CalendarDTO>) => (r: CalendarDTO[]) => r.map((c) => (c.id === id ? { ...c, ...p } : c));

  return (
    <Disclosure summary={<span className="text-[13px] text-text-2">{rows.length} calendars</span>} defaultOpen={defaultOpen}>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-10 border border-[rgba(255,255,255,.07)] bg-inset px-3 py-2.5">
            <Checkbox
              hitArea
              label="Sync"
              checked={c.enabled}
              onChange={(e) => change(c.id, patchOne(c.id, e.target.checked ? { enabled: true } : { enabled: false, isDefault: false }), () => setCalendarSyncAction(c.id, e.target.checked))}
            />
            <div className="min-w-[140px] flex-1">
              <div className="text-[13.5px]">{c.name}</div>
              <div className="text-[12px] text-text-3">
                {meta(c)}
                {saved === c.id && <span aria-live="polite"> · Saved</span>}
              </div>
            </div>
            <div className="flex w-full items-center gap-2 tab:w-[188px]">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: c.category ? CATEGORY[c.category].color : "transparent", border: c.category ? undefined : "1px solid var(--color-text-3, #888)" }} />
              <div className="min-w-0 flex-1">
                <Select
                  aria-label="Category"
                  disabled={!c.enabled}
                  value={c.category ?? ""}
                  aria-invalid={c.enabled && !c.category ? true : undefined}
                  onChange={(e) => {
                    const v = e.target.value as CategoryKey;
                    change(c.id, patchOne(c.id, { category: v }), () => setCalendarCategoryAction(c.id, v));
                  }}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {CATEGORY_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY[k].label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {c.enabled && !c.category && <p className="w-full text-[12.5px] text-red">Choose a category.</p>}
            {c.enabled && c.access !== "reader" && (
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-text-2 tab:min-h-0">
                <input
                  type="radio"
                  name="default-calendar"
                  className="size-4 accent-[#8b8cff]"
                  checked={c.isDefault}
                  onChange={() => change(c.id, (r) => r.map((x) => ({ ...x, isDefault: x.id === c.id })), () => setDefaultCalendarAction(c.id))}
                />
                Default for new events
              </label>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-text-3">New events use this calendar unless you pick another.</p>
      <p className="text-[12px] text-text-3">Unticking a calendar hides its events in LifeOS. Nothing changes in Google or iCloud.</p>
    </Disclosure>
  );
}
