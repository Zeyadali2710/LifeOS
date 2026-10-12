"use client";

import { Icon } from "./icon";
import type { IconName } from "./icon-names";
import { Button } from "./button";

export function InlineError({
  label,
  icon = "error",
  title,
  what,
  why,
  fix,
  action,
}: {
  label: string;
  icon?: IconName;
  title: string;
  what: string;
  why: string;
  fix: string;
  action?: { label: string; onClick: () => void };
}) {
  const row = (lead: string, text: string) => (
    <p className="text-[13px] leading-normal text-text-2">
      <span className="text-text">{lead}</span>
      {text}
    </p>
  );
  return (
    <div
      role="alert"
      className="flex flex-col gap-2.5 rounded-24 border border-[rgba(255,105,97,.3)] bg-[linear-gradient(180deg,rgba(255,105,97,.08),rgba(255,105,97,.02))] p-5"
    >
      <div className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.1em] text-red uppercase">
        <Icon name={icon} size={17} />
        {label}
      </div>
      <h3 className="text-[15px] leading-[1.35] font-medium tracking-[-0.005em]">{title}</h3>
      {row("What happened: ", what)}
      {row("Why: ", why)}
      {row("What to do: ", fix)}
      {action && (
        <div>
          <Button variant="inverse" className="h-8" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
