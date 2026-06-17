---
name: recipe-qa-rules
description: Full data QA flow for a recipe view — discovers pipeline topology, manages QA Requirements Documents (QRDs), runs hardcoded and QRD-defined quality checks, detects JOIN fan-outs, and resolves issues with user approval.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

**Trigger phrases:** "check recipe", "recipe QA", "test recipe", "recipe duplicates", "recipe discrepancy", "write qa for recipe", "create QRD", "update QRD", "recipe requirements", "проверь рецепт", or when the view name ends in `_recipe`.

---

## Phase 1 — Recipe State Discovery

### Step 1.1 — Retrieve recipe meta info

Call `getRecipeTool` with the recipe identifier to get the recipe's current meta state (name, status, owner, last run timestamps, etc.).

### Step 1.2 — Check actual database state via `system.tables`

Query `system.tables` to discover which views exist for this recipe. A recipe may have any combination of:

| Suffix | Meaning |
|--------|---------|
| `_staging` | Initial development view — recipe SQL with a date-range filter applied. Created when the recipe is first saved. Used for iterative development on a limited data sample. |
| `_pre_prod` | Activation-ready view produced after a successful run that passes all backward-compatibility and complexity validations (column deletions, type changes, `MAX_EXECUTION_TIME`, `MAX_MEMORY_USAGE`). Replaced on each successful run. |
| *(no suffix / prod)* | The current production view. Replaced when the user clicks **Activate** — the `_pre_prod` view is promoted in place. |

```sql
SELECT name, engine, create_table_query
FROM system.tables
WHERE database = '<db>'
  AND name LIKE '%<recipe_base_name>%'
```

**State interpretation matrix:**

| Found views | Interpretation |
|-------------|---------------|
| `_staging` only | Recipe is in active development, never activated |
| `_staging` + `_pre_prod` | Recipe passed validation, awaiting activation |
| `_staging` + prod | Recipe is live; `_staging` still present from dev |
| `_staging` + `_pre_prod` + prod | Normal mid-activation state |
| prod only | Recipe activated, staging cleaned up |
| Neither | Unexpected — activation may have failed |

If there is a state inconsistency that prevents clear QA (e.g., prod view exists but meta says staging, or `_pre_prod` is stale), **stop and invoke `notebook-editor-skill` first** to resolve the state before proceeding.

---

## Phase 1.5 — QRD Lookup & Generation

### Step 1.5.1 — Check for existing QRD

Search for an existing QA Requirements Document for this recipe:

```
listDocumentsTool(tag: "qrd, recipe:{notebook_id}")
```

If no results, try a fallback search:

```
listDocumentsTool(query: "QRD: {recipe_title}")
```

**If multiple QRDs are found** for the same recipe, use the most recently updated one. Warn the user about the duplicates so they can clean up.

### Step 1.5.2a — No QRD exists (First Run Flow)

When no QRD is found, generate one from the recipe:

1. **Analyze the recipe** — call `getRecipeStepTool(notebookId, stepId)` for each step listed in the `getRecipeTool` response. Extract:
   - Source tables (all `FROM` / `JOIN` references)
   - Column names and inferred types
   - Filters, `GROUP BY`, `DISTINCT` patterns
   - Calculated fields and business formulas (e.g., `spend / clicks AS cpc`)
   - JOIN conditions and JOIN types
   - Any deduplication logic (ROW_NUMBER, QUALIFY, DISTINCT)

2. **Fill the QRD template** — use [qrd_template.md](qrd_template.md) as the skeleton. Populate each section:
   - **Transformation Summary:** one paragraph describing what the recipe does end-to-end
   - **Input Contract:** all source tables with their columns (from step SQL)
   - **Output Contract:** final view columns (from the last step or `SHOW CREATE VIEW`)
   - **Data Quality Rules:** infer from column types — e.g., `spend >= 0` for monetary columns, `NOT NULL` for ID columns
   - **Deduplication Rules:** infer grain from `GROUP BY` or `DISTINCT` patterns
   - **Business Logic Rules:** infer from calculated fields — e.g., `cpc = spend / clicks`
   - **Row Count Expectations:** default to `output rows > 0` for first run
   - **Freshness Rules:** default to `max(date) within 48 hours of today()`
   - **Version History:** `v1.0` with current date and session ID

