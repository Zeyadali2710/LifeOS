"use client";

import { useState, type ReactNode } from "react";
import { aud } from "@/lib/finance";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/controls";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { Card } from "@/ui/layout";
import type { FinanceData } from "./finance-view";
import { chartScale } from "./chart-model";
import s from "./finances.module.css";

type Months = FinanceData['summary']['monthly'];
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' });
export function PanelHead({ icon, title, sub, action }: { icon: IconName; title: string; sub?: string; action?: ReactNode }) {
  return <div className={s.panelHead}><div className={s.panelTitle}><span className={s.iconChip}><Icon name={icon} size={19} /></span><div><h2>{title}</h2>{sub && <p className={s.sub}>{sub}</p>}</div></div>{action}</div>;
}

export function CashflowChart({ months, ranges }: { months: Months; ranges: ReactNode }) {
  const [active, setActive] = useState<number | null>(null);
  const width = Math.max(600, months.length * 48), step = (width - 60) / months.length;
  const scale = chartScale(months.flatMap(m => [m.income, m.spending, m.cashflow]), 210);
  const picked = active === null ? null : months[active];
  const labels = months.map(m => `${monthLabel(m.month)}: ${m.count ? `income ${aud(m.income)}, spending ${aud(m.spending)}, net ${aud(m.cashflow)}` : 'no imported data'}`);
  const description = labels.join('; ');
  return <Card className={`${s.panel} ${s.main}`}><PanelHead icon="bar_chart" title="Income and spending" sub="Monthly totals from imports · hover a month" action={ranges} />
    <div className={s.legend}><span><i style={{ background: 'var(--status-working)' }} />Income</span><span><i style={{ background: 'var(--accent)' }} />Spending</span><span>━ Net</span></div>
    <div className={s.chartWrap}>{picked && <div className={s.tooltip} role="status">{monthLabel(picked.month)} · {picked.count ? `Income ${aud(picked.income)} · Spending ${aud(picked.spending)} · Net ${aud(picked.cashflow)}` : 'No imported data'}</div>}
      <div className={s.scroll}><svg className={s.cashChart} style={{ minWidth: Math.min(width, 720) }} viewBox={`0 0 ${width} 250`} role="group" aria-label={`Monthly income and spending. ${description}`}>
        {[0, 70, 140, 210].map(y => <line key={y} x1="42" y1={y + 12} x2={width} y2={y + 12} stroke="var(--rule-faint)" />)}
        <line x1="42" y1={scale.zero + 12} x2={width} y2={scale.zero + 12} stroke="var(--border)" /><text x="0" y={scale.zero + 16}>$0</text>
        {months.map((m, i) => { const x = 50 + i * step; return <g key={m.month} tabIndex={0} role="button" aria-label={labels[i]} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)} onKeyDown={e => { if (e.key === 'Escape') setActive(null); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i); } }}>
          <rect x={x - 4} y="8" width={step - 2} height="218" fill={active === i ? 'var(--paper)' : 'transparent'} />
          {[m.income, m.spending].map((v, j) => <rect key={j} x={x + j * step * .36} y={12 + Math.min(scale.y(v), scale.zero)} width={Math.min(16, step * .3)} height={Math.abs(scale.y(v) - scale.zero)} rx="3" fill={j ? 'var(--accent)' : 'var(--status-working)'} />)}
          {m.count > 0 && <line x1={x} x2={x + step * .68} y1={scale.y(m.cashflow) + 12} y2={scale.y(m.cashflow) + 12} stroke="var(--ink)" strokeWidth="2" />}
          {(months.length <= 12 || i % Math.ceil(months.length / 10) === 0 || i === months.length - 1) && <text x={x + step * .3} y="245" textAnchor="middle">{monthLabel(m.month)}</text>}
        </g>; })}
      </svg></div>
    </div><details className={s.sub}><summary>View month-by-month figures</summary><div className={s.scroll}><table className={s.table}><caption className="sr-only">Monthly cash flow</caption><thead><tr><th>Month</th><th>Income</th><th>Spending</th><th>Net</th></tr></thead><tbody>{months.map(m => <tr key={m.month}><th>{monthLabel(m.month)}</th>{[m.income, m.spending, m.cashflow].map((v, i) => <td key={i}>{m.count ? aud(v) : 'No data'}</td>)}</tr>)}</tbody></table></div></details>
  </Card>;
}

