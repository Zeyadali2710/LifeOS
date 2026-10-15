import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ execute: vi.fn(), llm: vi.fn(), queued: vi.fn(), update: vi.fn(), model: "owner-action:socials.publish" }));
vi.mock("@/server/db/client", () => ({ db: () => ({
  select: () => ({ from: () => ({ where: async () => [{ agentId: "social", model: m.model }] }) }),
  update: () => ({ set: (value: unknown) => { m.update(value); return { where: async () => undefined }; } }),
}) }));
vi.mock("@/server/agents/approvals", () => ({ executeApproved: m.execute, expireDue: vi.fn() }));
vi.mock("@/server/agents/llm", () => ({ getLlm: m.llm }));
vi.mock("@/server/agents/loop", () => ({ runQueued: m.queued }));
vi.mock("@/server/events", () => ({ notifyLive: vi.fn() }));
import { handleResume } from "@/worker/jobs/agents";

const job = { runId: "11111111-1111-4111-8111-111111111111", approvalId: "22222222-2222-4222-8222-222222222222" };
beforeEach(() => { vi.clearAllMocks(); m.model = "owner-action:socials.publish"; m.execute.mockResolvedValue({ status: "executed", result: { status: "scheduled" } }); });
describe("owner Social resume", () => {
  it.each([null, {}])("completes a synthetic action without consulting the LLM (%j)", async (llm) => {
    m.llm.mockReturnValue(llm);
    await handleResume(job);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(m.llm).not.toHaveBeenCalled(); expect(m.queued).not.toHaveBeenCalled();
  });
  it("does not complete a skipped approval or call an LLM", async () => {
    m.execute.mockResolvedValue({ status: "skipped" });
    await handleResume(job);
    expect(m.update).not.toHaveBeenCalled(); expect(m.llm).not.toHaveBeenCalled();
  });
  it("continues a chat run after execution", async () => {
    m.model = "chat-model"; m.llm.mockReturnValue({});
    await handleResume(job);
    expect(m.queued).toHaveBeenCalledOnce();
  });
});
