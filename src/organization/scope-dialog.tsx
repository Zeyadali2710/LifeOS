"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { RadioGroup } from "@/ui/field";

export type Scope = "this" | "following" | "all";

export function ScopeDialog({
  kind,
  firstInstance,
  onConfirm,
  onCancel,
}: {
  kind: "edit" | "delete";
  /** the first occurrence of the series: "This and following" would equal "All" */
  firstInstance: boolean;
  onConfirm(scope: Scope): void;
  onCancel(): void;
}) {
  const [scope, setScope] = useState<Scope>("this");
  const del = kind === "delete";
  const options = [
    { value: "this", label: "This event" },
    ...(firstInstance ? [] : [{ value: "following", label: "This and following events" }]),
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
