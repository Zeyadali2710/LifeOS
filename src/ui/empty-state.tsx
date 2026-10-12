import type { ReactNode } from "react";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass-card flex flex-col items-center justify-center rounded-24 border border-white/[.08] p-6 text-center">
      <Icon name={icon} size={26} className="text-text-4" />
      <h3 className="mt-3 font-display text-[22px] leading-[1.15] font-normal">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-normal text-text-2">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
