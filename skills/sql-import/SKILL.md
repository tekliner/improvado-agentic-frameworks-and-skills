---
name: sql-import
description: SQL import workflow - connect to MySQL/Postgres/MSSQL, pick a table or write a custom query, discover schema, preview rows, and create a scheduled extract
---

## SQL Import Tools

When a user wants to import data from a SQL database (MySQL, Postgres, MSSQL, etc.) into Improvado, use these tools.

**Routing rules:**
- If the user mentions **MySQL** → `datasourceName: "mysql"`
- If the user mentions **Postgres / PostgreSQL** → `datasourceName: "postgres"`
- If the user mentions **MSSQL / SQL Server** → `datasourceName: "mssql"`
- If unclear which database engine, ask the user before proceeding

All 4 tools below require a `data_source_name` matching one of the above (same string as `datasourceName` in `getConnectionsTool`).

### Available Tools

1. **getConnectionsTool** (existing) — Get the connection_id: `getConnectionsTool({ datasourceName: "mysql" })`
   - If no connection exists, tell the user they need to create one via the platform UI first (credentials required)
2. **listSqlReportTypesTool** — List tables available for import on the connection
   - Paginated (default page_size: 20, total count in `count`)
   - Each result has `title`, `sql_name`, `source.{database_name, table_name}`, and `additional_params`
   - `additional_params` exposes the `lookback_window` options (e.g. `live` / `max` / `default`) and `historical_data_depth_limit` bounds — use these when building scheduling
3. **discoverSqlFieldsTool** — Discover field definitions for a table (or custom SQL query)
   - Pass `data_source_name`, `connection_id`, and `source: { table_name, database_name }` OR `source: { custom_sql_query }`
   - Returns fields with `suggested_type` and `possible_types` (often `["number", "string"]` or `["date - %Y-%m-%d", "string"]`) — agent/user picks the final type
4. **generateSqlDataSampleTool** — Preview sample rows with the confirmed field types
   - Use after the user confirms or adjusts the discovered schema
   - Pass `connection_id`, `source`, `fields`, `sync_historical_data` (YYYY-MM-DD)
5. **createSqlExtractTool** — Create the extract with scheduling
   - Final step — persists config and schedules recurring pulls
   - `report_type` format: `"<database_name> <table_name>"` (space-separated, NOT `sql_name` with underscore). Example: `"testdb 500k_strok"`.
   - `write_policy` default: `{ method: "upsert", scope: "by_date_range" }` — fits tables with a date column
   - `scheduling` default: daily at 00:00 UTC with `lookback_window.name: "default"`

---

## SQL Import Workflow (step by step — follow in order)

1. **Identify engine.** Confirm which SQL engine (mysql / postgres / mssql). Ask if ambiguous.
2. **Get connection.** `getConnectionsTool({ datasourceName: "<engine>" })` → `connection_id`. If no connection exists, stop and tell the user to create it in the platform UI.
3. **List tables.** `listSqlReportTypesTool({ data_source_name, connection_id })`.
   - If there are many pages (`count` > `page_size`), show the first page and ask which table they want, or page through on request.
   - Present as a short list: `database.table` → `title`.
4. **Custom query vs table.** If the user wants a custom SQL query instead of a full table, collect the SQL string and use `source: { custom_sql_query }` in steps 5+. Otherwise use `source: { database_name, table_name }`.
5. **Discover fields.** `discoverSqlFieldsTool({ data_source_name, connection_id, source })` → list of `{ name, suggested_type, possible_types, is_dimension }`.
6. **Pick types.** For each field, default to `suggested_type`. Only surface a type choice to the user when `possible_types.length > 1` AND the suggestion is non-obvious (e.g. a numeric-looking ID that could be `string`). Don't spam the user with every column.
7. **Sample.** `generateSqlDataSampleTool({ connection_id, source, fields, sync_historical_data })` → preview rows. Ask the user for `sync_historical_data` (start date for initial backfill) if they haven't specified it.
8. **Confirm schema.** Present the schema and proposed config as a table, then ask for confirmation:

   ```
   | Field Name     | Type   | Is Key | Sample Values          |
   |----------------|--------|--------|------------------------|
   | date_column    | Date   | Yes    | 2024-01-15, 2024-01-16 |
   | id             | Number | No     | 1, 2, 3                |
   | string_column  | Text   | Yes    | foo, bar, baz          |

   Data Table Name: 500k_strok
   Scheduling: Daily at 00:00 UTC
   Historical Sync From: 2026-03-25
   Write Policy: Upsert (by date range)
   Lookback: default (7 days)
   ```

9. **Create.** After confirmation, `createSqlExtractTool` with:
   - `title` and `data_table_title` — propose a name based on `database_name.table_name` (snake_case), ask user to confirm if unclear
   - `report_type` — `"<database_name> <table_name>"` (space-separated, lowercase for database)
   - `fields` — with `is_selected: true` by default for all; set `false` if the user wants to drop a column
   - `scheduling` — default daily UTC; ask if they want a different interval/time/timezone
   - `sync_historical_data` — from step 7
   - `write_policy` — default `{ method: "upsert", scope: "by_date_range" }`; switch to `whole_data` only if the table has no reliable date column
10. **Show link.** After creation succeeds:

    ```
    | Resource | Link                                                                                          |
    |----------|-----------------------------------------------------------------------------------------------|
    | Extract  | {platform_host}/info_connector/overview/{connection_id}/{extract_id}?workspace={workspace_id}  |
    ```

    Use `connection_id` from step 2, `extract_id` from the `createSqlExtractTool` response, and the current workspace ID.

---

## Custom SQL Query Workflow

Same as above, but skip step 3 (`listSqlReportTypesTool`). Start from step 5 with `source: { custom_sql_query: "<user's SQL>" }`. The `report_type` should be a short descriptive snake_case name of what the query represents (the user should provide or confirm it) — there is no database/table pair to build it from.

---

## Important Rules

- **Report type format matters.** For SQL tables it's `"<database_name> <table_name>"` with a **space**, not the underscore-joined `sql_name`. Getting this wrong causes silent ingestion issues.
- **Lookback window.** Each table has its own valid `lookback_window` options in `additional_params`. Do not hardcode — read from the list response and use `"default"` unless the user asks otherwise.
- **Historical sync.** `sync_historical_data` is required — ask the user for a start date if not given. Sensible defaults: 30 days back for exploratory imports, 1 year for production.
- **Write policy.** `by_date_range` requires a date column in the schema. If there is none, switch to `{ method: "overwrite" | "upsert", scope: "whole_data" }`.
- **Multi-database.** A MySQL connection can expose multiple databases. The list endpoint groups tables under `database_name` — keep that context when presenting to the user (e.g. `testdb.500k_strok`, not just `500k_strok`).
