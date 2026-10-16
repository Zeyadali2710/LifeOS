"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { aud, MAX_CSV_BYTES } from "@/lib/finance";
import type { FinancePreview } from "@/server/finance";
import { importFinanceAction, previewFinanceAction } from "@/server/finance-actions";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Checkbox, Field, Input } from "@/ui/field";
import { useShell } from "@/shell/shell-provider";

export function ImportDialog({ onClose, accounts }: { onClose(): void; accounts: string[] }) {
  const router = useRouter(); const { toast } = useShell();
  const [account, setAccount] = useState(accounts[0] ?? "everyday");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FinancePreview | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false); const [page, setPage] = useState(0);
  const form = () => { const f = new FormData(); if (file) f.set("file", file); f.set("account", account); f.set("keepPossible", String(keep)); return f; };
  async function inspect() {
    if (!file) { setError("Choose a CSV file first."); return; }
    if (file.size > MAX_CSV_BYTES) { setError("CSV files must be 750 KB or smaller."); return; }
    setBusy(true); setError("");
    try { const r = await previewFinanceAction(form()); if (r.ok) { setPreview(r.preview); setPage(0); } else setError(r.error); }
    catch { setError("Could not preview this file. Try again."); } finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const r = await importFinanceAction(form());
      if (!r.ok) { setError(r.error); return; }
      toast(r.result.kind === "rules" ? `${r.result.imported} rules saved · ${r.result.updated} transactions categorised` : `${r.result.imported} imported · ${r.result.skipped} duplicates/skipped · ${r.result.unclassified} need review`);
      if (preview.kind === "transactions") {
        const latest = preview.rows.map((r) => r.date.slice(0, 7)).sort().at(-1)!;
        router.push(`/finances?month=${latest}&tab=transactions`);
      } else router.refresh();
      onClose();
    } catch { setError("Could not complete the import. Preview again before retrying."); } finally { setBusy(false); }
  }
  const rows = preview?.kind === "transactions" ? preview.rows : [];
  const possible = rows.filter((r) => r.status === "possible").length;
  const conflicts = rows.filter((r) => r.status === "conflict").length;
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title="Import transactions or category rules" width={520} sheet actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>{preview ? <Button loading={busy} disabled={conflicts > 0} onClick={commit}>Confirm import</Button> : <Button loading={busy} onClick={inspect}>Preview CSV</Button>}</>}>
    <div className="space-y-4">
      <p className="text-[13px] text-text-2">CSV imports are processed inside LifeOS using local rules. Asking the optional Finance agent shares the requested data with your configured paid AI provider.</p>
      <Field label="Account label" helper="Use the same label for overlapping exports from the same account. Use a different label for each bank account."><Input list="finance-accounts" value={account} maxLength={80} disabled={busy} onChange={(e) => { setAccount(e.target.value); setPreview(null); }} /></Field>
      <datalist id="finance-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
      <Field label="CSV file" helper="Up to 750 KB / 5,000 rows. Bank Date, Amount, Description, Balance; or your Excel Month, Amount, Name, Balance, Category layout."><Input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setKeep(false); setError(""); }} /></Field>
      <p className="text-[12px] text-text-3">To migrate Excel history, format Month as <strong>yyyy-mm</strong> before saving the Transactions sheet as CSV; month names alone lose the year. Save the Categories sheet separately as CSV to import its Keyword/Category rules.</p>
      {error && <p role="alert" className="text-[13px] text-red">{error}</p>}
      {preview?.kind === "rules" && <div className="space-y-2"><p className="text-[13px]">{preview.rules.length} keyword rules ready. They will also categorise currently uncategorised transactions; reviewed categories are preserved.</p><ul className="max-h-60 overflow-auto text-[12px] text-text-2">{preview.rules.map((r, i) => <li key={i} className="py-1">{r.keyword} → {r.category}</li>)}</ul></div>}
      {preview?.kind === "transactions" && <div className="space-y-3">
        <div className="flex flex-wrap gap-3 text-[12px]"><span>{rows.filter((r) => r.status === "new").length} new</span><span>{rows.filter((r) => r.status === "duplicate").length} confirmed duplicates</span><span>{possible} possible duplicates</span><span>{rows.filter((r) => !r.category && r.status === "new").length} need a category</span></div>
        {possible > 0 && <div className="rounded-14 border border-amber/30 p-3"><p className="mb-2 text-[12px] text-amber">Some matching rows have no stable transaction ID or balance. Review them below: identical payments can be legitimate. They are skipped unless you choose to keep them.</p><Checkbox label={`Keep all ${possible} possible duplicates as new transactions`} checked={keep} onChange={(e) => setKeep(e.target.checked)} /></div>}
        {conflicts > 0 && <p role="alert" className="text-[13px] text-red">{conflicts} transaction IDs have conflicting details. Check that you selected the correct account and file.</p>}
        <div className="max-h-80 overflow-auto"><table className="w-full text-left text-[12px]"><caption className="sr-only">CSV import preview</caption><thead><tr>{["Row / date", "Description", "Amount", "Category", "Status"].map((s) => <th key={s} className="p-2">{s}</th>)}</tr></thead><tbody>{rows.slice(page * 50, page * 50 + 50).map((r) => <tr key={r.row} className="border-t border-white/[.08]"><td className="whitespace-nowrap p-2">{r.row} · {r.precision === "month" ? r.date.slice(0, 7) : r.date}</td><td className="max-w-64 p-2 break-words">{r.description}</td><td className="whitespace-nowrap p-2">{aud(r.amount)}</td><td className="p-2" title={r.reason}>{r.category ?? "Needs review"}</td><td className={`p-2 ${r.status === "conflict" ? "text-red" : r.status === "possible" ? "text-amber" : "text-text-3"}`}>{r.status === "new" ? "Ready" : r.status}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between gap-2 text-[12px]"><Button variant="secondary" size="xs" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span>Rows {page * 50 + 1}–{Math.min(rows.length, page * 50 + 50)} of {rows.length}</span><Button variant="secondary" size="xs" disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div>
      </div>}
    </div>
  </Dialog>;
}
