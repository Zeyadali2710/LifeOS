"use client";

import { issuePayloadSchema, parseLabels, type IssuePayload } from "@/lib/issue-payload";
import { Field, Input, Textarea } from "@/ui/field";

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

export function ApprovalEditForm({ repo, draft, errors, onChange }: { repo: string; draft: Draft; errors: DraftErrors; onChange: (d: Draft) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" error={errors.title}>
        <Input value={draft.title} maxLength={256} required onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      </Field>
      <Field label="Body" error={errors.body}>
        <Textarea rows={7} value={draft.body} maxLength={65536} onChange={(e) => onChange({ ...draft, body: e.target.value })} />
      </Field>
      <Field label="Labels" helper="Comma-separated, up to 10." error={errors.labels}>
        <Input value={draft.labels} onChange={(e) => onChange({ ...draft, labels: e.target.value })} />
      </Field>
      <div>
        <div className="mb-1 text-[12.5px] text-text-2">Repository</div>
        <div className="font-code text-[13px] text-text-2">{repo}</div>
      </div>
    </div>
  );
}
