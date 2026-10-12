"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectInput } from "@/lib/project-payload";
import { CATEGORY_LABEL, PROJECT_CATEGORIES, PROJECT_STATUSES, STATUS_LABEL } from "@/lib/project-types";
import type { ProjectCategory, ProjectDTO, ProjectStatus } from "@/lib/project-types";
import { createProjectAction, updateProjectAction } from "@/server/project-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";

export function ProjectDialog({ open, project, focus, onClose }: { open: boolean; project?: ProjectDTO; focus?: "workspacePath"; onClose: () => void }) {
  if (!open) return null;
  return <Form key={project?.id ?? "new"} project={project} focus={focus} onClose={onClose} />;
}

function Form({ project, focus, onClose }: { project?: ProjectDTO; focus?: "workspacePath"; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [category, setCategory] = useState<ProjectCategory>(project?.category ?? "personal");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [priority, setPriority] = useState<1 | 2 | 3>(project?.priority ?? 2);
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? "");
  const [workspacePath, setWorkspacePath] = useState(project?.workspacePath ?? "");
  const [workspaceMachine, setWorkspaceMachine] = useState(project?.workspaceMachine ?? "");
  const [blockerNote, setBlockerNote] = useState(project?.blockerNote ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const snap = JSON.stringify([name, description, category, status, priority, targetDate, workspacePath, workspaceMachine, blockerNote]);
  const [initial] = useState(snap);
  const close = () => (snap !== initial ? setDiscard(true) : onClose());

  const focusFirst = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(`form [aria-invalid="true"]`)?.focus());

  const submit = async () => {
    if (busy) return;
    const parsed = projectInput.safeParse({
      name,
      description,
      category,
      status,
      priority,
      targetDate: targetDate || null,
      workspacePath,
      workspaceMachine,
      blockerNote,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
      setErrors(errs);
      return focusFirst();
    }
    setErrors({});
    setBusy(true);
    const r = await (project ? updateProjectAction(project.id, parsed.data) : createProjectAction(parsed.data)).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) {
      if ("errors" in r) {
        setErrors(r.errors);
        return focusFirst();
      }
      return toast("Couldn't save the project. Check the highlighted fields and try again.", "error");
    }
    toast(project ? "Project saved" : "Project created");
    router.refresh();
    onClose();
    if (!project && "project" in r) router.push(`/projects/${r.project.id}`);
  };

  const seg = (active: boolean) =>
    `h-[26px] rounded-full px-3.5 text-[12.5px] ${active ? "bg-white/[.12] text-text" : "text-text-2"} max-tab:min-h-11`;

  return (
    <Dialog
      open
      onClose={close}
      title={project ? "Edit project" : "New project"}
      width={480}
      sheet
      actions={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {project ? "Save project" : "Create project"}
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
        <Field label="Name" error={errors.name}>
          <Input value={name} maxLength={80} required autoFocus={focus !== "workspacePath"} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" error={errors.description}>
          <Textarea rows={3} maxLength={500} className="rounded-14" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory)}>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        {project && (
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-text-2">Priority</span>
          <div role="group" aria-label="Priority" className="flex w-fit rounded-full border border-white/[.06] bg-white/[.04] p-[3px]">
            {([1, 2, 3] as const).map((p) => (
              <button key={p} type="button" aria-pressed={priority === p} className={seg(priority === p)} onClick={() => setPriority(p)}>
                P{p}
              </button>
            ))}
          </div>
        </div>
        <Field label="Target date" error={errors.targetDate}>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        <Field label="Workspace path" error={errors.workspacePath} helper="Folder on your machine, e.g. C:\code\lifeos or ~/code/lifeos">
          <Input className="font-code" value={workspacePath} maxLength={400} autoFocus={focus === "workspacePath"} onChange={(e) => setWorkspacePath(e.target.value)} />
        </Field>
        <Field label="Machine label" error={errors.workspaceMachine}>
          <Input value={workspaceMachine} maxLength={40} onChange={(e) => setWorkspaceMachine(e.target.value)} />
        </Field>
        <Field label="Blocker note" error={errors.blockerNote}>
          <Textarea rows={3} maxLength={500} className="rounded-14" value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} />
        </Field>
        <button type="submit" hidden disabled={busy} />
      </form>
      {discard && (
        <div role="alert" className="mt-3 flex items-center gap-2 rounded-14 border border-[rgba(255,159,10,.3)] bg-[rgba(255,159,10,.08)] p-3 text-[13px] text-amber">
          <span className="mr-auto">Discard changes?</span>
          <Button size="xs" variant="ghost" onClick={() => setDiscard(false)}>
            Keep editing
          </Button>
          <Button size="xs" variant="secondary" onClick={onClose}>
            Discard
          </Button>
        </div>
      )}
    </Dialog>
  );
}
