import { formatHM, sydneyParts, TZ } from "@/server/time";
import { eventCreatePayload, eventDeletePayload, eventUpdatePayload } from "./event-payload";
import { issuePayloadSchema } from "./issue-payload";
import { mailReplyPayload, type MailReplyPayload } from "./mail-payload";
import { draftCounts, projectCreatePayload, projectUpdatePayload } from "./project-payload";
import { z } from "zod";
import { checkVariant } from "./social-types";
import { financeChangePayload } from "./finance-payload";

// Per-tool-kind approval contract (client-safe).
export type ApprovalKind = "issue" | "event_create" | "event_update" | "event_delete" | "project_create" | "project_update" | "mail_reply" | "social_publish" | "finance_update";

export const socialPublishPayload = z.object({
  variantId: z.uuid(), platform: z.enum(["linkedin", "instagram"]), text: z.string().max(10_000),
  imageUrl: z.url().max(2000).nullable(), linkUrl: z.url().max(2000).nullable(),
  publishAt: z.iso.datetime({ offset: true }).nullable(),
  providerMode: z.enum(["real", "mock"]), connectionGeneration: z.uuid().nullable(),
}).superRefine((value, ctx) => {
  for (const message of checkVariant(value.platform, value).errors) ctx.addIssue({ code: "custom", path: ["text"], message });
});

const KINDS: Record<string, ApprovalKind> = {
  "calendar.create_event": "event_create",
  "calendar.update_event": "event_update",
  "calendar.delete_event": "event_delete",
  "projects.create": "project_create",
  "projects.update": "project_update",
  "mail.send_reply": "mail_reply", // never the "issue" fallback: bodies must not reach audit_log
  "socials.publish": "social_publish",
  "finance.update": "finance_update",
};
export const approvalKind = (tool: string): ApprovalKind => KINDS[tool] ?? "issue";

const SCHEMAS = {
  issue: issuePayloadSchema,
  event_create: eventCreatePayload,
  event_update: eventUpdatePayload,
  event_delete: eventDeletePayload,
  project_create: projectCreatePayload,
  project_update: projectUpdatePayload,
  mail_reply: mailReplyPayload,
  social_publish: socialPublishPayload,
  finance_update: financeChangePayload,
};
export const payloadSchemaFor = (tool: string) => SCHEMAS[approvalKind(tool)];

const TARGET = ["calendarId", "calendarLabel", "provider"];
export const LOCKED: Record<ApprovalKind, string[]> = {
  issue: ["repo"],
  event_create: TARGET,
  event_update: [...TARGET, "eventId", "etag", "scope", "instanceStart", "before"],
  event_delete: Object.keys(eventDeletePayload.shape),
  project_create: ["sources"],
  project_update: ["projectId", "before", "sources"],
  mail_reply: ["messageId", "connectionId", "mailbox", "threadId", "to", "cc", "inReplyTo", "references", "originalSubject", "from"],
  social_publish: ["variantId", "platform", "providerMode", "connectionGeneration"],
  finance_update: ["before"],
};

// Key-order-independent: the stored original comes back from jsonb, which reorders object keys.
const stable = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );

/** Names of the top-level fields that differ, never their values. */
export function changedKeys(orig: unknown, next: unknown): string[] {
  const o = (orig ?? {}) as Record<string, unknown>;
  const n = (next ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => stable(o[k]) !== stable(n[k])).sort();
}

export function checkLocked(kind: ApprovalKind, orig: unknown, next: unknown): Record<string, string> | null {
  const o = (orig ?? {}) as Record<string, unknown>;
  const n = (next ?? {}) as Record<string, unknown>;
  for (const k of LOCKED[kind]) {
    if (stable(o[k]) !== stable(n[k])) {
      return { [k]: k === "repo" ? "Repository can't be changed." : k === "calendarId" ? "Calendar can't be changed." : kind === "mail_reply" ? "Recipients and the thread can't be changed." : "This can't be changed." };
    }
  }
  if (kind === "project_create" || kind === "project_update") {
    // Repo/url targets can be removed, never added or retargeted.
    const orig0 = new Set(((o.links as unknown[]) ?? []).map(stable));
    if (((n.links as unknown[]) ?? []).some((l) => !orig0.has(stable(l)))) return { links: "Links can only be removed." };
  }
  return null;
}

