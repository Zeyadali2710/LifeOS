import { describe, expect, it } from "vitest";
import { classify, DEFAULT_FINANCE_CATEGORIES, effectiveBudgets, money, summariseFinance } from "@/lib/finance";
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
});
