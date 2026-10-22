"use client";

import { useId, useState, type ReactNode } from "react";
import { aud } from "@/lib/finance";
import type { loadFinance } from "@/server/finance";
import { Checkbox } from "@/legacy-ui/field";
import { Button } from "@/legacy-ui/button";

type Summary = Awaited<ReturnType<typeof loadFinance>>["summary"];
type Months = Summary["monthly"];
const colours = ["#64d2ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff6961", "#5e5ce6", "#66d4cf", "#ff9ed1"];
const panel = "glass-card min-w-0 rounded-24 p-5";
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });
const compact = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

function Tooltip({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <div id={id} role="tooltip" className="pointer-events-none absolute top-1 right-1 z-10 max-w-[calc(100%-8px)] rounded-14 border border-white/15 bg-[#171c28] px-3 py-2 text-[12px] shadow-xl"><strong className="block text-text">{title}</strong><div className="mt-1 space-y-1 text-text-2">{children}</div></div>;
}

function Point({ label, tip, onSelect, onClear, children }: { label: string; tip?: string; onSelect(): void; onClear(): void; children: ReactNode }) {
  return <g role="button" tabIndex={0} aria-label={label} aria-describedby={tip} className="cursor-pointer outline-none focus:[&_.point-dot]:stroke-white focus:[&_.point-dot]:stroke-2" onPointerEnter={onSelect} onPointerLeave={onClear} onFocus={onSelect} onBlur={onClear} onClick={onSelect} onKeyDown={e => { if (e.key === "Escape") onClear(); if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>{children}</g>;
}

export function CashflowChart({ months }: { months: Months }) {
  const [active, setActive] = useState<number | null>(null), tip = useId(), title = useId();
  const max = Math.max(1, ...months.flatMap(m => [Math.abs(m.income), Math.abs(m.spending)]));
  const width = Math.max(640, months.length * 46), step = (width - 50) / months.length;
  const picked = active === null ? null : months[active];
  return <section className={panel} aria-labelledby={title}>
    <h2 id={title} className="text-[15px] font-medium">Income and spending</h2>
    <p className="mt-1 text-[12px] text-text-3">Monthly totals in the selected range. Hover, focus or tap a month for values. Months without imports have no recorded data.</p>
    <div className="mt-4 flex gap-4 text-[12px]"><span className="text-green">● Income</span><span className="text-cyan">● Spending</span></div>
    <div className="relative mt-4">
      {picked && <Tooltip id={tip} title={monthLabel(picked.month)}>{picked.count ? <><p>Income: {aud(picked.income)}</p><p>Spending: {aud(picked.spending)}</p><p>Net cash flow: {aud(picked.cashflow)}</p></> : <p>No imported data</p>}</Tooltip>}
      <div className="overflow-x-auto"><svg role="group" aria-label="Monthly income and spending chart" viewBox={`0 0 ${width} 260`} className="h-[250px] w-full" style={{ minWidth: width }}>
        <line x1="30" y1="132" x2={width - 10} y2="132" stroke="rgba(255,255,255,.15)" />
        <text x="1" y="135" fill="#98989d" fontSize="10">$0</text>
        {months.map((m, i) => {
          const x = 35 + step * i;
          return <Point key={m.month} label={`${monthLabel(m.month)}: ${m.count ? `income ${aud(m.income)}, spending ${aud(m.spending)}, net cash flow ${aud(m.cashflow)}` : "No imported data"}`} tip={active === i ? tip : undefined} onSelect={() => setActive(i)} onClear={() => setActive(null)}>
            <rect x={x} y="8" width={step} height="242" fill={active === i ? "rgba(255,255,255,.04)" : "transparent"} />
            <rect x={x + step * .12} y={m.income >= 0 ? 132 - m.income / max * 100 : 132} width={step * .3} height={Math.abs(m.income) / max * 100} rx="3" fill="#30d158" />
            <rect x={x + step * .48} y={m.spending >= 0 ? 132 - m.spending / max * 100 : 132} width={step * .3} height={Math.abs(m.spending) / max * 100} rx="3" fill="#64d2ff" />
            <text x={x + step * .45} y="251" textAnchor="middle" fill="#98989d" fontSize="10">{monthLabel(m.month)}</text>
          </Point>;
        })}
      </svg></div>
    </div>
    <details className="mt-3 text-[12px] text-text-2"><summary className="cursor-pointer">View month-by-month figures</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Monthly imported cash flow</caption><thead><tr>{["Month", "Income", "Spending", "Net cash flow"].map(v => <th key={v} className="p-2">{v}</th>)}</tr></thead><tbody>{months.map(m => <tr key={m.month} className="border-t border-white/[.06]"><th scope="row" className="p-2 font-normal">{m.month}</th>{[m.income, m.spending, m.cashflow].map((v, i) => <td key={i} className="p-2 whitespace-nowrap">{m.count ? aud(v) : "No data"}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}

export function TrendChart({ months, metric, title, colour, helper }: { months: Months; metric: "cumulativeSavings" | "cashflow" | "cumulativeCashflow"; title: string; colour: string; helper: string }) {
  const [active, setActive] = useState<number | null>(null), tip = useId(), heading = useId();
  const width = Math.max(340, months.length * 30), height = 220;
  const min = Math.min(0, ...months.map(m => m[metric])), max = Math.max(0, ...months.map(m => m[metric]));
  const lo = min === max ? -100 : min, hi = min === max ? 100 : max;
  const span = hi - lo || 100;
  const x = (i: number) => 52 + (months.length === 1 ? (width - 70) / 2 : i * (width - 70) / (months.length - 1));
  const y = (value: number) => 22 + (hi - value) / span * 145;
  const cumulative = metric !== "cashflow";
  const hasData = months.some(m => m.count > 0);
  const picked = active === null ? null : months[active];
  const path = months.map((m, i) => `${i === 0 || (!cumulative && !months[i - 1]?.count) ? "M" : "L"}${x(i)},${y(m[metric])}`).filter((_, i) => cumulative || months[i]!.count > 0).join(" ");
  const latest = months.at(-1)!;
  return <section className={panel} aria-labelledby={heading}>
    <h2 id={heading} className="text-[15px] font-medium">{title}</h2><p className="mt-1 min-h-10 text-[12px] text-text-3">{helper}</p>
    <p className="mt-3 font-display text-[27px]">{hasData && (cumulative || latest.count) ? aud(latest[metric]) : "No data"}</p>
    {!hasData ? <p className="grid h-[220px] place-items-center text-[13px] text-text-3">No transactions in this range.</p> : <div className="relative mt-2">
      {picked && <Tooltip id={tip} title={monthLabel(picked.month)}>{picked.count || cumulative ? <p>{title}: {aud(picked[metric])}</p> : <p>No imported data</p>}{!picked.count && cumulative && <p>No imports this month; recorded total carried forward.</p>}</Tooltip>}
      <div className="overflow-x-auto"><svg role="group" aria-label={`${title} chart`} viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" style={{ minWidth: width }}>
        {[hi, 0, ...(lo < 0 ? [lo] : [])].filter((v, i, all) => all.indexOf(v) === i).map(v => <g key={v}><line x1="48" y1={y(v)} x2={width - 8} y2={y(v)} stroke="rgba(255,255,255,.1)" /><text x="44" y={y(v) + 3} textAnchor="end" fill="#98989d" fontSize="10">{compact(v)}</text></g>)}
        <path d={path} stroke={colour} strokeWidth="2.5" fill="none" />
        {months.map((m, i) => <Point key={m.month} label={`${monthLabel(m.month)}: ${m.count || cumulative ? `${title} ${aud(m[metric])}` : "No imported data"}`} tip={active === i ? tip : undefined} onSelect={() => setActive(i)} onClear={() => setActive(null)}>
          <rect x={x(i) - 13} y="0" width="26" height="205" fill="transparent" />
          {(m.count > 0 || cumulative) && <circle className="point-dot" cx={x(i)} cy={y(m[metric])} r={active === i ? 5 : 3.5} fill={colour} />}
          {(months.length < 13 || i % Math.ceil(months.length / 10) === 0 || i === months.length - 1) && <text x={x(i)} y="201" textAnchor="middle" fill="#98989d" fontSize="9">{monthLabel(m.month)}</text>}
        </Point>)}
      </svg></div>
    </div>}
    <details className="mt-2 text-[12px] text-text-2"><summary className="cursor-pointer">View values</summary><ul className="mt-2 max-h-52 space-y-2 overflow-auto">{months.map(m => <li key={m.month} className="flex justify-between gap-3"><span>{monthLabel(m.month)}</span><span>{hasData && (m.count || cumulative) ? aud(m[metric]) : "No data"}</span></li>)}</ul></details>
  </section>;
}

export function SpendingChart({ categories }: { categories: Summary["categories"] }) {
  const [hidden, setHidden] = useState<string[]>([]), [active, setActive] = useState<string | null>(null), tip = useId(), heading = useId();
  const selected = categories.filter(c => !hidden.includes(c.name));
  const total = selected.reduce((n, c) => n + c.amount, 0);
  const positive = selected.filter(c => c.amount > 0), positiveTotal = positive.reduce((n, c) => n + c.amount, 0);
  const picked = categories.find(c => c.name === active);
  const segments: { name: string; percent: number; offset: number; colour: string }[] = [];
  let offset = 0;
  for (const c of positive) {
    const percent = c.amount / positiveTotal * 100;
    segments.push({ name: c.name, percent, offset, colour: colours[categories.findIndex(row => row.name === c.name) % colours.length]! });
    offset += percent;
  }
  function toggle(name: string) { setHidden(hidden.includes(name) ? hidden.filter(n => n !== name) : [...hidden, name]); setActive(null); }
  return <section className={panel} aria-labelledby={heading}><h2 id={heading} className="text-[15px] font-medium">Where the money went</h2>
    {!categories.length ? <p className="mt-8 text-[13px] text-text-3">Import transactions to see your spending breakdown.</p> : <>
      <p className="mt-1 text-[12px] text-text-3">Toggle categories to update this pie and its selected total. Hover, focus or tap slices for values.</p>
      <div className="relative mx-auto my-5 max-w-64">
        {picked && <Tooltip id={tip} title={picked.name}><p>{picked.group} · {aud(picked.amount)}</p>{picked.amount > 0 && !hidden.includes(picked.name) && <p>{(picked.amount / positiveTotal * 100).toFixed(1)}% of selected positive spending</p>}</Tooltip>}
        <svg role="group" aria-label="Spending by category chart" viewBox="0 0 220 220" className="w-full">
          <circle cx="110" cy="110" r="78" stroke="rgba(255,255,255,.06)" strokeWidth="27" fill="none" />
          {segments.map(s => <Point key={s.name} label={`${s.name}: ${aud(categories.find(c => c.name === s.name)!.amount)}`} tip={active === s.name ? tip : undefined} onSelect={() => setActive(s.name)} onClear={() => setActive(null)}><circle cx="110" cy="110" r="78" pathLength="100" stroke={s.colour} strokeWidth={active === s.name ? 32 : 27} strokeDasharray={`${s.percent} ${100 - s.percent}`} strokeDashoffset={-s.offset} transform="rotate(-90 110 110)" fill="none" className="point-dot" /></Point>)}
          <text x="110" y="105" textAnchor="middle" fill="#98989d" fontSize="11">Selected spending</text><text x="110" y="128" textAnchor="middle" fill="white" fontSize="19">{aud(total)}</text>
        </svg>
      </div>
      <div className="mb-3 flex gap-2"><Button variant="ghost" size="xs" onClick={() => { setHidden([]); setActive(null); }}>Show all</Button><Button variant="ghost" size="xs" onClick={() => { setHidden(categories.map(c => c.name)); setActive(null); }}>Hide all</Button></div>
      <ul className="max-h-80 space-y-2 overflow-auto text-[13px]">{categories.map((c, i) => <li key={c.name} className={`flex items-center gap-2 ${hidden.includes(c.name) ? "opacity-50" : ""}`} onPointerEnter={() => setActive(c.name)} onPointerLeave={() => setActive(null)}><Checkbox aria-label={`Include ${c.name}`} checked={!hidden.includes(c.name)} onChange={() => toggle(c.name)} label={<span className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: colours[i % colours.length] }} /><span>{c.group} › {c.name}</span></span>} hitArea /><span className="ml-auto whitespace-nowrap font-mono text-[12px]">{aud(c.amount)}</span></li>)}</ul>
      <p className="mt-3 text-[11.5px] text-text-3">Refunds offset their spending category. Net credits remain in the selected total and legend; donut slices show positive spending.</p>
    </>}
  </section>;
}
