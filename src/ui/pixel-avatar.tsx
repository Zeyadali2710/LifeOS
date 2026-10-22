"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";
import { drawAvatar, LOOKS } from "./pixelkit";
import type { AgentState } from "./pixelkit";

/** 14×14 pixel portrait scaled to `size` px. Decorative: the caller always shows the agent name and state in text. */
export function PixelAvatar({
  agent,
  state = "idle",
  size = 28,
  bg = "#e9e1d1",
  radius = 4,
}: {
  agent: string;
  state?: AgentState;
  size?: number;
  bg?: string;
  radius?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const animate = !reduced && (state === "working" || state === "approval");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setFrame((f) => f + 1), 320);
    return () => clearInterval(t);
  }, [animate]);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    const look = LOOKS[agent] ?? LOOKS.orchestrator;
    if (ctx && look) drawAvatar(ctx, look, state, animate ? frame : 0, bg);
  }, [agent, state, frame, animate, bg]);

  return (
    <canvas
      ref={ref}
      width={14}
      height={14}
      aria-hidden="true"
      style={{ width: size, height: size, imageRendering: "pixelated", borderRadius: radius, flex: "none" }}
    />
  );
}
