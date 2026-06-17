# Naming Convention Join

## Overview

Naming Convention enriches recipe data with harmonized dimension values maintained in taxonomy tables. This guide explains how to discover candidate taxonomy tables in ClickHouse, inspect what dimension they harmonize, design a safe join, confirm the desired output with the user, and only then implement it.

This workflow is for cases where the user wants the recipe to use corrected names from Naming Convention.

---

## What Naming Convention Produces

For each naming taxonomy/workbook, the platform creates several ClickHouse objects:

- `resulting_table` — the main persisted taxonomy table
- `resulting_table_allowed_values` — allowed taxonomy values
- `resulting_table_view` — the taxonomy view aligned back to source rows

**For recipe enrichment, prefer the taxonomy view**:

```text
<resulting_table>_view
```

Why:

- it is aligned back to source rows
- it exposes both original and corrected values
- `new_<dimension>` falls back to the original source value when no correction exists
- it includes taxonomy parts and compliance status when available

Typical view fields:

- `original_<dimension>`
- `<dimension_id>`
- `account_id`
- `new_<dimension>`
- `compliance_result`
- taxonomy part columns
- optional filter/additional columns
- `created_at`, `updated_at`

> Do **not** join `*_allowed_values` for harmonization. That table is only the taxonomy dictionary.

---

## Step 1: Discover Candidate Taxonomy Tables

Search ClickHouse directly:

```sql
select *
from system.tables
where name like '%taxonomy%'
```

This is the starting point for discovery.

### What to do next

1. Identify candidate taxonomy tables relevant to the recipe.
2. Prefer candidates that clearly match the recipe's platform, business context, and dimension.
3. Prefer `_view` objects for enrichment.

### How to narrow the result

Use the recipe's current context:

- source platform
- source table naming
- business/domain wording in the table name
- target dimension the user wants to harmonize
- whether the candidate supports the required join keys

If several candidates still look plausible, ask the user which taxonomy table should be used.

---

## Step 2: Inspect the Candidate Tables

After the initial `system.tables` search, inspect the candidate taxonomy tables before designing any join.

You must determine:

- which dimension each table harmonizes
- whether it is ID-driven or text-driven
- whether it contains `account_id`
- which columns are available for the join
- whether the table is usable for this recipe

### How to infer the harmonized dimension

Look for column pairs such as:

- `original_campaign` / `new_campaign`
- `original_campaign_name` / `new_campaign_name`
- `original_adset` / `new_adset`
- `original_adgroup` / `new_adgroup`
- `original_ad` / `new_ad`

These `original_*` / `new_*` pairs tell you the harmonized dimension.

Also inspect whether the candidate contains stable ID columns such as:

- `campaign_id`
- `adset_id`
- `adgroup_id`
- `ad_id`
- `creative_id`

### Mandatory rule

Do not assume a taxonomy table contains the join keys you want. Inspect the actual columns first.

---

## Step 3: Pick the Correct Taxonomy Table

Choose the taxonomy table by matching all of the following:

1. **Dimension**
   Examples: `campaign`, `adset`, `adgroup`, `ad`, `creative`, custom dimensions such as `campaign_name`

2. **Source relevance**
   The taxonomy table should clearly correspond to the same source/business context as the recipe data.

3. **Joinability**
   The recipe table must contain the columns needed to join safely:
   - best case: dimension ID + account ID
   - acceptable fallback: original dimension text + account ID

4. **Recipe scope**
   If the recipe blends multiple sources, make sure the taxonomy table applies to the specific source slice you are enriching.

### When to ask the user

Ask the user if:

- multiple taxonomy tables match the same dimension
- the recipe blends multiple sources but only one taxonomy table is available
- the recipe data does not contain a safe join key

### Multi-source warning

If a recipe combines multiple platforms or sources, do **not** assume one taxonomy table applies to all of them.

Recommended approach:

- harmonize each source with its own taxonomy table first
- then union the harmonized outputs together

This is safer than applying one taxonomy join after the union.

---

## Step 4: Identify the Dimension to Harmonize

Before designing the join, confirm which dimension should be corrected.

Typical examples:

