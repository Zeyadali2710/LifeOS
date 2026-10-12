export function Sparkline({ data, height = 28, label }: { data: number[]; height?: number; label: string }) {
  const bars = Array.from({ length: 14 }, (_, i) => data[data.length - 14 + i] ?? 0);
  const max = Math.max(1, ...bars);
  return (
    <span role="img" aria-label={label} className="flex items-end gap-px" style={{ height }}>
      {bars.map((n, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i >= 7 ? "bg-accent" : "bg-white/[.12]"}`}
          style={{ height: n === 0 ? 2 : Math.max(2, (n / max) * height) }}
        />
      ))}
    </span>
  );
}
