import type { ToolTier } from "@/lib/agent-types";

/** HIGH_RISK is a floor nothing lowers; otherwise the override wins (and may raise to HIGH_RISK). */
export function resolvePolicy(defaultTier: ToolTier, override: ToolTier | null | undefined): ToolTier {
  if (defaultTier === "HIGH_RISK") return "HIGH_RISK";
  return override ?? defaultTier;
}

export const CONTENT_TOOLS = ["github.get_file", "github.list_tree"] as const;

/** Repo content can only ever produce a proposal the owner reviews (D-06): once content was read, side-effect tools need >= APPROVE. */
export function withContentFloor(tier: ToolTier, sideEffect: boolean, sawContent: boolean): ToolTier {
  return sideEffect && sawContent && (tier === "READ" || tier === "PREPARE" || tier === "EXECUTE") ? "APPROVE" : tier;
}
