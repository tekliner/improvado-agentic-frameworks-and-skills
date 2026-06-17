# SQL Cell

## 🚫 CRITICAL: SQL Cell Restrictions

**NEVER create a SQL cell unless the user EXPLICITLY asks for it.**

There are no exceptions — even if you believe SQL would be more efficient or elegant, you MUST use Blend Data, Join, Group By, or Filter cells instead.

## When SQL Cells Are Allowed

**SQL cells are FORBIDDEN unless ALL of these conditions are met:**

1. The user **explicitly says** to use a SQL cell (e.g., "use SQL", "create a SQL step", "write a SQL query")
2. You have **designed the SQL query** and shown it to the user
3. You have **run the SQL query** and received results
4. The user has **reviewed the results and confirmed** they are correct

## SQL Cell Creation Workflow

When the user explicitly asks for a SQL cell, follow this strict workflow:

### Step 1: Design
Write the SQL query and present it to the user for review:

```
I'll create a SQL query to [describe what it does]:
```

```sql
SELECT
  campaign_id,
  campaign_name,
  SUM(spend) as total_spend
FROM table_name
WHERE date >= '2024-01-01'
GROUP BY campaign_id, campaign_name
```

```
Should I proceed with testing this query?
```

### Step 2: Run
Execute the query (e.g., via ClickHouse or the notebook run command) and show the results to the user.

### Step 3: Confirm
Ask the user: "Here are the query results. Should I create the SQL cell with this query?"

### Step 4: Create
Only after user confirms, create the SQL cell.

### Step 5: Follow with Blend Data
**MANDATORY:** Always add a Blend Data (union) cell after the SQL cell with 1:1 mapping of all output columns.

**⚠️ Do NOT skip any step. Do NOT create the SQL cell before the user confirms the results.**

## SQL Cell Limitations

- SQL cells **cannot reference virtual tables** from previous cells
- SQL cells create their own virtual table output
- Must query real database tables directly

## CRITICAL: Blend Data Wrapper Requirement

If a SQL cell is used, you MUST always follow it with a Blend Data (union) cell that does a 1-to-1 mapping of all SQL output columns.

This allows non-technical users to rename columns and create formulas in the UI without editing raw SQL.

```
[SQL Cell] → raw query with complex logic (only after user confirmation)
     ↓
[Blend Data Cell] → 1:1 mapping of all SQL output columns
     ↓              (users can rename, add formulas here)
[Next cells...] → join, group_by, etc. reference the Blend output
```

## Content Structure

Content:
```json
{
  "query": "SELECT user_id, email, created_at FROM users WHERE created_at > '2024-01-01'"
}
```

## Empty Template

```json
{
  "cell_type": "sql",
  "content": {
    "query": ""
  },
  "title": "SQL Query",
  "context": "sql"
}
```

## Example: Complex Window Function

User explicitly requested SQL for a window function:

```json
{
  "query": "SELECT campaign_id, campaign_name, date, spend, SUM(spend) OVER (PARTITION BY campaign_id ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_spend FROM campaign_10873_google_ads_ql_all_data WHERE date >= '2024-01-01'"
}
```

Followed by Blend Data cell:

```json
{
  "output_schema": {
    "columns": [
      {"name": "campaign_id", "type": "string"},
      {"name": "campaign_name", "type": "string"},
      {"name": "date", "type": "date"},
      {"name": "spend", "type": "number"},
      {"name": "cumulative_spend", "type": "number"}
    ],
    "conditions": null
  },
  "tables": [
    {
      "name": "cell_1_sql_query_label_1234567890",
      "columns": [
        {"original_name": ["campaign_id"], "new_name": "campaign_id"},
        {"original_name": ["campaign_name"], "new_name": "campaign_name"},
        {"original_name": ["date"], "new_name": "date"},
        {"original_name": ["spend"], "new_name": "spend"},
        {"original_name": ["cumulative_spend"], "new_name": "cumulative_spend"}
      ]
    }
  ]
}
```

## Valid Use Cases (ONLY when user explicitly requests)

### 1. Window Functions
Running totals, moving averages, rank/row_number:
```sql
SELECT
  campaign_id,
  date,
  spend,
  SUM(spend) OVER (PARTITION BY campaign_id ORDER BY date) as running_total
FROM table_name
```

### 2. Recursive CTEs
Hierarchical data, graph traversal (rarely needed).

### 3. Advanced ClickHouse Functions
Array operations, tuple manipulations, specialized aggregates not available in Group By.

### 4. Complex Subqueries
Multi-level filtering or transformations that can't be expressed in the cell workflow.

## Invalid Use Cases (Use Other Cell Types Instead)

❌ Simple unions → Use Blend Data
❌ Joins → Use Join cell
❌ Aggregations → Use Group By cell
❌ Row filtering → Use Filter cell
❌ Column renaming → Use Blend Data
❌ CASE WHEN logic → Use Blend Data formulas

## Remember

**Default to Blend Data, Join, Group By, and Filter cells.** Only use SQL when the user explicitly requests it AND you've followed the full workflow (design → run → confirm → create → wrap in Blend Data).
