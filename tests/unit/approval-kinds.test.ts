import { describe, expect, it } from "vitest";
import { approvalKind, approvalSummary, checkLocked, nothingText, payloadSchemaFor } from "@/lib/approval-kinds";

const cal = { calendarId: "11111111-1111-4111-8111-111111111111", calendarLabel: "Personal", provider: "google" as const };
const ev = { ...cal, title: "Lunch", start: "2026-10-12T01:00:00Z", end: "2026-10-12T02:00:00Z" };
const inst = { eventId: "22222222-2222-4222-8222-222222222222", etag: "e", scope: "this" as const, instanceStart: null };
const upd = { ...ev, ...inst, before: { title: "L", start: "a", end: "b", allDay: false, location: "", description: "", showAs: "busy" } };
const issue = { repo: "me/a", title: "Bug", body: "", labels: [] };

describe("approval kinds", () => {
  it("maps tools to kinds", () => {
    expect(approvalKind("github.create_issue")).toBe("issue");
    expect(approvalKind("test.approve")).toBe("issue");
    expect(approvalKind("calendar.create_event")).toBe("event_create");
    expect(approvalKind("calendar.update_event")).toBe("event_update");
    expect(approvalKind("calendar.delete_event")).toBe("event_delete");
  });

  it("validates end after start", () => {
    const s = payloadSchemaFor("calendar.create_event");
    expect(s.safeParse(ev).success).toBe(true);
    const bad = s.safeParse({ ...ev, end: ev.start });
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues[0]!.message).toBe("End must be after start.");
  });

  it("locks fields per kind", () => {
    expect(checkLocked("event_update", upd, { ...upd, calendarId: "x" })).toEqual({ calendarId: "Calendar can't be changed." });
    expect(checkLocked("event_update", upd, { ...upd, eventId: "x" })).toEqual({ eventId: "This can't be changed." });
    expect(checkLocked("issue", issue, { ...issue, repo: "x/y" })).toEqual({ repo: "Repository can't be changed." });
    expect(checkLocked("issue", issue, { ...issue, title: "New" })).toBeNull();
    expect(checkLocked("event_update", upd, { ...upd, title: "New" })).toBeNull();
    // jsonb reorders object keys; a reordered `before` snapshot is still the same value.
    const before = { title: "Gym", start: "a", end: "b", allDay: false, location: "", description: "", showAs: "busy" };
    const reordered = Object.fromEntries(Object.entries(before).reverse());
    expect(checkLocked("event_update", { ...upd, before }, { ...upd, before: reordered })).toBeNull();
    expect(checkLocked("event_update", { ...upd, before }, { ...upd, before: { ...reordered, title: "X" } })).toEqual({ before: "This can't be changed." });
  });

  it("nothing text", () => {
    expect(nothingText("issue")).toBe("Nothing was created.");
    expect(nothingText("event_create")).toBe("Nothing was created.");
    expect(nothingText("event_update")).toBe("Nothing was changed.");
    expect(nothingText("event_delete")).toBe("Nothing was deleted.");
  });

  it("summaries", () => {
    const exp = new Date("2026-10-19T01:00:00Z");
    const del = approvalSummary("calendar.delete_event", { ...cal, ...inst, title: "Lunch", start: ev.start, end: ev.end, allDay: false }, exp);
    expect(del.title).toBe("Approval waiting: delete calendar event");
    expect(del.body).toContain('"Lunch"');
    expect(del.body).toContain("This removes it from Personal.");
    expect(approvalSummary("calendar.create_event", ev, exp).title).toBe("Approval waiting: create calendar event");
    expect(approvalSummary("github.create_issue", issue, exp).body).toMatch(/^me\/a: "Bug"\. Expires /);
    expect(approvalSummary("calendar.create_event", { nope: 1 }, exp)).toEqual({ title: "", body: undefined });
  });
});
