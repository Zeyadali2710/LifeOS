const FILL = {
  running: "bg-indigo",
  online: "bg-green",
  attention: "bg-red",
  paused: "bg-amber",
  idle: "bg-text-3",
  none: "border border-text-3",
} as const;

export function StatusDot({ state, pulse = false }: { state: keyof typeof FILL; pulse?: boolean }) {
  return <span aria-hidden="true" className={`inline-block size-[7px] shrink-0 rounded-full ${FILL[state]} ${pulse ? "animate-[lo-pulse_1.2s_ease-out_infinite]" : ""}`} />;
}
