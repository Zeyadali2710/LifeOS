import type { ReactNode } from "react";
import s from "./display.module.css";

export type Tone = "working" | "approval" | "failed" | "idle" | "offline" | "merged" | "accent";

export const AGENT_STATES = {
  working: { glyph: "…", label: "Working", short: "Working", tone: "working" },
  approval: { glyph: "!", label: "Needs approval", short: "Needs you", tone: "approval" },
  failed: { glyph: "×", label: "Failed", short: "Failed", tone: "failed" },
  idle: { glyph: "–", label: "Idle", short: "Idle", tone: "idle" },
  paused: { glyph: "II", label: "Paused", short: "Paused", tone: "idle" },
  offline: { glyph: "○", label: "Not connected", short: "Offline", tone: "offline" },
} as const satisfies Record<string, { glyph: string; label: string; short: string; tone: Tone }>;
export type AgentState = keyof typeof AGENT_STATES;

/** State always shows as glyph + word + colour, never colour alone. */
export function Status({ tone, glyph, children, mono, className }: { tone: Tone; glyph: string; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <span className={[s.status, mono && s.statusMono, s[tone], className].filter(Boolean).join(" ")}>
      <span className={s.glyph} aria-hidden="true">
        {glyph}
      </span>
      {children}
    </span>
  );
}

export function AgentStatus({ state, short, mono }: { state: AgentState; short?: boolean; mono?: boolean }) {
  const st = AGENT_STATES[state];
  return (
    <Status tone={st.tone} glyph={st.glyph} mono={mono}>
      {short ? st.short : st.label}
    </Status>
  );
}

export function CountBadge({ n, label, accent }: { n: number; label?: string; accent?: boolean }) {
  if (n <= 0) return null;
  return (
    <span className={[s.count, accent && s.countAccent].filter(Boolean).join(" ")} aria-label={label}>
      {n}
    </span>
  );
}

export function Tag({ children, variant = "tag", className }: { children: ReactNode; variant?: "tag" | "topic" | "source"; className?: string }) {
  return <span className={[s.tag, variant !== "tag" && s[variant], className].filter(Boolean).join(" ")}>{children}</span>;
}

export function LabelPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`${s.label} ${s[tone]}`}>{children}</span>;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Avatar({ name, size = 28, label }: { name: string; size?: 24 | 28 | 30; label?: string }) {
  return (
    <span
      className={s.avatar}
      style={{ width: size, height: size, fontSize: size >= 30 ? 12 : size >= 28 ? 11 : 10 }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {initials(name)}
    </span>
  );
}

export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={[s.meta, className].filter(Boolean).join(" ")}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

export function Progress({ value, tone, label }: { value: number; tone?: Tone; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={s.progress} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={[s.progressBar, tone && s[tone]].filter(Boolean).join(" ")} style={{ width: `${v}%` }} />
    </div>
  );
}
