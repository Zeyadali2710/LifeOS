"use client";

import { InlineError } from "@/ui/inline-error";

// Fixed copy only: never render error.message, stack or digest (T-02-31).
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <InlineError
      label="ERROR · PAGE"
      title="This page couldn't load."
      what="Something went wrong while loading it."
      why="The server returned an error."
      fix="Try again. If it keeps happening, check the System tile on Home."
      action={{ label: "TRY AGAIN", onClick: retry }}
    />
  );
}
