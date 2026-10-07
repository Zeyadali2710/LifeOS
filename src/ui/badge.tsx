import type { ReactNode } from "react";

const tones = {
  red: "text-red bg-[rgba(240,122,110,.12)]",
  amber: "text-amber bg-[rgba(232,184,106,.12)]",
  green: "text-green bg-[rgba(79,209,161,.12)]",
  blue: "text-blue bg-[rgba(108,182,255,.12)]",
  indigo: "text-indigo-text bg-[rgba(139,140,255,.12)]",
  neutral: "text-text-2 bg-[rgba(255,255,255,.07)]",
};

export function Badge({ kind, tone, children }: { kind: "status" | "tag" | "count"; tone: keyof typeof tones; children: ReactNode }) {
  const shape = kind === "tag" ? "rounded-5" : "rounded-full";
  const type = kind === "count" ? "px-1.5 py-0.5 text-[10.5px] font-medium" : "px-2 py-[3px] text-[10px] font-semibold tracking-[0.08em] uppercase";
  return <span className={`inline-block font-mono leading-none ${shape} ${type} ${tones[tone]}`}>{children}</span>;
}
