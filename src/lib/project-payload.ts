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
  context: z.string().max(4000, "Context must be 4000 characters or fewer.").default(""),
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

// ---- Agent draft payloads (phase 5.1, D-09) ----
// Field names are ref/milestoneRef/blockedBy, never "key": redact() masks key-named fields.
const draftRef = z.string().trim().min(1).max(40);
const optDate = z.iso.date("Enter a valid date.").nullable().optional();

// .pick keeps workspacePath/workspaceMachine (shell-bound) out of agent payloads.
const draftFields = projectInput.pick({ name: true, description: true, context: true, category: true, priority: true, targetDate: true });
// Same rules, no defaults: zod 4 fires defaults inside optional(), which would reset untouched fields.
const draftChanges = z.object({
  name: projectInput.shape.name.optional(),
  description: z.string().max(500, "Description must be 500 characters or fewer.").optional(),
  context: z.string().max(4000, "Context must be 4000 characters or fewer.").optional(),
  category: z.enum(PROJECT_CATEGORIES).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  targetDate: optDate,
});

const draftMilestone = z.object({
  id: z.uuid().optional(),
  ref: draftRef.optional(),
  title: milestoneInput.shape.title,
  dueDate: optDate,
});
const draftTask = z.object({
  id: z.uuid().optional(),
  ref: draftRef.optional(),
  title: z.string().trim().min(1, "Add a title.").max(200, "Title must be 200 characters or fewer."),
  dueDate: optDate,
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
  milestoneRef: z.string().max(40).nullable().optional(),
  blockedBy: z.array(z.string().max(40)).max(10).optional(),
});

export const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const draftLink = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), repo: z.string().max(140).regex(REPO_FULL_NAME, "Use owner/name.") }),
  linkInput.options[1],
]);

const projectBefore = z.object({
  name: z.string().max(200),
  updatedAt: z.string().max(40),
  fields: z.object({
    name: z.string().max(200),
    description: z.string().max(500),
    context: z.string().max(4000),
    category: z.string().max(40),
    priority: z.number().int().min(1).max(3),
    targetDate: z.string().nullable(),
  }),
  milestones: z.array(z.object({ id: z.uuid(), title: z.string().max(200), dueDate: z.string().nullable() })).max(12).default([]),
  tasks: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().max(300),
        dueDate: z.string().nullable(),
        priority: z.number().int().nullable(),
        milestoneId: z.uuid().nullable(),
      }),
    )
    .max(40)
    .default([]),
});

type Draft = {
  milestones: { ref?: string }[];
  tasks: { ref?: string; id?: string; milestoneRef?: string | null; blockedBy?: string[] }[];
  links: ({ kind: "repo"; repo: string } | { kind: "url"; url: string })[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refsResolve(allowIds: boolean) {
  return (p: Draft, ctx: z.RefinementCtx) => {
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const dup = (refs: (string | undefined)[], field: "milestones" | "tasks") => {
      const seen = new Set<string>();
      refs.forEach((r, i) => {
        if (r === undefined) return;
        if (seen.has(r)) bad([field, i, "ref"], "Each ref must be unique.");
        seen.add(r);
      });
    };
    dup(p.milestones.map((m) => m.ref), "milestones");
    dup(p.tasks.map((t) => t.ref), "tasks");
    const mRefs = new Set(p.milestones.map((m) => m.ref).filter((r): r is string => !!r));
    const tRefs = new Set(p.tasks.map((t) => t.ref).filter((r): r is string => !!r));
    const known = (set: Set<string>, v: string) => set.has(v) || (allowIds && UUID.test(v));
    p.tasks.forEach((t, i) => {
      if (t.milestoneRef && !known(mRefs, t.milestoneRef)) bad(["tasks", i, "milestoneRef"], "Pick a milestone from this draft.");
      for (const b of t.blockedBy ?? []) {
        if ((t.ref && b === t.ref) || (t.id && b === t.id)) bad(["tasks", i, "blockedBy"], "A task can't block itself.");
        else if (!known(tRefs, b)) bad(["tasks", i, "blockedBy"], "Pick a task from this draft.");
      }
    });
    const seen = new Set<string>();
    p.links.forEach((l, i) => {
      const k = l.kind === "repo" ? `r:${l.repo.toLowerCase()}` : `u:${l.url}`;
      if (seen.has(k)) bad(["links", i], "This link is already in the draft.");
      seen.add(k);
    });
  };
}

const sources = z.array(z.string().max(300)).max(50).default([]);
const links = z.array(draftLink).max(10).default([]);

export const projectCreatePayload = draftFields
  .extend({
    milestones: z.array(draftMilestone.omit({ id: true })).max(12).default([]),
    tasks: z.array(draftTask.omit({ id: true })).max(40).default([]),
    links,
    sources,
  })
  .superRefine(refsResolve(false));
export type ProjectCreatePayload = z.infer<typeof projectCreatePayload>;

export const projectUpdatePayload = z
  .object({
    projectId: z.uuid(),
    before: projectBefore,
    changes: draftChanges.default({}),
    milestones: z.array(draftMilestone).max(12).default([]),
    tasks: z.array(draftTask).max(40).default([]),
    links,
    sources,
  })
  .superRefine(refsResolve(true));
export type ProjectUpdatePayload = z.infer<typeof projectUpdatePayload>;
export type DraftTask = z.infer<typeof draftTask>;
export type DraftMilestone = z.infer<typeof draftMilestone>;
export type DraftLink = z.infer<typeof draftLink>;

export function draftCounts(p: ProjectCreatePayload | ProjectUpdatePayload) {
  return {
    milestones: p.milestones.length,
    tasks: p.tasks.length,
    links: p.links.length,
    deps: p.tasks.reduce((n, t) => n + (t.blockedBy?.length ?? 0), 0),
    fields: "changes" in p ? Object.keys(p.changes).length : 0,
  };
}
