import s from "./settings.module.css";
import Link from "next/link";
export const SECTIONS: {
  key: "connections" | "ai" | "outreach" | "briefings" | "roster";
  label: string;
}[] = [
    { key: "connections", label: "Connections" },
    { key: "ai", label: "AI and spend" },
    { key: "outreach", label: "Outreach" },
    { key: "briefings", label: "Briefings" },
    { key: "roster", label: "Work roster" },
  ];
export function SettingsNav({ current }: {
  current: string;
}) {
  return (<nav aria-label="Settings sections" className={s.nav}>
    {SECTIONS.map(item => <Link key={item.key} href={`/settings?section=${item.key}`} aria-current={item.key === current ? "page" : undefined}>
      {item.label}
    </Link>)}
  </nav>);
}
