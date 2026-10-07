import { DomainPage } from "@/shell/domain-page";
import { SignOut } from "../sign-out";

export const metadata = { title: "Settings · LifeOS" };

export default function SettingsPage() {
  return (
    <DomainPage
      title="Settings"
      lead="Connections, permissions and preferences."
      icon="tune"
      emptyTitle="Settings aren't built yet."
      emptyBody="Connections, permissions and preferences will live here."
      action={<SignOut />}
    />
  );
}
