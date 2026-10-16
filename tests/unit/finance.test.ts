import { describe, expect, it } from "vitest";
import { classify, DEFAULT_FINANCE_CATEGORIES, effectiveBudgets, financeOverview, money, shiftFinanceMonth, summariseFinance } from "@/lib/finance";
import { csvRows, financeDate, parseFinanceCsv } from "@/lib/finance-csv";

describe("finance CSV and money", () => {
  it("parses exact integer cents, real zero, thousands and negative parentheses", () => {
    expect(money("0")).toBe(0); expect(money("0.10")).toBe(10); expect(money("AUD $1,234.56")).toBe(123456); expect(money("(12.01)")).toBe(-1201);
    for (const bad of ["1.001", "1,23", "NaN", "Infinity", "=SUM(A1)", "", "999999999999999"]) expect(() => money(bad)).toThrow();
  });
  it("handles BOM, CRLF, embedded commas/newlines, and escaped quotes", () => {
    expect(csvRows('\ufeffDate,Amount,Description\r\n01/02/2026,-1.23,"Shop, \"\"North\"\"\nbranch"\r\n')).toEqual([["Date", "Amount", "Description"], ["01/02/2026", "-1.23", 'Shop, "North"\nbranch']]);
    expect(() => csvRows('A,B\n"unterminated')).toThrow(/unclosed/);
    expect(() => csvRows('A,B\n"ok"junk,x')).toThrow(/closing quote/);
  });
  it("supports the workbook's month layout without pretending it contains exact dates", () => {
    const result = parseFinanceCsv('Month,Amount,Name,Balance,Category\n2026-02,-12.01,Test merchant,123.45,Groceries');
    expect(result).toMatchObject({ kind: "transactions", rows: [{ date: "2026-02-01", precision: "month", amount: -1201, balance: 12345, category: "Groceries" }] });
    expect(() => parseFinanceCsv('Month,Amount,Name\nFebruary,-12,Shop')).toThrow(/include its year/);
  });
  it("supports headerless bank exports and separate debit/credit columns", () => {
    expect(parseFinanceCsv('12/02/2026,-12.34,"Test store",99.00')).toMatchObject({ rows: [{ date: "2026-02-12", amount: -1234, description: "Test store", balance: 9900 }] });
    expect(parseFinanceCsv('Date,Debit,Credit,Details\n12/02/2026,10,,Store\n13/02/2026,,20,Pay')).toMatchObject({ rows: [{ amount: -1000 }, { amount: 2000 }] });
    expect(() => parseFinanceCsv('Date,Debit,Credit,Details\n12/02/2026,10,20,Store')).toThrow(/Both debit and credit/);
    expect(() => parseFinanceCsv('Date,Debit,Credit,Details\n12/02/2026,-10,,Store')).toThrow(/signed Amount/);
  });
  it("rejects invalid dates and malformed rows, without silently skipping data", () => {
    expect(financeDate("29/02/2024")).toBe("2024-02-29");
    for (const bad of ["29/02/2025", "31/04/2026", "2026-13-01", "02/03/26"]) expect(() => financeDate(bad)).toThrow();
    expect(() => parseFinanceCsv('Date,Amount,Description\n01/02/2026,nope,Shop')).toThrow(/Row 2/);
    expect(() => parseFinanceCsv('Date,Amount,Description\n01/02/2026,-1,')).toThrow(/description/);
  });
  it("supports bank ISO timestamps while preserving the bank's written calendar date", () => {
    expect(parseFinanceCsv('"Transaction Date","Description","Amount","Balance"\n"2026-10-16T05:34:09.070+11:00","Example merchant","-30","100.50"')).toMatchObject({
      rows: [{ date: "2026-10-16", precision: "day", amount: -3000, balance: 10050 }],
    });
    expect(financeDate("2026-11-01T00:05:00+11:00")).toBe("2026-11-01");
    expect(financeDate("2026-10-31T23:55:00-07:00")).toBe("2026-10-31");
    expect(financeDate("2026-10-16T05:34:09Z")).toBe("2026-10-16");
    for (const bad of ["2026-02-30T05:34:09+11:00", "2026-10-16T25:34:09+11:00", "2026-10-16T05:60:09Z", "2026-10-16T05:34:60Z", "2026-10-16T05:34:09+11:99", "2026-10-16T05:34:09+25:00", "2026-10-16Tgarbage"]) expect(() => financeDate(bad)).toThrow();
  });
  it("reads keyword/category exports even with the workbook's extra helper column", () => {
    expect(parseFinanceCsv('Keyword,Category,,\nTest market,Groceries,,Work')).toEqual({ kind: "rules", rules: [{ keyword: "Test market", category: "Groceries" }] });
  });
});

