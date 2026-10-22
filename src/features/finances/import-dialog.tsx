"use client";

import { useState } from "react";
import { aud, MAX_CSV_BYTES } from "@/lib/finance";
import type { FinancePreview } from "@/server/finance";
import { importFinanceAction, previewFinanceAction } from "@/server/finance-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Checkbox, TextField } from "@/ui/controls";
import { Alert } from "@/ui/feedback";
import { Status } from "@/ui/display";
import { Dialog } from "@/ui/overlay";
import s from "./finances.module.css";

type Result = Extract<Awaited<ReturnType<typeof importFinanceAction>>, { ok: true }>['result'];
export function ImportDialog({ onClose, accounts }: { onClose(month?: string): void; accounts: string[] }) {
  const { toast } = useShell();
  const [account, setAccount] = useState(accounts[0] ?? 'everyday');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FinancePreview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false), [page, setPage] = useState(0);
  const rows = preview?.kind === 'transactions' ? preview.rows : [];
  const possible = rows.filter(r => r.status === 'possible').length, conflicts = rows.filter(r => r.status === 'conflict').length;
  const form = () => { const f = new FormData(); if (file) f.set('file', file); f.set('account', account); f.set('keepPossible', String(keep)); return f; };
  function close() { if (!busy) onClose(result?.kind === 'transactions' ? rows.map(r => r.date.slice(0, 7)).sort().at(-1) : undefined); }
  async function inspect() {
    if (!file) { setError('Choose a CSV file first.'); return; }
    if (file.size > MAX_CSV_BYTES) { setError('CSV files must be 750 KB or smaller.'); return; }
    setBusy(true); setError('');
    try { const r = await previewFinanceAction(form()); if (r.ok) { setPreview(r.preview); setPage(0); } else setError(r.error); }
    catch { setError('Could not preview this file. Try again.'); } finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || busy || result) return;
    setBusy(true); setError('');
    try { const r = await importFinanceAction(form()); if (!r.ok) { setError(r.error); return; } setResult(r.result); toast(r.result.kind === 'rules' ? `${r.result.imported} rules saved · ${r.result.updated} transactions categorised` : `${r.result.imported} imported · ${r.result.skipped} duplicates/skipped · ${r.result.unclassified} need review`); }
    catch { setError('Could not complete the import. Preview again before retrying.'); } finally { setBusy(false); }
  }
  return <Dialog open wide title="Import CSV" onClose={close} footer={<><Button disabled={busy} onClick={close}>{result ? 'Close' : 'Cancel'}</Button>{result ? <Button variant="primary" onClick={close}>Done</Button> : <><Button disabled={busy || conflicts > 0} variant="primary" onClick={preview ? commit : inspect}>{busy ? 'Working…' : preview ? 'Confirm import' : 'Preview CSV'}</Button></>}</>}>
    <div className={s.dialogBody}><span className={s.step}>STEP {result ? 3 : preview ? 2 : 1} OF 3</span>
      {error && <Alert>{error}</Alert>}
      {result ? <div role="status"><Status tone="working" glyph="✓">Import complete</Status><p>{result.kind === 'rules' ? `${result.imported} rules saved. ${result.updated} transactions categorised; reviewed categories are preserved.` : `Imported ${result.imported} transactions into ${account}. ${result.skipped} duplicates/skipped; ${result.unclassified} uncategorised. Review them in Transactions. You can remove this import from Recent imports.`}</p></div> : <>
        {!preview ? <><div className={s.fileBox}><TextField label="CSV file" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setKeep(false); setError(''); }} help="UTF-8 · up to 750 KB / 5,000 rows" /></div>
          <TextField label="Account label" list="finance-accounts" value={account} maxLength={80} disabled={busy} onChange={e => { setAccount(e.target.value); setPreview(null); }} help="Use the same label for overlapping exports from this account; a different label for each bank account." /><datalist id="finance-accounts">{accounts.map(a => <option key={a} value={a} />)}</datalist>
          <p className={s.sub}>Bank Date, Amount, Description, Balance; or Excel Month, Amount, Name, Balance, Category. Format Month as yyyy-mm; month names alone lose the year. Save Categories separately as Keyword/Category CSV.</p><p className={s.sub}>CSV imports use local rules. Asking Finance shares requested data with your configured paid AI provider.</p></> : <>
          <div className={s.listRow}><span>{file?.name} · {account}</span><Button variant="text" disabled={busy} onClick={() => { setPreview(null); setKeep(false); setError(''); }}>Change file or account</Button></div>
          {preview.kind === 'rules' ? <><p>{preview.rules.length} keyword rules ready. They also categorise uncategorised transactions; reviewed categories stay intact.</p><ul className={s.previewList}>{preview.rules.map((r, i) => <li key={i}>{r.keyword} → {r.category}</li>)}</ul></> : <>
            <div className={s.previewTotals}>{[['new rows', rows.filter(r => r.status === 'new').length], ['duplicates skipped', rows.filter(r => r.status === 'duplicate').length], ['possible duplicates', possible], ['need a category', rows.filter(r => !r.category && r.status === 'new').length]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
            {possible > 0 && <Alert tone="warn"><p>Matching rows without a stable ID or balance are skipped unless kept. Identical payments may be legitimate.</p><Checkbox label={`Keep all ${possible} possible duplicates as new transactions`} checked={keep} disabled={busy} onChange={e => setKeep(e.target.checked)} /></Alert>}
            {conflicts > 0 && <Alert>{conflicts} transaction IDs have conflicting details. Check the account and file.</Alert>}
            <div className={s.previewList}><table className={s.table}><caption className="sr-only">CSV import preview</caption><thead><tr>{['Row / date', 'Description', 'Amount', 'Category', 'Status'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{rows.slice(page * 50, page * 50 + 50).map(r => <tr key={r.row}><td>{r.row} · {r.precision === 'month' ? `${r.date.slice(0, 7)} (month only)` : r.date}</td><td>{r.description}</td><td className={s.money}>{aud(r.amount)}</td><td title={r.reason}>{r.category ?? 'Needs review'}</td><td><Status tone={r.status === 'conflict' ? 'failed' : r.status === 'possible' ? 'approval' : r.status === 'new' ? 'working' : 'idle'} glyph={r.status === 'new' ? '✓' : r.status === 'conflict' ? '×' : r.status === 'possible' ? '!' : '–'}>{r.status === 'new' ? 'Ready' : r.status}</Status></td></tr>)}</tbody></table></div>
            <div className={s.listRow}><Button size="sm" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span className={s.sub}>Rows {page * 50 + 1}–{Math.min(rows.length, page * 50 + 50)} of {rows.length}</span><Button size="sm" disabled={busy || (page + 1) * 50 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div>
          </>}
        </>}
      </>}
    </div>
  </Dialog>;
}
