import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/client-ip";

describe("clientIp", () => {
  it("takes the proxy-appended (rightmost) hop, ignoring client-supplied ones", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 100.64.0.7" }))).toBe("100.64.0.7");
  });
  it("returns null without the header", () => {
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(undefined)).toBeNull();
  });
});
