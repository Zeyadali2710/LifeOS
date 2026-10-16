import { MAX_CSV_ROWS, money, type ParsedTransaction } from "./finance";

/** RFC-style quoted fields, escaped quotes, CRLF and embedded newlines. No formula execution. */
export function csvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  const finishField = () => { row.push(field.trim()); field = ""; closed = false; };
  const finishRow = () => { finishField(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > MAX_CSV_ROWS + 1) throw new Error(`CSV may contain at most ${MAX_CSV_ROWS} data rows.`); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += ch;
    } else if (ch === delimiter) finishField();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; finishRow(); }
    else if (ch === '"') { if (field) throw new Error("Quote CSV fields that contain quotation marks."); quoted = true; }
    else { if (closed && ch.trim()) throw new Error("CSV contains text after a closing quote."); field += ch; }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (field || row.length || closed) finishRow();
  return rows;
}

export function financeDate(text: string, monthOnly = false): string {
  let s = text.trim(); let y: number, m: number, d: number;
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(s);
  if (timestamp) {
    if (Number(timestamp[2]) > 23 || Number(timestamp[3]) > 59 || Number(timestamp[4]) > 59 || Number(timestamp[6] ?? 0) > 23 || Number(timestamp[7] ?? 0) > 59) throw new Error("Invalid timestamp.");
    // Keep the bank's calendar date; converting to UTC can change the reporting month.
    s = timestamp[1]!;
  }
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?: 00:00:00)?$/.exec(s);
  const aus = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  const named = /^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/.exec(s);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3] ?? 1); }
  else if (aus) { y = Number(aus[3]); m = Number(aus[2]); d = Number(aus[1]); }
  else if (named) { y = Number(named[3]); m = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ").indexOf(named[2]!.toLowerCase()) + 1; d = Number(named[1]); }
  else throw new Error(monthOnly ? "Month must include its year. In Excel, format Month as yyyy-mm before exporting." : "Date must be DD/MM/YYYY, YYYY-MM-DD, DD-Mon-YYYY or an ISO timestamp with a timezone.");
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new Error("Invalid calendar date.");
  return `${y}-${String(m).padStart(2, "0")}-${monthOnly ? "01" : String(d).padStart(2, "0")}`;
}

const header = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = {
  date: ["date", "transactiondate", "posteddate", "postingdate", "month"],
  description: ["description", "name", "transactiondescription", "details", "narrative", "merchant"],
  amount: ["amount", "transactionamount"], balance: ["balance", "runningbalance", "closingbalance"],
  category: ["category"], id: ["transactionid", "id", "referenceid"],
  debit: ["debit", "debitamount", "withdrawal", "withdrawals"], credit: ["credit", "creditamount", "deposit", "deposits"],
};
export function parseFinanceCsv(text: string): { kind: "transactions"; rows: ParsedTransaction[] } | { kind: "rules"; rules: { keyword: string; category: string }[] } {
  const data = csvRows(text);
  if (!data.length) throw new Error("The CSV is empty.");
  let heads = data[0]!.map(header), start = 1;
  if (heads.includes("keyword") && heads.includes("category")) {
    const rules = data.slice(1).map((r, i) => {
      const keyword = r[heads.indexOf("keyword")] ?? "", category = r[heads.indexOf("category")] ?? "";
      if (keyword.length < 2 || keyword.length > 500 || !category || category.length > 80) throw new Error(`Row ${i + 2}: invalid keyword or category.`);
      return { keyword, category };
    });
    if (!rules.length) throw new Error("The rules CSV has no data rows.");
    return { kind: "rules", rules };
  }
  if (!heads.some((h) => ALIASES.date.includes(h))) {
    // CommBank's headerless export has Date, Amount, Description, Balance in this order.
    try { financeDate(data[0]![0] ?? ""); money(data[0]![1] ?? ""); } catch { throw new Error("CSV needs Date (or Month), Amount and Description (or Name) columns."); }
    heads = ["date", "amount", "description", "balance"]; start = 0;
  }
  const idx = Object.fromEntries(Object.entries(ALIASES).map(([key, names]) => [key, heads.findIndex((h) => names.includes(h))])) as Record<keyof typeof ALIASES, number>;
  if (idx.date < 0 || idx.description < 0 || (idx.amount < 0 && (idx.debit < 0 || idx.credit < 0))) throw new Error("CSV needs Date/Month, Description/Name, and Amount or Debit + Credit columns.");
  if (data.length - start > MAX_CSV_ROWS) throw new Error(`CSV may contain at most ${MAX_CSV_ROWS} data rows.`);
  const rows = data.slice(start).map((r, i): ParsedTransaction => {
    const row = i + start + 1, read = (key: keyof typeof ALIASES) => (r[idx[key]] ?? "").trim();
    try {
      const description = read("description");
      if (!description || description.length > 4000 || read("id").length > 200 || read("category").length > 80) throw new Error("Invalid description, category or transaction ID length.");
      let amount: number;
      if (idx.amount >= 0) amount = money(read("amount"));
      else {
        const debit = read("debit"), credit = read("credit");
        if (debit && credit && money(debit) !== 0 && money(credit) !== 0) throw new Error("Both debit and credit are populated.");
        if ((credit && money(credit) < 0) || (debit && money(debit) < 0)) throw new Error("Use non-negative Debit/Credit values or a signed Amount column.");
        amount = (credit ? money(credit) : 0) - (debit ? money(debit) : 0);
        if (!debit && !credit) throw new Error("Missing amount.");
      }
      const monthOnly = heads[idx.date] === "month" || /^\d{4}-\d{2}$/.test(read("date"));
      return { row, date: financeDate(read("date"), monthOnly), precision: monthOnly ? "month" : "day", description, amount,
        balance: read("balance") ? money(read("balance")) : null, externalId: read("id") || null, category: read("category") || null };
    } catch (error) { throw new Error(`Row ${row}: ${error instanceof Error ? error.message : "Invalid transaction."}`); }
  });
  if (!rows.length) throw new Error("The CSV has no transactions.");
  return { kind: "transactions", rows };
}
