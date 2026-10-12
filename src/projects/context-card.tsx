"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";

export function ContextCard({ context, onEdit }: { context: string; onEdit?: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflow(el.scrollHeight > el.clientHeight);
  }, [context, open]);

  const edit = onEdit && (
    <Button variant="ghost" size="xs" onClick={onEdit}>
      <Icon name="edit_note" size={16} />
      Edit context
    </Button>
  );

  return (
    <div className="glass-card rounded-24 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium tracking-[0.14em] text-text-3 uppercase">Context</span>
        {context && edit}
      </div>
      {context ? (
        <>
          <p ref={ref} id="ctx-body" className={`text-[14px] leading-[1.5] break-words whitespace-pre-wrap text-text-2 ${open ? "" : "max-h-[320px] overflow-hidden"}`}>
            {context}
          </p>
          {(overflow || open) && (
            <button type="button" aria-expanded={open} aria-controls="ctx-body" className="mt-2 text-[13px] text-cyan max-tab:min-h-11" onClick={() => setOpen(!open)}>
              {open ? "Show less" : "Show full context"}
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[14px] leading-[1.5] text-text-2">No context notes yet. Add what this project is and how it&apos;s built so Claude Code starts with the right picture.</p>
          {edit}
        </div>
      )}
    </div>
  );
}
