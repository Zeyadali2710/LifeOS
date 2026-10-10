import { z } from "zod";

// Client-safe: no server imports.
export const taskInput = z
  .object({
    title: z.string().trim().min(1, "Add a title.").max(200, "Title must be 200 characters or fewer."),
    notes: z.string().max(4000, "Notes must be 4000 characters or fewer.").default(""),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").nullable().default(null),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.").nullable().default(null),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
    remindAt: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid reminder time.")
      .nullable()
      .default(null),
  })
  .superRefine((v, ctx) => {
    if (v.dueTime && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueTime"], message: "Add a due date before choosing a time." });
  });

export type TaskInput = z.infer<typeof taskInput>;
