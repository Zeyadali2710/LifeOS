"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTokens, formatUsd } from "@/lib/format";
import { setSpendCapAction } from "@/server/settings-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Progress } from "@/ui/progress";

type ModelRow = { model: string; label: string; input: number; output: number; cache: number; costUsd: number };

const label = "font-mono text-[11px] font-medium tracking-[0.12em] text-text-3 uppercase";

export function SpendSection({
  mtdUsd,
  capUsd,
  monthLabel,
  resetLabel,
  rows,
}: {
  mtdUsd: number;
  capUsd: number;
  monthLabel: string;
  resetLabel: string;
  rows: ModelRow[];
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
    } else toast("Couldn't save that. Try again.", "error");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 glass-card rounded-26 px-4 py-3.5">
        <div className="max-w-[420px]">
          <label htmlFor="spend-cap" className="text-[14.5px] font-medium">
            Monthly spend cap
          </label>
          <p className="text-[12.5px] text-text-3">
            New runs are blocked once this month&apos;s spend reaches the cap. Runs already in progress finish. The month runs on Sydney time.
          </p>
          {valid && n < mtdUsd && (
            <p className="mt-1.5 text-[12.5px] text-amber">
              This is below this month&apos;s spend (US${mtdUsd.toFixed(2)}). New runs will be blocked now.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-[140px]">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-text-3">US$</span>
            <Input id="spend-cap" type="number" min={1} max={1000} step={1} className="pl-11" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button variant={dirty ? "primary" : "secondary"} disabled={!dirty} loading={busy} onClick={save}>
            Save cap
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 glass-card rounded-26 px-4 py-3.5">
        <span className={label}>This month · {monthLabel}</span>
        <span className="text-[22px] leading-[1.2] font-medium tracking-[-0.02em]">{formatUsd(mtdUsd)}</span>
        <Progress value={mtdUsd} max={capUsd} label={`${pct}% of US$${capUsd.toFixed(2)} · resets ${resetLabel}`} />
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="font-mono text-[10.5px] tracking-[0.08em] text-text-3">
                <tr>
                  {["MODEL", "INPUT", "OUTPUT", "CACHE", "COST"].map((h, i) => (
                    <th key={h} scope="col" className={`py-1.5 font-medium ${i > 0 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono text-[12px]">
                {rows.map((r) => (
                  <tr key={r.model} className="border-t border-white/[.10]">
                    <td className="py-1.5 font-sans">{r.label}</td>
                    <td className="text-right">{formatTokens(r.input)}</td>
                    <td className="text-right">{formatTokens(r.output)}</td>
                    <td className="text-right">{formatTokens(r.cache)}</td>
                    <td className="text-right">{formatUsd(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card rounded-26 px-4 py-3.5">
        <div className="text-[14.5px] font-medium">Models</div>
        <p className="text-[12.5px] text-text-3">Orchestrator Opus 5.5 · Domain agents Sonnet 5.5 · Triage Haiku 4.5</p>
      </div>
    </div>
  );
}
