# Finances

Open **Finances** in the navigation (or More on mobile). All reads and actions require the owner session. CSV import and keyword categorisation run locally. Asking the optional Finance agent sends the requested finance context to your configured paid AI provider; it never uses a free model.

## Import transaction history

1. Export a UTF-8 CSV from your bank, or the workbook's Transactions sheet. For the workbook, change the Month display format to **yyyy-mm** before export: month names alone lose the year. This keeps monthly precision; LifeOS does not invent original transaction days.
2. Choose Import CSV and a stable account label. Use the same label for later exports from that account, including workbook history and bank exports.
3. Preview the rows and categories. Confirmed duplicates are skipped. Possible duplicates without an ID or balance are skipped unless you explicitly choose to keep them. Conflicting transaction IDs block confirmation.
4. Confirm the import, then review uncategorised transactions in Transactions. Select a category and optionally remember a stable merchant keyword for future imports and currently uncategorised rows.
5. Export the workbook's Categories sheet separately and import it as a Keyword/Category CSV to reuse existing rules. Existing CSV and reviewed categories are preserved.

Imports support Date (DD/MM/YYYY, YYYY-MM-DD, DD-Mon-YYYY or an ISO timestamp such as 2026-10-16T05:34:09.070+11:00), Amount, Description, and optional Balance, Category and Transaction ID columns. Transaction Date is accepted for bank exports; timestamps retain the bank's written calendar date without UTC conversion. Month and Name are accepted workbook aliases. Headerless Date, Amount, Description, Balance bank exports and separate non-negative Debit/Credit columns are supported. Amounts are signed AUD decimals: expenses negative, receipts positive. Quoted fields, embedded newlines and UTF-8 BOMs are accepted. Each CSV is limited to 750 KB and 5,000 rows. Invalid rows block the whole import.

Deduplication is scoped to the account label. Repeating the same file adds nothing. Stable IDs or matching date/month, signed amount, full description and balance identify confirmed matches. Without an ID or balance, repeated payments within a new file are preserved; overlaps with earlier imports require review. Differences in bank descriptions or balances can prevent a match: review the preview when overlapping workbook and bank history. Month-only history can match dated exports within the same month when the amount, description and balance agree.

Recent imports can be removed with confirmation. This deletes only the transactions that batch added, including their subsequent category corrections. It does not delete rules or budgets. Re-importing the original CSV remains possible after removal.

## Categories and charts

The default category groups follow the workbook. CSV categories take precedence over keyword rules. Matching is case-insensitive; the longest keyword wins. Equally specific rules pointing to different categories require review. Rules changes apply to uncategorised rows and future imports, preserving existing assignments. You can edit individual assignments at any time.

Transfers in count as income and transfers out as spending, as requested. Refunds assigned to expense categories offset that category; the Refunds income category follows the workbook's treatment. Savings and investments appear separately as net contributions. Net cash flow includes all imported inflows and outflows. Unknown categories still count by amount direction and are flagged for review. These are transaction reports, not bank balance or net-worth estimates. Missing months show no data.

Overview offers Month, All time, 3m, 6m and 1yr. Rolling ranges include the selected ending month; All time uses the earliest through latest imported month for the selected account. Overview totals, income/spending and category breakdowns use that range. Transactions and budgets retain their selected-month scope.

Three trend charts show cumulative Savings contributions, monthly net cash flow, and cumulative cash flow side by side on desktop (stacked on phones). Savings uses only categories with Savings treatment, with withdrawals reducing contributions; it excludes investments and income-minus-spending. Both cumulative charts start at zero at the selected range boundary and represent imported movements, not account balances. Months without imports show missing data in the monthly cash-flow chart; cumulative recorded totals carry forward with a no-import note.

Hover, focus or tap chart points/slices to see exact AUD values. Tables/lists provide the same values without pointer interaction. In Where the money went, check/uncheck individual categories to update the pie and selected total; Show all/Hide all controls are provided. These display filters do not change transactions or the other overview totals, and reset when the account or range changes. Refunds offset their categories; net-credit categories remain in the selected total and legend without negative pie slices.

## Budgets

Budgets cover **all accounts**, even when the overview has an account filter. Set limits for expense categories in the selected month. Limits carry forward until changed; saving another value sets an override from that month onward. Clearing an override restores the previous limit; zero is a valid limit. No amounts are guessed from historical spending.

Recorded spending includes credits/refunds in each category. Uncategorized transactions are flagged and excluded from category budgets until assigned. An empty month shows no data rather than a verified zero spend. Importing partial history does not prove that a month's spending is complete.

## Deploy to the homelab

After these changes have been committed and pushed, use the existing VM checkout:

```bash
cd ~/lifeos
git pull
docker compose -f docker/compose.yml --env-file .env up -d --build
docker compose -f docker/compose.yml --env-file .env logs --tail=50 migrate
docker compose -f docker/compose.yml --env-file .env ps
```

The migrate service applies additive migration **0012_finances** before web and worker start. Check it exits successfully. No new credentials, services, dependencies or environment variables are needed. Keep the existing backup process running: imported financial descriptions and account labels are private database content.

Deployment, live bank exports and the owner's first real import are not performed by local tests.

## Finance agent

Use **Ask Finance**, or ask the main assistant directly. The orchestrator delegates finance requests to the live **Finance** agent, which also appears in the Agent Command Centre. It reads category and budget definitions, totals, merchant groups and transaction details. It can propose a detailed taxonomy, replace old categories, recategorise imported history, create/edit keyword rules, correct individual assignments and set/remove monthly budget overrides.

Example: “Review all my finance transactions. Design a detailed category split, replace the old categories and categorise every transaction. Preserve my budget limits and prepare one proposal for approval.” For budgets, provide the category, month and AUD limit; the agent must not invent limits.

For a full reorganisation the server requires complete, current merchant-page coverage. One **HIGH_RISK** approval previews category definitions and replacements, keyword rules, individual corrections, budget changes, changed/uncategorised counts and fallback counts. Review and edit it in chat or Approvals, then explicitly approve. Existing manual/CSV assignments are replaced only when the proposal says it will recategorise all history. Unmatched transactions receive the named fallback income/expense category, and the proposal discloses the count rather than inferring their purpose.

Retiring categories remaps their transactions and retained rules; carried budget histories merge at every monthly boundary so a limit is not lost just because two old categories changed in different months. Other limits persist. Transactions, original amounts/dates and imports are never deleted by the agent. A proposal fails safely if finance data changes before execution. Approved writes commit atomically, record counts in the audit log and are safe to retry without applying twice.

Finance reads and proposals taint the entire conversation/delegation scope as private, including siblings and retries. The general free-private-data opt-in cannot send that data to free models. The Finance agent uses the existing paid model configuration (Sonnet by default), spend caps, pause controls and approval queue. No new credentials or migrations are required for the agent; deploy both web and worker after the existing finance migration has been applied. No tools move money or change bank connections.
