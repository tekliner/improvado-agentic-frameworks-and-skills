# Cell Types Overview

## Available Cell Types

- `sql` - SQL query cell
- `union` - Union multiple sources (Blend Data)
- `join` - Join tables
- `group_by` - Group by aggregation
- `conditional_mapping` - Filter data (row filtering with conditions)

## Cell Type Selection Priority

**Always prefer Blend Data (union), Join, Group By, and Filter cells over SQL cells.**

### When to Use Each Cell Type

**Blend Data (Union):**
- Combining data from multiple sources (e.g., Google Ads + Facebook Ads)
- Standardizing column names across different data sources
- Applying row-level transformations (CASE WHEN, arithmetic)
- Renaming columns
- Adding constant values or data source labels

**Join:**
- Enriching data with additional dimensions (e.g., campaign metadata)
- Combining related tables (e.g., ads + campaigns)
- Joining cell outputs with reference tables
- Left/Right/Inner/Full outer joins

**Group By:**
- Aggregating metrics (SUM, COUNT, AVG, MIN, MAX)
- Rolling up data by dimensions
- Computing totals and subtotals
- Deduplication with COUNT DISTINCT

**Filter (Conditional Mapping):**
- Removing unwanted rows based on conditions
- Date range filtering
- Including/excluding specific campaigns, accounts, etc.
- Complex AND/OR condition logic

**SQL:**
- ONLY when user explicitly requests it
- Complex window functions
- Recursive queries
- Advanced ClickHouse-specific operations
- MUST be followed by a Blend Data cell with 1:1 mapping

## Column Types

**Use lowercase types:** `date`, `string`, `number`, `datetime`

**WRONG:** `Int64`, `Float64`, `String`, `Date`, `Boolean`, `Number`, `Datetime`
**CORRECT:** `date`, `string`, `number`, `datetime`

## Context Field Mapping

| cell_type | context value |
|-----------|---------------|
| `union` | `"blend_data"` |
| `join` | `"join"` |
| `group_by` | `"group_by"` |
| `sql` | `"sql"` |
| `conditional_mapping` | `"filter"` |
