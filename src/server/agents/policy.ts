import type { ToolTier } from "@/lib/agent-types";

/** HIGH_RISK is a floor nothing lowers; otherwise the override wins (and may raise to HIGH_RISK). */
export function resolvePolicy(defaultTier: ToolTier, override: ToolTier | null | undefined): ToolTier {
  if (defaultTier === "HIGH_RISK") return "HIGH_RISK";
  return override ?? defaultTier;
}
