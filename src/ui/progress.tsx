export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 100 ? "bg-red" : pct >= 80 ? "bg-amber" : "bg-indigo";
  return (
    <div className="flex flex-col gap-1.5">
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-fill-3">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12.5px] text-text-3">{label}</span>
    </div>
  );
}
