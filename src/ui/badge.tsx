import type { ReactNode } from "react";

const tones = {
  red: "text-red bg-[rgba(255,105,97,.12)]",
  amber: "text-amber bg-[rgba(255,159,10,.12)]",
  green: "text-green bg-[rgba(48,209,88,.12)]",
  blue: "text-cyan bg-[rgba(100,210,255,.12)]",
  indigo: "text-cyan bg-[rgba(10,132,255,.12)]",
  neutral: "text-text-2 bg-white/[.07]",
  purple: "text-purple-text bg-[rgba(191,90,242,.12)]",
};

export function Badge({ kind, tone, children }: { kind: "status" | "tag" | "count"; tone: keyof typeof tones; children: ReactNode }) {
  const shape = kind === "tag" ? "rounded-5" : "rounded-full";
  const type = kind === "count" ? "px-1.5 py-0.5 text-[10.5px] font-medium" : "px-2 py-[3px] text-[10px] font-semibold tracking-[0.08em] uppercase";
  return <span className={`inline-block font-mono leading-none ${shape} ${type} ${tones[tone]}`}>{children}</span>;
}
