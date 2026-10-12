export type ProviderName = "google" | "icloud";
export type ProviderErrorKind = "auth" | "not_found" | "rate_limit" | "conflict" | "client" | "unavailable" | "gone" | "scope";

/** message is a fixed, non-secret string chosen by the caller (never a raw provider body). */
export class ProviderError extends Error {
  constructor(
    public provider: ProviderName,
    public kind: ProviderErrorKind,
    public status: number,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const providerLabel = (p: ProviderName) => (p === "google" ? "Google" : "iCloud");
