import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { Icon } from "@/legacy-ui/icon";
import type { IconName } from "@/legacy-ui/icon-names";
import { StatusDot } from "@/legacy-ui/status-dot";
import type { AgentsOverview } from "./command-centre";

type A = AgentsOverview["agents"][number];

export const DOT = { ONLINE: "online", WORKING: "running", READY: "online", PAUSED: "paused", ATTENTION: "attention", "NOT CONNECTED": "none" } as const;

export function AgentCard({ a }: { a: A }) {
  const stats = a.stats;
  const task = !stats
    ? a.arrival
      ? `Not connected · arrives in ${a.arrival}`
      : "Not connected · planned"
    : (a.currentTask ?? (a.status === "PAUSED" ? "Paused by you." : "Idle."));
  const working = a.status === "WORKING";
  const last = stats?.last;
  const health = stats?.health ?? null;
  const spark = stats?.sparkline ?? [];
  const max = Math.max(1, ...spark);
  return (
    <Link
      href={`/agents/${a.id}`}
      className={`flex flex-col gap-3 glass-card rounded-24 p-4 transition duration-150 ${a.status === "ATTENTION" ? "!border-[rgba(255,105,97,.35)]" : ""} ${stats ? "hover:-translate-y-px" : ""}`}
    >
      <span className="flex items-center gap-2.5">
        <span className={`grid size-[30px] place-items-center rounded-full bg-white/[.06] ${stats ? "" : "opacity-75"}`} style={{ color: a.color }}>
          <Icon name={a.icon as IconName} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold tracking-[.12em] uppercase">{a.name}</span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[.12em] text-text-2">
            <StatusDot state={DOT[a.status]} pulse={working} />
            {a.status}
          </span>
        </span>
      </span>
      <span className="min-h-10 text-[13.5px] leading-[1.45] text-text-2">{task}</span>
      {stats && (
        <>
          <span
            aria-hidden="true"
            className={`block h-0.5 rounded-full bg-white/[.06] ${working ? "animate-[lo-scan_1.8s_linear_infinite] bg-no-repeat" : ""}`}
            style={working ? { backgroundImage: `linear-gradient(90deg,transparent,${a.color},transparent)`, backgroundSize: "38% 100%" } : undefined}
          />
          <dl className="m-0 grid grid-cols-3 gap-2">
            {[
              ["LAST", last ? (last.durationMs === null ? last.status : formatDuration(last.durationMs)) : "—"],
              ["QUEUE", String(stats.queue)],
              ["HEALTH", health === null ? "—" : `${health}%`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-text-3">{k}</dt>
                <dd className={`m-0 text-[12px] font-medium ${k === "HEALTH" && health !== null ? (health >= 97 ? "text-green" : "text-amber") : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <span role="img" aria-label="Runs in the last 24 hours" className="flex h-6 items-end gap-px">
            {spark.map((n, i) => (
              <span key={i} className="flex-1 rounded-[1px]" style={{ height: `${Math.max(8, (n / max) * 100)}%`, background: i >= 21 ? a.color : "rgba(255,255,255,.14)" }} />
            ))}
          </span>
          <span className="sr-only">{spark.reduce((s, n) => s + n, 0)} runs in the last 24 hours</span>
        </>
      )}
    </Link>
  );
}
