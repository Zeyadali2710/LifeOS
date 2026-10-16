"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeTrigger, TRIGGER_EVENTS, WEEKDAYS, type Action, type AutomationInput, type Condition, type Trigger, type TriggerEvent } from "@/lib/automations";
import type { AutomationsData } from "@/server/automations";
import { deleteAutomationAction, saveAutomationAction, setAutomationEnabledAction } from "@/server/automation-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { EmptyState } from "@/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/field";
import { Icon } from "@/ui/icon";

type Row = AutomationsData["automations"][number];
const STATUS: Record<string, string> = { done: "text-green", failed: "text-red", skipped: "text-amber", running: "text-cyan" };
const ACTION_LABEL: Record<Action["type"], string> = { notify: "Send a notification", create_task: "Create a task", ask_agent: "Ask LifeOS (unattended)" };
const blankAction = (type: Action["type"]): Action =>
  type === "notify" ? { type, title: "", body: "", priority: "FYI" } : type === "create_task" ? { type, title: "", dueInDays: null, priority: null } : { type, prompt: "" };
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

function Editor({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useShell();
  const [name, setName] = useState(row?.name ?? "");
  const [trigger, setTrigger] = useState<Trigger>(row?.trigger ?? { type: "event", eventType: "github.ci.failed" });
  const [conditions, setConditions] = useState<Condition[]>(row?.conditions ?? []);
  const [actions, setActions] = useState<Action[]>(row?.actions ?? [blankAction("notify")]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const setAction = (i: number, a: Action) => setActions(actions.map((x, j) => (j === i ? a : x)));

  async function save() {
    setBusy(true); setError(null);
    const input: AutomationInput = { name, enabled: row?.enabled ?? true, trigger, conditions: trigger.type === "event" ? conditions : [], actions };
    const r = await saveAutomationAction(input, row?.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(row ? "Automation saved" : "Automation created");
    onSaved();
  }
  async function remove() {
    setBusy(true);
    const r = await deleteAutomationAction(row!.id);
    setBusy(false);
    if (r.ok) { toast("Automation deleted"); onSaved(); } else setError(r.error);
  }

  return (
    <Dialog open onClose={onClose} title={row ? "Edit automation" : "New automation"} width={520}
      footerStart={row ? <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Delete</Button> : undefined}
      actions={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{row ? "Save" : "Create"}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Name"><Input value={name} maxLength={120} placeholder="e.g. CI watcher" onChange={(e) => setName(e.target.value)} /></Field>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-[11px] tracking-[.12em] text-text-3">WHEN</legend>
          <Select aria-label="Trigger type" value={trigger.type} onChange={(e) => setTrigger(e.target.value === "event" ? { type: "event", eventType: "github.ci.failed" } : { type: "schedule", at: "08:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] })}>
            <option value="event">Something happens in LifeOS</option>
            <option value="schedule">On a schedule</option>
          </Select>
          {trigger.type === "event" ? (
            <Select aria-label="Event" value={trigger.eventType} onChange={(e) => setTrigger({ type: "event", eventType: e.target.value as TriggerEvent })}>
              {Object.entries(TRIGGER_EVENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          ) : (
            <div className="flex flex-col gap-2">
              <Field label="Time (Sydney)"><Input type="time" value={trigger.at} onChange={(e) => setTrigger({ ...trigger, at: e.target.value })} className="w-36" /></Field>
              <div role="group" aria-label="Days" className="flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => <Checkbox key={d} label={d} checked={trigger.days.includes(d)} onChange={(e) => setTrigger({ ...trigger, days: e.target.checked ? WEEKDAYS.filter((x) => x === d || trigger.days.includes(x)) : trigger.days.filter((x) => x !== d) })} />)}
              </div>
            </div>
          )}
        </fieldset>

        {trigger.type === "event" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] tracking-[.12em] text-text-3">ONLY IF (ALL MATCH, OPTIONAL)</legend>
            {conditions.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <Select aria-label={`Condition ${i + 1} field`} value={c.field} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, field: e.target.value as Condition["field"] } : x)))} className="w-28"><option value="title">Title</option><option value="detail">Detail</option><option value="source">Source</option></Select>
                <Select aria-label={`Condition ${i + 1} operator`} value={c.op} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition["op"] } : x)))} className="w-28"><option value="contains">contains</option><option value="equals">equals</option></Select>
                <Input aria-label={`Condition ${i + 1} value`} value={c.value} maxLength={200} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="min-w-0 flex-1" />
                <Button variant="ghost" size="xs" aria-label={`Remove condition ${i + 1}`} onClick={() => setConditions(conditions.filter((_, j) => j !== i))}><Icon name="close" size={14} /></Button>
              </div>
            ))}
            {conditions.length < 5 && <Button variant="ghost" size="xs" className="self-start" onClick={() => setConditions([...conditions, { field: "title", op: "contains", value: "" }])}><Icon name="add" size={14} />Add condition</Button>}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[11px] tracking-[.12em] text-text-3">THEN</legend>
          {actions.map((a, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-14 border border-white/[.08] p-3">
              <div className="flex items-center gap-2">
                <Select aria-label={`Action ${i + 1}`} value={a.type} onChange={(e) => setAction(i, blankAction(e.target.value as Action["type"]))}>
                  {(Object.keys(ACTION_LABEL) as Action["type"][]).map((k) => <option key={k} value={k}>{ACTION_LABEL[k]}</option>)}
                </Select>
                {actions.length > 1 && <Button variant="ghost" size="xs" aria-label={`Remove action ${i + 1}`} onClick={() => setActions(actions.filter((_, j) => j !== i))}><Icon name="close" size={14} /></Button>}
              </div>
              {a.type === "notify" && <>
                <Input aria-label={`Action ${i + 1} title`} placeholder="Notification title" value={a.title} maxLength={120} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                <Input aria-label={`Action ${i + 1} body`} placeholder="Body (optional)" value={a.body} maxLength={500} onChange={(e) => setAction(i, { ...a, body: e.target.value })} />
              </>}
              {a.type === "create_task" && <>
                <Input aria-label={`Action ${i + 1} task title`} placeholder="Task title" value={a.title} maxLength={200} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                <div className="flex gap-2">
                  <Input aria-label={`Action ${i + 1} due in days`} inputMode="numeric" placeholder="Due in N days (optional)" value={a.dueInDays ?? ""} onChange={(e) => setAction(i, { ...a, dueInDays: e.target.value === "" ? null : Math.max(0, Math.min(365, Math.floor(Number(e.target.value) || 0))) })} />
                  <Select aria-label={`Action ${i + 1} priority`} value={a.priority ?? ""} onChange={(e) => setAction(i, { ...a, priority: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null })} className="w-36"><option value="">No priority</option><option value="1">High</option><option value="2">Medium</option><option value="3">Low</option></Select>
                </div>
              </>}
              {a.type === "ask_agent" && <>
                <Textarea aria-label={`Action ${i + 1} prompt`} rows={3} placeholder="What should LifeOS do?" value={a.prompt} maxLength={2000} onChange={(e) => setAction(i, { ...a, prompt: e.target.value })} />
                <p className="text-[12px] text-text-3">Runs on a paid model with nobody watching: anything that changes something waits for your approval. Counts toward your AI spend cap.</p>
              </>}
            </div>
          ))}
          {actions.length < 5 && <Button variant="ghost" size="xs" className="self-start" onClick={() => setActions([...actions, blankAction("notify")])}><Icon name="add" size={14} />Add action</Button>}
          {trigger.type === "event" && <p className="text-[12px] text-text-3">Use <code>{"{{event.title}}"}</code>, <code>{"{{event.detail}}"}</code> or <code>{"{{event.source}}"}</code> in text to include the triggering event.</p>}
        </fieldset>

        {error && <p role="alert" className="text-[13px] text-red">{error}</p>}
        {confirm && row && (
          <div role="alert" className="flex flex-col gap-2 rounded-14 border border-red/30 bg-red/[.06] p-3">
            <p className="text-[13px]">Delete “{row.name}” and its run history? Tasks and notifications it created are kept.</p>
            <div className="flex gap-2"><Button variant="destructive" size="sm" loading={busy} onClick={remove}>Delete automation</Button><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Keep</Button></div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function AutomationsView({ data }: { data: AutomationsData }) {
  const router = useRouter(), { toast } = useShell();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  // Optimistic toggle, shown only while the server still reports the value it was made against.
  const [flip, setFlip] = useState<Record<string, { next: boolean; base: boolean }>>({});
  const shown = (r: Row) => (flip[r.id] && flip[r.id]!.base === r.enabled ? flip[r.id]!.next : r.enabled);
  async function toggle(r: Row, on: boolean) {
    setFlip((f) => ({ ...f, [r.id]: { next: on, base: r.enabled } }));
    const res = await setAutomationEnabledAction(r.id, on);
    if (res.ok) { toast(on ? "Automation on" : "Automation off"); router.refresh(); }
    else { setFlip((f) => { const n = { ...f }; delete n[r.id]; return n; }); toast(res.error, "error"); }
  }
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] tracking-[.12em] text-amber">AUTOMATIONS</p>
          <h1 className="font-display text-[clamp(36px,4.4vw,60px)] leading-[.95]">When this happens, do that.</h1>
          <p className="max-w-[640px] text-[13px] text-text-2">Rules run every minute through the same permission gateway as agents. Each run is listed in Agents → Automations. At most 20 runs per rule per day.</p>
        </div>
        <Button onClick={() => setEditing("new")}><Icon name="add" size={16} />New automation</Button>
      </header>
      {data.paused && <p role="status" className="rounded-14 border border-amber/30 bg-amber/[.06] p-3 text-[13px]">Automations are paused. Resume the Automations agent in <Link href="/agents/automations" className="text-text underline">Agents</Link> to run them.</p>}
      {data.automations.length === 0 ? (
        <EmptyState icon="repeat" title="No automations yet." body="For example: when CI fails on main, create a high-priority task; every weekday at 08:00, ask LifeOS to plan your day." action={<Button onClick={() => setEditing("new")}>New automation</Button>} />
      ) : (
        <ul aria-label="Automations" className="flex flex-col gap-3">
          {data.automations.map((r) => (
            <li key={r.id} className="glass-card flex flex-col gap-3 rounded-22 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{r.name}</span>
                  <span className="text-[12.5px] text-text-2">{describeTrigger(r.trigger)}{r.conditions.length ? ` · if ${r.conditions.map((c) => `${c.field} ${c.op} “${c.value}”`).join(" and ")}` : ""}</span>
                  <span className="text-[12px] text-text-3">Then: {r.actions.map((a) => ACTION_LABEL[a.type].toLowerCase()).join(", ")}</span>
                </div>
                <Checkbox label="On" checked={shown(r)} onChange={(e) => void toggle(r, e.target.checked)} aria-label={`${r.name} enabled`} />
                <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>Edit</Button>
              </div>
              {r.runs.length > 0 && (
                <ul aria-label={`${r.name} recent runs`} className="flex flex-col gap-1 border-t border-white/[.06] pt-2.5">
                  {r.runs.map((run) => (
                    <li key={run.id} className="flex flex-wrap items-center gap-x-3 text-[12px]">
                      <span className={`w-14 ${STATUS[run.status] ?? "text-text-3"}`}>{run.status}</span>
                      <span className="text-text-3">{when(run.createdAt)}</span>
                      {run.error && <span className="min-w-0 flex-1 truncate text-text-2">{run.error}</span>}
                      {run.agentRunId && <Link href={`/agents/runs/${run.agentRunId}`} className="ml-auto text-text-2 hover:text-text">Trace →</Link>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <Editor key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}
