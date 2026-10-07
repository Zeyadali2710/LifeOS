import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Organization · LifeOS" };

export default function OrganizationPage() {
  return (
    <DomainPage
      title="Organization"
      lead="Calendar, tasks and reminders."
      icon="calendar_month"
      emptyTitle="Organization isn't set up yet."
      emptyBody="Your calendar, tasks and reminders appear here once a calendar is connected."
    />
  );
}
