import { z } from "zod";
import { PROJECT_CATEGORIES, PROJECT_STATUSES } from "./project-types";

// Client-safe: no server imports.
const date = () => z.iso.date("Enter a valid date.").nullable().default(null);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .default(null);

export const projectInput = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(80, "Name must be 80 characters or fewer."),
  description: z.string().max(500, "Description must be 500 characters or fewer.").default(""),
  category: z.enum(PROJECT_CATEGORIES).default("personal"),
  status: z.enum(PROJECT_STATUSES).default("active"),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  targetDate: date(),
  // The path is pasted into a shell by the owner (launch command): no quotes, backticks, $ or newlines.
  workspacePath: optText(400).refine((v) => v === null || !/["`$\r\n]/.test(v), {
    message: "Paths can't contain quotes, backticks, $ or line breaks.",
  }),
  workspaceMachine: optText(40),
  blockerNote: z.string().max(500, "Blocker note must be 500 characters or fewer.").default(""),
});
export type ProjectInput = z.infer<typeof projectInput>;

export const milestoneInput = z.object({
  title: z.string().trim().min(1, "Give the milestone a title.").max(120, "Title must be 120 characters or fewer."),
  dueDate: date(),
});
export type MilestoneInput = z.infer<typeof milestoneInput>;

const URL_MSG = "Enter a full web address starting with http:// or https://";
export const linkInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), repoId: z.number().int().positive() }),
  z.object({
    kind: z.literal("url"),
    label: z.string().trim().min(1, "Add a label.").max(80, "Label must be 80 characters or fewer."),
    url: z
      .string()
      .trim()
      .url(URL_MSG)
      .refine((u) => /^https?:\/\//i.test(u), URL_MSG),
  }),
]);
export type LinkInput = z.infer<typeof linkInput>;
