import { z } from "zod";
/* eslint-disable @typescript-eslint/no-explicit-any -- test fake: heterogeneous tool inputs */
import { ToolError, type Tool } from "@/server/agents/types";

export function fakeTools() {
  const calls = { exec: 0, read: 0, approve: 0, high: 0 };
  const echo = z.object({ text: z.string() });
  const mk = (name: string, tier: Tool["tier"], extra: Partial<Tool<any, any>> = {}): Tool<any, any> => ({
    name,
    label: `run ${name}`,
    description: name,
    input: echo,
    output: z.object({ echoed: z.string() }),
    tier,
    sideEffect: false,
    handler: async (i: { text: string }) => ({ echoed: i.text }),
    ...extra,
  });
  const tools: Record<string, Tool<any, any>> = {
    "test.read": mk("test.read", "READ", { handler: async (i: any) => (calls.read++, { echoed: i.text }) }),
    "test.approve": mk("test.approve", "APPROVE", {
      label: "create GitHub issue",
      input: z.object({ repo: z.string(), title: z.string() }),
      toApproval: (i: any) => ({ payload: i, reason: "because" }),
      handler: async () => (calls.approve++, { echoed: "x" }),
    }),
    "test.high": mk("test.high", "HIGH_RISK", { handler: async () => (calls.high++, { echoed: "x" }) }),
    "test.exec": mk("test.exec", "EXECUTE", {
      sideEffect: true,
      handler: async (i: any) => {
        calls.exec++;
        await new Promise((r) => setTimeout(r, 50));
        return { echoed: i.text };
      },
    }),
    "test.lookup": mk("test.lookup", "READ", {
      resolve: async (i: any) => {
        if (i.text === "missing") throw new ToolError("not_found", "Entity not found");
        return i;
      },
    }),
    "test.badout": mk("test.badout", "READ", { handler: async () => ({ nope: 1 }) as any }),
  };
  return { tools, calls };
}
