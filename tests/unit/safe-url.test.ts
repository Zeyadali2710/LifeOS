import { describe, expect, it } from "vitest";
import { isSafePath } from "@/lib/safe-url";

describe("isSafePath", () => {
  it("accepts same-origin paths", () => {
    expect(isSafePath("/agents")).toBe(true);
    expect(isSafePath("/")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const v of ["//evil.com", "/\\evil", "javascript:alert(1)", "https://x.com", "/\t/evil.com", "/\n/evil.com", "/\r//evil.com", "", null, undefined]) {
      expect(isSafePath(v)).toBe(false);
    }
  });
});
