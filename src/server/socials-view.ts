import type { ApprovalDTO } from "@/lib/agent-types";
import { getApproval } from "./agents/approvals";
import type { DB } from "./db/client";
import { socialReviewFacts } from "./socials-actions";
import type { getPost } from "./socials/queries";

export type SocialReview = { approval: ApprovalDTO; facts: NonNullable<Awaited<ReturnType<typeof socialReviewFacts>>> };

/** Read the current proposal and account binding, including edits made in the approval inbox. */
export async function socialPostReviews(h: DB, post: Awaited<ReturnType<typeof getPost>>): Promise<Record<string, SocialReview>> {
  const reviews: Record<string, SocialReview> = {};
  await Promise.all((post?.variants ?? []).filter((v) => v.status === "pending_approval" && v.approvalId).map(async (v) => {
    const [approval, facts] = await Promise.all([getApproval(h, v.approvalId!), socialReviewFacts(v.approvalId!)]);
    if (approval && facts && facts.postId === post!.id) reviews[v.id] = { approval, facts };
  }));
  return reviews;
}
