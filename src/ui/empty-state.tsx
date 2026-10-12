import type { ReactNode } from "react";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass-card flex flex-col gap-2 rounded-26 border border-dashed border-white/[.12] px-5 py-[26px]">
      <Icon name={icon} size={26} className="text-text-4" />
      <h3 className="font-display text-[22px] leading-[1.15] font-normal">{title}</h3>
      <p className="text-[13.5px] leading-normal text-text-2">{body}</p>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
