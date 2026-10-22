"use client";
import s from "./settings.module.css";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CATEGORY, CATEGORY_KEYS, type CategoryKey } from "@/lib/calendar-categories";
import type { CalendarDTO } from "@/lib/calendar-types";
import { setCalendarCategoryAction, setCalendarSyncAction, setDefaultCalendarAction } from "@/server/calendar-settings-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Checkbox, Select } from "@/ui/controls";
const meta = (c: CalendarDTO) => (c.kind === "subscribed" ? "Subscribed" : c.access === "reader" ? "Read only" : "Owner · read and write");
export function CalendarList({ calendars, defaultOpen = false }: {
  calendars: CalendarDTO[];
  defaultOpen?: boolean;
}) {
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
  async function change(id: string, patch: (r: CalendarDTO[]) => CalendarDTO[], call: () => Promise<{
    ok: boolean;
  }>) {
    const before = rows;
    const want = patch(before);
    setRows((cur) => patch(cur));
    const r = await call().catch(() => ({ ok: false }));
    if (!r.ok) {
      // Undo only the fields this change set, so a concurrent edit to another row or field survives (WR-B12).
      setRows((cur) => cur.map((x) => {
        const b = before.find((y) => y.id === x.id);
        const w = want.find((y) => y.id === x.id);
        if (!b || !w)
          return x;
        const o: Record<string, unknown> = { ...x };
        for (const k of Object.keys(w) as (keyof CalendarDTO)[])
          if (w[k] !== b[k] && x[k] === w[k])
            o[k] = b[k];
        return o as unknown as CalendarDTO;
      }));
      return toast("Couldn't save that. Try again.", "error");
    }
    setSaved(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(undefined), 2000);
    router.refresh();
  }
  const patchOne = (id: string, p: Partial<CalendarDTO>) => (r: CalendarDTO[]) => r.map((c) => (c.id === id ? { ...c, ...p } : c));
  return (<details className={s.disclosure} open={defaultOpen || undefined}>
    <summary>
      {rows.length} calendars</summary>
    <ul className={s.list}>
      {rows.map(c => <li key={c.id} className={s.calendarRow}>
        <Checkbox label={`Sync ${c.name}`} checked={c.enabled} onChange={e => change(c.id, patchOne(c.id, e.target.checked ? { enabled: true } : { enabled: false, isDefault: false }), () => setCalendarSyncAction(c.id, e.target.checked))} />
        <span className={s.note}>
          {meta(c)}{saved === c.id && <span role="status"> · Saved</span>}
        </span>
        <Select label={`${c.name} category`} disabled={!c.enabled} value={c.category ?? ""} aria-invalid={c.enabled && !c.category ? true : undefined} onChange={e => { const v = e.target.value as CategoryKey; change(c.id, patchOne(c.id, { category: v }), () => setCalendarCategoryAction(c.id, v)); }}>
          <option value="" disabled>Choose…</option>
          {CATEGORY_KEYS.map(k => <option key={k} value={k}>
            {CATEGORY[k].label}
          </option>)}
        </Select>
        {c.enabled && !c.category && <p role="alert" className={s.error}>Choose a category.</p>}{c.enabled && c.access !== "reader" && <label className={s.check}>
          <input type="radio" name="default-calendar" checked={c.isDefault} onChange={() => change(c.id, r => r.map(x => ({ ...x, isDefault: x.id === c.id })), () => setDefaultCalendarAction(c.id))} />Default for new events</label>}
      </li>)}
    </ul>
    <p className={s.note}>New events use this calendar unless you pick another.</p>
    <p className={s.note}>Unticking a calendar hides its events in LifeOS. Nothing changes in Google or iCloud.</p>
  </details>);
}
