import { describe, expect, it } from "vitest";
import { boardColumn, checkVariant, expiryState } from "@/lib/social-types";

describe("social rules", () => {
  it("counts code points and applies platform checks", () => {
    expect(checkVariant("linkedin", { text: "😀".repeat(3000) }).errors).toEqual([]);
    expect(checkVariant("linkedin", { text: "😀".repeat(3001) }).errors).toHaveLength(1);
    expect(checkVariant("linkedin", { text: "#a #b #c #d #e #f" }).warnings).toHaveLength(1);
    expect(checkVariant("instagram", { text: "caption" }).errors).toHaveLength(1);
    expect(checkVariant("instagram", { text: "caption", imageUrl: "https://example.com/a.jpg" }).errors).toEqual([]);
    expect(checkVariant("instagram", { text: "caption", imageUrl: "http://example.com/a.jpg" }).errors).toHaveLength(1);
    expect(checkVariant("tiktok", { text: "a".repeat(2201) }).warnings).toHaveLength(1);
    expect(checkVariant("portfolio", { text: "body" }).errors).toHaveLength(1);
    expect(checkVariant("linkedin", { text: " " }).errors).toHaveLength(1);
  });

  it("derives the board column by priority", () => {
    expect(boardColumn("idea", [])).toBe("Ideas");
    expect(boardColumn("draft", ["pending_approval", "scheduled"])).toBe("Review");
    expect(boardColumn("draft", ["scheduled", "published"])).toBe("Scheduled");
    expect(boardColumn("draft", ["published", "posted_manually"])).toBe("Published");
    expect(boardColumn("draft", ["draft", "published"])).toBe("Draft");
  });

  it("classifies expiry in days", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    expect(expiryState(new Date("2026-10-14T00:00:00Z"), now)).toBe("expired");
    expect(expiryState(new Date("2026-10-22T00:00:00Z"), now)).toBe("soon");
    expect(expiryState(new Date("2026-10-23T00:00:00Z"), now)).toBe("okay");
  });
});
