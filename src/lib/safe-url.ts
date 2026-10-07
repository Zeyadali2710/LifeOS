/** Same-origin path only: "/x" yes; "//host", backslash paths, schemes, empty no. */
export function isSafePath(p: string | null | undefined): p is string {
  return !!p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\");
}
