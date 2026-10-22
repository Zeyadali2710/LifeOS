"use client";

import { useState } from "react";
import { automationInput, TRIGGER_EVENTS, WEEKDAYS, type Action, type Condition, type Trigger, type TriggerEvent } from "@/lib/automations";
import type { AutomationsViewData } from "@/server/automations-view";
import { deleteAutomationAction, saveAutomationAction } from "@/server/automation-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button, IconButton } from "@/ui/button";
import { Checkbox, Select, TextArea, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Dialog } from "@/ui/overlay";
import { ACTION_LABEL } from "./model";
import s from "./automations.module.css";

type Row = AutomationsViewData["automations"][number];
const blankAction = (type: Action["type"]): Action => type === "notify" ? { type, title: "", body: "", priority: "FYI" } : type === "create_task" ? { type, title: "", dueInDays: null, priority: null } : { type, prompt: "" };

export function AutomationEditor({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useShell();
  const [name, setName] = useState(row?.name ?? "");
  const [trigger, setTrigger] = useState<Trigger>(row?.trigger ?? { type: "event", eventType: "github.ci.failed" });
  const [conditions, setConditions] = useState<Condition[]>(row?.conditions ?? []);
  const [actions, setActions] = useState<Action[]>(row?.actions ?? [blankAction("notify")]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const setAction = (i: number, action: Action) => setActions((all) => all.map((a, j) => j === i ? action : a));
  const setCondition = (i: number, condition: Condition) => setConditions((all) => all.map((c, j) => j === i ? condition : c));
  async function save() {
    const parsed = automationInput.safeParse({ name, enabled: row?.enabled ?? true, trigger, conditions: trigger.type === "event" ? conditions : [], actions });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the automation."); return; }
    setBusy(true); setError(null);
    try {
      const result = await saveAutomationAction(parsed.data, row?.id);
      if (!result.ok) { setError(result.error); return; }
      toast(row ? "Automation saved" : "Automation created"); onSaved();
    } catch { setError("Could not save the automation. Try again."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!row) return;
    setBusy(true); setError(null);
    try {
      const result = await deleteAutomationAction(row.id);
      if (!result.ok) { setError(result.error); return; }
      toast("Automation deleted"); onSaved();
    } catch { setError("Could not delete the automation. Try again."); }
    finally { setBusy(false); }
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={row ? "Edit automation" : "New automation"} wide footer={<>
    {row && <Button variant="danger" disabled={busy} onClick={() => setConfirm(true)}>Delete</Button>}
    <Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || confirm} onClick={() => void save()}>{busy ? "Saving…" : row ? "Save" : "Create"}</Button>
  </>}>
    <fieldset className={s.editor} disabled={busy}>
      <TextField label="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      <fieldset className={s.fieldset}><legend>WHEN</legend>
        <Select label="Trigger type" value={trigger.type} onChange={(e) => setTrigger(e.target.value === "event" ? { type: "event", eventType: "github.ci.failed" } : { type: "schedule", at: "08:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] })}><option value="event">Something happens in LifeOS</option><option value="schedule">On a schedule</option></Select>
        {trigger.type === "event" ? <Select label="Event" value={trigger.eventType} onChange={(e) => setTrigger({ type: "event", eventType: e.target.value as TriggerEvent })}>{Object.entries(TRIGGER_EVENTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select> : <>
          <TextField label="Time (Sydney)" type="time" value={trigger.at} onChange={(e) => setTrigger({ ...trigger, at: e.target.value })} />
          <div role="group" aria-label="Days" className={s.toolbar}>{WEEKDAYS.map((d) => <Checkbox key={d} label={d} checked={trigger.days.includes(d)} onChange={(e) => setTrigger({ ...trigger, days: e.target.checked ? WEEKDAYS.filter((day) => day === d || trigger.days.includes(day)) : trigger.days.filter((day) => day !== d) })} />)}</div>
        </>}
      </fieldset>
      {trigger.type === "event" && <fieldset className={s.fieldset}><legend>IF · ALL MATCH (OPTIONAL)</legend>
        {conditions.map((c, i) => <div key={i} className={s.condition}>
          <Select label={`Condition ${i + 1} field`} value={c.field} onChange={(e) => setCondition(i, { ...c, field: e.target.value as Condition["field"] })}><option value="title">Title</option><option value="detail">Detail</option><option value="source">Source</option></Select>
          <Select label={`Condition ${i + 1} operator`} value={c.op} onChange={(e) => setCondition(i, { ...c, op: e.target.value as Condition["op"] })}><option value="contains">contains</option><option value="equals">equals</option></Select>
          <TextField label={`Condition ${i + 1} value`} hideLabel value={c.value} maxLength={200} onChange={(e) => setCondition(i, { ...c, value: e.target.value })} />
          <IconButton icon="close" label={`Remove condition ${i + 1}`} onClick={() => setConditions(conditions.filter((_, j) => j !== i))} />
        </div>)}
        {conditions.length < 5 && <Button variant="text" onClick={() => setConditions([...conditions, { field: "title", op: "contains", value: "" }])}>Add condition</Button>}
      </fieldset>}
      <fieldset className={s.fieldset}><legend>THEN</legend>
        {actions.map((a, i) => <div key={i} className={s.actionCard}>
          <div className={s.actionHead}><Select label={`Action ${i + 1}`} value={a.type} onChange={(e) => setAction(i, blankAction(e.target.value as Action["type"]))}>{(Object.keys(ACTION_LABEL) as Action["type"][]).map((type) => <option key={type} value={type}>{ACTION_LABEL[type]}</option>)}</Select>{actions.length > 1 && <IconButton icon="close" label={`Remove action ${i + 1}`} onClick={() => setActions(actions.filter((_, j) => j !== i))} />}</div>
          {a.type === "notify" && <><TextField label={`Action ${i + 1} notification title`} value={a.title} maxLength={120} onChange={(e) => setAction(i, { ...a, title: e.target.value })} /><TextField label={`Action ${i + 1} body (optional)`} value={a.body} maxLength={500} onChange={(e) => setAction(i, { ...a, body: e.target.value })} /><Select label={`Action ${i + 1} notification priority`} value={a.priority} onChange={(e) => setAction(i, { ...a, priority: e.target.value as "FYI" | "IMPORTANT" })}><option value="FYI">FYI</option><option value="IMPORTANT">Important</option></Select></>}
          {a.type === "create_task" && <><TextField label={`Action ${i + 1} task title`} value={a.title} maxLength={200} onChange={(e) => setAction(i, { ...a, title: e.target.value })} /><div className={s.condition}><TextField label="Due in days (optional)" type="number" min={0} max={365} step={1} value={a.dueInDays ?? ""} onChange={(e) => setAction(i, { ...a, dueInDays: e.target.value === "" ? null : Number(e.target.value) })} /><Select label={`Action ${i + 1} task priority`} value={a.priority ?? ""} onChange={(e) => setAction(i, { ...a, priority: e.target.value ? Number(e.target.value) as 1 | 2 | 3 : null })}><option value="">No priority</option><option value="1">High</option><option value="2">Medium</option><option value="3">Low</option></Select></div></>}
          {a.type === "ask_agent" && <><TextArea label={`Action ${i + 1} prompt`} rows={3} value={a.prompt} maxLength={2000} onChange={(e) => setAction(i, { ...a, prompt: e.target.value })} /><p className={s.note}>Runs on a paid model with nobody watching: anything that changes something waits for your approval. Counts toward your AI spend cap.</p></>}
        </div>)}
        {actions.length < 5 && <Button variant="text" onClick={() => setActions([...actions, blankAction("notify")])}>Add action</Button>}
        {trigger.type === "event" && <p className={s.note}>Use <code>{"{{event.title}}"}</code>, <code>{"{{event.detail}}"}</code> or <code>{"{{event.source}}"}</code> in text to include the triggering event.</p>}
      </fieldset>
      {error && <Alert>{error}</Alert>}
      {confirm && row && <Alert tone="warn" action={<div className={s.toolbar}><Button variant="danger" disabled={busy} onClick={() => void remove()}>Delete automation</Button><Button disabled={busy} onClick={() => setConfirm(false)}>Keep</Button></div>}>Delete “{row.name}” and its run history? Tasks and notifications it created are kept.</Alert>}
    </fieldset>
  </Dialog>;
}
