export const CATEGORY_KEYS = ["work", "personal", "social", "career", "events", "deadlines"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY: Record<CategoryKey, { label: string; color: string }> = {
  work: { label: "Work", color: "#8b8cff" },
  personal: { label: "Personal", color: "#4fd1a1" },
  social: { label: "Social", color: "#e889c4" },
  career: { label: "Career", color: "#e8b86a" },
  events: { label: "Events", color: "#6cb6ff" },
  deadlines: { label: "Deadlines", color: "#f07a6e" },
};

export const fill = (key: CategoryKey) => CATEGORY[key].color + "22";
export const border = (key: CategoryKey) => CATEGORY[key].color + "44";
export const isCategory = (x: unknown): x is CategoryKey => CATEGORY_KEYS.includes(x as CategoryKey);
