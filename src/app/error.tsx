"use client";

import { InlineError } from "@/ui/inline-error";

// Catches what segment boundaries can't: errors thrown by the (os) layout or the login page,
// in practice the session/database read. Fixed copy only, never error details (T-02-31).
export default function RootError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md">
        <InlineError
          label="LIFEOS OFFLINE"
          title="LifeOS can't reach its database."
          what="LifeOS couldn't load your session or data."
          why="The database isn't responding. It may be restarting or down."
          fix="Try again in a moment. If it keeps happening, check that the database is running."
          action={{ label: "TRY AGAIN", onClick: retry }}
        />
      </div>
    </main>
  );
}
