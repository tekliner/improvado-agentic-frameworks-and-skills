# Currency Conversion Join

## Overview

Currency conversion allows users to express monetary metrics (spend, revenue, cost) in a target currency by joining exchange rate data into the recipe. This guide covers the full workflow: detecting source currency, confirming the target, selecting columns to convert, and building the join cell correctly.

---

## Step 1: Resolve the Source Currency

Before writing any cell, determine what currency the existing data is in. Check these sources in order:

### 1.1 `src_improvado_datasource_accounts` view

This view contains account-level metadata including currency. Query it with the `__account_id` from your recipe data:

```sql
SELECT
  datasource_account_item
FROM src_improvado_datasource_accounts
WHERE __account_id = '<account_id>'
LIMIT 1
```

The `datasource_account_item` column is a JSON object. Example value:

```json
{
  "id": "act_EXAMPLE_ACCOUNT_ID",
  "name": "Example Account",
  "status": "active",
  "currency": "USD",
  "business_id": null,
  "timezone_id": 1,
  "business_name": null,
  "timezone_name": "America/Los_Angeles",
  "is_disabled_by_status_mapping": 0
}
```

Extract `currency` from the JSON — this is the source currency for that account.

### 1.2 Currency column in existing recipe data or source tables

Some source tables or intermediate recipe outputs may contain a `currency` or `currency_code` column. Check the datasources available to the cell:

```bash
python3 .claude/skills/notebook-editor/notebook_client.py datasources \
  --notebook-id <notebook-id> \
  --cell-id <cell-id> \
  --database-schema <agency_database_schema>
```

Inspect the columns of the current cell output or source table for a currency indicator column.

### 1.3 No currency info available

If neither `src_improvado_datasource_accounts` nor the existing data has currency information, offer the user two options:

1. **Discovery API** — explore the account info directly from the platform API to find currency settings
2. **Manual mapping** — ask the user to provide a flat file or custom table mapping `account_id` → `currency_code`, then connect it via a Blend Data (union) cell before the join

> Always resolve source currency before proceeding. Do not assume USD or any default.

---

## Step 2: Confirm the Target Currency

Ask the user: **"What currency would you like to convert to?"**

Common examples: EUR, GBP, JPY, CAD, AUD. Accept any ISO 4217 currency code.

---

## Step 3: Identify Columns to Convert

Suggest monetary columns that are candidates for conversion. Typical columns in marketing data:

| Column | Description |
|--------|-------------|
| `spend` | Ad spend |
| `cost` | Campaign cost |
| `revenue` | Attributed revenue |
| `cpc` | Cost per click |
| `cpm` | Cost per mille |
| `cpa` | Cost per acquisition |
| `roas` | Return on ad spend (revenue/spend) |
| `budget` | Campaign or ad set budget |
| `value` | Conversion value |

Ask the user to confirm which columns to convert. Not all columns need conversion — dimensions, counts (clicks, impressions), and ratios that are already normalized may not need it.

**Default output column naming:** append the target currency code as a suffix in lowercase.

Examples:
- `spend` → `spend_eur`
- `revenue` → `revenue_gbp`
- `cost` → `cost_jpy`

Ask the user if they want the original columns kept alongside the converted ones, or replaced.

---

## Step 4: Exchange Rate Source

Exchange rates are available in the **`src_improvado_currency_exchange_rates`** view. This is a standard Improvado view — no need to search for it.

Schema:

| Column | Type | Description |
|--------|------|-------------|
| `currency_exchange_daily_grain_id` | String | Row UUID/hash |
| `date` | Date | Rate date (daily granularity) |
| `base_currency` | FixedString(3) | Source currency ISO code (e.g., `AED`, `USD`) |
| `quote_currency` | FixedString(3) | Target currency ISO code (e.g., `EUR`, `VND`) |
| `currency_pair` | String | Human-readable pair label (e.g., `AED/VND`) |
| `currency_exchange_rate` | Float64 | Conversion rate — multiply the source amount by this value |
| `__insert_date` | DateTime | When the rate was loaded |

Example rows:

```
currency_exchange_daily_grain_id  date        base_currency  quote_currency  currency_pair  currency_exchange_rate  __insert_date
AD4BEFC56B1BE47B17093F1083D229FC  2025-12-01  AED            VND             AED/VND        7194.244604             2025-12-01 07:03:58
158847D398417487F987050DC36864CB  2025-12-01  AED            BRL             AED/BRL        1.458762                2025-12-02 07:08:35
```

> The view contains one row per `(date, base_currency, quote_currency)` combination. Joining on all three prevents row fan-out.

---

## Step 5: Build the Join Cell

After all information is confirmed, create a join cell following the [join-cell documentation](join-cell.md).

### Join Key Requirements

