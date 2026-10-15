import type { socialVariants } from "../db/schema";

export const TERMINAL_CONTAINER_ERROR = "Instagram container failed or expired. Request a new approval.";
export const clearedPublication = {
  approvalId: null, scheduledAt: null, approvedTextHash: null, approvedProviderMode: null, approvedConnectionGeneration: null,
  remoteId: null, remoteUrl: null, containerId: null, publishedAt: null, isMock: false, metrics: null, metricsAt: null, lastError: null,
};

export function canRedraftVariant(v: Pick<typeof socialVariants.$inferSelect, "remoteId" | "containerId" | "approvedTextHash" | "lastError">): boolean {
  return !v.remoteId && ((!v.containerId && !v.approvedTextHash) || v.lastError === TERMINAL_CONTAINER_ERROR);
}
