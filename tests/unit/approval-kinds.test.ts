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

describe("event payload times (CR-A04)", () => {
  const base = { title: "T", calendarId: "11111111-2222-4333-8444-555555555555", calendarLabel: "Google · Main", provider: "google" };
  const ok = (o: object) => payloadSchemaFor("calendar.create_event").safeParse({ ...base, ...o }).success;

  it("rejects timed values without a UTC offset, accepts Z and explicit offsets", () => {
    expect(ok({ start: "2026-10-15T09:00:00", end: "2026-10-15T10:00:00" })).toBe(false);
    expect(ok({ start: "2026-10-15T09:00:00+11:00", end: "2026-10-15T10:00:00+11:00" })).toBe(true);
    expect(ok({ start: "2026-10-14T22:00:00.000Z", end: "2026-10-14T23:00:00.000Z" })).toBe(true);
  });

  it("all-day values must be plain dates", () => {
    expect(ok({ allDay: true, start: "2026-10-15T09:00:00Z", end: "2026-10-16T09:00:00Z" })).toBe(false);
    expect(ok({ allDay: true, start: "2026-10-15", end: "2026-10-16" })).toBe(true);
  });
});

describe("event payload bounds (WR-C05)", () => {
  const ok = (kind: string, o: object) => payloadSchemaFor(kind).safeParse(o).success;

  it("rejects impossible all-day dates", () => {
    expect(ok("calendar.create_event", { ...ev, allDay: true, start: "2026-02-31", end: "2026-03-01" })).toBe(false);
  });

  it("time zones must be known and bounded", () => {
    expect(ok("calendar.create_event", { ...ev, timeZone: "Europe/London" })).toBe(true);
    expect(ok("calendar.create_event", { ...ev, timeZone: "Mars/Olympus" })).toBe(false);
    expect(ok("calendar.create_event", { ...ev, timeZone: "x".repeat(65) })).toBe(false);
  });

  it("caps etag, instanceStart, before and delete fields", () => {
    expect(ok("calendar.update_event", upd)).toBe(true);
    expect(ok("calendar.update_event", { ...upd, etag: "e".repeat(513) })).toBe(false);
    expect(ok("calendar.update_event", { ...upd, instanceStart: "2".repeat(41) })).toBe(false);
    expect(ok("calendar.update_event", { ...upd, before: { ...upd.before, description: "d".repeat(16001) } })).toBe(false);
    expect(ok("calendar.delete_event", { ...cal, ...inst, title: "L", start: "s".repeat(41), end: "e", allDay: false })).toBe(false);
  });
});

describe("project approval kinds", () => {
  const link = { kind: "url" as const, label: "Docs", url: "https://a.example/x" };
  const link2 = { kind: "repo" as const, repo: "me/a" };
  const pc = {
    name: "Studio",
    description: "",
    context: "",
    category: "personal",
    priority: 2,
    targetDate: null,
    milestones: [{ ref: "m1", title: "M" }],
    tasks: [{ ref: "t1", title: "T" }],
    links: [link, link2],
    sources: ["a"],
  };
  it("maps and locks", () => {
    expect(approvalKind("projects.create")).toBe("project_create");
    expect(approvalKind("projects.update")).toBe("project_update");
    expect(payloadSchemaFor("projects.create").safeParse(pc).success).toBe(true);
    expect(checkLocked("project_create", pc, { ...pc, sources: [] })).toEqual({ sources: "This can't be changed." });
    expect(checkLocked("project_update", { ...pc, projectId: "a" }, { ...pc, projectId: "b" })).toEqual({ projectId: "This can't be changed." });
    expect(nothingText("project_create")).toBe("Nothing was created.");
    expect(nothingText("project_update")).toBe("Nothing was changed.");
  });
  it("links can only be removed", () => {
    expect(checkLocked("project_create", pc, { ...pc, links: [link] })).toBeNull();
    expect(checkLocked("project_create", pc, { ...pc, links: [...pc.links, { ...link, label: "New" }] })).toEqual({ links: "Links can only be removed." });
    expect(checkLocked("project_create", pc, { ...pc, links: [{ kind: "repo", repo: "me/b" }] })).toEqual({ links: "Links can only be removed." });
  });
  it("summarises", () => {
    const exp = new Date("2026-10-14T01:00:00Z");
    const s = approvalSummary("projects.create", pc, exp);
    expect(s.title).toBe('Approval waiting: create project "Studio"');
    expect(s.body).toMatch(/^1 tasks, 1 milestones, 2 links\. Expires /);
    expect(approvalSummary("projects.create", { ...pc, milestones: [], tasks: [], links: [] }, exp).body).toMatch(/^Expires /);
    expect(approvalSummary("projects.create", { nope: 1 }, exp)).toEqual({ title: "", body: undefined });
  });
});
