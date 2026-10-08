import Link from "next/link";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";

export const SECTIONS: { key: "connections" | "ai"; label: string; icon: IconName }[] = [
  { key: "connections", label: "Connections", icon: "hub" },
  { key: "ai", label: "AI and spend", icon: "auto_awesome" },
];

export function SettingsNav({ current }: { current: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto tab:sticky tab:top-6 tab:w-[200px] tab:shrink-0 tab:flex-col tab:self-start tab:overflow-visible"
    >
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={`/settings?section=${s.key}`}
          aria-current={s.key === current ? "page" : undefined}
          className={`flex h-11 shrink-0 items-center gap-2 rounded-8 px-3 text-[13.5px] tab:h-[34px] ${
            s.key === current ? "bg-selected text-text" : "text-text-2 hover:bg-fill-2 hover:text-text"
          }`}
        >
          <Icon name={s.icon} size={18} />
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
