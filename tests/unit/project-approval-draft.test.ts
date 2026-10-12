import { describe, expect, it } from "vitest";
import { toProjectDraft, validateProjectDraft, type ProjectPayload } from "@/approvals/project-approval";
import { projectCreatePayload as C } from "@/lib/project-payload";

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
});
