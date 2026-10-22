import { NAV_ITEMS } from "./nav";

export type ShellAction = { type: "palette" } | { type: "ai" } | { type: "escape" } | { type: "nav"; href: string };

type KeyInfo = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "repeat"> & {
  target?: EventTarget | null;
};

export const EDITABLE = "input,textarea,select,[contenteditable]:not([contenteditable='false'])";

/** True while focus is in a field: page shortcuts never fire while typing. */
export function isTyping(target: EventTarget | null | undefined): boolean {
  return Boolean((target as Element | null | undefined)?.closest?.(EDITABLE));
}

export function matchShortcut(e: KeyInfo): ShellAction | null {
  if (e.isComposing) return null;
  if (e.key === "Escape") return { type: "escape" };
  const typing = isTyping(e.target);
  const mod = e.ctrlKey || e.metaKey;
  // Ctrl+Alt is AltGr on many layouts: never hijack it.
  if (mod && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === "k") return e.repeat ? null : { type: "palette" };
    if (key === "j") return e.repeat ? null : { type: "ai" };
    if (e.code === "Comma") return typing ? null : { type: "nav", href: "/settings" };
    return null;
  }
  // Option+digit types characters on macOS: never navigate away from a field.
  if (e.altKey && !mod && !e.shiftKey && !typing) {
    const m = /^Digit([1-8])$/.exec(e.code);
    const item = m ? NAV_ITEMS[Number(m[1]) - 1] : undefined;
    if (item) return { type: "nav", href: item.href };
  }
  return null;
}
