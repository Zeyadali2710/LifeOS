import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AGENTS, getAgent, MODELS } from "@/server/agents/registry";
import { TOOLS } from "@/server/agents/tools";
import { redact, summarize } from "@/server/agents/redact";
import { apiName, toAnthropicTool } from "@/server/agents/types";

describe("registry", () => {
  it("lists 11 agents in order with orchestrator, organization and projects live", () => {
    expect(AGENTS.map((a) => a.id)).toEqual([
      "orchestrator", "home", "career", "social", "outreach", "organization", "projects", "knowledge", "goals", "finance", "agentops",
    ]);
    expect(AGENTS.filter((a) => a.live).map((a) => a.id)).toEqual(["orchestrator", "organization", "projects"]);
    expect(Object.fromEntries(AGENTS.map((a) => [a.id, a.arrival]))).toMatchObject({
      home: "Phase 9", career: "Phase 5", social: "Phase 7", outreach: "Phase 6", organization: null,
      knowledge: "Phase 8", goals: "Phase 8", finance: null, agentops: null,
    });
  });
  it("uses the decided default models", () => {
    expect(getAgent("orchestrator")?.defaultModel).toBe(MODELS.opus);
    expect(getAgent("projects")?.defaultModel).toBe(MODELS.sonnet);
  });
  it("makes organization live with the seven calendar and task tools", () => {
    const o = getAgent("organization");
    expect(o).toMatchObject({ live: true, routable: true, requiresTools: true, defaultModel: MODELS.sonnet });
    expect(o?.tools).toHaveLength(7);
    expect(getAgent("orchestrator")?.systemPrompt).toContain("Delegate calendar, schedule and task questions to the organization agent.");
  });
  it("projects agent exposes the repo content and project write tools", () => {
    expect(getAgent("projects")?.tools).toEqual(expect.arrayContaining(["github.list_tree", "github.get_file", "projects.create", "projects.update"]));
    for (const n of ["projects.create", "projects.update"]) expect(TOOLS[n]).toMatchObject({ tier: "APPROVE", sideEffect: true, private: true });
    const schema = JSON.stringify(toAnthropicTool(TOOLS["projects.create"]!).input_schema);
    expect(schema).not.toContain("workspacePath");
  });

  it("exposes projects.list and projects.get as READ tools on the Projects agent", () => {
    expect(getAgent("projects")?.tools).toEqual(expect.arrayContaining(["projects.list", "projects.get"]));
    for (const n of ["projects.list", "projects.get"]) expect(TOOLS[n]).toMatchObject({ tier: "READ", sideEffect: false });
    expect(getAgent("orchestrator")?.systemPrompt).toContain("LifeOS project");
  });
  it("maps every tool name to a valid Anthropic name", () => {
    for (const t of AGENTS.flatMap((a) => a.tools)) expect(apiName(t)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(apiName("github.create_issue")).toBe("github_create_issue");
  });
});

describe("toAnthropicTool", () => {
  it("emits an object schema without $schema", () => {
    const t = toAnthropicTool({ name: "a.b", description: "d", input: z.object({ x: z.string() }) });
    expect(t.name).toBe("a_b");
    expect(t.input_schema.type).toBe("object");
    expect(t.input_schema).not.toHaveProperty("$schema");
  });
});

describe("redact / summarize", () => {
  it("redacts sensitive keys deeply", () => {
    expect(redact({ token: "x", nested: { Authorization: "y", ok: 1 } })).toEqual({
      token: "[redacted]",
      nested: { Authorization: "[redacted]", ok: 1 },
    });
  });
  it("caps summaries at 600 chars", () => {
    expect(summarize("a".repeat(5000)).length).toBeLessThanOrEqual(600);
    expect(summarize({ a: 1 })).toBe('{"a":1}');
  });
});
