import type { LanguageSlice } from "@/lib/project-types";

export function LanguageBar({ slices, legend = true }: { slices: LanguageSlice[]; legend?: boolean }) {
  if (slices.length === 0) return null;
  const label = `Languages: ${slices.map((s) => `${s.name} ${s.pct}%`).join(", ")}`;
  return (
    <div className="flex flex-col gap-2">
      <span role="img" aria-label={label} className="flex h-1.5 overflow-hidden rounded-full bg-white/[.08]">
        {slices.map((s) => (
          <span key={s.name} style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </span>
      {legend && (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-text-2">
          {slices.map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: s.color }} />
              {s.name} {s.pct}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
