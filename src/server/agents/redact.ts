const SENSITIVE = /token|authorization|secret|password|key/i;

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : redact(v)]),
    ) as T;
  }
  return value;
}

export function summarize(value: unknown, max = 600): string {
  const s = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