describe("finance categories and budgets", () => {
  const rules = [{ keyword: "uber", category: "Ubers" }, { keyword: "uber eats", category: "Delivery" }];
  const known = new Set(["Ubers", "Delivery", "Groceries"]);
  it("honours supplied categories, longest rules and ambiguous rule review", () => {
    expect(classify("UBER EATS SYDNEY", rules, known)).toMatchObject({ category: "Delivery", source: "rule" });
    expect(classify("UBER EATS", rules, known, "Groceries")).toMatchObject({ category: "Groceries", source: "csv" });
    expect(classify("unknown", rules, known)).toMatchObject({ category: null });
    expect(classify("ABCD EFGH", [{ keyword: "abcd", category: "Ubers" }, { keyword: "efgh", category: "Delivery" }], known)).toMatchObject({ category: null, reason: expect.stringContaining("Conflicting") });
  });
  it("reconciles cash flow, transfers, refunds and separate savings/investment contributions", () => {
    const rows = [
      { date: "2026-02-01", amount: 100000, category: "Work" }, { date: "2026-02-02", amount: 5000, category: "Transfers in" },
      { date: "2026-02-03", amount: -4000, category: "Transfers out" }, { date: "2026-02-04", amount: -12000, category: "Groceries" },
      { date: "2026-02-05", amount: 2000, category: "Groceries" }, { date: "2026-02-06", amount: -20000, category: "Savings" },
      { date: "2026-02-07", amount: -3000, category: "Investment" }, { date: "2026-02-08", amount: -1000, category: null },
    ];
    const summary = summariseFinance(rows, DEFAULT_FINANCE_CATEGORIES, "2026-02");
    expect(summary).toMatchObject({ income: 105000, spending: 15000, savings: 20000, investment: 3000, cashflow: 67000, unclassified: 1 });
    expect(summary.income - summary.spending - summary.savings - summary.investment).toBe(summary.cashflow);
    expect(summary.monthly[0]).toMatchObject({ count: 0 });
    expect(summary.monthly[1]).toMatchObject({ cashflow: 67000, count: 8 });
    expect(summary.categories.find((c) => c.name === "Groceries")?.amount).toBe(10000);
  });
  it("carries the latest earlier limit, applies overrides, preserves zero, and excludes future budgets", () => {
    const rows = [{ category: "Groceries", month: "2026-01", cents: 10000 }, { category: "Groceries", month: "2026-03", cents: 0 }, { category: "Groceries", month: "2026-06", cents: 20000 }];
    expect(effectiveBudgets(rows, "2026-02").get("Groceries")).toEqual({ cents: 10000, month: "2026-01" });
    expect(effectiveBudgets(rows, "2026-04").get("Groceries")).toEqual({ cents: 0, month: "2026-03" });
    expect(effectiveBudgets(rows, "2025-12").size).toBe(0);
  });
  it("anchors rolling ranges to the selected month and lets all time include every imported year", () => {
    const rows = [{ date: "2024-11-01", amount: 10000, category: "Work" }, { date: "2026-01-01", amount: -2000, category: "Groceries" }, { date: "2026-03-01", amount: 5000, category: "Work" }];
    for (const [range, from, size] of [["3m", "2025-12", 3], ["6m", "2025-09", 6], ["1yr", "2025-03", 12]] as const) {
      const s = financeOverview(rows, DEFAULT_FINANCE_CATEGORIES, "2026-02", range);
      expect(s).toMatchObject({ from, to: "2026-02", spending: 2000, income: 0, count: 1 });
      expect(s.monthly).toHaveLength(size);
    }
    expect(financeOverview(rows, DEFAULT_FINANCE_CATEGORIES, "2026-02", "all")).toMatchObject({ from: "2024-11", to: "2026-03", income: 15000, spending: 2000, cashflow: 13000, count: 3 });
    expect(shiftFinanceMonth("2026-01", -2)).toBe("2025-11");
    expect(shiftFinanceMonth("2025-12", 1)).toBe("2026-01");
  });
  it("accumulates only Savings contributions, subtracts withdrawals and resets at the range boundary", () => {
    const rows = [
      { date: "2025-12-01", amount: -50000, category: "Savings" },
      { date: "2026-01-01", amount: 100000, category: "Work" },
      { date: "2026-01-02", amount: -20000, category: "Savings" },
      { date: "2026-01-03", amount: -10000, category: "Investment" },
      { date: "2026-03-01", amount: 5000, category: "Savings" },
      { date: "2026-03-02", amount: -1000, category: "Groceries" },
    ];
    const s = financeOverview(rows, DEFAULT_FINANCE_CATEGORIES, "2026-03", "3m");
    expect(s.monthly.map(m => [m.month, m.count, m.cashflow, m.cumulativeSavings, m.cumulativeCashflow])).toEqual([
      ["2026-01", 3, 70000, 20000, 70000], ["2026-02", 0, 0, 20000, 70000], ["2026-03", 2, 4000, 15000, 74000],
    ]);
    expect(financeOverview(rows, DEFAULT_FINANCE_CATEGORIES, "2026-03").monthly[0]).toMatchObject({ cumulativeSavings: -5000, cumulativeCashflow: 4000 });
    expect(financeOverview([], DEFAULT_FINANCE_CATEGORIES, "2026-03", "all")).toMatchObject({ count: 0, from: "2026-03", to: "2026-03", monthly: [{ count: 0, cumulativeSavings: 0, cumulativeCashflow: 0 }] });
  });
});
