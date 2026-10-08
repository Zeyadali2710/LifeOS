import { sydneyInstant, sydneyParts } from "../time";
import type { LlmUsage } from "./types";

// $ per MTok. w5m = 5-minute cache write, read = cache hit.
export const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20, w5m: 5, read: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, w5m: 2.5, read: 0.1 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5, w5m: 1.25, read: 0.1 },
} as const;

export function costUsd(model: string, u: LlmUsage): number {
  // Unknown model -> Opus (most expensive) so the cap is never under-counted.
  const p = PRICES[model as keyof typeof PRICES] ?? PRICES["claude-opus-5-5"];
  return (u.input * p.in + u.output * p.out + u.cacheWrite * p.w5m + u.cacheRead * p.read) / 1e6;
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

export function sydneyMonthBounds(now: Date) {
  const { year, month } = sydneyParts(now);
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return {
    start: sydneyInstant(year, month, 1, 0),
    end: sydneyInstant(ny, nm, 1, 0),
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}