- `campaign`
- `campaign_name`
- `adset`
- `adgroup`
- `ad`
- `creative`

### How to choose

Inspect the main recipe table columns:

```bash
python3 .claude/skills/notebook-editor/notebook_client.py columns \
  --table-name <table-name> \
  --notebook-id <notebook-id> \
  --database-schema <agency_database_schema>
```

Then match the recipe columns to the candidate taxonomy table:

- standard dimension case:
  - recipe has `campaign_id` and `campaign_name`
  - taxonomy table harmonizes `campaign`
- custom text case:
  - recipe has `campaign_name`
  - taxonomy table harmonizes `campaign_name`

### Rule

If a stable ID exists, use the ID-driven taxonomy table whenever possible. It is safer than text-only matching.

---

## Step 5: Ask the User the Right Product Question

Before implementing anything, ask the user:

**"Do you want both the original and harmonized dimension values in the recipe, or should I replace the original value with the corrected one?"**

Recommended default:

- keep both during QA and rollout
- switch to corrected-only only when the result is validated

Also clarify whether the user wants QA/debug columns retained:

- `compliance_result`
- taxonomy part columns
- original unharmonized dimension

### Common output choices

#### Option A: Keep both

Useful for QA and comparison.

Example output columns:

- `campaign_name_original`
- `campaign_name_harmonized`
- `naming_compliance_result`

#### Option B: Corrected only

Useful for production-ready marts and dashboards.

Example output columns:

- `campaign_name`

Mapped from:

- `new_campaign_name`

#### Option C: Keep both plus taxonomy parts

Useful when downstream users also need the decomposed taxonomy structure.

Example extra columns:

- `geo`
- `channel`
- `objective`
- `audience`

### Mandatory confirmation rule

You must design the join first and present it to the user before implementing it.

The design must explicitly state:

- chosen taxonomy table
- harmonized dimension
- chosen join keys
- columns kept from the recipe
- columns brought from the taxonomy table
- whether the result keeps both original and harmonized values or only corrected values

Do **not** implement the join before the user confirms the design.

---

## Step 6: Choose the Right Join Target

**Preferred join target:**

```text
<resulting_table>_view
```

Example:

```text
social_hp_media_taxonomy_recipe_custom_campaign_name_taxonomy_ffa8f945_view
```

Why the view is preferred:

- it is rebuilt against original source rows
- `new_<dimension>` is always populated with a corrected-or-original value
- part columns are derived consistently
- it is the safest enrichment object for recipe joins

Use the base taxonomy table only if you specifically need the persisted rows and understand the tradeoffs.

---

## Step 7: Join Key Strategy

### Best practice order

1. **Dimension ID**  
   Example: `campaign_id -> campaign_id`

2. **Account ID** when available  
   Example: `__account_id -> account_id`

3. **Original dimension text** as an extra guard when useful  
   Example: `campaign_name -> original_campaign_name`

### Strong rules

- If a dimension ID exists, do **not** join only on the text name.
- If account ID exists in both tables, include it for extra safety.
- Use text-only joins only when no stable dimension ID is available.

### Recommended join patterns

#### Standard dimension taxonomy

Use:

- dimension ID
- account ID if available

#### Custom text-only taxonomy

Use:

- original dimension text
- account ID if available

### Avoid

- joining only on `campaign_name` when `campaign_id` exists
- joining one taxonomy table to mixed-source data after a union
- joining `*_allowed_values` as if it were the correction table

---

## Step 8: Build the Join Cell

After the user confirms the design, create a join cell following the [join-cell documentation](join-cell.md).

### Example A: Standard campaign harmonization

Recipe data has:

- `campaign_id`
- `campaign_name`
- `__account_id`

Taxonomy view has:

- `campaign_id`
- `original_campaign`
- `new_campaign`
- `account_id`
- `compliance_result`

