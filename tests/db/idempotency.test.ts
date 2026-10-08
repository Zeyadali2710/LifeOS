import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuns } from "@/server/db/schema";
import { callTool } from "@/server/agents/gateway";
import { fakeTools } from "../helpers/fake-tools";
import { setupTestDb } from "./helpers";

vi.mock("@/server/agents/registry", () => ({ getAgent: () => ({ id: "projects", name: "Projects", live: true, tools: ["test.exec"] }) }));

const t = setupTestDb();
let runId = "";
let ft = fakeTools();
const call = (id: string) => callTool({ handle: t.handle(), runId, agentId: "projects", tools: ft.tools }, "test.exec", { text: "a" }, id);

beforeEach(async () => {
  ft = fakeTools();
  const [r] = await t.handle().insert(agentRuns).values({ agentId: "projects", prompt: "p", model: "m" }).returning();
  runId = r!.id;
});

describe("idempotency", () => {
  it("same key twice runs the handler once", async () => {
    const a = await call("u1");
    const b = await call("u1");
    expect(a).toMatchObject({ status: "ok", output: { echoed: "a" } });
    expect(b).toMatchObject({ status: "ok", duplicate: true, output: { echoed: "a" } });
    expect(ft.calls.exec).toBe(1);
  });

  it("concurrent calls run the handler once", async () => {
    const [a, b] = await Promise.all([call("u2"), call("u2")]);
    expect(ft.calls.exec).toBe(1);
    // The loser either sees the in-flight claim or, if the winner already finished, the stored result.
    const loser = [a, b].find((r) => r.status === "error" || ("duplicate" in r && r.duplicate));
    expect(loser).toBeDefined();
    if (loser!.status === "error") expect(loser).toMatchObject({ error: "already running" });
    else expect(loser).toMatchObject({ status: "ok", duplicate: true, output: { echoed: "a" } });
  });

  it("different toolUseId runs again", async () => {
    await call("u3");
    await call("u4");
    expect(ft.calls.exec).toBe(2);
  });
});
