/** https://github.com URLs only: exact host, no credentials, no control chars. */
export function isSafeGithubUrl(u: string | null | undefined): u is string {
  if (!u || /[\u0000-\u001f\u007f]/.test(u)) return false;
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.hostname === "github.com" && !p.username && !p.password;
  } catch {
    return false;
  }
}

/** Same-origin path only: "/x" yes; "//host", backslash paths, schemes, control chars, empty no. */
export function isSafePath(p: string | null | undefined): p is string {
  // Control chars too: URL parsing strips tab/newline, so "/\t/evil.com" would resolve as "//evil.com".
  return !!p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !/[\u0000-\u001f\u007f]/.test(p);
}
