import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { agentRuns, runTurns } from "@/server/db/schema";
import { assertUnderCap, capStatus, getCap, monthToDate, setCap, spendByModel } from "@/server/agents/spend";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const NOW = new Date("2026-10-15T02:00:00Z");

describe("spend", () => {
  it("sums Sydney month, cap, once-per-month URGENT", async () => {
    const h = t.handle();
    const row = (startedAt: string, costUsd: string, model = "m") => ({
      agentId: "projects",
      prompt: "p",
      model,
      startedAt: new Date(startedAt),
      costUsd,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
    });
    const runs = await h
      .insert(agentRuns)
      .values([
        row("2026-09-30T13:59:00Z", "100"), // Sydney Sept 30 23:59 -> excluded
        row("2026-09-30T14:00:00Z", "12.5"), // Oct 1 00:00 Sydney
        row("2026-10-10T00:00:00Z", "10", "m2"),
      ])
      .returning({ id: agentRuns.id });
    const turn = (runId: string, model: string, costUsd: string, seq = 1) => ({ runId, seq, model, costUsd, inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 });
    await h.insert(runTurns).values([turn(runs[0]!.id, "m", "100"), turn(runs[1]!.id, "m", "12.5"), turn(runs[2]!.id, "m2", "10")]);
    expect(await monthToDate(h, NOW)).toBeCloseTo(22.5);
    expect((await spendByModel(h, NOW)).find((r) => r.model === "m2")).toEqual({ model: "m2", input: 10, output: 5, cache: 2, costUsd: 10 });

    expect(await getCap(h)).toBe(20);
    expect(await setCap(h, 25.5)).toBe(false);
    expect(await setCap(h, 0)).toBe(false);
    expect(await setCap(h, 1001)).toBe(false);
    expect(await capStatus(h, NOW)).toMatchObject({ mtdUsd: 22.5, capUsd: 20, reached: true });

    // mixed run: attributed per turn model
    const [mixed] = await h.insert(agentRuns).values(row("2026-10-11T00:00:00Z", "3", "m3")).returning({ id: agentRuns.id });
    await h.insert(runTurns).values([turn(mixed!.id, "free:free", "0"), turn(mixed!.id, "m3", "1", 2), turn(mixed!.id, "m3", "2", 3)]);
    const by = await spendByModel(h, NOW);
    expect(by.find((r) => r.model === "free:free")).toMatchObject({ costUsd: 0 });
    expect(by.find((r) => r.model === "m3")).toMatchObject({ costUsd: 3, input: 20 });
    await h.delete(agentRuns).where(eq(agentRuns.id, mixed!.id));

    const emit = vi.fn().mockResolvedValue(null);
    expect(await assertUnderCap(h, NOW, emit)).toEqual({ ok: false, capUsd: 20 });
    await assertUnderCap(h, NOW, emit);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toMatchObject({ category: "URGENT" });

    expect(await setCap(h, 40)).toBe(true);
    expect(await assertUnderCap(h, NOW, emit)).toEqual({ ok: true });
  });
});
