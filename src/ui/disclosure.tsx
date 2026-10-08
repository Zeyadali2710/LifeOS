"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const rid = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={rid}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        {summary}
        <span className={`shrink-0 text-text-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <Icon name="expand_more" size={16} />
        </span>
      </button>
      <div id={rid} role="region" className={`grid transition-[grid-template-rows] duration-150 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden" inert={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}