3. **Present the draft to the user** — show the complete QRD with clear explanations of what was inferred vs assumed. Ask the user to review, edit, add, or remove rules.

4. **Wait for user approval.** Do not proceed until the user explicitly approves the QRD.

5. **Save the QRD** — after approval, call:
   ```
   createDocumentTool(
     title: "QRD: {recipe_title} ({view_name})",
     tags: "qrd, recipe:{notebook_id}, view:{view_name}",
     content: <approved QRD markdown>
   )
   ```

6. Proceed to Phase 2.

### Step 1.5.2b — QRD exists (Subsequent Run Flow)

When a QRD is found:

1. Call `getDocumentTool(id)` to load the full QRD content.
2. Parse the QRD by `##` section headers into structured data for Phase 3.
3. Proceed to Phase 2.

---

## Phase 2 — Pipeline Topology

### Step 2.1 — Fetch the target view DDL

Use `SHOW CREATE VIEW` on the view that represents the current intended state (prefer `_pre_prod` if activation is pending, otherwise prod):

```sql
SHOW CREATE VIEW <db>.<view_name>
```

Extract:
- All `FROM` / `JOIN` source references
- Key dimension columns (date, ids, datasource)
- Numeric metric columns (spend, impressions, clicks, conversions, revenue)
- JOIN types and conditions (for fan-out detection in Phase 3)

### Step 2.2 — Recursively explore upstream dependencies

Any table or view reference **without** an `_all_data` suffix is not raw data — it is a derived recipe or view. For each such reference, recursively fetch its DDL and repeat until only `_all_data` sources remain. Build a full upstream dependency tree.

### Step 2.3 — Discover downstream dependencies

Search for views that reference the current recipe view:

```sql
SELECT name, create_table_query
FROM system.tables
WHERE database = '<db>'
  AND create_table_query LIKE '%<view_name>%'
  AND name != '<view_name>'
```

Collect all downstream consumers into the dependency tree.

### Step 2.4 — Document the pipeline (if non-trivial)

If the combined upstream + downstream tree contains more than one recipe layer or more than two nodes total:

1. Search existing documents for any prior pipeline or recipe documentation (`listDocuments` / `getDocument`) to reference or update rather than duplicate.
2. Create a new document via `createDocument` with:
   - A prose description of the data pipeline
   - A Mermaid diagram of the full node graph (sources → recipes → consumers)
   - State of each node (staging / pre-prod / prod)

---

## Phase 3 — Quality Rule Application

### Step 3.1 — Select applicable hardcoded rules

Read the rule files in this directory and determine which apply given the pipeline schema:

- Duplicate check (includes JOIN fan-out detection) → [duplicate_check.md](duplicate_check.md)
- Source discrepancy → [source_discrepancy.md](source_discrepancy.md)

Auto-detect which rules are relevant:
- Any recipe with a defined grain → duplicate check applies (Template A or B)
- Any recipe with JOINs → JOIN fan-out check applies (Template C in duplicate_check.md)
- Any recipe with aggregated metrics from `_all_data` sources → source discrepancy applies

If the user specified a particular check, generate only that one. Otherwise generate all applicable checks.

### Step 3.2 — Infer datasource name

Infer the datasource display name from the source table prefix. Common mappings:
- `facebook` → `Facebook Ads`
- `google_ads` → `Google Ads`
- `linkedin_ads` → `LinkedIn Ads`
- `dbm` / `dbmbp` → `Google Display and Video 360`
- `ttd` → `The Trade Desk`
- `amazon_dsp` / `ams_dsp` → `Amazon DSP`

For unknown prefixes, infer the display name from the table prefix by converting underscores to spaces and capitalizing each word (e.g., `tiktok_ads` → `TikTok Ads`, `snapchat` → `Snapchat`).