```json
{
  "main_table": "cell_2_sql_query_label_1088891118",
  "join_table": "criteo_campaign_name_data_aa145861_view",
  "join_type": "left",
  "join_keys": [
    {
      "main_table_column": "campaign_id",
      "join_table_column": "campaign_id"
    },
    {
      "main_table_column": "__account_id",
      "join_table_column": "account_id"
    }
  ],
  "additional_main_table_columns": [
    "date",
    "__account_id",
    "campaign_id",
    "campaign_name",
    "spend",
    "clicks",
    "impressions"
  ],
  "additional_join_table_columns": [
    "original_campaign",
    "new_campaign",
    "compliance_result"
  ]
}
```

### Example B: Custom `campaign_name` harmonization

Recipe data has:

- `campaign_name`
- `__account_id`

Taxonomy view has:

- `original_campaign_name`
- `new_campaign_name`
- `account_id`
- taxonomy part columns

```json
{
  "main_table": "cell_2_sql_query_label_1088891118",
  "join_table": "social_hp_media_taxonomy_recipe_custom_campaign_name_taxonomy_ffa8f945_view",
  "join_type": "left",
  "join_keys": [
    {
      "main_table_column": "campaign_name",
      "join_table_column": "original_campaign_name"
    },
    {
      "main_table_column": "__account_id",
      "join_table_column": "account_id"
    }
  ],
  "additional_main_table_columns": [
    "date",
    "__account_id",
    "campaign_name",
    "spend",
    "clicks",
    "impressions"
  ],
  "additional_join_table_columns": [
    "new_campaign_name",
    "compliance_result"
  ]
}
```

---

## Step 9: Follow with a Blend Data Cell

After the join, use a **Blend Data (union) cell** to shape the final output. This is the cleanest way to:

- rename columns
- expose harmonized fields
- keep or drop original fields
- preserve QA columns only when needed

See [union-cell documentation](union-cell.md).

### Case A: Keep both original and harmonized

Recommended output columns:

- `date`
- `__account_id`
- `campaign_id`
- `campaign_name_original`
- `campaign_name_harmonized`
- `spend`
- `clicks`
- `impressions`
- `naming_compliance_result`

Example mapping idea:

- `campaign_name -> campaign_name_original`
- `new_campaign_name -> campaign_name_harmonized`
- `compliance_result -> naming_compliance_result`

### Case B: Corrected-only output

Recommended output columns:

- `date`
- `__account_id`
- `campaign_id`
- `campaign_name`
- `spend`
- `clicks`
- `impressions`

Example mapping idea:

- `new_campaign_name -> campaign_name`

### Case C: Keep taxonomy parts for downstream analysis

If the taxonomy table contains part columns, you can expose them as additional dimensions:

- `geo`
- `language`
- `channel`
- `objective`
- `audience`

Only keep them if the user explicitly wants them in the final recipe output.

---

## Full Workflow Summary

```text
1. Search ClickHouse taxonomy tables with:
   select * from system.tables where name like '%taxonomy%'
2. Inspect candidate tables and infer which dimension they harmonize
3. Match the right taxonomy table to the recipe source and dimension
4. Confirm which dimension should be harmonized
5. Ask the user:
   - keep both original and harmonized?
   - or replace with corrected-only?
   - keep compliance/taxonomy QA columns or not?
6. Design the join and wait for user confirmation
7. Prefer joining <resulting_table>_view
8. Join using:
   - dimension ID first
   - account ID if available
   - original text only as fallback or extra guard
9. Add Blend Data cell after the join to shape final output
10. Validate the result and check for duplicate rows or null harmonized values
11. After implementation is complete, use the `recipe-qa-rules` skill to build the QRD for the resulting recipe
```

---

## Validation Checklist

After running the join:

1. Check row counts did not unexpectedly increase
2. Confirm corrected values appear where expected
3. Confirm non-matching rows remain in the output when using left join
4. Confirm there is no fan-out from weak join keys
5. Confirm the final output columns match the user's choice:
   - corrected-only
   - both original and corrected
   - optional taxonomy parts / QA fields

If row count increases unexpectedly, the join keys are too weak. Strengthen them before proceeding.

---

## Final Mandatory Step: Build the QRD

After the Naming Convention join is implemented, validated, and accepted by the user, you must bring in the `recipe-qa-rules` skill and use it to build the QRD for the resulting recipe.

This is mandatory for this workflow.
