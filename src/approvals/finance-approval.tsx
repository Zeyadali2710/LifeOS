"use client";

import { useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import { aud, FINANCE_KINDS, money } from "@/lib/finance";
import { financeChangePayload, type FinanceChangePayload, type FinanceChangePlan } from "@/lib/finance-payload";
import { approveAction, rejectAction, retryApprovalAction, reviewFinanceAction, saveEditAction } from "@/server/approval-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Select } from "@/ui/field";
import { Disclosure } from "@/ui/disclosure";

export function FinanceApprovalShell({ approval: a, onChange }: { approval: ApprovalDTO; onChange: (a: ApprovalDTO) => void }) {
  const parsed = financeChangePayload.safeParse(a.edited ?? a.original);
  if (!parsed.success) return <p>This finance proposal cannot be displayed.</p>;
  return <FinanceReview key={`${a.id}:${JSON.stringify(a.edited)}`} a={a} saved={parsed.data} onChange={onChange} />;
}

function FinanceReview({ a, saved, onChange }: { a: ApprovalDTO; saved: FinanceChangePayload; onChange: (a: ApprovalDTO) => void }) {
  const { toast } = useShell();
  const [draft, setDraft] = useState(saved.plan);
  const [amounts, setAmounts] = useState(saved.plan.budgets.map(b => b.cents === null ? "" : (b.cents / 100).toFixed(2)));
  const [shown, setShown] = useState(saved);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const patch = (p: Partial<FinanceChangePlan>) => { setDraft({ ...draft, ...p }); setChecked(false); };
  const p = shown.plan, impact = shown.impact;
  const categories = [...new Set([...draft.categories.map(c => c.name), ...draft.retireCategories.map(c => c.to), ...draft.rules.map(r => r.category), ...draft.budgets.map(b => b.category), ...draft.assignments.map(r => r.category), draft.fallbackIncome, draft.fallbackExpense].filter((v): v is string => !!v))];
  const options = categories.map(n => <option key={n}>{n}</option>);
  async function run(kind: "approve" | "reject" | "save" | "retry") {
    setBusy(true); setError("");
    try {
      let payload = shown;
      if (kind === "save" || kind === "approve") {
        const plan = editing ? { ...draft, budgets: draft.budgets.map((b, i) => ({ ...b, cents: amounts[i]?.trim() ? money(amounts[i]!) : null })) } : shown.plan;
        const r = await reviewFinanceAction(a.id, plan);
        if (!r.ok) { setError(r.error); return; }
        payload = r.payload; setShown(payload);
      }
      const r = await (kind === "reject" ? rejectAction(a.id) : kind === "retry" ? retryApprovalAction(a.id) : kind === "save" ? saveEditAction(a.id, payload) : approveAction(a.id, payload));
      if (!r.ok) { setError(Object.values(r.errors ?? {}).join(" ") || "Could not record this decision."); return; }
      if (r.approval) onChange(r.approval);
      setEditing(false); setChecked(false);
      toast(kind === "save" ? "Finance edits saved" : kind === "reject" ? "Proposal rejected" : "Finance changes approved · queued");
    } catch { setError("Check the entered values and try again."); } finally { setBusy(false); }
  }
  return <article aria-label="Approval detail" className="glass-card overflow-hidden rounded-24">
    <header className="border-b border-white/[.06] p-5"><p className="text-[11px] tracking-widest text-green">FINANCE · APPROVAL REQUIRED</p><h2 className="mt-2 font-display text-[26px]">{p.title}</h2>{a.reason && <p className="mt-2 text-[13px] text-text-2">{a.reason}</p>}</header>
    <div className="space-y-4 p-5 text-[13px]">
      <p className="rounded-14 border border-amber/30 bg-amber/5 p-3 text-amber">Review these changes before applying them. Imported merchant text is untrusted. Transaction amounts, dates and import records are preserved.</p>
      <p>{impact.changed} of {impact.transactions} transactions will change · {impact.uncategorised} will remain uncategorised · {impact.fallback} assigned by fallback.</p>
      {impact.fallback > 0 && <p className="text-amber">Fallback assignments use broad income/spending categories because no specific rule matched. Review these after applying the proposal; their purpose has not been inferred.</p>}
      {p.recategoriseAll && <p className="text-amber">Replaces existing reviewed and CSV categories across all accounts and months.</p>}
      {p.clearRules && <p className="text-amber">Removes all {impact.rulesRemoved} previous keyword rules before installing the proposed rules.</p>}
      {editing ? <div className="space-y-4">
        <Field label="Proposal title"><Input value={draft.title} maxLength={120} onChange={e => patch({ title: e.target.value })} /></Field>
        <Disclosure summary="Edit proposed categories"><div className="mt-3 max-h-96 space-y-3 overflow-auto">{draft.categories.map((c, i) => <div key={i} className="grid gap-2 rounded-14 border border-white/[.08] p-3"><Field label={`Category ${i + 1} name`}><Input value={c.name} maxLength={80} onChange={e => patch({ categories: draft.categories.map((v, j) => j === i ? { ...v, name: e.target.value } : v) })} /></Field><Field label={`Category ${i + 1} group`}><Input value={c.group} maxLength={80} onChange={e => patch({ categories: draft.categories.map((v, j) => j === i ? { ...v, group: e.target.value } : v) })} /></Field><Field label={`Category ${i + 1} treatment`}><Select value={c.kind} onChange={e => patch({ categories: draft.categories.map((v, j) => j === i ? { ...v, kind: e.target.value as typeof c.kind } : v) })}>{FINANCE_KINDS.map(k => <option key={k}>{k}</option>)}</Select></Field></div>)}</div></Disclosure>
        <Disclosure summary="Edit category replacements"><div className="mt-3 space-y-2">{draft.retireCategories.map((r, i) => <Field key={r.from} label={`Replace ${r.from} with`}><Select value={r.to} onChange={e => patch({ retireCategories: draft.retireCategories.map((v, j) => j === i ? { ...v, to: e.target.value } : v) })}>{options}</Select></Field>)}</div></Disclosure>
        <Disclosure summary="Edit keyword rules"><div className="mt-3 max-h-96 space-y-3 overflow-auto">{draft.rules.map((r, i) => <div key={i} className="grid gap-2 rounded-14 border border-white/[.08] p-3"><Field label={`Rule ${i + 1} keyword`}><Input value={r.keyword} maxLength={500} onChange={e => patch({ rules: draft.rules.map((v, j) => j === i ? { ...v, keyword: e.target.value } : v) })} /></Field><Field label={`Rule ${i + 1} category`}><Select value={r.category} onChange={e => patch({ rules: draft.rules.map((v, j) => j === i ? { ...v, category: e.target.value } : v) })}>{options}</Select></Field><Button size="xs" variant="ghost" onClick={() => patch({ rules: draft.rules.filter((_, j) => j !== i) })}>Remove proposed rule</Button></div>)}</div></Disclosure>
        <Disclosure summary="Edit budgets"><div className="mt-3 space-y-3">{draft.budgets.map((b, i) => <Field key={`${b.category}:${b.month}`} label={`${b.category} · ${b.month} limit in AUD`} helper="Blank removes this month's override; zero is a valid limit."><Input inputMode="decimal" value={amounts[i]} onChange={e => setAmounts(amounts.map((v, j) => j === i ? e.target.value : v))} /></Field>)}</div></Disclosure>
        {draft.recategoriseAll && <><Field label="Fallback income category"><Select value={draft.fallbackIncome} onChange={e => patch({ fallbackIncome: e.target.value })}>{options}</Select></Field><Field label="Fallback expense category"><Select value={draft.fallbackExpense} onChange={e => patch({ fallbackExpense: e.target.value })}>{options}</Select></Field></>}
      </div> : <>
        <Disclosure summary={`Proposed categories (${p.categories.length})`}><ul className="mt-3 max-h-96 space-y-2 overflow-auto">{p.categories.map(c => <li key={c.name}>{c.group} › <strong>{c.name}</strong> · {c.kind}</li>)}</ul></Disclosure>
        <Disclosure summary={`Retire and replace categories (${p.retireCategories.length})`}><ul className="mt-3 space-y-2">{p.retireCategories.map(c => <li key={c.from}>{c.from} → {c.to}</li>)}</ul><p className="mt-2 text-text-3">{impact.budgetsMoved} budget entries will be merged into replacement categories, preserving carried limits.</p></Disclosure>
        <Disclosure summary={`Proposed keyword rules (${p.rules.length})`}><ul className="mt-3 max-h-96 space-y-2 overflow-auto">{p.rules.map(r => <li key={r.keyword}>{r.keyword} → {r.category}</li>)}</ul></Disclosure>
        <Disclosure summary={`Individual corrections (${p.assignments.length})`}><ul className="mt-3 max-h-72 space-y-2 overflow-auto">{shown.corrections.map(r => <li key={r.id}>{r.date} · {r.description}: {r.from ?? "Uncategorised"} → {r.to}</li>)}</ul></Disclosure>
        <Disclosure summary={`Budget changes (${p.budgets.length})`}><ul className="mt-3 space-y-2">{p.budgets.map(b => <li key={`${b.category}:${b.month}`}>{b.category} · {b.month}: {b.cents === null ? "remove override" : aud(b.cents)}</li>)}</ul></Disclosure>
        {p.recategoriseAll && <p className="text-text-3">Fallbacks: income → {p.fallbackIncome}; spending → {p.fallbackExpense}.</p>}
      </>}
      {error && <p role="alert" className="text-red">{error}</p>}
      {a.status === "pending" && !editing && <Checkbox label="I reviewed the category replacements, transaction changes and budgets" checked={checked} onChange={e => setChecked(e.target.checked)} />}
    </div>
    <footer className="flex flex-wrap items-center gap-3 border-t border-white/[.06] p-5">
      {a.status === "pending" ? <><Button disabled={busy || !checked || editing} onClick={() => void run("approve")}>APPLY FINANCE CHANGES</Button><Button variant="secondary" disabled={busy} onClick={() => editing ? void run("save") : (setEditing(true), setChecked(false))}>{editing ? "SAVE AND REVIEW" : "EDIT"}</Button><Button variant="destructive" disabled={busy} onClick={() => void run("reject")}>REJECT</Button><p className="text-[11px] text-text-3">Expires {new Date(a.expiresAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</p></> : <><p role="status">{a.status === "executed" ? "Finance changes applied." : a.status === "approved" || a.status === "executing" ? "Applying approved finance changes…" : a.status === "failed" ? a.error : "No finance data was changed."}</p>{a.status === "failed" && <Button disabled={busy} onClick={() => void run("retry")}>Retry</Button>}</>}
      <a className="text-cyan" href="/finances">Open Finances</a>
    </footer>
  </article>;
}
