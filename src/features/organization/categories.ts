import type { CategoryKey } from "@/lib/calendar-categories";

/** Almanac category swatches (fill + line). Deadlines borrow the focus wash; uncategorised events use Work. */
export const CAT_STYLE: Record<CategoryKey, { fill: string; line: string }> = {
  work: { fill: "var(--cat-work)", line: "var(--cat-work-line)" },
  personal: { fill: "var(--cat-personal)", line: "var(--cat-personal-line)" },
  social: { fill: "var(--cat-social)", line: "var(--cat-social-line)" },
  career: { fill: "var(--cat-career)", line: "var(--cat-career-line)" },
  events: { fill: "var(--cat-events)", line: "var(--cat-events-line)" },
  deadlines: { fill: "var(--status-failed-bg)", line: "var(--status-failed)" },
};

export const catStyle = (k: CategoryKey | null | undefined) => CAT_STYLE[k ?? "work"];
