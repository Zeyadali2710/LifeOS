import { NAV_ITEMS } from "./nav";

export type ShellAction =
  | { type: "palette" }
  | { type: "ai" }
  | { type: "compact" }
  | { type: "escape" }
  | { type: "nav"; href: string };

type KeyInfo = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "repeat"> & {
  target?: EventTarget | null;
};

const EDITABLE = "input,textarea,select,[contenteditable]:not([contenteditable='false'])";

export function matchShortcut(e: KeyInfo): ShellAction | null {
  if (e.isComposing) return null;
  if (e.key === "Escape") return { type: "escape" };
  // Never navigate away from a field the user is typing in (Option+digit types characters on macOS).
  const typing = Boolean((e.target as Element | null | undefined)?.closest?.(EDITABLE));
  const mod = e.ctrlKey || e.metaKey;
  // Ctrl+Alt is AltGr on many layouts: never hijack it.
  if (mod && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === "k") return e.repeat ? null : { type: "palette" };
    if (key === "j") return e.repeat ? null : { type: "ai" };
    if (e.code === "Backslash") return e.repeat ? null : { type: "compact" };
    if (e.code === "Comma") return typing ? null : { type: "nav", href: "/settings" };
    return null;
  }
  if (e.altKey && !mod && !e.shiftKey && !typing) {
    const m = /^Digit([1-9])$/.exec(e.code);
    const item = m ? NAV_ITEMS[Number(m[1]) - 1] : undefined;
    if (item) return { type: "nav", href: item.href };
  }
  return null;
}
