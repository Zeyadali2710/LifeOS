export const PLATFORMS = ["linkedin", "instagram", "tiktok", "portfolio"] as const;
export type SocialPlatform = (typeof PLATFORMS)[number];

export const VARIANT_STATUSES = ["draft", "pending_approval", "scheduled", "publishing", "published", "failed", "posted_manually"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];
export type PostStage = "idea" | "draft";
export type SocialMetrics = Partial<Record<"impressions" | "reach" | "views" | "likes" | "comments" | "shares" | "saves", number>>;
export type SocialCapabilities = { draft: boolean; publish: boolean; schedule: boolean; analytics: boolean };

export const LIMITS = {
  linkedin: { text: 3000, hashtagsWarning: 5 },
  instagram: { text: 2200, hashtags: 30, mentions: 20 },
  tiktok: { textWarning: 2200 },
} as const;

export type VariantInput = { text: string; title?: string | null; imageUrl?: string | null; linkUrl?: string | null };

export function isPublicHttpsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.hostname.includes(".") && !url.hostname.endsWith(".local") &&
      url.hostname !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) &&
      !url.hostname.includes(":");
  } catch {
    return false;
  }
}

export function checkVariant(platform: SocialPlatform, variant: VariantInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const length = [...variant.text].length;
  const hashtags = variant.text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  const mentions = variant.text.match(/(^|\s)@[\p{L}\p{N}_.]+/gu)?.length ?? 0;
  if (!variant.text.trim()) errors.push("Text is required.");
  if (platform === "linkedin") {
    if (length > LIMITS.linkedin.text) errors.push("LinkedIn text exceeds 3,000 characters.");
    if (hashtags > LIMITS.linkedin.hashtagsWarning) warnings.push("More than five hashtags may reduce readability.");
  } else if (platform === "instagram") {
    if (length > LIMITS.instagram.text) errors.push("Instagram caption exceeds 2,200 characters.");
    if (hashtags > LIMITS.instagram.hashtags) errors.push("Instagram allows at most 30 hashtags.");
    if (mentions > LIMITS.instagram.mentions) errors.push("Instagram allows at most 20 mentions.");
    if (!variant.imageUrl || !isPublicHttpsImageUrl(variant.imageUrl)) errors.push("A public HTTPS image URL is required.");
  } else if (platform === "tiktok") {
    if (length > LIMITS.tiktok.textWarning) warnings.push("TikTok caption exceeds 2,200 characters; review before posting manually.");
  } else if (!variant.title?.trim()) {
    errors.push("Portfolio title is required.");
  }
  return { errors, warnings };
}

export function boardColumn(stage: PostStage, statuses: readonly VariantStatus[]): "Ideas" | "Draft" | "Review" | "Scheduled" | "Published" {
  if (statuses.includes("pending_approval")) return "Review";
  if (statuses.includes("scheduled")) return "Scheduled";
  if (statuses.length > 0 && statuses.every((s) => s === "published" || s === "posted_manually")) return "Published";
  return stage === "idea" ? "Ideas" : "Draft";
}

export function expiryState(expiresAt: Date | null, now = new Date()): "expired" | "soon" | "okay" {
  if (!expiresAt) return "okay";
  if (expiresAt.getTime() <= now.getTime()) return "expired";
  return expiresAt.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000 ? "soon" : "okay";
}
