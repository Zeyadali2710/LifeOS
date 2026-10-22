"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { milestoneInput } from "@/lib/project-payload";
import type { MilestoneDTO } from "@/lib/project-types";
import { createMilestoneAction, deleteMilestoneAction, setMilestoneDoneAction, updateMilestoneAction } from "@/server/project-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Dialog } from "@/legacy-ui/dialog";
import { Checkbox, Field, Input } from "@/legacy-ui/field";

export function MilestoneDialog({ open, projectId, milestone, onClose }: { open: boolean; projectId: string; milestone?: MilestoneDTO; onClose: () => void }) {
  if (!open) return null;
  return <Form key={milestone?.id ?? "new"} projectId={projectId} milestone={milestone} onClose={onClose} />;
}

function Form({ projectId, milestone, onClose }: { projectId: string; milestone?: MilestoneDTO; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? "");
  const [done, setDone] = useState(!!milestone?.completedAt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const fail = () => toast("Couldn't save the milestone. Try again.", "error");

  const submit = async () => {
    if (busy) return;
    const parsed = milestoneInput.safeParse({ title, dueDate: dueDate || null });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
      return setErrors(errs);
    }
    setErrors({});
    setBusy(true);
    const r = await (milestone ? updateMilestoneAction(milestone.id, parsed.data) : createMilestoneAction(projectId, parsed.data)).catch(() => ({ ok: false, error: "failed" }) as const);
    if (!r.ok) {
      setBusy(false);
      return "errors" in r ? setErrors(r.errors) : fail();
    }
    if (milestone && done !== !!milestone.completedAt) {
      const d = await setMilestoneDoneAction(milestone.id, done).catch(() => ({ ok: false }) as const);
      if (!d.ok) {
        setBusy(false);
        router.refresh();
        return fail();
      }
    }
    setBusy(false);
    toast(milestone ? "Milestone saved" : "Milestone added");
    router.refresh();
    onClose();
  };

  const remove = async () => {
    if (!milestone) return;
    setBusy(true);
    const r = await deleteMilestoneAction(milestone.id).catch(() => ({ ok: false }) as const);
    setBusy(false);
    if (!r.ok) return toast("Couldn't delete the milestone. Try again.", "error");
    toast("Milestone deleted");
    router.refresh();
    onClose();
  };

  if (confirm && milestone) {
    return (
      <Dialog
        open
        onClose={() => setConfirm(false)}
        title={`Delete "${milestone.title}"?`}
        initialFocus={() => document.querySelector<HTMLElement>("[data-cancel]")}
        actions={
          <>
            <Button variant="ghost" data-cancel="" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={remove}>
              Delete milestone
            </Button>
          </>
        }
      >
        Tasks assigned to it stay in the project without a milestone.
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={milestone ? "Edit milestone" : "Add milestone"}
      sheet
      footerStart={
        milestone && (
          <button type="button" onClick={() => setConfirm(true)} className="rounded-6 px-1 py-2 text-[13px] text-red hover:underline max-tab:min-h-11">
            Delete milestone
          </button>
        )
      }
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {milestone ? "Save milestone" : "Add milestone"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Title" error={errors.title}>
          <Input value={title} maxLength={120} required autoFocus onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Due date" error={errors.dueDate}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        {milestone && <Checkbox label="Done" checked={done} onChange={(e) => setDone(e.target.checked)} />}
        <button type="submit" hidden disabled={busy} />
      </form>
    </Dialog>
  );
}
