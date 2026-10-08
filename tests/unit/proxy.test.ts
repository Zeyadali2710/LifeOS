import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());

describe("proxy login redirect", () => {
  it("redirects to the public URL, not the internal upstream, and keeps next", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://lifeos.example.ts.net");
    const res = proxy(new NextRequest("http://web:3000/projects?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://lifeos.example.ts.net/login?next=%2Fprojects%3Fx%3D1");
  });
  it("omits next for the root", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://lifeos.example.ts.net");
    expect(proxy(new NextRequest("http://web:3000/")).headers.get("location")).toBe("https://lifeos.example.ts.net/login");
  });
});
