import { describe, expect, it } from "vitest";
import { type SchedItem } from "@/server/calendar/conflicts";
import { headline, planDay, planSummary, weekStats, type PlanTask } from "@/server/calendar/plan";
import { sydneyInstant } from "@/server/time";

const at = (h: number, min = 0, d = 8) => sydneyInstant(2026, 10, d, h, min).getTime();
const task = (id: string, o: Partial<PlanTask> = {}): PlanTask => ({
  id, title: id, dueAt: null, dueHasTime: false, priority: null, createdAt: 1, ...o,
});
const day = { start: at(8), end: at(22) };

describe("planDay", () => {
  it("orders by due, priority, created and places first-fit", () => {
    const tasks = [
      task("c", { dueAt: at(20), createdAt: 3 }),
      task("b", { dueAt: at(20), priority: 2, createdAt: 2 }),
      task("a", { dueAt: at(18), priority: 3, createdAt: 9 }),
      task("n", { createdAt: 0 }),
    ];
    const out = planDay({ tasks, slots: [day], dayEnd: at(23, 59) });
    expect(out.map((i) => i.taskId)).toEqual(["a", "b", "c", "n"]);
    expect(out[0]).toMatchObject({ kind: "task", start: at(8), end: at(8, 30) });
    expect(out[1]).toMatchObject({ start: at(8, 30), end: at(9) });
    expect(planDay({ tasks, slots: [day], dayEnd: at(23, 59) })).toEqual(out);
  });
  it("skips skipped ids and uses estimate", () => {
    const out = planDay({ tasks: [task("a", { estimateMin: 60 }), task("b")], slots: [day], skipped: new Set(["b"]), dayEnd: at(23, 59) });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: at(8), end: at(9) });
  });
  it("dated task must end before due; no slot -> conflict", () => {
    const out = planDay({
      tasks: [task("a", { dueAt: at(9) }), task("later", { dueAt: at(9, 0, 9) })],
      slots: [{ start: at(10), end: at(12) }],
      dayEnd: at(23, 59),
    });
    expect(out).toEqual([{ kind: "conflict", taskId: "a", dueAt: at(9), why: { key: "no_slot", params: { due: at(9) } } }]);
  });
  it("why keys", () => {
    const out = planDay({
      tasks: [task("p", { dueAt: at(20), priority: 1 }), task("o", { dueAt: at(12) }), task("d", { dueAt: at(21) })],
      slots: [{ start: at(11, 30), end: at(12) }, { start: at(13), end: at(15) }],
      dayEnd: at(23, 59),
    });
    const why = Object.fromEntries(out.map((i) => [i.taskId, i.why]));
    expect(why.o!.key).toBe("only_block");
    expect(why.p!.key).toBe("priority_due");
    expect(why.p!.params.priority).toBe("high");
    expect(why.d!.key).toBe("due_first_slot");
  });
});

describe("weekStats", () => {
  const ev = (id: string, s: number, e: number, o: Partial<SchedItem> = {}): SchedItem => ({
    id, start: s, end: e, allDay: false, transparency: "opaque", declined: false, status: "confirmed", ...o,
  });
  it("counts from real data", () => {
    const days = ["2026-10-08", "2026-10-09"];
    const items = [
      ev("a", at(9), at(11)),
      ev("b", at(10), at(12)),
      ev("c", at(9, 0, 9), at(10, 0, 9), { declined: true }),
      ev("x", at(9, 0, 20), at(10, 0, 20)),
    ];
    const s = weekStats(items, days, at(8));
    expect(s.events).toBe(2);
    expect(s.conflicts).toBe(1);
    // day 1: busy 09-12 merged = 3h -> 11h free; day 2: 14h
    expect(s.freeHours).toBe(11 + 14);
  });
});

describe("headline", () => {
  it("picks largest >=2h slot and period", () => {
    expect(headline([{ start: at(9), end: at(12) }], [], at(8))).toBe("You're free this morning.");
    expect(headline([{ start: at(13), end: at(15) }, { start: at(16), end: at(17) }], [], at(8))).toBe("You're free this afternoon.");
    expect(headline([{ start: at(18), end: at(21) }], [], at(8))).toBe("You're free this evening.");
  });
  it("falls back to tomorrow then null", () => {
    expect(headline([{ start: at(9), end: at(10) }], [{ start: at(9, 0, 9), end: at(12, 0, 9) }], at(8))).toBe("You're free tomorrow morning.");
    expect(headline([], [], at(8))).toBeNull();
  });
});

describe("planSummary", () => {
  it("templates", () => {
    expect(planSummary({ freeMinutes: 300, toPlace: 3, unplaced: 0, afterHours: false, open: 3 })).toBe("5 hours free between now and 22:00. 3 tasks to place.");
    expect(planSummary({ freeMinutes: 60, toPlace: 1, unplaced: 0, afterHours: false, open: 1 })).toBe("1 hour free between now and 22:00. 1 task to place.");
    expect(planSummary({ freeMinutes: 0, toPlace: 0, unplaced: 2, afterHours: false, open: 2 })).toBe("Your day is full. 2 tasks have no free slot today.");
    expect(planSummary({ freeMinutes: 100, toPlace: 0, unplaced: 0, afterHours: false, open: 0 })).toBe("All clear. Nothing due today.");
    expect(planSummary({ freeMinutes: 0, toPlace: 0, unplaced: 0, afterHours: true, open: 4 })).toBe("Today's plan is done. 4 tasks are still open.");
    expect(planSummary({ freeMinutes: 0, toPlace: 0, unplaced: 0, afterHours: true, open: 1 })).toBe("Today's plan is done. 1 task is still open.");
  });
});
