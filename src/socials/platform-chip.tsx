import type { SocialPlatform } from "@/lib/social-types";
import { PLATFORM } from "./platform";

export function PlatformChip({ platform, mock = false }: { platform: SocialPlatform; mock?: boolean }) {
  const p = PLATFORM[platform];
  return <span className="inline-flex items-center gap-1.5 rounded-6 px-2 py-[3px] text-[10px] font-medium tracking-[.1em] uppercase" style={{ color: p.text, background: p.tint }}>{p.label}{mock && " · MOCK"}</span>;
}
