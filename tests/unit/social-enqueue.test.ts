import { describe, expect, it, vi } from "vitest";
import type { DB } from "@/server/db/client";
const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/queue", () => ({ enqueue: send, QUEUES: { socialsPublish: "socials.publish" } }));
vi.mock("@/server/socials/connections", () => ({ socialConnection: async () => null }));
import { approvedHash, publish } from "@/server/agents/tools/socials";

describe("durable Social scheduling", () => {
  it.each([new Error("queue down"), new DOMException("timeout", "TimeoutError")])("finishes preparation when enqueue fails (%s)", async (error) => {
    send.mockRejectedValueOnce(error);
    const input = { variantId: "11111111-1111-4111-8111-111111111111", platform: "linkedin" as const, text: "Approved", imageUrl: null, linkUrl: null };
    const v = { id: input.variantId, ...input, status: "scheduled", approvalId: "approval", approvedProviderMode: "mock", approvedConnectionGeneration: null, approvedTextHash: approvedHash(input), scheduledAt: new Date() };
    const h = { select: () => ({ from: () => ({ where: async () => [v] }) }) } as unknown as DB;
    expect(await publish.handler(input, { handle: h, runId: "run", agentId: "social", toolUseId: "publish", approvalId: "approval", now: () => new Date() })).toEqual({ status: "scheduled", variantId: v.id });
  });
});