### Step 3.3 — Generate check queries

For each applicable rule, generate the SQL following the template in the corresponding rule file. Rules must cover:
- **Direct data quality** on the recipe itself: duplicates, nulls, zeroes, unexpected metric values
- **JOIN integrity**: ensure JOINs did not cause fan-out (row multiplication)
- **Pipeline integrity**: ensure changes to the recipe do not silently break downstream consumers (column set, types, grain stability)

**Compute efficiency requirements — mandatory for all queries:**
- Always apply a date-range filter (`toStartOfMonth(today())` or similar) — never scan unbounded history
- Use `SAMPLE` clauses where statistical approximation is acceptable
- Prefer `countIf` / `sumIf` over subqueries where possible
- Avoid `SELECT *` — always enumerate columns
- Add `LIMIT` to any exploratory or diagnostic queries
- Do not run the same aggregation twice; use CTEs to share intermediate results

### Step 3.4 — Output format

Each check: a single code block with a comment header (`-- Duplicate Check`, `-- Source Discrepancy`, `-- JOIN Fan-Out Check`). No trailing semicolons. No `CREATE VIEW` wrappers.

### Step 3.5 — Logic verification

Run each query via the MCP query tool and evaluate all output values for logical consistency:

- **Duplicate check:** `max_cnt` must be ≥ 1. If 0, the table is empty or the date filter is too narrow.
- **Source discrepancy:** both `all_data_*` and `recipe_*` values must be > 0. If either is 0, the source table or date filter is wrong.
- **JOIN fan-out:** `fan_out_ratio` > 1.5 indicates likely row multiplication. If 0 or NULL, check that the date filter returned rows.

If anything looks wrong, identify the root cause, fix the query logic, and re-run.

### Step 3.6 — Validation

Validate results: row count 1–5000, mandatory columns present (`check_entity_id`, `datasource`, `check_result`), `check_entity_id` unique, `datasource` / `check_result` contain valid values. Regenerate if invalid.

### Step 3.7 — Update pipeline document

After all hardcoded checks are complete, update the pipeline document created in Phase 2 with a summary of rules applied, checks run, and their outcomes.

### Step 3.8 — QRD-Defined Validation

**Skip this step if no QRD was loaded in Phase 1.5** (user rejected, first run not yet approved, or error). Run only hardcoded checks in that case.

When a QRD is available, generate and run validation queries for each QRD section:

#### 3.8.1 — Data Quality Rules

For each rule in the QRD's Data Quality Rules table, generate a SQL query:

```sql
SELECT
    count(*) AS violation_count,
    multiIf(count(*) > 0, 'rule broken', 'rule followed') AS check_result
FROM <db>.<recipe_view>
WHERE date >= toStartOfMonth(today())
  AND NOT ({sql_expression_from_qrd})
```

Run the query. Report pass/fail for each rule.

#### 3.8.2 — Deduplication Rules

Generate a duplicate check using the grain columns specified in the QRD (not the generic grain from the hardcoded check). Use the same 5-CTE pattern as Template A/B in `duplicate_check.md` but with QRD-specified grain columns.

If the hardcoded duplicate check and QRD dedup check both run, the QRD version is authoritative for reporting but both results are logged.

#### 3.8.3 — Business Logic Rules

For each business logic rule in the QRD, generate a SQL check. Use tolerance-based comparison for floating-point values:

```sql
SELECT
    count(*) AS violation_count,
    multiIf(count(*) > 0, 'rule broken', 'rule followed') AS check_result
FROM <db>.<recipe_view>
WHERE date >= toStartOfMonth(today())
  AND NOT ({sql_expression_from_qrd})
```

#### 3.8.4 — Row Count Expectations

Run the row count SQL from the QRD and compare the result against the expected range:

```sql
SELECT count(*) AS row_count
FROM <db>.<recipe_view>
WHERE date >= toStartOfMonth(today())
```

Fail if `row_count` falls outside the QRD's expected bounds.

#### 3.8.5 — Freshness Rules

Run the freshness SQL from the QRD:

