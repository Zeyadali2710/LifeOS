"use client";

import { usePathname } from "next/navigation";
import { PAGE_STATES, ROUTE_TITLE, STATE_AGENT } from "@/features/shell/page-states";
import { PageState } from "@/ui/feedback";
import { Page, PageHeader } from "@/ui/layout";

// Fixed copy only: never render error.message, stack or digest (T-02-31).
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const route = usePathname().split("/")[1] || "home";
  const copy = PAGE_STATES[route]?.error ?? ["This page couldn't load", "Something went wrong while loading it. Try again."];
  return (
    <Page>
      <PageHeader title={ROUTE_TITLE[route] ?? "LifeOS"} />
      <PageState kind="error" title={copy[0]} body={copy[1]} agent={STATE_AGENT[route]} action={{ label: "Try again", onClick: retry }} />
    </Page>
  );
}
