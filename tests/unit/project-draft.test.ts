import { describe, expect, it } from "vitest";
import { draftCounts, projectCreatePayload as C, projectInput, projectUpdatePayload as U } from "@/lib/project-payload";
import { redact } from "@/server/agents/redact";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";
const before = { name: "P", updatedAt: "2026-10-13T00:00:00Z", fields: { name: "P", description: "", context: "", category: "personal", priority: 2, targetDate: null } };
const paths = (r: { error?: { issues: { path: PropertyKey[] }[] } }) => r.error?.issues.map((i) => i.path) ?? [];
const n = (k: number, o: object) => Array.from({ length: k }, () => o);

describe("projectInput.context", () => {
  it("accepts 4000, rejects 4001, defaults to empty", () => {
    expect(projectInput.safeParse({ name: "a", context: "x".repeat(4000) }).success).toBe(true);
    const r = projectInput.safeParse({ name: "a", context: "x".repeat(4001) });
    expect(r.error?.issues[0]?.message).toBe("Context must be 4000 characters or fewer.");
    expect(projectInput.parse({ name: "a" }).context).toBe("");
  });
});

describe("projectCreatePayload", () => {
  it("minimal payload defaults collections to empty", () => {
    const p = C.parse({ name: "Studio" });
    expect([p.milestones, p.tasks, p.links, p.sources]).toEqual([[], [], [], []]);
  });
  it("enforces bounds 12/40/10", () => {
    expect(C.safeParse({ name: "a", milestones: n(13, { title: "m" }) }).success).toBe(false);
    expect(C.safeParse({ name: "a", tasks: n(41, { title: "t" }) }).success).toBe(false);
    const links = Array.from({ length: 11 }, (_, i) => ({ kind: "url", label: "l", url: `https://x.test/${i}` }));
    expect(C.safeParse({ name: "a", links }).success).toBe(false);
    expect(C.safeParse({ name: "a", milestones: n(12, { title: "m" }), tasks: n(40, { title: "t" }) }).success).toBe(true);
  });
  it("rejects a dangling milestoneRef", () => {
    const r = C.safeParse({ name: "a", tasks: [{ title: "t", milestoneRef: "m9" }] });
    expect(paths(r)).toContainEqual(["tasks", 0, "milestoneRef"]);
  });
  it("rejects dangling and self blockedBy", () => {
    const r = C.safeParse({ name: "a", tasks: [{ ref: "t1", title: "t", blockedBy: ["t1"] }, { title: "u", blockedBy: ["zz"] }] });
    expect(paths(r)).toEqual([["tasks", 0, "blockedBy"], ["tasks", 1, "blockedBy"]]);
  });
  it("rejects duplicate refs", () => {
    expect(C.safeParse({ name: "a", milestones: [{ ref: "m", title: "a" }, { ref: "m", title: "b" }] }).success).toBe(false);
    expect(C.safeParse({ name: "a", tasks: [{ ref: "t", title: "a" }, { ref: "t", title: "b" }] }).success).toBe(false);
  });
  it("rejects duplicate links", () => {
    const repo = C.safeParse({ name: "a", links: [{ kind: "repo", repo: "me/x" }, { kind: "repo", repo: "ME/x" }] });
    expect(paths(repo)).toContainEqual(["links", 1]);
    const u = { kind: "url", label: "l", url: "https://a.test" };
    expect(paths(C.safeParse({ name: "a", links: [u, u] }))).toContainEqual(["links", 1]);
  });
  it("strips workspace keys and ids", () => {
    const p = C.parse({ name: "a", workspacePath: "/x", workspaceMachine: "m", milestones: [{ title: "m", id: ID }] });
    expect(p).not.toHaveProperty("workspacePath");
    expect(p).not.toHaveProperty("workspaceMachine");
    expect(p.milestones[0]).not.toHaveProperty("id");
  });
  it("redact leaves refs intact", () => {
    const p = C.parse({ name: "a", milestones: [{ ref: "m1", title: "m" }], tasks: [{ ref: "t1", title: "t", milestoneRef: "m1" }, { title: "u", blockedBy: ["t1"] }] });
    expect(JSON.stringify(redact(p))).not.toContain("[redacted]");
  });
  it("draftCounts counts deps", () => {
    const p = C.parse({ name: "a", tasks: [{ ref: "t1", title: "t" }, { title: "u", blockedBy: ["t1"] }] });
    expect(draftCounts(p)).toEqual({ milestones: 0, tasks: 2, links: 0, deps: 1, fields: 0 });
  });
});

describe("projectUpdatePayload", () => {
  it("keeps only the changed keys", () => {
    expect(U.parse({ projectId: ID, before, changes: { name: "X" } }).changes).toEqual({ name: "X" });
  });
  it("allows existing uuids or draft refs", () => {
    const ok = U.safeParse({ projectId: ID, before, milestones: [{ ref: "m", title: "m" }], tasks: [{ title: "t", milestoneRef: ID2, blockedBy: [ID2] }, { ref: "x", title: "u", milestoneRef: "m" }] });
    expect(ok.success).toBe(true);
    expect(U.safeParse({ projectId: ID, before, tasks: [{ title: "t", blockedBy: ["nope"] }] }).success).toBe(false);
  });
  it("counts changed fields", () => {
    expect(draftCounts(U.parse({ projectId: ID, before, changes: { name: "X", priority: 1 } })).fields).toBe(2);
  });
});
