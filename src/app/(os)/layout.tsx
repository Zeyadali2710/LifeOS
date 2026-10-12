import { checkHealth } from "@/server/health";
import { snapshot } from "@/server/notifications";
import { requireOwner } from "@/server/session";
import { AppShell } from "@/shell/app-shell";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner();
  const [health, notif] = await Promise.all([checkHealth(), snapshot().catch(() => null)]);
  return (
    <AppShell
      owner={{ name: session.user.name, email: session.user.email }}
      version={health.version}
      initialHealth={health}
      initialUnread={notif?.unread ?? 0}
    >
      {children}
    </AppShell>
  );
}
