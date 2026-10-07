// Rightmost X-Forwarded-For hop is the one appended by our proxy (Tailscale serve); earlier hops are client-supplied.
export function clientIp(headers: Headers | undefined): string | null {
  const hops = headers?.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean);
  return hops?.at(-1) ?? null;
}
