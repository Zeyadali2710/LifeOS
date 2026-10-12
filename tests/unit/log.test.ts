import { DrizzleQueryError } from "drizzle-orm/errors";
import { expect, it } from "vitest";
import { errSerializer } from "@/server/log";

it("logs a failed query's SQL but never its bound values (T-04-41)", () => {
  const e = new DrizzleQueryError("insert into calendar_events (title) values ($1)", ["Doctor: private\nnotes"], new Error("boom"));
  const o = errSerializer(e) as Record<string, unknown>;
  const out = JSON.stringify(o);
  expect(out).toContain("insert into calendar_events");
  expect(out).not.toContain("Doctor");
  expect(out).not.toContain("private");
  expect(o.params).toBeUndefined();
});