To avoid duplication and ensure efficiency, join on keys that uniquely identify the exchange rate row:

- `date` — always required (rates change daily)
- `base_currency` — the source currency of the data row
- `quote_currency` — the target currency the user wants, **when the target currency varies per row**

**When the target currency is fixed** (e.g., user always wants EUR), do not add `quote_currency` as a join key. Instead, pre-filter the exchange rate view to `quote_currency = 'EUR'` before joining — this keeps the join clean and avoids needing a target currency column in the main table.

### Join Type

Use **left join** — preserve all rows from the main data table. Rows without a matching rate (e.g., missing date or unsupported currency pair) will produce NULL converted values, making data gaps visible rather than silently dropping rows.

### Deduplication Warning

`src_improvado_currency_exchange_rates` contains one row per `(date, base_currency, quote_currency)`. Always join on all three — never just `date` alone — or you will get one fan-out row per supported currency pair.

Failing to use all three keys will cause **row multiplication** (fan-out), inflating all metrics.

### Example Join Cell Content

**Case A — fixed target currency (most common):** pre-filter the exchange rate view so only one `quote_currency` row exists per date. Join on `date` + `base_currency` only.

```json
{
  "main_table": "cell_2_sql_query_label_1088891118",
  "join_table": "src_improvado_currency_exchange_rates",
  "join_type": "left",
  "join_keys": [
    {
      "main_table_column": "date",
      "join_table_column": "date"
    },
    {
      "main_table_column": "source_currency",
      "join_table_column": "base_currency"
    }
  ],
  "additional_main_table_columns": [
    "date",
    "campaign_id",
    "campaign_name",
    "__account_id",
    "spend",
    "clicks",
    "impressions",
    "source_currency"
  ],
  "additional_join_table_columns": [
    "currency_exchange_rate"
  ]
}
```

> Pre-filter `src_improvado_currency_exchange_rates` to `quote_currency = 'EUR'` (or whichever target) in a preceding SQL cell before this join. This is the preferred approach when the target currency is the same for all rows.

**Case B — dynamic target currency (target varies per row):** the main table must have a target currency column. Join on all three keys.

```json
{
  "main_table": "cell_2_sql_query_label_1088891118",
  "join_table": "src_improvado_currency_exchange_rates",
  "join_type": "left",
  "join_keys": [
    {
      "main_table_column": "date",
      "join_table_column": "date"
    },
    {
      "main_table_column": "source_currency",
      "join_table_column": "base_currency"
    },
    {
      "main_table_column": "target_currency",
      "join_table_column": "quote_currency"
    }
  ],
  "additional_main_table_columns": [
    "date",
    "campaign_id",
    "campaign_name",
    "__account_id",
    "spend",
    "clicks",
    "impressions",
    "source_currency",
    "target_currency"
  ],
  "additional_join_table_columns": [
    "currency_exchange_rate"
  ]
}
```

### After the Join: Compute Converted Columns

After the join cell, **always add a Blend Data (union) cell** to compute the converted values. Only Blend Data supports row-level formula expressions — Group By does not. Read the [Blend Data documentation](union-cell.md) before creating this cell.

The Blend Data cell should:
- Pass through all existing columns with 1:1 mapping
- Add new formula columns for each converted metric, e.g.:

```
spend_eur    = spend * currency_exchange_rate
revenue_eur  = revenue * currency_exchange_rate
```

Refer to [formulas-and-expressions documentation](formulas-and-expressions.md) for formula syntax.

---

## Full Workflow Summary

```
1. Check src_improvado_datasource_accounts → get source currency
   OR find currency column in existing data
   OR use Discovery API / ask user for flat mapping

2. Ask user: target currency?

3. Ask user: which monetary columns to convert?
   (suggest: spend, cost, revenue, cpc, cpm, cpa, budget)

4. Create join cell:
   - main_table: current cell output
   - join_table: src_improvado_currency_exchange_rates
   - join_type: left
   - join_keys: date + base_currency + quote_currency
   - Pull only: currency_exchange_rate column from the exchange rate view

5. Add Blend Data cell:
   - Compute spend_<currency> = spend * currency_exchange_rate
   - Compute other converted columns
   - Keep or drop originals per user preference
```

---

## Common Pitfalls

| Pitfall | Prevention |
|---------|-----------|
| Joining only on `date` | Always include `base_currency`; add `quote_currency` if target varies per row |
| Assuming all accounts share one currency | Check `src_improvado_datasource_accounts` per account |
| NULL converted values | Expected for missing rate rows; inform the user |
| Replacing original columns blindly | Ask user whether to keep originals alongside converted columns |
| Using Group By instead of Blend Data after join | Only Blend Data supports row-level formula expressions; always use Blend Data |
