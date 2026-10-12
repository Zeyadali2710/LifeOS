export const CATEGORY_KEYS = ["work", "personal", "social", "career", "events", "deadlines"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY: Record<CategoryKey, { label: string; color: string }> = {
  work: { label: "Work", color: "#0a84ff" },
  personal: { label: "Personal", color: "#30d158" },
  social: { label: "Social", color: "#ff6482" },
  career: { label: "Career", color: "#ff9f0a" },
  events: { label: "Events", color: "#64d2ff" },
  deadlines: { label: "Deadlines", color: "#ff6961" },
};

export const fill = (key: CategoryKey) => CATEGORY[key].color + "22";
export const border = (key: CategoryKey) => CATEGORY[key].color + "44";
export const isCategory = (x: unknown): x is CategoryKey => CATEGORY_KEYS.includes(x as CategoryKey);
