import { describe, expect, it } from "vitest";
import { toProjectDraft, validateProjectDraft, type ProjectPayload } from "@/approvals/project-approval";
import { projectCreatePayload as C, projectUpdatePayload as U } from "@/lib/project-payload";

const PID = "00000000-0000-4000-8000-000000000001";
const T1 = "00000000-0000-4000-8000-000000000002";
const M1 = "00000000-0000-4000-8000-000000000003";
const M2 = "00000000-0000-4000-8000-000000000004";
const fields = { name: "P", description: "", context: "", category: "personal", priority: 2, targetDate: null };

const ok = (tool: string, p: ProjectPayload, d = toProjectDraft(p)) => {
  const r = validateProjectDraft(tool, p, d);
  if (!("payload" in r)) throw new Error(JSON.stringify(r.errors));
  return r.payload;
};

describe("project edit draft", () => {
  it("CR-01: a task without milestoneRef stays unassigned after an edit", () => {
    const p = C.parse({ name: "a", milestones: [{ ref: "m1", title: "M" }], tasks: [{ title: "t" }, { title: "u", milestoneRef: "m1" }] });
    const d = toProjectDraft(p);
    expect(d.tasks[0]!.milestone).toBe("");
    const out = ok("projects.create", p, { ...d, name: "b" });
    expect(out.tasks[0]!.milestoneRef ?? null).toBeNull();
    expect(out.tasks[1]!.milestoneRef).toBe("m1");
  });
  it("CR-02: editing an update keeps omitted due/priority/milestone and shows the current values", () => {
    const p = U.parse({
      projectId: PID,
      before: { name: "P", updatedAt: "2026-10-13T00:00:00Z", fields, milestones: [{ id: M1, title: "M", dueDate: "2026-11-01" }], tasks: [{ id: T1, title: "Old", dueDate: "2026-11-03", priority: 1, milestoneId: M2 }] },
      milestones: [{ id: M1, title: "M renamed" }],
      tasks: [{ id: T1, title: "New" }],
    });
    const d = toProjectDraft(p);
    expect(d.tasks[0]).toMatchObject({ dueDate: "2026-11-03", priority: "1", milestone: M2 });
    expect(d.milestones[0]!.dueDate).toBe("2026-11-01");
    const out = ok("projects.update", p, { ...d, tasks: [{ ...d.tasks[0]!, title: "Newer" }] }) as typeof p;
    expect(out.tasks[0]).toEqual({ id: T1, title: "Newer" });
    expect(out.milestones[0]).toEqual({ id: M1, title: "M renamed" });
    // An explicit clear still clears.
    const cleared = ok("projects.update", p, { ...d, tasks: [{ ...d.tasks[0]!, dueDate: "", priority: "", milestone: "" }] }) as typeof p;
    expect(cleared.tasks[0]).toMatchObject({ dueDate: null, priority: null, milestoneRef: null });
  });
});
