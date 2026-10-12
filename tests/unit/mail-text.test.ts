import { describe, expect, it } from "vitest";
import { bodyText, parseAddrList } from "@/server/mail/text";
import { capUtf8, htmlToText } from "@/server/text";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("capUtf8", () => {
  it("does not split a surrogate pair", () => {
    expect(capUtf8("a😀b", 3)).toEqual({ text: "a", truncated: true });
  });
  it("returns input within cap", () => {
    expect(capUtf8("abc", 3)).toEqual({ text: "abc", truncated: false });
  });
});

describe("htmlToText", () => {
  it("drops script/style/head", () => {
    expect(htmlToText("<head><title>t</title></head><style>p{}</style><script>x()</script><p>Hi</p>")).toBe("Hi");
  });
  it("br and block closes become newlines; collapses 3+", () => {
    expect(htmlToText("<p>a</p><p>b</p><br><br><br><br>c")).toBe("a\nb\n\nc");
  });
  it("keeps link URLs as text", () => {
    expect(htmlToText('<a href="https://x.test">X</a>')).toBe("X (https://x.test)");
  });
  it("decodes basic entities", () => {
    expect(htmlToText("&amp; &lt; &gt; &quot; &#39; &nbsp;| &#233; &#xE9;")).toBe("& < > \" '  | é é");
  });
  it("drops images", () => {
    expect(htmlToText('hello<img src="https://tracker.test/p.gif">')).toBe("hello");
  });
});

describe("bodyText", () => {
  it("prefers text/plain in multipart/alternative", () => {
    const p = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
        { mimeType: "text/plain", body: { data: b64("plain") } },
      ],
    };
    expect(bodyText(p)).toEqual({ text: "plain", htmlOnly: false, truncated: false });
  });
  it("falls back to stripped html", () => {
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<p>Hello</p>") } })).toEqual({ text: "Hello", htmlOnly: true, truncated: false });
  });
  it("ignores attachment parts", () => {
    const p = { mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", body: { attachmentId: "A1" } }, { mimeType: "text/plain", body: { data: b64("body") } }] };
    expect(bodyText(p).text).toBe("body");
  });
  it("caps a 20 KB body at 16384 bytes", () => {
    const r = bodyText({ mimeType: "text/plain", body: { data: b64("x".repeat(20_000)) } });
    expect(r.truncated).toBe(true);
    expect(Buffer.byteLength(r.text)).toBeLessThanOrEqual(16_384);
  });
});

describe("parseAddrList", () => {
  it("splits on commas outside quotes", () => {
    expect(parseAddrList('"Lee, Hannah" <h@x.test>, b@y.test')).toEqual([
      { name: "Lee, Hannah", address: "h@x.test" },
      { name: "", address: "b@y.test" },
    ]);
  });
});
