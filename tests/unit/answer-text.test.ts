import { describe, expect, it } from "vitest";
import { parseAnswer } from "@/shell/ai/answer-text";

describe("parseAnswer", () => {
  it("parses paragraph, list, citation and inline code", () => {
    const b = parseAnswer("Two PRs:\n- octo/app#12 needs review\n- `main` is green");
    expect(b.map((x) => x.t)).toEqual(["p", "ul"]);
    const ul = b[1] as Extract<(typeof b)[number], { t: "ul" }>;
    expect(ul.items[0]).toContainEqual({ t: "citation", ref: "octo/app#12", url: "https://github.com/octo/app/issues/12" });
    expect(ul.items[1]![0]).toEqual({ t: "code", text: "main" });
  });
  it("keeps html as literal text", () => {
    const b = parseAnswer("<img src=x onerror=alert(1)>");
    expect(b).toEqual([{ t: "p", inline: [{ t: "text", text: "<img src=x onerror=alert(1)>" }] }]);
  });
  it("bare repo cites the repo; js links stay plain text", () => {
    expect(parseAnswer("see octo/app.")[0]).toEqual({
      t: "p",
      inline: [{ t: "text", text: "see " }, { t: "citation", ref: "octo/app", url: "https://github.com/octo/app" }, { t: "text", text: "." }],
    });
    const js = parseAnswer("[x](javascript:alert(1))")[0] as { inline: { t: string }[] };
    expect(js.inline.every((n) => n.t === "text")).toBe(true);
  });
});
