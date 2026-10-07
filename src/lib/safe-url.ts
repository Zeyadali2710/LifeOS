/** Same-origin path only: "/x" yes; "//host", backslash paths, schemes, control chars, empty no. */
export function isSafePath(p: string | null | undefined): p is string {
  // Control chars too: URL parsing strips tab/newline, so "/\t/evil.com" would resolve as "//evil.com".
  return !!p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !/[\u0000-\u001f\u007f]/.test(p);
}
