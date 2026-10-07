import { cookies } from "next/headers";
import { checkHealth } from "@/server/health";
import { snapshot } from "@/server/notifications";
import { requireOwner } from "@/server/session";
import { AppShell } from "@/shell/app-shell";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner();
  // Only the literal "compact" counts; any other cookie value means full.
  const compact = (await cookies()).get("lo_nav")?.value === "compact";
  const [health, notif] = await Promise.all([checkHealth(), snapshot().catch(() => null)]);
  return (
    <AppShell
      owner={{ name: session.user.name, email: session.user.email }}
      version={health.version}
      initialCompact={compact}
      initialHealth={health}
      initialUnread={notif?.unread ?? 0}
    >
      {children}
    </AppShell>
  );
}
