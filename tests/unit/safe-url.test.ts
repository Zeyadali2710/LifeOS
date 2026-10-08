import { describe, expect, it } from "vitest";
import { isSafeGithubUrl, isSafePath } from "@/lib/safe-url";

describe("isSafeGithubUrl", () => {
  it("accepts github.com https", () => {
    expect(isSafeGithubUrl("https://github.com/o/r/pull/1")).toBe(true);
  });
  it("rejects lookalikes and unsafe schemes", () => {
    for (const v of ["http://github.com/x", "https://github.com.evil.com/x", "https://user@github.com/x", "javascript:alert(1)", "//github.com", "", null]) {
      expect(isSafeGithubUrl(v)).toBe(false);
    }
  });
});

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
