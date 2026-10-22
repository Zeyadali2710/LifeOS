"use client";

import { PageState } from "@/ui/feedback";

// Catches what segment boundaries can't: errors thrown by the (os) layout or the login page,
// in practice the session/database read. Fixed copy only, never error details (T-02-31).
export default function RootError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "0 24px" }}>
      <PageState kind="error" title="LifeOS can't reach its database" body="LifeOS couldn't load your session or data. The database may be restarting; try again in a moment." action={{ label: "Try again", onClick: retry }} />
    </main>
  );
}
