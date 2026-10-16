import { aud } from "@/lib/finance";
import type { loadFinance } from "@/server/finance";

type Summary = Awaited<ReturnType<typeof loadFinance>>["summary"];
const colours = ["#64d2ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff6961", "#5e5ce6", "#66d4cf", "#ff9ed1"];

export function CashflowChart({ months }: { months: Summary["monthly"] }) {
  const max = Math.max(1, ...months.flatMap((m) => [Math.abs(m.income), Math.abs(m.spending)]));
  return <section className="glass-card rounded-24 p-5 min-w-0" aria-labelledby="finance-cashflow">
    <h2 id="finance-cashflow" className="text-[15px] font-medium">Income and spending · {months[0]!.month.slice(0, 4)}</h2>
    <p className="mt-1 text-[12px] text-text-3">Monthly totals from imported transactions. Negative adjustments extend below the baseline; blank months have no imported data.</p>
    <div className="mt-4 flex gap-4 text-[12px]"><span className="text-green">● Income</span><span className="text-cyan">● Spending</span></div>
    <div className="mt-4 overflow-x-auto"><svg role="img" aria-label="Monthly income and spending comparison. Exact values follow in the table." viewBox="0 0 720 300" className="w-full min-w-[520px]">
      <line x1="10" y1="150" x2="710" y2="150" stroke="rgba(255,255,255,.12)" />
      {months.map((m, i) => <g key={m.month}>
        <title>{`${m.month}: ${m.count ? `income ${aud(m.income)}, spending ${aud(m.spending)}, net cash flow ${aud(m.cashflow)}` : "no data"}`}</title>
        <rect x={i * 59 + 14} y={m.income >= 0 ? 150 - m.income / max * 110 : 150} width="16" height={Math.abs(m.income) / max * 110} rx="3" fill="#30d158" />
        <rect x={i * 59 + 32} y={m.spending >= 0 ? 150 - m.spending / max * 110 : 150} width="16" height={Math.abs(m.spending) / max * 110} rx="3" fill="#64d2ff" />
        <text x={i * 59 + 30} y="284" textAnchor="middle" fill="#98989d" fontSize="11">{new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}</text>
      </g>)}
    </svg></div>
    <details className="mt-3 text-[12px] text-text-2"><summary className="cursor-pointer">View month-by-month figures</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Monthly imported cash flow</caption><thead><tr>{["Month", "Income", "Spending", "Net cash flow"].map((v) => <th key={v} className="p-2">{v}</th>)}</tr></thead><tbody>{months.map((m) => <tr key={m.month} className="border-t border-white/[.06]"><th scope="row" className="p-2 font-normal">{m.month}</th>{[m.income, m.spending, m.cashflow].map((v, i) => <td key={i} className="p-2 whitespace-nowrap">{m.count ? aud(v) : "No data"}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}

export function SpendingChart({ categories }: { categories: Summary["categories"] }) {
  const groups = new Map<string, number>();
  for (const c of categories) groups.set(c.group, (groups.get(c.group) ?? 0) + c.amount);
  const rows = [...groups].sort((a, b) => b[1] - a[1]);
  const positiveTotal = rows.reduce((sum, [, v]) => sum + Math.max(0, v), 0);
  let cumulative = 0;
  const stops: string[] = [];
  for (const [i, [, amount]] of rows.entries()) {
    if (amount <= 0) continue;
    const from = cumulative; cumulative += amount / (positiveTotal || 1) * 100;
    stops.push(`${colours[i % colours.length]} ${from}% ${cumulative}%`);
  }
  return <section className="glass-card rounded-24 p-5" aria-labelledby="finance-spending"><h2 id="finance-spending" className="text-[15px] font-medium">Where the money went</h2>
    {!rows.length ? <p className="mt-8 text-[13px] text-text-3">Import transactions to see your spending breakdown.</p> : <>
      <div aria-hidden="true" className="relative mx-auto my-6 grid size-44 place-items-center rounded-full" style={{ background: stops.length ? `conic-gradient(${stops.join(",")})` : "rgba(255,255,255,.06)" }}><div className="grid size-32 place-items-center rounded-full bg-[#10131b]"><span className="text-center text-[13px] text-text-2">Spending<br /><strong className="text-[18px] text-text">{aud(categories.reduce((n, c) => n + c.amount, 0))}</strong></span></div></div>
      <ul className="space-y-2 text-[13px]">{rows.map(([name, amount], i) => <li key={name} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: colours[i % colours.length] }} /><span className="flex-1">{name}</span><span className="font-mono text-[12px]">{aud(amount)}</span></li>)}</ul>
      <p className="mt-3 text-[11.5px] text-text-3">Refunds offset their spending category. Net credits appear in the figures but not as donut slices.</p>
    </>}
  </section>;
}
