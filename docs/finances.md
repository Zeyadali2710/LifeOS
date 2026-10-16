# Finances

Open **Finances** in the navigation (or More on mobile). All reads and actions require the owner session. Financial data stays in the LifeOS database; categorisation uses local keywords and does not call an AI provider.

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

Overview charts show the selected year's monthly income/spending and selected month's category groups. The month-by-month table provides exact figures. Account filtering applies to the overview and transaction list.

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
