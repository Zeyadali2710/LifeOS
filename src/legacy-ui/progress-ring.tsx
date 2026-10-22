export function ProgressRing({
  pct,
  size = 36,
  stroke = 3,
  label,
  done = false,
  color: override,
  text,
}: {
  pct: number | null;
  size?: number;
  stroke?: number;
  label: string;
  done?: boolean;
  /** overrides the built-in colour rule */
  color?: string;
  /** overrides the centre text (default: the percentage) */
  text?: string;
}) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = override ?? (done || v >= 100 ? "var(--green)" : v >= 80 ? "var(--amber)" : "var(--accent)");
  const big = size >= 72;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct === null ? undefined : Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
          />
        )}
      </svg>
      <span className={`absolute text-text ${big ? "font-display text-[20px]" : "text-[11px] font-medium"}`}>
        {text ?? (pct === null ? "—" : `${Math.round(v)}%`)}
      </span>
    </div>
  );
}
