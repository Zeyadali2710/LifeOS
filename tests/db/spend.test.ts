import { describe, expect, it, vi } from "vitest";
import { agentRuns } from "@/server/db/schema";
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
    await h.insert(agentRuns).values([
      row("2026-09-30T13:59:00Z", "100"), // Sydney Sept 30 23:59 -> excluded
      row("2026-09-30T14:00:00Z", "12.5"), // Oct 1 00:00 Sydney
      row("2026-10-10T00:00:00Z", "10", "m2"),
    ]);
    expect(await monthToDate(h, NOW)).toBeCloseTo(22.5);
    expect((await spendByModel(h, NOW)).find((r) => r.model === "m2")).toEqual({ model: "m2", input: 10, output: 5, cache: 2, costUsd: 10 });

    expect(await getCap(h)).toBe(20);
    expect(await setCap(h, 25.5)).toBe(false);
    expect(await setCap(h, 0)).toBe(false);
    expect(await setCap(h, 1001)).toBe(false);
    expect(await capStatus(h, NOW)).toMatchObject({ mtdUsd: 22.5, capUsd: 20, reached: true });

    const emit = vi.fn().mockResolvedValue(null);
    expect(await assertUnderCap(h, NOW, emit)).toEqual({ ok: false, capUsd: 20 });
    await assertUnderCap(h, NOW, emit);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toMatchObject({ category: "URGENT" });

    expect(await setCap(h, 40)).toBe(true);
    expect(await assertUnderCap(h, NOW, emit)).toEqual({ ok: true });
  });
});
