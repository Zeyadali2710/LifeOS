import Link from "next/link";
import type { BlockerDTO } from "@/lib/project-types";
import { Icon } from "@/legacy-ui/icon";

const ROW = "flex items-center gap-2.5 rounded-16 px-3 py-2.5 text-[13px]";

export function BlockersList({ blockers, note, onEditNote }: { blockers: BlockerDTO[]; note: string; onEditNote?: () => void }) {
  const n = note.trim();
  return (
    <ul className="glass-card rounded-24 p-2">
      {blockers.map((b) => {
        const red = b.kind === "task_blocked" || b.kind === "ci_failing";
        const body = (
          <>
            <span className={red ? "text-red" : "text-amber"}>
              <Icon name="block" size={16} />
            </span>
            <span className="min-w-0 flex-1 break-words">{b.label}</span>
          </>
        );
        return (
          <li key={`${b.kind}-${b.refId}`}>
            {b.href ? (
              <Link href={b.href} className={`${ROW} hover:bg-white/[.04]`}>
                {body}
              </Link>
            ) : (
              <div className={ROW}>{body}</div>
            )}
          </li>
        );
      })}
      {n && (
        <li className={ROW}>
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-text-3 uppercase">Note</span>
          <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{n}</span>
          {onEditNote && (
            <button type="button" aria-label="Edit blocker note" onClick={onEditNote} className="grid size-7 place-items-center rounded-full text-text-3 hover:bg-fill-2 hover:text-text max-tab:size-11">
              <Icon name="edit" size={16} />
            </button>
          )}
        </li>
      )}
      {blockers.length === 0 && !n && (
        <li className={`${ROW} text-text-2`}>
          <span className="text-green">
            <Icon name="check_circle" size={16} />
          </span>
          Nothing is blocking this project.
        </li>
      )}
    </ul>
  );
}
