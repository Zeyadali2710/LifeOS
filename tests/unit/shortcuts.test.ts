import { describe, expect, it } from "vitest";
import { matchShortcut } from "@/shell/shortcuts";
import { crumbFor, NAV_ITEMS } from "@/shell/nav";

const base = { key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false };
const k = (o: Partial<typeof base>) => matchShortcut({ ...base, ...o });

describe("matchShortcut", () => {
  it("palette / ai / compact / settings", () => {
    expect(k({ key: "k", ctrlKey: true })).toEqual({ type: "palette" });
    expect(k({ key: "K", metaKey: true })).toEqual({ type: "palette" });
    expect(k({ key: "k", ctrlKey: true, altKey: true })).toBeNull();
    expect(k({ key: "j", ctrlKey: true })).toEqual({ type: "ai" });
    expect(k({ code: "Backslash", key: "\\", ctrlKey: true })).toEqual({ type: "compact" });
    expect(k({ code: "Comma", key: ",", ctrlKey: true })).toEqual({ type: "nav", href: "/settings" });
  });
  it("alt+digit navigation", () => {
    expect(k({ code: "Digit2", altKey: true })).toEqual({ type: "nav", href: "/career" });
    expect(k({ code: "Digit9", altKey: true })).toEqual({ type: "nav", href: "/agents" });
    expect(k({ code: "Digit2", altKey: true, ctrlKey: true })).toBeNull();
    expect(k({ code: "Digit2", altKey: true, shiftKey: true })).toBeNull();
  });
  it("nav shortcuts never fire while typing in a field", () => {
    const field = { closest: (sel: string) => (sel.includes("textarea") ? {} : null) } as unknown as EventTarget;
    const page = { closest: () => null } as unknown as EventTarget;
    const at = (target: EventTarget, o: Partial<typeof base>) => matchShortcut({ ...base, ...o, target });
    expect(at(field, { code: "Digit2", altKey: true })).toBeNull();
    expect(at(field, { code: "Comma", key: ",", ctrlKey: true })).toBeNull();
    expect(at(field, { key: "k", ctrlKey: true })).toEqual({ type: "palette" });
    expect(at(page, { code: "Digit2", altKey: true })).toEqual({ type: "nav", href: "/career" });
  });
  it("escape, composition, repeat", () => {
    expect(k({ key: "Escape" })).toEqual({ type: "escape" });
    expect(k({ key: "Escape", isComposing: true })).toBeNull();
    expect(k({ key: "k", ctrlKey: true, isComposing: true })).toBeNull();
    expect(k({ key: "k", ctrlKey: true, repeat: true })).toBeNull();
    expect(k({ key: "j", ctrlKey: true, repeat: true })).toBeNull();
    expect(k({ code: "Backslash", ctrlKey: true, repeat: true })).toBeNull();
  });
});

describe("nav", () => {
  it("crumbFor", () => {
    expect(crumbFor("/")).toBe("HOME");
    expect(crumbFor("/career")).toBe("CAREER");
    expect(crumbFor("/career/x")).toBe("CAREER");
    expect(crumbFor("/unknown")).toBe("HOME");
  });
  it("9 items with Alt+1..9", () => {
    expect(NAV_ITEMS.map((n) => n.shortcut)).toEqual(Array.from({ length: 9 }, (_, i) => `Alt+${i + 1}`));
  });
});
