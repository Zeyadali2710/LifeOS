"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { RadioGroup } from "@/ui/field";

export type Scope = "this" | "following" | "all";

export function ScopeDialog({
  kind,
  onConfirm,
  onCancel,
}: {
  kind: "edit" | "delete";
  onConfirm(scope: Scope): void;
  onCancel(): void;
}) {
  const [scope, setScope] = useState<Scope>("this");
  const del = kind === "delete";
  const options = [
    { value: "this", label: "This event" },
    // On the first occurrence the server treats "following" as "all", so it is always safe to offer.
    { value: "following", label: "This and following events" },
    { value: "all", label: "All events" },
  ];
  return (
    <Dialog
      open
      onClose={onCancel}
      title={del ? "Delete repeating event" : "Edit repeating event"}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={del ? "destructive" : "primary"} onClick={() => onConfirm(scope)}>
            {del ? "Delete event" : "Save event"}
          </Button>
        </>
      }
    >
      <RadioGroup name="scope" label="Which events" value={scope} options={options} onChange={(v) => setScope(v as Scope)} />
    </Dialog>
  );
}
