# Join Cell

## Overview

Join cells combine two tables based on key columns. They are used for:
- Enriching data with additional dimensions (e.g., campaign metadata)
- Combining related entities (e.g., ads + campaigns)
- Joining cell outputs with reference tables
- All standard SQL join types: left, right, inner, full

## Content Structure

Content — references real tables or virtual cell output tables:

```json
{
  "main_table": "cell_1_sql_query_label_1088891118",
  "join_table": "entity_campaigns_10873_google_ads_ql_all_data",
  "join_type": "left",
  "join_keys": [
    {
      "main_table_column": "campaign_id",
      "join_table_column": "campaign_id"
    }
  ],
  "additional_main_table_columns": ["date", "campaign_id", "campaign_name", "spend", "__insert_date"],
  "additional_join_table_columns": ["advertising_channel_sub_type", "advertising_channel_type", "start_date"]
}
```

## Key Rules

- `main_table`/`join_table` can be real tables OR virtual cell outputs (e.g., `cell_1_sql_query_label_...`)
- `join_type`: `"left"`, `"right"`, `"inner"`, `"full"`
- `join_keys`: array of `{"main_table_column": "...", "join_table_column": "..."}` pairs
- `additional_main_table_columns` / `additional_join_table_columns`: columns to include from each table
- Context for run: `"join"`

## Join Types

### Left Join
Returns all rows from main table + matching rows from join table. Non-matching rows from join table are NULL.

```json
{
  "join_type": "left"
}
```

### Right Join
Returns all rows from join table + matching rows from main table. Non-matching rows from main table are NULL.

```json
{
  "join_type": "right"
}
```

### Inner Join
Returns only rows that have matches in both tables.

```json
{
  "join_type": "inner"
}
```

### Full Outer Join
Returns all rows from both tables. Non-matching rows have NULL values.

```json
{
  "join_type": "full"
}
```

## Multiple Join Keys

You can join on multiple columns:

```json
{
  "join_keys": [
    {
      "main_table_column": "campaign_id",
      "join_table_column": "campaign_id"
    },
    {
      "main_table_column": "account_id",
      "join_table_column": "account_id"
    }
  ]
}
```

## Discovering Table Names

**You MUST use the `datasources` command to discover the exact virtual table names** — do not guess the hash.

Virtual cell outputs follow this pattern:
```
cell_{cell_number}_sql_query_label_{hash}
```

Example: `cell_1_sql_query_label_1088891118`

### List available datasources (tables)

```bash
python3 .claude/skills/notebook-editor/notebook_client.py datasources \
  --notebook-id <notebook-id> \
  --cell-id <cell-id> \
  --database-schema <agency_database_schema>
```

Returns all tables available to a cell, including:
- Real data tables (e.g., `ads_10873_google_ads_ql_all_data`)
- Virtual cell output tables (e.g., `cell_1_sql_query_label_1088891118`) marked with `[CELL OUTPUT]`

## Empty Template

```json
{
  "cell_type": "join",
  "content": {
    "main_table": "",
    "join_table": "",
    "join_type": "left",
    "join_keys": [],
    "additional_main_table_columns": [],
    "additional_join_table_columns": []
  },
  "title": "Join data",
  "context": "join"
}
```

## Full Example: Enriching Campaign Data

Joining blended ads data with campaign entity table to add campaign metadata:

```json
{
  "main_table": "cell_1_sql_query_label_1088891118",
  "join_table": "entity_campaigns_10873_google_ads_ql_all_data",
  "join_type": "left",
  "join_keys": [
    {
      "main_table_column": "campaign_id",
      "join_table_column": "campaign_id"
    }
  ],
  "additional_main_table_columns": [
    "date",
    "campaign_id",
    "campaign_name",
    "spend",
    "clicks",
    "impressions",
    "__account_id",
    "__insert_date"
  ],
  "additional_join_table_columns": [
    "advertising_channel_sub_type",
    "advertising_channel_type",
    "campaign_status",
    "start_date",
    "end_date"
  ]
}
```

## Common Use Cases

### 1. Add Entity Metadata
Join ads/adsets with campaign/ad group entities to get status, dates, settings:
```
cell_1 (ads data) LEFT JOIN entity_campaigns ON campaign_id
```

### 2. Add Account Information
Enrich with account names, IDs, custom fields:
```
cell_2 (campaign data) LEFT JOIN entity_accounts ON __account_id
```

### 3. Cross-Reference Tables
Join two cell outputs for complex transformations:
```
cell_3 (Google data) INNER JOIN cell_4 (Facebook data) ON shared_key
```

### 4. Lookup Tables
Add custom mappings (e.g., campaign taxonomy, geo mappings):
```
cell_5 (main data) LEFT JOIN lookup_table ON campaign_name
```
