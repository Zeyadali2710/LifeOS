import { followerTotal, type Card as Account } from "./model";
import { PLATFORM, formatCount } from "./platform";
import s from "./socials.module.css";

export function FollowersChart({ cards }: { cards: Account[] }) {
  const series = cards.filter((c) => c.history.some((row) => typeof row.followers === "number"));
  const total = followerTotal(cards); const points = series.flatMap((c) => c.history.filter((row) => row.followers !== null));
  const minDate = Math.min(...points.map((row) => Date.parse(row.date))); const maxDate = Math.max(...points.map((row) => Date.parse(row.date)));
  const max = Math.max(1, ...points.map((row) => row.followers!));
  const trend = series.map((c) => { const rows = c.history.filter((row) => row.followers !== null); return `${c.label}${c.isMock ? " MOCK" : ""}: ${rows[0]!.followers} to ${rows.at(-1)!.followers}, ${rows[0]!.date} to ${rows.at(-1)!.date}`; }).join("; ");
  return <div className={s.stack}><p className={s.muted}>Followers · {total === null ? "not available" : formatCount(total)} · mock accounts excluded from total</p>
    {!series.length ? <div><h3 className={s.title}>No follower history yet</h3><p className={s.muted}>Connect Instagram or TikTok in Settings. Growth shows from the first sync after connecting.</p></div> : <><svg viewBox="0 0 640 240" className={s.chart} role="img" aria-label={`Follower trend by platform. ${trend}. Mock accounts use dashed lines.`}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1="40" x2="630" y1={210 - f * 190} y2={210 - f * 190} stroke="var(--rule-soft)" /><text x="32" y={214 - f * 190} textAnchor="end" fill="var(--ink-2)" fontFamily="var(--font-mono)" fontSize="var(--text-mono-xs)">{formatCount(Math.round(max * f))}</text></g>)}
      {series.map((c) => { const rows = c.history.filter((row) => row.followers !== null); const x = (date: string) => 40 + (Date.parse(date) - minDate) / Math.max(86400000, maxDate - minDate) * 590; const y = (value: number) => 210 - value / max * 190;
        return <g key={c.platform}>{rows.length > 1 && <polyline points={rows.map((row) => `${x(row.date)},${y(row.followers!)}`).join(" ")} fill="none" stroke={PLATFORM[c.platform].color} strokeWidth="2" strokeDasharray={c.isMock ? "5 4" : undefined} />}{rows.map((row) => <circle key={row.date} cx={x(row.date)} cy={y(row.followers!)} r="3" fill={PLATFORM[c.platform].color}><title>{c.label}: {row.followers} on {row.date}</title></circle>)}</g>;
      })}<text x="40" y="236" fill="var(--ink-2)" fontSize="var(--text-mono-xs)" fontFamily="var(--font-mono)">{new Date(minDate).toISOString().slice(0, 10)}</text><text x="630" y="236" textAnchor="end" fill="var(--ink-2)" fontSize="var(--text-mono-xs)" fontFamily="var(--font-mono)">{new Date(maxDate).toISOString().slice(0, 10)}</text>
    </svg><ul className={s.legend}>{series.map((c) => <li key={c.platform} style={{ color: PLATFORM[c.platform].color }}>{c.label}{c.isMock ? " · MOCK" : ""}: {c.history.at(-1)?.followers}{c.history.length < 2 && " · needs one more sync to draw a line"}</li>)}</ul></>}
  </div>;
}