const NOTHING: Record<ApprovalKind, string> = {
  issue: "Nothing was created.",
  event_create: "Nothing was created.",
  event_update: "Nothing was changed.",
  event_delete: "Nothing was deleted.",
  project_create: "Nothing was created.",
  project_update: "Nothing was changed.",
  mail_reply: "Nothing was sent.",
  social_publish: "Nothing was posted.",
  finance_update: "No finance data was changed.",
};
export const nothingText = (kind: ApprovalKind) => NOTHING[kind];

function when(d: Date, withTime = true) {
  const mon = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, month: "short" }).format(d);
  const p = sydneyParts(d);
  const day = `${p.weekday} ${p.day} ${mon}`;
  return withTime ? `${day} ${formatHM(d)}` : day;
}

export function approvalSummary(tool: string, payload: unknown, expiresAt: Date): { title: string; body: string | undefined } {
  const kind = approvalKind(tool);
  const exp = when(expiresAt);
  if (kind === "issue") {
    // Loose on purpose: Phase 3 notified for any payload with string repo/title.
    const p = (payload ?? {}) as { repo?: unknown; title?: unknown };
    const ok = typeof p.repo === "string" && typeof p.title === "string";
    return { title: "", body: ok ? `${p.repo}: "${p.title}". Expires ${exp}.` : undefined };
  }
  const parsed = payloadSchemaFor(tool).safeParse(payload);
  if (!parsed.success) return { title: "", body: undefined };
  if (kind === "project_create" || kind === "project_update") {
    const pp = parsed.data as Parameters<typeof draftCounts>[0];
    const c = draftCounts(pp);
    if (kind === "project_create") {
      const parts = [
        c.tasks && `${c.tasks} tasks`,
        c.milestones && `${c.milestones} milestones`,
        c.links && `${c.links} links`,
      ].filter(Boolean);
      return {
        title: `Approval waiting: create project "${(pp as { name: string }).name}"`,
        body: `${parts.length ? parts.join(", ") + ". " : ""}Expires ${exp}.`,
      };
    }
    const k = c.fields + c.tasks + c.milestones + c.links;
    return { title: `Approval waiting: change project "${(pp as { before: { name: string } }).before.name}"`, body: `${k} changes. Expires ${exp}.` };
  }
  if (kind === "mail_reply") {
    const m = parsed.data as MailReplyPayload;
    const to = m.to[0]!;
    return { title: `Approval waiting: reply to ${to.name || to.address} · ${m.subject}`, body: `${m.body.length} characters to ${to.address}. Expires ${exp}.` };
  }
  if (kind === "finance_update") {
    const p = financeChangePayload.parse(parsed.data);
    return { title: "Approval waiting: finance changes", body: `${p.impact.changed} transactions, ${p.plan.categories.length} categories, ${p.plan.budgets.length} budget changes. Expires ${exp}.` };
  }
  if (kind === "social_publish") {
    const p = parsed.data as z.infer<typeof socialPublishPayload>;
    const label = p.platform === "linkedin" ? "LinkedIn" : "Instagram";
    const preview = p.text.trim().slice(0, 50);
    const scheduled = p.publishAt ? ` · ${when(new Date(p.publishAt))}` : "";
    return { title: `Approval waiting: post to ${label} · ${preview}${scheduled}`, body: `${p.providerMode === "mock" ? "MOCK · nothing leaves LifeOS. " : ""}Expires ${exp}.` };
  }
  const p = parsed.data as { title: string; start: string; allDay: boolean; calendarLabel: string };
  const s = new Date(p.allDay ? `${p.start}T12:00:00Z` : p.start);
  const st = Number.isNaN(s.getTime()) ? "" : ` · ${when(s, !p.allDay)}`;
  if (kind === "event_delete") {
    return { title: "Approval waiting: delete calendar event", body: `"${p.title}"${st}. This removes it from ${p.calendarLabel}.` };
  }
  return {
    title: kind === "event_create" ? "Approval waiting: create calendar event" : "Approval waiting: change calendar event",
    body: `"${p.title}"${st}. Expires ${exp}.`,
  };
}
