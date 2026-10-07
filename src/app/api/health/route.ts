import { checkHealth } from "@/server/health";

export const dynamic = "force-dynamic";

// Public: used by Docker healthchecks. Exposes status only, no internals.
export async function GET() {
  const health = await checkHealth();
  return Response.json(health, { status: health.db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
