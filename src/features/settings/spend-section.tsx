"use client";
import s from "./settings.module.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTokens, formatUsd } from "@/lib/format";
import { setSpendCapAction } from "@/server/settings-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/controls";
import { Section } from "@/ui/layout";
import { Alert, EmptyState } from "@/ui/feedback";
import { FreePrivacy } from "./free-privacy";
import { Progress } from "@/ui/display";
type ModelRow = {
  model: string;
  label: string;
  input: number;
  output: number;
  cache: number;
  costUsd: number;
  turns: number;
};
export function SpendSection({ mtdUsd, capUsd, monthLabel, resetLabel, rows, freePrivateOk, }: {
  mtdUsd: number;
  capUsd: number;
  monthLabel: string;
  resetLabel: string;
  rows: ModelRow[];
  freePrivateOk: boolean;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const [value, setValue] = useState(String(capUsd));
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 1000;
  const dirty = valid && n !== capUsd;
  const pct = capUsd > 0 ? Math.round((mtdUsd / capUsd) * 100) : 0;
  async function save() {
    setBusy(true);
    const r = await setSpendCapAction(n);
    setBusy(false);
    if (r.ok) {
      toast(`Spend cap set to US$${n}`);
      router.refresh();
    }
    else
      toast("Couldn't save that. Try again.", "error");
  }
  return (<div className={s.stack}>
    <div className={s.spend}>
      {formatUsd(mtdUsd)} <span>of US${capUsd} this month</span>
    </div>
    <Progress value={pct} label={`${pct}% of US$${capUsd.toFixed(2)} · resets ${resetLabel}`} />
    <p className={s.note}>Sydney calendar month · {monthLabel} · at the cap, new runs are blocked and running work finishes · resets {resetLabel}
    </p>
    <form className={`${s.actions} ${s.capForm}`} onSubmit={e => {
      e.preventDefault(); if (dirty)
        void save();
    }}>
      <TextField className={s.capField} label="Monthly cap US$" type="number" min={1} max={1000} step={1} value={value} onChange={e => setValue(e.target.value)} />
      <Button type="submit" variant={dirty ? "primary" : "secondary"} disabled={!dirty || busy}>
        {busy ? "Saving…" : "Save cap"}
      </Button>
    </form>
    {valid && n < mtdUsd && <Alert tone="warn">This is below this month&apos;s spend (US${mtdUsd.toFixed(2)}). New runs will be blocked now.</Alert>}
    <Section id="model-spend" label="Spend by model">
      {rows.map(row => <div key={row.model} className={s.modelRow}>
        <span>{row.label}</span><span>{formatUsd(row.costUsd)}</span><span>{row.turns} turns</span>
      </div>)}
      <details className={s.disclosure}>
        <summary>Token usage details</summary>
      {rows.length === 0 ? <EmptyState title="No model spend this month" /> : <div className={s.tableScroll}>
        <table className={s.table}>
          <thead>
            <tr>
              {["Model", "Input", "Output", "Cache", "Cost"].map(h => <th scope="col" key={h}>
                {h}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => <tr key={r.model}>
              <th scope="row">
                {r.label}
              </th>
              <td>
                {formatTokens(r.input)}
              </td>
              <td>
                {formatTokens(r.output)}
              </td>
              <td>
                {formatTokens(r.cache)}
              </td>
              <td>
                {formatUsd(r.costUsd)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      </details>
    </Section>
    <FreePrivacy value={freePrivateOk} />
    <p className={s.note}>Mail, finance and knowledge data never reach a free model regardless of this setting.</p>
    <Section id="models" label="Models">
      <p className={s.body}>Orchestrator Opus 5.5 · Domain agents Sonnet 5.5 · Triage Haiku 4.5</p>
    </Section>
  </div>);
}
