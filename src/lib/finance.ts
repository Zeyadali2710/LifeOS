export const FINANCE_KINDS = ["income", "expense", "savings", "investment", "transfer"] as const;
export type FinanceKind = typeof FINANCE_KINDS[number];
export type FinanceCategory = { name: string; group: string; kind: FinanceKind };
export type FinanceRule = { keyword: string; category: string };
export type ParsedTransaction = { row: number; date: string; precision: "day" | "month"; amount: number; description: string; balance: number | null; externalId: string | null; category: string | null };
export const MAX_CSV_BYTES = 750_000;
export const MAX_CSV_ROWS = 5000;
export const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export const normalise = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
export const merchantText = (text: string) => normalise(text).replace(/\bcard\s+(?:xx|\*+)\d+.*$/i, "").replace(/\bvalue date:.*$/i, "").trim();
export const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

/** Parse decimal money without binary floating point or silent rounding. */
export function money(text: string): number {
  let s = text.trim().replace(/^AUD\s*/i, "").replace(/\$/g, "").trim();
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s)) throw new Error("Use a decimal AUD amount with at most two cents digits.");
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = s.replace(/[-,]/g, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 2_000_000_000) throw new Error("Amount is outside the supported range.");
  return negative ? -cents : cents;
}

export function classify(description: string, rules: FinanceRule[], known: Set<string>, supplied?: string | null) {
  if (supplied && known.has(supplied)) return { category: supplied, source: "csv" as const, reason: "Category from your CSV" };
  const text = merchantText(description);
  const matches = rules.filter((r) => text.includes(normalise(r.keyword)) && known.has(r.category)).sort((a, b) => b.keyword.length - a.keyword.length);
  if (!matches.length) return { category: null, source: "unclassified" as const, reason: "No matching rule — needs review" };
  const best = matches[0]!;
  if (matches.some((r) => r.keyword.length === best.keyword.length && r.category !== best.category)) return { category: null, source: "unclassified" as const, reason: "Conflicting rules — needs review" };
  return { category: best.category, source: "rule" as const, reason: `Matched “${best.keyword}”` };
}

const groups: [string, FinanceKind, string[]][] = [
  ["Income", "income", ["Work", "Pocket Money", "Haircuts", "Transfers in", "Deposit", "Refunds", "(Uni Fees)"]],
  ["Food", "expense", ["Delivery", "Restaraunts", "Food at work"]],
  ["Transport", "expense", ["Rental", "Public", "Lime Bike", "Ubers"]],
  ["Home", "expense", ["Groceries", "Rent", "Bills", "Home and Laundry"]],
  ["Shopping", "expense", ["Clothes", "Online", "Work Expenses"]],
  ["Subscriptions", "expense", ["Phone Bill", "Stan", "Disney Plus", "Claude", "Business", "Other Subscriptions"]],
  ["Entertainment", "expense", ["Degen Pass", "Going out", "Tickets", "Gaming"]],
  ["Misc", "expense", ["Transfers out", "Bank Fees", "Health", "Uni Fees", "Other", "Holiday", "Smoking"]],
  ["Allocations", "savings", ["Savings"]], ["Allocations", "investment", ["Investment"]],
];
export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = groups.flatMap(([group, kind, names]) => names.map((name) => ({ name, group, kind })));
export const DEFAULT_FINANCE_RULES: FinanceRule[] = [
  ["uber eats", "Delivery"], ["ubereats", "Delivery"], ["doordash", "Delivery"], ["menulog", "Delivery"],
  ["woolworths", "Groceries"], ["coles", "Groceries"], ["aldi", "Groceries"],
  ["didimobility", "Ubers"], ["uber", "Ubers"], ["lime", "Lime Bike"], ["transport for nsw", "Public"], ["opal", "Public"],
  ["amazon", "Online"], ["disney", "Disney Plus"], ["anthropic", "Claude"], ["steamgames", "Gaming"],
  ["international transaction fee", "Bank Fees"], ["payroll", "Work"], ["salary", "Work"],
  ["transfer from", "Transfers in"], ["transfer to", "Transfers out"],
].map(([keyword, category]) => ({ keyword: keyword!, category: category! }));

