import { HEALTH_LABEL, STATUS_LABEL, type CiChip, type Health, type ProjectStatus } from "@/lib/project-types";
import { Badge } from "@/legacy-ui/badge";
import { Icon } from "@/legacy-ui/icon";

// Single status map: Career, Projects and Home all render from here.
export const HEALTH: Record<Health, { label: string; dot: string; text: string }> = {
  on_track: { label: HEALTH_LABEL.on_track, dot: "bg-green", text: "text-green" },
  at_risk: { label: HEALTH_LABEL.at_risk, dot: "bg-amber", text: "text-amber" },
  behind: { label: HEALTH_LABEL.behind, dot: "bg-red", text: "text-red" },
};

export function HealthDot({ health }: { health: Health | null }) {
  if (!health) return null;
  const h = HEALTH[health];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium tracking-[.1em] uppercase ${h.text}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${h.dot}`} />
      {h.label}
    </span>
  );
}

export function StatusChip({ status }: { status: ProjectStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-green">
        <span aria-hidden="true" className="size-2 rounded-full bg-green" />
        {STATUS_LABEL.active}
      </span>
    );
  }
  return (
    <Badge kind="status" tone="neutral">
      {status === "done" && (
        <span className="mr-1 inline-block align-[-2px]">
          <Icon name="check_circle" size={12} />
        </span>
      )}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PRIORITY = {
  1: { tag: "P1", cls: "bg-[#ff6961] text-[#121214]", sr: "Priority high" },
  2: { tag: "P2", cls: "bg-[#ff9f0a] text-[#121214]", sr: "Priority medium" },
  3: { tag: "P3", cls: "bg-white/[.07] text-[#aeaeb2]", sr: "Priority low" },
} as const;

export function PriorityTag({ priority }: { priority: 1 | 2 | 3 }) {
  const p = PRIORITY[priority];
  return (
    <span className={`inline-block rounded-6 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[.08em] uppercase ${p.cls}`}>
      <span aria-hidden="true">{p.tag}</span>
      <span className="sr-only">{p.sr}</span>
    </span>
  );
}

export const CI: Record<CiChip, { label: string; dot: string }> = {
  passing: { label: "Passing", dot: "bg-green" },
  failing: { label: "Failing", dot: "bg-red" },
  running: { label: "Running", dot: "bg-amber" },
  none: { label: "No CI", dot: "bg-text-3" },
};

export function CiChipView({ ci }: { ci: CiChip }) {
  const c = CI[ci];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2">
      <span aria-hidden="true" className={`size-2 rounded-full ${c.dot} ${ci === "running" ? "animate-[lo-pulse_2s_ease-out_infinite]" : ""}`} />
      {c.label}
    </span>
  );
}
