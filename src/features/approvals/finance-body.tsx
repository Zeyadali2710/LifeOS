"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { aud, FINANCE_KINDS, money } from "@/lib/finance";
import { financeChangePayload, type FinanceChangePayload, type FinanceChangePlan } from "@/lib/finance-payload";
import { approveAction, rejectAction, retryApprovalAction, reviewFinanceAction, saveEditAction } from "@/server/approval-actions";
import { getAgent } from "@/server/agents/registry";
import { useShell } from "@/features/shell/shell-provider";
import { useAgentStatus } from "@/features/shell/agent-status";
import { Button } from "@/ui/button";
import { Checkbox, SelectField, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { since, stamp } from "./summary";
import s from "./approvals.module.css";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={s.details}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function FinanceBody({ approval: a, onChange }: { approval: ApprovalDTO; onChange: (a: ApprovalDTO) => void }) {
  const parsed = financeChangePayload.safeParse(a.edited ?? a.original);
  if (!parsed.success) return <Alert tone="info">This finance proposal can&apos;t be displayed. It expires on its own.</Alert>;
  return <FinanceReview key={`${a.id}:${JSON.stringify(a.edited)}`} a={a} saved={parsed.data} onChange={onChange} />;
}

function FinanceReview({ a, saved, onChange }: { a: ApprovalDTO; saved: FinanceChangePayload; onChange: (a: ApprovalDTO) => void }) {
  const { toast } = useShell();
  const { refresh } = useAgentStatus();
  const [draft, setDraft] = useState(saved.plan);
  const [amounts, setAmounts] = useState(saved.plan.budgets.map((b) => (b.cents === null ? "" : (b.cents / 100).toFixed(2))));
  const [shown, setShown] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const patch = (p: Partial<FinanceChangePlan>) => {
    setDraft({ ...draft, ...p });
    setChecked(false);
  };
  const p = shown.plan;
  const impact = shown.impact;
  const pending = a.status === "pending";
  const categories = [
    ...new Set(
      [...draft.categories.map((c) => c.name), ...draft.retireCategories.map((c) => c.to), ...draft.rules.map((r) => r.category), ...draft.budgets.map((b) => b.category), ...draft.assignments.map((r) => r.category), draft.fallbackIncome, draft.fallbackExpense].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  const options = categories.map((n) => <option key={n}>{n}</option>);

  async function run(kind: "approve" | "reject" | "save" | "retry") {
    setBusy(true);
    setError("");
    try {
      let payload = shown;
      if (kind === "save" || kind === "approve") {
        const plan = editing ? { ...draft, budgets: draft.budgets.map((b, i) => ({ ...b, cents: amounts[i]?.trim() ? money(amounts[i]!) : null })) } : shown.plan;
        const r = await reviewFinanceAction(a.id, plan);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        payload = r.payload;
        setShown(payload);
      }
      const r = await (kind === "reject" ? rejectAction(a.id) : kind === "retry" ? retryApprovalAction(a.id) : kind === "save" ? saveEditAction(a.id, payload) : approveAction(a.id, payload));
      if (!r.ok) {
        setError(Object.values(r.errors ?? {}).join(" ") || "Couldn't record this decision.");
        return;
      }
      if (r.approval) onChange(r.approval);
      setEditing(false);
      setChecked(false);
      void refresh();
      toast(kind === "save" ? "Finance edits saved. Review them, then approve." : kind === "reject" ? "Rejected. No finance data changed." : "Finance changes approved · applying");
    } catch {
      setError("Check the entered values and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={s.stateLine} style={{ color: pending ? "var(--status-approval)" : "var(--ink-3)" }}>
        {pending ? "! AWAITING YOUR APPROVAL" : `${a.status.toUpperCase()}${a.decidedAt ? ` · ${stamp(a.decidedAt)}` : ""}`}
      </div>
      <h2 className={s.title}>{p.title}</h2>
      <dl className={s.facts}>
        <dt>Requested by</dt>
        <dd>
          {getAgent(a.agentId)?.name ?? a.agentId} agent · {since(a.createdAt)} ago
        </dd>
        <dt>Tool · tier</dt>
        <dd className={s.mono}>{a.tool} · APPROVE</dd>
        <dt>Target</dt>
        <dd>
          {impact.changed} of {impact.transactions} transactions change · {impact.uncategorised} stay uncategorised · {impact.fallback} by fallback
        </dd>
        <dt>Expires</dt>
        <dd>{pending ? `${stamp(a.expiresAt)} · the run is suspended until you decide` : "—"}</dd>
        {a.reason && (
          <>
            <dt>Why</dt>
            <dd>{a.reason}</dd>
          </>
        )}
      </dl>
      <Alert tone="warn" role="note">
        Imported merchant text is untrusted. Transaction amounts, dates and import records are preserved; only categories, rules and budgets change.
      </Alert>
      {impact.fallback > 0 && <p className={s.warn}>Fallback assignments use broad income and spending categories because no rule matched. Review them after applying.</p>}
      {p.recategoriseAll && <p className={s.warn}>Replaces existing reviewed and CSV categories across all accounts and months.</p>}
      {p.clearRules && <p className={s.warn}>Removes all {impact.rulesRemoved} previous keyword rules before installing the proposed rules.</p>}

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField label="Proposal title" value={draft.title} maxLength={120} onChange={(e) => patch({ title: e.target.value })} data-edit />
          <Section title={`Edit proposed categories (${draft.categories.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {draft.categories.map((c, i) => (
                <div key={i} className={s.fieldsRow}>
                  <TextField label={`Category ${i + 1} name`} value={c.name} maxLength={80} onChange={(e) => patch({ categories: draft.categories.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)) })} />
                  <TextField label={`Category ${i + 1} group`} value={c.group} maxLength={80} onChange={(e) => patch({ categories: draft.categories.map((v, j) => (j === i ? { ...v, group: e.target.value } : v)) })} />
                  <SelectField label={`Category ${i + 1} treatment`} value={c.kind} onChange={(e) => patch({ categories: draft.categories.map((v, j) => (j === i ? { ...v, kind: e.target.value as typeof c.kind } : v)) })}>
                    {FINANCE_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </SelectField>
                </div>
              ))}
            </div>
          </Section>
          <Section title={`Edit category replacements (${draft.retireCategories.length})`}>
            {draft.retireCategories.map((r, i) => (
              <SelectField key={r.from} label={`Replace ${r.from} with`} value={r.to} onChange={(e) => patch({ retireCategories: draft.retireCategories.map((v, j) => (j === i ? { ...v, to: e.target.value } : v)) })}>
                {options}
              </SelectField>
            ))}
          </Section>
          <Section title={`Edit keyword rules (${draft.rules.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {draft.rules.map((r, i) => (
                <div key={i} className={s.fieldsRow} style={{ alignItems: "flex-end" }}>
                  <TextField label={`Rule ${i + 1} keyword`} value={r.keyword} maxLength={500} onChange={(e) => patch({ rules: draft.rules.map((v, j) => (j === i ? { ...v, keyword: e.target.value } : v)) })} />
                  <SelectField label={`Rule ${i + 1} category`} value={r.category} onChange={(e) => patch({ rules: draft.rules.map((v, j) => (j === i ? { ...v, category: e.target.value } : v)) })}>
                    {options}
                  </SelectField>
                  <Button variant="ghost" size="sm" destructive style={{ flex: "none" }} onClick={() => patch({ rules: draft.rules.filter((_, j) => j !== i) })}>
                    Remove rule
                  </Button>
                </div>
              ))}
            </div>
          </Section>
          <Section title={`Edit budgets (${draft.budgets.length})`}>
            {draft.budgets.map((b, i) => (
              <TextField
                key={`${b.category}:${b.month}`}
                label={`${b.category} · ${b.month} limit in AUD`}
                help="Blank removes this month's override; zero is a valid limit."
                inputMode="decimal"
                value={amounts[i]}
                onChange={(e) => setAmounts(amounts.map((v, j) => (j === i ? e.target.value : v)))}
              />
            ))}
          </Section>
          {draft.recategoriseAll && (
            <div className={s.fieldsRow}>
              <SelectField label="Fallback income category" value={draft.fallbackIncome} onChange={(e) => patch({ fallbackIncome: e.target.value })}>
                {options}
              </SelectField>
              <SelectField label="Fallback expense category" value={draft.fallbackExpense} onChange={(e) => patch({ fallbackExpense: e.target.value })}>
                {options}
              </SelectField>
            </div>
          )}
        </div>
      ) : (
        <div className={s.preview}>
          <Section title={`Proposed categories (${p.categories.length})`}>
            <ul className={s.rows}>
              {p.categories.map((c) => (
                <li key={c.name}>
                  {c.group} › <strong>{c.name}</strong> <span className={s.rowMeta}>{c.kind}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={`Retire and replace categories (${p.retireCategories.length})`}>
            <ul className={s.rows}>
              {p.retireCategories.map((c) => (
                <li key={c.from}>
                  {c.from} → {c.to}
                </li>
              ))}
            </ul>
            <p className={s.rowMeta}>{impact.budgetsMoved} budget entries merge into replacement categories, keeping carried limits.</p>
          </Section>
          <Section title={`Proposed keyword rules (${p.rules.length})`}>
            <ul className={s.rows}>
              {p.rules.map((r) => (
                <li key={r.keyword}>
                  “{r.keyword}” → {r.category}
                </li>
              ))}
            </ul>
          </Section>
          <Section title={`Individual corrections (${p.assignments.length})`}>
            <ul className={s.rows}>
              {shown.corrections.map((r) => (
                <li key={r.id}>
                  {r.date} · {r.description}: {r.from ?? "Uncategorised"} → {r.to}
                </li>
              ))}
            </ul>
          </Section>
          <Section title={`Budget changes (${p.budgets.length})`}>
            <ul className={s.rows}>
              {p.budgets.map((b) => (
                <li key={`${b.category}:${b.month}`}>
                  {b.category} · {b.month}: {b.cents === null ? "remove override" : aud(b.cents)}
                </li>
              ))}
            </ul>
          </Section>
          {p.recategoriseAll && (
            <p className={s.rowMeta}>
              Fallbacks: income → {p.fallbackIncome}; spending → {p.fallbackExpense}.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className={s.err}>
          {error}
        </p>
      )}
      {pending ? (
        <>
          {!editing && <Checkbox label="I reviewed the category replacements, transaction changes and budgets" checked={checked} onChange={(e) => setChecked(e.target.checked)} />}
          <div className={s.actions}>
            <Button variant="primary" size="lg" disabled={busy || !checked || editing} onClick={() => void run("approve")} data-approve>
              Apply finance changes
            </Button>
            <Button size="lg" disabled={busy} onClick={() => (editing ? void run("save") : (setEditing(true), setChecked(false)))}>
              {editing ? "Save and review" : "Edit"}
            </Button>
            <Button size="lg" disabled={busy} style={{ color: "var(--status-failed)" }} onClick={() => void run("reject")}>
              Reject
            </Button>
            <Link href="/finances" style={{ fontSize: 14, padding: "9px 8px" }}>
              Open Finances →
            </Link>
          </div>
          <p className={s.next}>Applied atomically: everything changes together, or nothing does.</p>
        </>
      ) : (
        <div role="status" className={s.outcome}>
          <span>
            {a.status === "executed"
              ? "Finance changes applied."
              : a.status === "approved" || a.status === "executing"
                ? "Applying approved finance changes…"
                : a.status === "failed"
                  ? a.error
                  : "No finance data was changed."}
          </span>
          {a.status === "failed" && (
            <Button size="sm" disabled={busy} onClick={() => void run("retry")}>
              Retry
            </Button>
          )}
          <Link href="/finances">Open Finances</Link>
        </div>
      )}
    </>
  );
}
