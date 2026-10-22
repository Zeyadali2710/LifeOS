import { assistantStatus } from "@/server/agents/chat";
import { db } from "@/server/db/client";
import { checkHealth } from "@/server/health";
import { snapshot } from "@/server/notifications";
import { requireOwner } from "@/server/session";
import { AppShell } from "@/features/shell/app-shell";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner();
  const [health, notif, status] = await Promise.all([checkHealth(), snapshot().catch(() => null), assistantStatus(db()).catch(() => null)]);
  return (
    <AppShell
      owner={{ name: session.user.name, email: session.user.email }}
      version={health.version}
      initialHealth={health}
      initialUnread={notif?.unread ?? 0}
      initialStatus={status}
    >
      {children}
    </AppShell>
  );
}
