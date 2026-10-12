import { describe, expect, it } from "vitest";
import { repoPath } from "@/server/agents/tools/github";

describe("repoPath", () => {
  it.each(["README.md", "docs/ROADMAP.md", "a b/c.md"])("accepts %s", (p) => {
    expect(repoPath.safeParse(p).success).toBe(true);
  });
  it.each(["/etc/passwd", "../x", "docs/../x", "docs//x", "./x", "docs\\x", "a\u0000b", "", "a".repeat(401)])("rejects %j", (p) => {
    expect(repoPath.safeParse(p).success).toBe(false);
  });
});
