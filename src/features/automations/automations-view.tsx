"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { describeTrigger } from "@/lib/automations";
import { setAutomationEnabledAction } from "@/server/automation-actions";
import type { AutomationsViewData } from "@/server/automations-view";
import { useShell } from "@/features/shell/shell-provider";
import { useLiveEvents } from "@/features/shell/live-provider";
import { PAGE_STATES } from "@/features/shell/page-states";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { Status } from "@/ui/display";
import { Alert, EmptyState } from "@/ui/feedback";
import { Page, PageHeader, Section } from "@/ui/layout";
import { AutomationEditor } from "./automation-editor";
import { describeAction, runState } from "./model";
import s from "./automations.module.css";

type Row = AutomationsViewData["automations"][number];
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

export function AutomationsView({ data }: { data: AutomationsViewData }) {
  const router = useRouter();
  const { toast } = useShell();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  useLiveEvents("run", () => router.refresh());
  useLiveEvents("approval", () => router.refresh());
  const current = data.automations.find((a) => a.id === selected) ?? data.automations[0];
  const runs = data.automations.flatMap((a) => a.runs.map((r) => ({ ...r, name: a.name }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

  async function toggle(row: Row, on: boolean) {
    if (inFlight.current.has(row.id)) return;
    inFlight.current.add(row.id);
    setPending((p) => ({ ...p, [row.id]: on }));
    setError(null);
    try {
      const result = await setAutomationEnabledAction(row.id, on);
      if (!result.ok) { setError(result.error); toast(result.error, "error"); return; }
      toast(on ? "Turned on. Only new triggers count; no backlog replay." : "Turned off.");
      router.refresh();
    } catch {
      setError("Could not update the automation. Try the switch again.");
      toast("Could not update the automation.", "error");
    } finally {
      inFlight.current.delete(row.id);
      setPending((p) => { const next = { ...p }; delete next[row.id]; return next; });
    }
  }

  return <Page label="Automations">
    <PageHeader title="Automations" sub="Trigger → conditions → up to 5 actions. Side effects from “Ask LifeOS” always need approval." actions={<Button variant="primary" onClick={() => setEditing("new")}>New automation</Button>} />
    {data.paused && <Alert tone="warn" className={s.alert}>Automations are paused. Resume the Automations agent in <Link href="/agents/automations">Agents</Link> to run them.</Alert>}
    {error && <Alert className={s.alert}>{error}</Alert>}
    {!current ? <EmptyState icon="repeat" title={PAGE_STATES.automations!.empty![0]} body={PAGE_STATES.automations!.empty![1]} action={<Button onClick={() => setEditing("new")}>New automation</Button>} /> : <div className={s.columns}>
      <ul className={s.rules} aria-label="Automations" onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp", "j", "k", "Home", "End"].includes(e.key)) return;
        const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-rule]")];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (["ArrowDown", "j"].includes(e.key) ? 1 : items.length - 1)) % items.length]?.focus();
      }}>
        {data.automations.map((a) => {
          const on = pending[a.id] ?? a.enabled;
          const last = a.runs[0];
          const state = last ? runState(last) : null;
          return <li key={a.id} className={s.rule} data-selected={current.id === a.id || undefined}>
            <button type="button" data-rule tabIndex={current.id === a.id ? 0 : -1} aria-pressed={current.id === a.id} className={s.pick} onFocus={() => setSelected(a.id)} onClick={() => setSelected(a.id)}>
              <strong className={on ? undefined : s.off}>{a.name}</strong>
              <span className={s.trigger}>{describeTrigger(a.trigger)}</span>
              <span className={s.last}>{!on ? <Status tone="idle" glyph="–" mono>Off</Status> : state ? <><time dateTime={last!.createdAt}>{when(last!.createdAt)}</time> · <Status tone={state.tone} glyph={state.glyph} mono>{state.label}</Status></> : "No runs yet"}</span>
            </button>
            <Switch checked={on} label={`${a.name} enabled`} disabled={pending[a.id] !== undefined} onChange={(value) => void toggle(a, value)} />
          </li>;
        })}
      </ul>
      <section className={s.detail} aria-label={`${current.name} details`}>
        <div className={s.detailHead}><h2>{current.name}</h2><Button size="sm" onClick={() => setEditing(current)}>Edit</Button></div>
        <dl className={s.steps}>{[
          { label: "WHEN", items: [describeTrigger(current.trigger)] },
          { label: "IF", items: current.conditions.length ? current.conditions.map((c) => `${c.field} ${c.op} “${c.value}”`) : ["Always"] },
          { label: "THEN", items: current.actions.map(describeAction) },
        ].map((step) => <div key={step.label} className={s.step}><dt>{step.label}</dt><dd>{step.items.map((text, i) => <span key={i}>{text}</span>)}</dd></div>)}</dl>
        <p className={s.note}>Max 20 runs per rule per 24 h. Schedules fire up to 30 minutes late, then skip. Events from automations never trigger automations.</p>
        <Section id="automation-recent-runs" label="Recent runs">
          {runs.length ? <ul className={s.runs}>{runs.map((run) => {
            const state = runState(run);
            return <li key={run.id} className={s.run}>
              <time dateTime={run.createdAt}>{when(run.createdAt)}</time>
              <div className={s.runBody}><span>{run.name}</span><span className={s.runDetail}>{run.error ?? run.triggerRef}</span>{run.agentRunId && <Link href={`/agents/runs/${run.agentRunId}`}>Trace →</Link>}</div>
              <Status tone={state.tone} glyph={state.glyph} mono>{state.label}</Status>
            </li>;
          })}</ul> : <p className={s.note}>No runs yet. New triggers appear here when this rule runs.</p>}
        </Section>
      </section>
    </div>}
    {editing && <AutomationEditor key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
  </Page>;
}
