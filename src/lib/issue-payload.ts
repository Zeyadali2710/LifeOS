import { z } from "zod";

// Single source for D-04 re-validation (client form + server decide).
export const issuePayloadSchema = z.object({
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  title: z.string().trim().min(1, "Title is required.").max(256, "Title must be 256 characters or fewer."),
  body: z.string().max(65536).default(""),
  labels: z.array(z.string().trim().min(1).max(50)).max(10, "Labels must be comma-separated, up to 10.").default([]),
});

export type IssuePayload = z.infer<typeof issuePayloadSchema>;

export function parseLabels(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
