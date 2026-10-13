import { describe, expect, it } from "vitest";
import { mailOf, mailResolved, sameMail, toMailDraft, validateMailDraft } from "@/approvals/mail-approval";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailReplyPayload } from "@/lib/mail-payload";

const MID = "00000000-0000-4000-8000-000000000001";
const base: MailReplyPayload = {
  messageId: MID,
  threadId: "t1",
  to: [{ name: "Lee", address: "lee@example.org" }],
  cc: [],
  inReplyTo: "<a@b>",
  references: null,
  originalSubject: "Agenda",
  subject: "Re: Agenda",
  body: "Friday works.",
};
const appr = (over: Partial<ApprovalDTO>): ApprovalDTO =>
  ({ id: "a", runId: "r", agentId: "outreach", tool: "mail.send_reply", status: "executed", kind: "mail_reply", original: base, edited: null, reason: null, createdAt: "", expiresAt: "", decidedAt: null, result: null, error: null, repoPrivate: null, targetChanged: null, ...over }) as ApprovalDTO;

describe("mail reply draft", () => {
  it("round-trips subject and body", () => {
    expect(toMailDraft(base)).toEqual({ subject: "Re: Agenda", body: "Friday works." });
    expect(mailOf(appr({ edited: { ...base, body: "Changed" } })).body).toBe("Changed");
  });

  it("reports an empty subject and empty body with the schema messages", () => {
    const r = validateMailDraft("mail.send_reply", base, { subject: "", body: "x" });
    expect("errors" in r && r.errors.subject).toBe("Add a subject.");
    const e = validateMailDraft("mail.send_reply", base, { subject: "ok", body: "  " });
    expect("errors" in e && e.errors.body).toBe("Write a reply.");
  });

  it("keeps recipients and thread from base even if the draft tries to set them", () => {
    const evil = { subject: "Hi", body: "Yo", to: [{ name: "Eve", address: "eve@evil.test" }], threadId: "evil" } as never;
    const r = validateMailDraft("mail.send_reply", base, evil);
    expect("payload" in r && r.payload.to).toEqual(base.to);
    expect("payload" in r && r.payload.threadId).toBe("t1");
    expect("payload" in r && r.payload.subject).toBe("Hi");
  });

  it("compares subject and body only", () => {
    expect(sameMail(base, { ...base, to: [] })).toBe(true);
    expect(sameMail(base, { ...base, body: "other" })).toBe(false);
    expect(sameMail(base, { ...base, subject: "other" })).toBe(false);
  });
});

describe("mailResolved", () => {
  it("links to the email only for a uuid message id", () => {
    expect(mailResolved(appr({}), "10:00")).toMatchObject({ text: "Reply sent to Lee. Approved at 10:00.", href: `/outreach?tab=email&mail=${MID}` });
    expect(mailResolved(appr({ original: { ...base, messageId: "../../x" } }), "10:00")?.href).toBeNull();
  });

  it("reports a draft hand-off", () => {
    expect(mailResolved(appr({ status: "rejected", result: { gmailDraftId: "d1" } }), "10:00")?.text).toBe("Moved to Gmail drafts. Finish it in Gmail.");
    expect(mailResolved(appr({ status: "rejected" }), "10:00")).toBeNull();
  });

  it("flags a Reconnect Google failure", () => {
    const r = mailResolved(appr({ status: "failed", error: "Gmail isn't allowed. Reconnect Google in Settings → Connections." }), "10:00");
    expect(r?.reconnect).toBe(true);
    expect(r?.text).toContain("Nothing was sent.");
    expect(mailResolved(appr({ status: "failed", error: "boom" }), "10:00")?.reconnect).toBe(false);
  });
});
