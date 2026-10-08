export function formatUsd(n: number): string {
  if (n > 0 && n < 0.001) return "<US$0.001";
  return `US$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