export function TrendChart({ months, metric, title, colour, helper }: { months: Months; metric: 'cumulativeSavings' | 'cashflow' | 'cumulativeCashflow'; title: string; colour: string; helper: string }) {
  const values = months.map(m => m[metric]), scale = chartScale(values, 120), width = Math.max(280, months.length * 16), step = width / months.length;
  const hasData = months.some(m => m.count), cumulative = metric !== 'cashflow';
  return <Card className={s.trend}><div className={s.trendLabel}>{title}</div><div className={s.trendValue}>{hasData ? aud(values.at(-1) ?? 0) : '—'}</div>
    {hasData ? <svg viewBox={`0 0 ${width} 130`} role="img" aria-label={`${title}: ${aud(values[0] ?? 0)} at the start, ${aud(values.at(-1) ?? 0)} at the end. ${helper}`}><line x1="0" x2={width} y1={scale.zero + 5} y2={scale.zero + 5} stroke="var(--border)" />{months.map((m, i) => (m.count || cumulative) ? <rect key={m.month} x={i * step + 2} y={Math.min(scale.y(m[metric]), scale.zero) + 5} width={Math.max(1, step - 4)} height={Math.max(1, Math.abs(scale.y(m[metric]) - scale.zero))} rx="2" fill={m[metric] < 0 ? 'var(--status-failed)' : colour}><title>{monthLabel(m.month)}: {aud(m[metric])}</title></rect> : null)}</svg> : <p className={s.sub}>No imported data for this range.</p>}
    <p className={s.sub}>{helper}</p><details className={s.sub}><summary>View values</summary>{months.map(m => <div className={s.listRow} key={m.month}><span>{monthLabel(m.month)}</span><span>{hasData && (m.count || cumulative) ? aud(m[metric]) : 'No data'}</span></div>)}</details>
  </Card>;
}

const colours = ['var(--ink)', 'var(--accent)', 'var(--status-working)', 'var(--status-approval)', 'var(--status-merged)', 'var(--ink-2)'];
export function SpendingChart({ categories, budgets }: { categories: FinanceData['summary']['categories']; budgets: FinanceData['budgets'] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const selected = categories.filter(c => !hidden.includes(c.name)), total = selected.reduce((sum, c) => sum + c.amount, 0), positive = selected.reduce((sum, c) => sum + Math.max(0, c.amount), 0);
  return <Card className={`${s.panel} ${s.side}`}><PanelHead icon="donut_small" title="Where the money went" sub={`Selected ${aud(total)} of spending`} action={<div className={s.actions}><Button variant="text" onClick={() => setHidden([])}>Show all</Button><Button variant="text" onClick={() => setHidden(categories.map(c => c.name))}>Hide all</Button></div>} />
    <div className={s.categoryBar} aria-hidden="true">{categories.map((c, i) => !hidden.includes(c.name) && c.amount > 0 ? <span key={c.name} style={{ width: `${c.amount / positive * 100}%`, background: colours[i % colours.length] }} /> : null)}</div>
    {!categories.length && <p className={s.sub}>No spending recorded for this range.</p>}
    <div className={s.categoryList}>{categories.map((c, i) => { const budget = budgets.find(b => b.category === c.name); return <div className={s.categoryRow} key={c.name}><Checkbox label={<><i className={s.dot} style={{ background: colours[i % colours.length] }} /><span>{c.group} › {c.name}</span></>} checked={!hidden.includes(c.name)} onChange={() => setHidden(hidden.includes(c.name) ? hidden.filter(n => n !== c.name) : [...hidden, c.name])} /><span className={s.mono}>{!hidden.includes(c.name) && total > 0 ? `${Math.round(c.amount / total * 100)}%` : '—'}</span><span className={s.mono}>{aud(c.amount)}</span>{budget?.limit !== null && budget?.limit !== undefined && budget.actual > budget.limit && <span className={s.failed}>▲ Over {aud(budget.actual - budget.limit)} this month</span>}</div>; })}</div>
    <p className={s.sub}>Refunds offset spending. Net credits remain in totals; the bar shows positive spending.</p>
  </Card>;
}
