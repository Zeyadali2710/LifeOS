import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("proxy login redirect", () => {
  it("redirects with a relative Location and keeps next", () => {
    const res = proxy(new NextRequest("http://web:3000/projects?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login?next=%2Fprojects%3Fx%3D1");
  });
  it("omits next for the root", () => {
    expect(proxy(new NextRequest("http://web:3000/")).headers.get("location")).toBe("/login");
  });
});
