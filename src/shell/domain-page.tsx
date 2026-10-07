import type { ReactNode } from "react";
import { EmptyState } from "@/ui/empty-state";
import type { IconName } from "@/ui/icon-names";
import { PageHeader } from "@/ui/page-header";

export function DomainPage(p: { title: string; lead: string; icon: IconName; emptyTitle: string; emptyBody: string; action?: ReactNode }) {
  return (
    <>
      <PageHeader title={p.title} lead={p.lead} />
      <EmptyState icon={p.icon} title={p.emptyTitle} body={p.emptyBody} action={p.action} />
    </>
  );
}
