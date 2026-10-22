"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MilestoneDTO, ProjectCategory, ProjectDTO, ProjectStatus } from "@/lib/project-types";
import { CATEGORY_LABEL, PROJECT_CATEGORIES, PROJECT_STATUSES, STATUS_LABEL } from "@/lib/project-types";
import { linkInput, milestoneInput, projectInput } from "@/lib/project-payload";
import { linkProjectAction } from "@/server/goals-actions";
import { addLinkAction, createMilestoneAction, createProjectAction, deleteMilestoneAction, setMilestoneDoneAction, updateMilestoneAction, updateProjectAction } from "@/server/project-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Checkbox, Segmented, SelectField, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";

const grid2 = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" } as const;
const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => {
  const errs: Record<string, string> = {};
  for (const i of e.issues) errs[String(i.path[0] ?? "form")] ??= i.message;
  return errs;
};

function Discard({ show, onKeep, onDiscard }: { show: boolean; onKeep: () => void; onDiscard: () => void }) {
  if (!show) return null;
  return (
    <Alert
      tone="warn"
      action={
        <span style={{ display: "inline-flex", gap: 8 }}>
          <Button variant="text" size="sm" onClick={onKeep}>
            Keep editing
          </Button>
          <Button variant="text" size="sm" destructive onClick={onDiscard}>
            Discard
          </Button>
        </span>
      }
    >
      Discard changes?
    </Alert>
  );
}

/** New project (name, category, target, objective) or full edit of an existing one. */
export function ProjectDialog({
  open,
  project,
  objectives = [],
  onClose,
}: {
  open: boolean;
  project?: ProjectDTO;
  objectives?: { id: string; title: string; goal: string }[];
  onClose: () => void;
}) {
  if (!open) return null;
  return <ProjectForm key={project?.id ?? "new"} project={project} objectives={objectives} onClose={onClose} />;
}

function ProjectForm({ project, objectives, onClose }: { project?: ProjectDTO; objectives: { id: string; title: string; goal: string }[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [context, setContext] = useState(project?.context ?? "");
  const [category, setCategory] = useState<ProjectCategory>(project?.category ?? "personal");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [priority, setPriority] = useState<1 | 2 | 3>(project?.priority ?? 2);
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? "");
  const [workspacePath, setWorkspacePath] = useState(project?.workspacePath ?? "");
  const [workspaceMachine, setWorkspaceMachine] = useState(project?.workspaceMachine ?? "");
  const [blockerNote, setBlockerNote] = useState(project?.blockerNote ?? "");
  const [objective, setObjective] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const snap = JSON.stringify([name, description, context, category, status, priority, targetDate, workspacePath, workspaceMachine, blockerNote, objective]);
  const [initial] = useState(snap);
  const close = () => (snap !== initial ? setDiscard(true) : onClose());

  const submit = async () => {
    if (busy) return;
    const parsed = projectInput.safeParse({ name, description, context, category, status, priority, targetDate: targetDate || null, workspacePath, workspaceMachine, blockerNote });
    if (!parsed.success) return setErrors(issues(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await (project ? updateProjectAction(project.id, parsed.data) : createProjectAction(parsed.data)).catch(() => ({ ok: false, error: "failed" }) as const);
    if (r.ok && !project && "project" in r && objective) await linkProjectAction(objective, r.project.id).catch(() => null);
    setBusy(false);
    if (!r.ok) return "errors" in r ? setErrors(r.errors) : toast("Couldn't save the project. Try again.", "error");
    toast(project ? "Project saved" : `Created “${parsed.data.name}”.`);
    router.refresh();
    onClose();
    if (!project && "project" in r) router.push(`/projects/${r.project.id}`);
  };

  return (
    <Dialog
      open
      onClose={close}
      title={project ? "Edit project" : "New project"}
      footer={
        <>
          <Button size="lg" onClick={close}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" disabled={busy} onClick={() => void submit()}>
            {project ? "Save project" : "Create project"}
          </Button>
        </>
      }
    >
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="Name" placeholder="e.g. Conference talk" value={name} maxLength={80} required autoFocus error={errors.name} onChange={(e) => setName(e.target.value)} />
        <div style={grid2}>
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory)}>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </SelectField>
          <TextField label="Target date" type="date" value={targetDate} error={errors.targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        {!project && objectives.length > 0 && (
          <SelectField label="Objective (optional)" value={objective} onChange={(e) => setObjective(e.target.value)}>
            <option value="">None</option>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {o.goal}
              </option>
            ))}
          </SelectField>
        )}
        {project && (
          <>
            <div style={grid2}>
              <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                {PROJECT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABEL[st]}
                  </option>
                ))}
              </SelectField>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>Priority</span>
                <Segmented
                  label="Priority"
                  value={String(priority) as "1" | "2" | "3"}
                  onChange={(v) => setPriority(Number(v) as 1 | 2 | 3)}
                  options={[
                    { value: "1", label: "P1" },
                    { value: "2", label: "P2" },
                    { value: "3", label: "P3" },
                  ]}
                />
              </div>
            </div>
            <TextArea label="Description" rows={3} maxLength={500} value={description} error={errors.description} onChange={(e) => setDescription(e.target.value)} />
            <TextArea label="Context" rows={6} maxLength={4000} value={context} error={errors.context} help="What the project is, how it's built and where things live. Included in the context brief." onChange={(e) => setContext(e.target.value)} />
            <div style={grid2}>
              <TextField label="Workspace path" value={workspacePath} maxLength={400} error={errors.workspacePath} help="e.g. ~/code/lifeos" onChange={(e) => setWorkspacePath(e.target.value)} />
              <TextField label="Machine label" value={workspaceMachine} maxLength={40} error={errors.workspaceMachine} onChange={(e) => setWorkspaceMachine(e.target.value)} />
            </div>
            <TextArea label="Blocker note" rows={2} maxLength={500} value={blockerNote} error={errors.blockerNote} onChange={(e) => setBlockerNote(e.target.value)} />
          </>
        )}
        <button type="submit" hidden disabled={busy} />
      </form>
      <Discard show={discard} onKeep={() => setDiscard(false)} onDiscard={onClose} />
    </Dialog>
  );
}

