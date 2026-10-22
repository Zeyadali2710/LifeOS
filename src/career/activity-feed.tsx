import Link from "next/link";
import type { ReactNode } from "react";
import type { ActivityItemDTO } from "@/lib/project-types";
import { Icon } from "@/legacy-ui/icon";
import type { IconName } from "@/legacy-ui/icon-names";
import { relativeTime } from "./repo-card";

const CI_COLOR = { passing: "text-green", failing: "text-red", running: "text-amber", none: "text-text-3" } as const;
const KIND: Record<Exclude<ActivityItemDTO["kind"], "ci">, { icon: IconName; color: string }> = {
  commit: { icon: "commit", color: "text-cyan" },
  pr: { icon: "call_merge", color: "text-purple-text" },
  issue: { icon: "bug_report", color: "text-amber" },
  task: { icon: "check_circle", color: "text-green" },
};

const ROW = "grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-16 px-3 py-2.5 text-text hover:bg-white/5";

function Row({ it, now }: { it: ActivityItemDTO; now: string }) {
  const k = it.kind === "ci" ? { icon: "deployed_code" as IconName, color: CI_COLOR[it.ci ?? "none"] } : KIND[it.kind];
  const meta = [it.repo, it.actor].filter(Boolean).join(" · ");
  const body: ReactNode = (
    <>
      <span className={`flex size-[26px] items-center justify-center rounded-7 bg-white/5 ${k.color}`}>
        <Icon name={k.icon} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px]">{it.title}</span>
        {meta && <span className="block truncate text-[12.5px] text-text-3">{meta}</span>}
      </span>
      <time dateTime={it.at} className="text-[10.5px] text-text-3">
        {relativeTime(it.at, now)}
      </time>
    </>
  );
  if (it.href && it.external) {
    return (
      <li>
        <a href={it.href} target="_blank" rel="noopener noreferrer" className={ROW}>
          {body}
        </a>
      </li>
    );
  }
  if (it.href) {
    return (
      <li>
        <Link href={it.href} className={ROW}>
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className={ROW}>{body}</div>
    </li>
  );
}

export function ActivityFeed({ items, now, label, empty }: { items: ActivityItemDTO[]; now: string; label: string; empty: string }) {
  return (
    <ul aria-label={label} className="glass-card rounded-24 p-2">
      {items.length === 0 ? (
        <li className="px-3 py-6 text-center text-[13.5px] text-text-2">{empty}</li>
      ) : (
        items.map((it) => <Row key={it.id} it={it} now={now} />)
      )}
    </ul>
  );
}
