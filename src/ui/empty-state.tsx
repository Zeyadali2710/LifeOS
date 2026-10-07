import type { ReactNode } from "react";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-14 border border-dashed border-[rgba(255,255,255,.12)] px-5 py-[26px]">
      <Icon name={icon} size={26} className="text-text-4" />
      <h3 className="text-[15px] leading-[1.35] font-medium tracking-[-0.005em]">{title}</h3>
      <p className="text-[13px] leading-normal text-text-2">{body}</p>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
