import { describe, expect, it } from "vitest";
import { canMove, DEFAULT_INTERESTS, nextStage, prevStage, STAGE } from "@/lib/outreach-types";

describe("outreach-types", () => {
  it("nextStage walks forward", () => {
    expect(nextStage(null)).toBe("SAVED");
    expect(nextStage("ATTENDED")).toBe("FOLLOW_UP");
    expect(nextStage("FOLLOW_UP")).toBeNull();
  });
  it("prevStage walks back", () => {
    expect(prevStage("SAVED")).toBeNull();
    expect(prevStage("ATTENDING")).toBe("INTERESTED");
  });
  it("canMove only allows +-1", () => {
    expect(canMove("SAVED", "INTERESTED")).toBe(true);
    expect(canMove("INTERESTED", "SAVED")).toBe(true);
    expect(canMove(null, "SAVED")).toBe(true);
    expect(canMove("SAVED", "ATTENDING")).toBe(false);
    expect(canMove("SAVED", "SAVED")).toBe(false);
  });
  it("stage labels and tones", () => {
    expect(STAGE.FOLLOW_UP.label).toBe("Follow up");
    expect(STAGE.ATTENDING.tone).toBe("blue");
  });
  it("default interests", () => {
    expect(DEFAULT_INTERESTS).toHaveLength(8);
    expect(DEFAULT_INTERESTS[0]).toBe("Entrepreneurship");
    expect(DEFAULT_INTERESTS[7]).toBe("Networking");
  });
});
