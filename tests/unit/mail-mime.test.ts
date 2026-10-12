import { describe, expect, it } from "vitest";
import { buildReplyMime, replyMessageId } from "@/server/mail/mime";

const base: Parameters<typeof buildReplyMime>[0] = { to: [{ name: "Hannah", address: "h@x.test" }], cc: [], subject: "Demo night", body: "Hello there", inReplyTo: "<orig@x>", references: "<a@x>", approvalId: "abc" };
const decode = (p: Partial<typeof base> = {}) => Buffer.from(buildReplyMime({ ...base, ...p }), "base64url").toString("utf8");
const headers = (m: string) => m.split("\r\n\r\n")[0]!.split("\r\n");

describe("buildReplyMime", () => {
  it("uses CRLF headers and base64url overall", () => {
    const raw = buildReplyMime(base);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const m = decode();
    expect(m).toContain("\r\n\r\n");
    expect(m.split("\r\n\r\n")[0]).not.toContain("\n\n");
  });
  it("prefixes Re: once", () => {
    expect(headers(decode())).toContain("Subject: Re: Demo night");
    expect(headers(decode({ subject: "re: X" }))).toContain("Subject: re: X");
  });
  it("RFC 2047 for non-ASCII subjects", () => {
    const line = headers(decode({ subject: "Café" })).find((l) => l.startsWith("Subject:"))!;
    const m = /=\?UTF-8\?B\?(.+)\?=/.exec(line)!;
    expect(Buffer.from(m[1]!, "base64").toString("utf8")).toBe("Re: Café");
  });
  it("strips CR/LF so no Bcc header can be injected", () => {
    const m = decode({ subject: "x\r\nBcc: evil@x.test", to: [{ name: "N\r\nBcc: evil@x.test", address: "h@x.test" }] });
    expect(headers(m).some((l) => l.startsWith("Bcc:"))).toBe(false);
  });
  it("threads and sets the deterministic Message-ID", () => {
    const h = headers(decode());
    expect(h).toContain("In-Reply-To: <orig@x>");
    expect(h).toContain("References: <a@x> <orig@x>");
    expect(h).toContain("Message-ID: <approval-abc@lifeos.local>");
    expect(replyMessageId("abc")).toBe("<approval-abc@lifeos.local>");
    expect(headers(decode({ approvalId: null })).some((l) => l.startsWith("Message-ID:"))).toBe(false);
  });
  it("quotes names, renders Cc only when present", () => {
    expect(headers(decode({ to: [{ name: 'Ha"nnah', address: "h@x.test" }] }))[0]).toBe('To: "Ha\\"nnah" <h@x.test>');
    expect(headers(decode()).some((l) => l.startsWith("Cc:"))).toBe(false);
    expect(headers(decode({ cc: [{ name: "", address: "c@x.test" }] }))).toContain("Cc: c@x.test");
  });
  it("wraps the base64 body at 76 and declares utf-8 text/plain", () => {
    const m = decode({ body: "y".repeat(500) });
    expect(headers(m)).toContain("Content-Type: text/plain; charset=UTF-8");
    for (const l of m.split("\r\n\r\n")[1]!.trim().split("\r\n")) expect(l.length).toBeLessThanOrEqual(76);
  });
});
