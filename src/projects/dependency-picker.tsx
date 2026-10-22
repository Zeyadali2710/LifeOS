"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addProjectDependencyAction, addTaskDependencyAction } from "@/server/project-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Field, Select } from "@/legacy-ui/field";
import { InlineError } from "@/legacy-ui/inline-error";

type Props = { open: boolean; kind: "task" | "project"; subjectId: string; options: { id: string; title: string }[]; onClose: () => void };

export function DependencyPicker(p: Props) {
  if (!p.open) return null;
  return <Form {...p} />;
}

function Form({ kind, subjectId, options, onClose }: Props) {
  const router = useRouter();
  const { toast } = useShell();
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cycle = `That would create a circular dependency. Pick a different ${kind}.`;

  const submit = async () => {
    if (busy) return;
    if (!pick) return setError(`Pick a ${kind}.`);
    setError(null);
    setBusy(true);
    const act = kind === "task" ? addTaskDependencyAction : addProjectDependencyAction;
    const r = await act(subjectId, pick).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) {
      if ("errors" in r) return setError(cycle);
      return toast("Couldn't add the dependency. Try again.", "error");
    }
    toast("Dependency added");
    router.refresh();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add dependency"
      sheet
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Add dependency
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={`Blocked by (${kind})`}>
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a {kind}</option>
            {options
              .filter((o) => o.id !== subjectId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
          </Select>
        </Field>
        {error &&
          (error === cycle ? (
            <InlineError label="Dependency" title="Circular dependency" what={cycle} why="A chain of blockers can't loop back on itself." fix={`Choose a different ${kind}.`} />
          ) : (
            <p role="alert" className="text-[12.5px] text-red">
              {error}
            </p>
          ))}
      </div>
    </Dialog>
  );
}