export type FinanceRecord = { date: string; amount: number; category: string | null };
export const FINANCE_RANGES = ["month", "all", "3m", "6m", "1yr"] as const;
export type FinanceRange = typeof FINANCE_RANGES[number];
export function shiftFinanceMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const index = year! * 12 + number! - 1 + offset;
  return `${Math.floor(index / 12)}-${String((index % 12 + 12) % 12 + 1).padStart(2, "0")}`;
}
export function summariseFinance(records: FinanceRecord[], categories: FinanceCategory[], month: string, window?: { from: string; to: string }) {
  const byName = new Map(categories.map((c) => [c.name, c]));
  const start = window?.from ?? `${month.slice(0, 4)}-01`, end = window?.to ?? `${month.slice(0, 4)}-12`;
  const monthly: { month: string; income: number; spending: number; cashflow: number; savings: number; count: number }[] = [];
  for (let m = start; m <= end; m = shiftFinanceMonth(m, 1)) monthly.push({ month: m, income: 0, spending: 0, cashflow: 0, savings: 0, count: 0 });
  const spending = new Map<string, number>();
  let income = 0, expense = 0, cashflow = 0, savings = 0, investment = 0, unclassified = 0, count = 0;
  for (const row of records) {
    const c = row.category ? byName.get(row.category) : undefined;
    // Unknown categories still contribute to totals by sign, and remain visibly unreviewed.
    const kind = c?.kind ?? (row.amount < 0 ? "expense" : "income");
    const inc = kind === "income" ? row.amount : 0;
    const out = kind === "expense" ? -row.amount : 0;
    const period = monthly.find((m) => m.month === row.date.slice(0, 7));
    if (period) { period.income += inc; period.spending += out; period.cashflow += row.amount; period.savings += kind === "savings" ? -row.amount : 0; period.count++; }
    const rowMonth = row.date.slice(0, 7);
    if (window ? rowMonth < window.from || rowMonth > window.to : rowMonth !== month) continue;
    count++; income += inc; expense += out; cashflow += row.amount;
    if (kind === "savings") savings -= row.amount;
    if (kind === "investment") investment -= row.amount;
    if (!c) unclassified++;
    if (kind === "expense") spending.set(row.category ?? "Uncategorised", (spending.get(row.category ?? "Uncategorised") ?? 0) + out);
  }
  return { income, spending: expense, cashflow, savings, investment, unclassified, count, monthly,
    categories: [...spending].map(([name, amount]) => ({ name, amount, group: byName.get(name)?.group ?? "Needs review" })).sort((a, b) => b.amount - a.amount) };
}

export function financeOverview(records: FinanceRecord[], categories: FinanceCategory[], month: string, range: FinanceRange = "month") {
  const months = records.map(r => r.date.slice(0, 7)).sort();
  const from = range === "all" ? months[0] ?? month : shiftFinanceMonth(month, -(range === "3m" ? 2 : range === "6m" ? 5 : range === "1yr" ? 11 : 0));
  const to = range === "all" ? months.at(-1) ?? month : month;
  const summary = summariseFinance(records, categories, month, { from, to });
  let cashflow = 0, savings = 0;
  const monthly = summary.monthly.map(m => {
    cashflow += m.cashflow; savings += m.savings;
    return { ...m, cumulativeCashflow: cashflow, cumulativeSavings: savings };
  });
  const known = new Set(categories.map(c => c.name));
  const reviewMonth = records.filter(r => r.date.slice(0, 7) >= from && r.date.slice(0, 7) <= to && (!r.category || !known.has(r.category))).map(r => r.date.slice(0, 7)).sort().at(-1) ?? month;
  return { ...summary, monthly, from, to, reviewMonth };
}

export function effectiveBudgets(rows: { category: string; month: string; cents: number }[], month: string) {
  const result = new Map<string, { cents: number; month: string }>();
  for (const row of [...rows].filter((r) => r.month <= month).sort((a, b) => a.month.localeCompare(b.month))) result.set(row.category, { cents: row.cents, month: row.month });
  return result;
}