```sql
SELECT
    max(date) AS latest_date,
    dateDiff('hour', max(date), now()) AS hours_stale
FROM <db>.<recipe_view>
```

Fail if `hours_stale` exceeds the QRD's max staleness threshold.

#### 3.8.6 — Consolidated results

After all checks (hardcoded + QRD), produce a combined summary table:

```
| Rule Source | Rule Name | Result | Details |
|-------------|-----------|--------|---------|
| Hardcoded   | Duplicate Check | PASS/FAIL | max_cnt = X |
| Hardcoded   | Source Discrepancy | PASS/FAIL | diff = X% |
| Hardcoded   | JOIN Fan-Out | PASS/FAIL | ratio = X |
| QRD         | {rule description} | PASS/FAIL | {actual vs expected} |
| ...         | ...       | ...    | ...     |
```

---

## Phase 4 — Issue Resolution

### Step 4.1 — Root cause investigation

If any check reveals a data quality or pipeline integrity issue, investigate potential root causes in the DDL and upstream dependencies.

### Step 4.2 — Expected vs Actual reporting

For every failed check, present:
- **Rule:** which rule failed and its source (hardcoded or QRD)
- **Expected:** the condition that should hold (from the rule definition)
- **Actual:** the observed value (from the query result)
- **Likely cause:** which recipe step or JOIN most likely produces the violation

### Step 4.3 — Fix proposal with approval gate

For each proposed fix:

1. Show the concrete change (before → after: SQL modification, filter addition, type cast, etc.)
2. **Explicitly ask the user:** "Shall I apply this fix?"
3. **NEVER apply a fix without explicit user confirmation.** This applies to ALL fixes, including trivial ones.
4. After the user approves and the fix is applied, re-run the failed check to confirm resolution.
5. If the re-run still fails, report the new state and discuss next steps with the user.

### Step 4.4 — Escalate complex issues

If the issue is complex or requires a design decision (e.g., grain change, backfill strategy, breaking schema change), **create a separate document** via `createDocument` describing:
- The issue and its observed symptoms
- Root cause analysis
- Decision options with trade-offs
- Recommended resolution path

This allows the user to handle it in a focused follow-up session.

---

## Phase 5 — QRD Maintenance

**Skip this phase entirely on first run** (when the QRD was just created in Phase 1.5). Only run when a QRD already existed before this QA session.

### Step 5.1 — Detect recipe changes

Compare the current recipe state against the QRD:

1. Re-read all recipe steps via `getRecipeStepTool`.
2. Compare source tables against the QRD's Input Contract — look for added/removed tables or columns.
3. Compare output columns against the QRD's Output Contract — look for schema changes.
4. Check for changes in JOIN logic, filters, calculated fields, or deduplication strategy.

### Step 5.2 — Assess impact

If changes are detected:
- List each change (added column, removed source, modified formula, new JOIN)
- For each change, identify which QRD sections are affected
- Classify as: "QRD update required" or "QRD still valid"

### Step 5.3 — Propose QRD edits

If updates are needed, for each affected section:
- Show the **current** QRD section content
- Show the **proposed** replacement
- Explain **why** the change is needed (which recipe modification triggered it)

### Step 5.4 — User approval and update

**You MUST present all proposed QRD changes to the user and wait for explicit approval before updating.**

After approval:
1. Call `editDocumentTool(id, content, tags)` with the full updated QRD content.
2. Add a new entry to the Version History section:
   ```
   | v{N} | {YYYY-MM-DD} | {description of changes} | {session_id} |
   ```
3. Confirm the update was saved successfully.

### Step 5.5 — No changes detected

If no recipe changes are detected relative to the QRD, skip this phase and report: "QRD is up to date — no changes detected since last QA run."

---

## Additional resources

- QRD template: [qrd_template.md](qrd_template.md)
- Duplicate check template + grain columns + JOIN fan-out: [duplicate_check.md](duplicate_check.md)
- Source discrepancy templates (single + multi-source): [source_discrepancy.md](source_discrepancy.md)
