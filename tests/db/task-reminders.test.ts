import { describe, expect, it } from "vitest";
import { createTask, fireDueReminders, setTaskCompleted, updateTask } from "@/server/tasks";
import { setupTestDb } from "./helpers";

const t = setupTestDb();
const T0 = new Date("2026-10-05T00:00:00Z"); // 11:00 Sydney Mon 5 Oct
const T1 = new Date("2026-10-05T02:00:00Z");

type Em = { a: { type: string; source: string; title: string; detail?: string }; n?: { category: string; title: string; body?: string; actionUrl?: string } };
function spy(ok = true) {
  const calls: Em[] = [];
  const emit = (async (a: Em["a"], n?: Em["n"]) => {
    calls.push({ a, n });
    return ok ? { activityId: "a" } : null;
  }) as unknown as Parameters<typeof fireDueReminders>[2];
  return { calls, emit };
}
const mk = async (raw: Record<string, unknown>) => {
  const r = await createTask(t.handle(), raw, T0);
  if (!r.ok) throw new Error("create failed");
  return r.task.id;
};

describe("fireDueReminders", () => {
  it("fires once per arming with the mapped copy, skips completed and future", async () => {
    const dated = await mk({ title: "Pay rent", dueDate: "2026-10-08", dueTime: "18:00", remindAt: "2026-10-05T01:00:00Z" });
    await mk({ title: "Today", dueDate: "2026-10-05", remindAt: "2026-10-05T01:00:00Z" });
    await mk({ title: "Nodue", remindAt: "2026-10-05T01:00:00Z" });
    const done = await mk({ title: "Done", remindAt: "2026-10-05T01:00:00Z" });
    await mk({ title: "Later", remindAt: "2026-10-09T00:00:00Z" });
    await setTaskCompleted(t.handle(), done, true, T0);

    const s = spy();
    expect(await fireDueReminders(t.handle(), T1, s.emit)).toBe(3);
    const byTitle = Object.fromEntries(s.calls.map((c) => [c.a.detail, c]));
    expect(byTitle["Pay rent"]!.n).toEqual({ category: "REMINDER", title: "Reminder: Pay rent", body: "Due Thu 8 Oct 18:00.", actionUrl: "/organization#tasks" });
    expect(byTitle["Pay rent"]!.a).toMatchObject({ type: "task.reminder", source: "calendar", title: "Reminder" });
    expect(byTitle["Today"]!.n!.body).toBe("Due today.");
    expect(byTitle["Nodue"]!.n!.body).toBe("No due date.");

    const again = spy();
    expect(await fireDueReminders(t.handle(), T1, again.emit)).toBe(0);
    expect(again.calls).toHaveLength(0);

    // editing remindAt re-arms; the new time is past at the later "now"
    await updateTask(t.handle(), dated, { title: "Pay rent", dueDate: "2026-10-08", dueTime: "18:00", remindAt: "2026-10-05T03:00:00Z" }, T0);
    const re = spy();
    expect(await fireDueReminders(t.handle(), new Date("2026-10-05T04:00:00Z"), re.emit)).toBe(1);
    expect(re.calls[0]!.a.detail).toBe("Pay rent");
  });

  it("un-claims a reminder whose notification failed, so the next run retries it", async () => {
    await mk({ title: "Retry", remindAt: "2026-10-05T01:00:00Z" });
    expect(await fireDueReminders(t.handle(), T1, spy(false).emit)).toBe(0);
    const s = spy();
    expect(await fireDueReminders(t.handle(), new Date("2026-10-05T02:01:00Z"), s.emit)).toBe(1);
    expect(s.calls[0]!.a.detail).toBe("Retry");
  });

  it("reopening a task disarms a reminder that passed while it was done, but keeps a future one", async () => {
    const past = await mk({ title: "Past", remindAt: "2026-10-05T01:00:00Z" });
    const future = await mk({ title: "Future", remindAt: "2026-10-05T03:00:00Z" });
    for (const id of [past, future]) await setTaskCompleted(t.handle(), id, true, T0);
    for (const id of [past, future]) await setTaskCompleted(t.handle(), id, false, T1);
    const s = spy();
    expect(await fireDueReminders(t.handle(), new Date("2026-10-05T04:00:00Z"), s.emit)).toBe(1);
    expect(s.calls[0]!.a.detail).toBe("Future");
  });
});
