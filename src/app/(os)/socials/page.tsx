import { DomainPage } from "@/shell/domain-page";

export const metadata = { title: "Socials · LifeOS" };

export default function SocialsPage() {
  return (
    <DomainPage
      title="Socials"
      lead="Accounts, drafts and your content calendar."
      icon="public"
      emptyTitle="Socials isn't set up yet."
      emptyBody="Accounts, drafts and your content calendar appear here once a social account is connected."
    />
  );
}