export function MilestoneDialog({ open, projectId, milestone, onClose }: { open: boolean; projectId: string; milestone?: MilestoneDTO; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? "");
  const [done, setDone] = useState(Boolean(milestone?.completedAt));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const save = async () => {
    const parsed = milestoneInput.safeParse({ title, dueDate: dueDate || null });
    if (!parsed.success) return setErrors(issues(parsed.error));
    setBusy(true);
    const r = await (milestone ? updateMilestoneAction(milestone.id, parsed.data) : createMilestoneAction(projectId, parsed.data)).catch(() => ({ ok: false }) as const);
    if (r.ok && milestone && done !== Boolean(milestone.completedAt)) await setMilestoneDoneAction(milestone.id, done).catch(() => null);
    setBusy(false);
    if (!r.ok) return "errors" in r ? setErrors(r.errors as Record<string, string>) : toast("Couldn't save the milestone. Try again.", "error");
    toast(milestone ? "Milestone saved" : "Milestone added");
    router.refresh();
    onClose();
  };
  const remove = async () => {
    if (!milestone) return;
    setBusy(true);
    const r = await deleteMilestoneAction(milestone.id).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) return toast("Couldn't delete the milestone. Try again.", "error");
    toast("Milestone deleted. Its tasks stay in the project.");
    router.refresh();
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={milestone ? "Edit milestone" : "New milestone"}
      footer={
        <>
          {milestone && (
            <Button variant="ghost" destructive style={{ marginRight: "auto" }} disabled={busy} onClick={() => void remove()}>
              Delete milestone
            </Button>
          )}
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" disabled={busy} onClick={() => void save()}>
            {milestone ? "Save" : "Add milestone"}
          </Button>
        </>
      }
    >
      <TextField label="Title" value={title} maxLength={120} autoFocus error={errors.title} onChange={(e) => setTitle(e.target.value)} />
      <TextField label="Due date" type="date" value={dueDate} error={errors.dueDate} onChange={(e) => setDueDate(e.target.value)} />
      {milestone && <Checkbox label="Done" checked={done} onChange={(e) => setDone(e.target.checked)} />}
    </Dialog>
  );
}

export function LinkDialog({ open, projectId, repos, onClose }: { open: boolean; projectId: string; repos: { id: number; fullName: string }[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [kind, setKind] = useState<"repo" | "url">("repo");
  const [repoId, setRepoId] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async () => {
    const parsed = linkInput.safeParse(kind === "repo" ? { kind, repoId: Number(repoId) } : { kind, label, url });
    if (!parsed.success) {
      const errs = issues(parsed.error);
      if (kind === "repo") errs.repoId = "Pick a repository.";
      return setErrors(errs);
    }
    setBusy(true);
    const r = await addLinkAction(projectId, parsed.data).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) return "errors" in r ? setErrors(r.errors as Record<string, string>) : toast("Couldn't add the link. Try again.", "error");
    toast("Link added");
    router.refresh();
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Link to this project"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" disabled={busy} onClick={() => void submit()}>
            Add link
          </Button>
        </>
      }
    >
      <Segmented
        label="Link type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "repo", label: "GitHub repository" },
          { value: "url", label: "Web link" },
        ]}
      />
      {kind === "repo" ? (
        <SelectField label="Repository" value={repoId} error={errors.repoId} help={repos.length ? undefined : "No synced repositories. Connect GitHub in Settings."} onChange={(e) => setRepoId(e.target.value)}>
          <option value="">Pick a synced repository…</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </SelectField>
      ) : (
        <>
          <TextField label="Label" value={label} maxLength={80} error={errors.label} onChange={(e) => setLabel(e.target.value)} />
          <TextField label="URL" type="url" value={url} error={errors.url} onChange={(e) => setUrl(e.target.value)} />
        </>
      )}
    </Dialog>
  );
}
