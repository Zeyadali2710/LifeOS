import { followerTotal, type Card } from "./model";
import { PLATFORM, formatCount } from "./platform";

export function FollowersChart({ cards }: { cards: Card[] }) {
  const series = cards.filter((c) => c.history.some((s) => typeof s.followers === "number"));
  const total = followerTotal(cards);
  const points = series.flatMap((c) => c.history.filter((s) => s.followers !== null));
  const minDate = Math.min(...points.map((s) => Date.parse(s.date))); const maxDate = Math.max(...points.map((s) => Date.parse(s.date)));
  const max = Math.max(1, ...points.map((s) => s.followers!));
  return <section aria-labelledby="followers-heading" className="glass-card rounded-24 p-5"><h2 id="followers-heading" className="text-[11px] tracking-[.14em] text-text-3">FOLLOWERS</h2><p className="mt-2 font-display text-[29px]">{total === null ? <span aria-label="not available">—</span> : formatCount(total)}</p>
    {!series.length ? <div className="py-8"><h3 className="font-display text-[20px]">No follower history yet</h3><p className="mt-2 text-[13.5px] text-text-3">Connect Instagram or TikTok in Settings. Growth shows from the first sync after connecting.</p></div> : <><svg viewBox="0 0 640 190" role="img" aria-label="Follower history by platform. Mock accounts use dashed lines and are excluded from totals." className="mt-4 h-[180px] w-full"><line x1="20" x2="620" y1="170" y2="170" stroke="currentColor" opacity=".1" />{series.map((c) => {
      const rows = c.history.filter((s) => s.followers !== null); const path = rows.map((s, i) => `${i ? "L" : "M"}${20 + (Date.parse(s.date) - minDate) / Math.max(86400000, maxDate - minDate) * 600},${170 - s.followers! / max * 150}`).join(" ");
      return <g key={c.platform}>{rows.length > 1 && <path d={path} fill="none" stroke={PLATFORM[c.platform].color} strokeWidth="2" strokeDasharray={c.isMock ? "5 4" : undefined} />}{rows.map((s) => <circle key={s.date} cx={20 + (Date.parse(s.date) - minDate) / Math.max(86400000, maxDate - minDate) * 600} cy={170 - s.followers! / max * 150} r="3" fill={PLATFORM[c.platform].color}><title>{c.label}{c.isMock ? " MOCK" : ""}: {s.followers} on {s.date}</title></circle>)}</g>;
    })}</svg><p className="text-[12.5px] text-text-3">History since {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(minDate)}. Mock accounts are dashed and not counted in the total.</p><ul className="mt-3 flex flex-wrap gap-4 text-[12.5px]">{series.map((c) => <li key={c.platform} style={{ color: PLATFORM[c.platform].text }}>{c.label}{c.isMock ? " · MOCK" : ""}: {c.history.at(-1)?.followers}{c.history.length < 2 && ` · ${c.label} needs one more sync to draw a line.`}<span className="sr-only">{c.history.map((s) => `${s.date}: ${s.followers ?? "not provided"}`).join("; ")}</span></li>)}</ul></>}
  </section>;
}
