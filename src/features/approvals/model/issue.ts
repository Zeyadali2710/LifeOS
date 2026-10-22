// Moved from the pre-Almanac approval UI: logic only, unchanged.
import type { ApprovalKind } from "@/lib/approval-kinds";
import { issuePayloadSchema, parseLabels, type IssuePayload } from "@/lib/issue-payload";

export type Draft = { title: string; body: string; labels: string };
export type DraftErrors = Partial<Record<"title" | "body" | "labels", string>>;

export const toDraft = (p: IssuePayload): Draft => ({ title: p.title, body: p.body, labels: p.labels.join(", ") });
export const toPayload = (repo: string, d: Draft) => ({ repo, title: d.title, body: d.body, labels: parseLabels(d.labels) });

/** Client-side check with the same schema the server re-runs (D-04). */
export function validateDraft(repo: string, d: Draft): { payload: IssuePayload } | { errors: DraftErrors } {
  const r = issuePayloadSchema.safeParse(toPayload(repo, d));
  if (r.success) return { payload: r.data };
  const errors: DraftErrors = {};
  for (const i of r.error.issues) {
    const k = i.path[0] === "labels" ? "labels" : i.path[0] === "body" ? "body" : "title";
    errors[k] ??= k === "labels" ? "Labels must be comma-separated, up to 10." : i.message;
  }
  return { errors };
}

/** Narrow a kind-tagged approval to its issue payloads (null for event kinds, and for an issue row whose payload doesn't parse). */
export function issueOf(a: { kind: ApprovalKind; edited: unknown; original: unknown }): { original: IssuePayload; current: IssuePayload } | null {
  if (a.kind !== "issue") return null;
  // safeParse: one malformed row must not throw during render and take the whole list or transcript down (WR-B10)
  const original = issuePayloadSchema.safeParse(a.original);
  const current = a.edited == null ? original : issuePayloadSchema.safeParse(a.edited);
  return original.success && current.success ? { original: original.data, current: current.data } : null;
}

export const sameIssue = (a: IssuePayload, b: IssuePayload) => a.title === b.title && a.body === b.body && a.labels.join(",") === b.labels.join(",");
