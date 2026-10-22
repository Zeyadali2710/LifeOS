import { PageLoading, PageState } from "@/ui/feedback";
import type { PageStateKind } from "@/ui/feedback";
import { Page, PageHeader } from "@/ui/layout";
import { PAGE_STATES, ROUTE_TITLE, STATE_AGENT } from "./page-states";

/** Route-level state page: title + agent portrait + copy + one action. Server-safe (link actions only). */
export function RouteState({ route, kind, action, body }: { route: string; kind: PageStateKind; action?: { label: string; href: string }; body?: string }) {
  const copy = PAGE_STATES[route]?.[kind] ?? PAGE_STATES[route]?.error ?? ["Something went wrong", "Try again."];
  const fallback = kind === "disconnected" ? { label: "Open Connections", href: "/settings?section=connections" } : undefined;
  return (
    <Page label={`State · ${ROUTE_TITLE[route] ?? route}`}>
      <PageHeader title={ROUTE_TITLE[route] ?? route} />
      <PageState kind={kind} title={copy[0]} body={body ?? copy[1]} agent={STATE_AGENT[route]} action={action ?? fallback} />
    </Page>
  );
}

export function RouteLoading({ route, bars }: { route: string; bars?: [number, string][] }) {
  return (
    <Page>
      <PageHeader title={ROUTE_TITLE[route] ?? route} />
      <PageLoading title={ROUTE_TITLE[route] ?? route} agent={STATE_AGENT[route]} bars={bars} />
    </Page>
  );
}
