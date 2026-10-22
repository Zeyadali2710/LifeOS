// Moved from the pre-Almanac approval UI: logic only, unchanged.
import type { z } from "zod";
import type { ApprovalDTO } from "@/lib/agent-types";
import { socialPublishPayload } from "@/lib/approval-kinds";
import type { socialReviewFacts } from "@/server/socials-actions";

export type SocialPayload = z.infer<typeof socialPublishPayload>;
export type SocialDraft = Pick<SocialPayload, "text" | "imageUrl" | "linkUrl" | "publishAt">;
export const socialOf = (a: Pick<ApprovalDTO, "original" | "edited">) => (a.edited ?? a.original) as SocialPayload;
const draftFields = (p: SocialDraft): SocialDraft => ({ text: p.text, imageUrl: p.imageUrl, linkUrl: p.linkUrl, publishAt: p.publishAt });
export const toSocialDraft = draftFields;
export const sameSocial = (a: SocialDraft, b: SocialDraft) => a.text === b.text && a.imageUrl === b.imageUrl && a.linkUrl === b.linkUrl && a.publishAt === b.publishAt;
export function validateSocialDraft(base: SocialPayload, draft: SocialDraft) {
  return socialPublishPayload.safeParse({ ...base, ...draftFields(draft) });
}
export type Facts = Awaited<ReturnType<typeof socialReviewFacts>>;
export function socialResolved(a: ApprovalDTO, facts: Facts): string {
  if (a.status === "rejected") return "Rejected. Nothing was posted.";
  if (a.status === "expired" || a.status === "cancelled") return "Request expired or cancelled. Nothing was posted by this request.";
  if (a.status === "failed") return a.error ?? "Approval failed. Review in Socials.";
  if (!facts) return "Approved · checking publish status…";
  switch (facts.status) {
    case "scheduled": return `Scheduled for ${new Date(facts.scheduledAt!).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} (Sydney).`;
    case "publishing": return "Publishing…";
    case "published": return facts.isMock ? "MOCK · published inside LifeOS. Nothing left LifeOS." : "Published.";
    case "failed": return facts.lastError ?? "Publishing failed. Review in Socials before retrying.";
    default: return "This request is no longer active. View the current variant in Socials.";
  }
}
