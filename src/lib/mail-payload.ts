import { z } from "zod";

// Single source for mail reply approval payloads (agent approvals + owner editor). Client-safe.
const addr = z.object({ name: z.string().max(200), address: z.email().max(320) });

export const mailReplyPayload = z.object({
  messageId: z.uuid(),
  threadId: z.string().min(1).max(200),
  to: z.array(addr).min(1).max(20),
  cc: z.array(addr).max(20),
  inReplyTo: z.string().max(998).nullable(),
  references: z.string().max(4000).nullable(),
  originalSubject: z.string().max(300),
  subject: z.string().trim().min(1, "Add a subject.").max(200, "Subject must be 200 characters or fewer."),
  body: z.string().trim().min(1, "Write a reply.").max(10000, "Reply must be 10,000 characters or fewer."),
});
export type MailReplyPayload = z.infer<typeof mailReplyPayload>;
