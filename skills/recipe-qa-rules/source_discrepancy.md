# Source Discrepancy Check

**Pattern:** Compare aggregated metrics between source all_data table(s) and recipe. Single output row. `rule broken` if any metric diff != 0.

## Step 1 — Identify source tables and metrics

From the recipe DDL:
- Find all `FROM` tables — may be 1 or multiple all_data tables
- Map source column name → recipe column name (they often differ, e.g. `cost_micros/1000000` → `spend`)
- Include only numeric metrics present in both source and recipe

**Number of source tables determines the template variant:**
- **1 source table** → Template A (simple UNION ALL)
- **2+ source tables** → Template B (separate base CTEs + scalar subquery addition)

## Template A — Single source table

```sql
WITH
    prep_data AS
    (
        SELECT
            'all_data_sources' AS source_type,
            sum(assumeNotNull(<source_metric_1>)) AS sum_<metric_1>,
            sum(assumeNotNull(<source_metric_2>)) AS sum_<metric_2>
        FROM <db>.<source_all_data_table>
        WHERE date >= addMonths(today(), -1)
        UNION ALL
        SELECT
            'recipe_data' AS source_type,
            sum(assumeNotNull(<recipe_metric_1>)) AS sum_<metric_1>,
            sum(assumeNotNull(<recipe_metric_2>)) AS sum_<metric_2>
        FROM <db>.<recipe_view>
        WHERE date >= addMonths(today(), -1)
    ),
    aggregated AS
    (
        SELECT
            sum(multiIf(source_type = 'all_data_sources', sum_<metric_1>, 0)) AS all_data_<metric_1>,
            sum(multiIf(source_type = 'recipe_data', sum_<metric_1>, 0)) AS recipe_<metric_1>,
            sum(multiIf(source_type = 'all_data_sources', sum_<metric_2>, 0)) AS all_data_<metric_2>,
            sum(multiIf(source_type = 'recipe_data', sum_<metric_2>, 0)) AS recipe_<metric_2>
        FROM prep_data
    ),
    add_ids_and_meta AS
    (
        SELECT
            '<Datasource Name>' AS datasource,
            '<Datasource Name> Data Consistency' AS rule_name,
            'Validates that aggregated metrics from <source_table> match <recipe_view>' AS rule_description,
            toString(round(all_data_<metric_1>, 2)) AS all_data_<metric_1>_,
            toString(round(recipe_<metric_1>, 2)) AS recipe_<metric_1>_,
            toString(round(all_data_<metric_1> - recipe_<metric_1>, 2)) AS <metric_1>_diff_,
            toString(round(all_data_<metric_2>, 2)) AS all_data_<metric_2>_,
            toString(round(recipe_<metric_2>, 2)) AS recipe_<metric_2>_,
            toString(round(all_data_<metric_2> - recipe_<metric_2>, 2)) AS <metric_2>_diff_,
            multiIf((round(all_data_<metric_1> - recipe_<metric_1>, 2) != 0) OR (round(all_data_<metric_2> - recipe_<metric_2>, 2) != 0), 'rule broken', 'rule followed') AS check_result,
            '<datasource_slug>:consistency_check' AS check_entity_id,
            round(all_data_<metric_1>, 2) AS all_data_<metric_1>,
            round(recipe_<metric_1>, 2) AS recipe_<metric_1>,
            round(all_data_<metric_2>, 2) AS all_data_<metric_2>,
            round(recipe_<metric_2>, 2) AS recipe_<metric_2>,
            'date within last 1 month' AS rule_filters,
            'Any difference in <metric_1> or <metric_2> between all_data source and recipe' AS violation_if,
            '<datasource_slug>' AS rule_granularity,
            'Metric Compliance' AS compliance_category,
            'Quality' AS business_category,
            'High' AS severity,
            'Investigate data discrepancy between source table and recipe' AS action_required,
            'placeholder' AS rule_owners,
            'Enabled' AS status,
            'Daily' AS run_frequency
        FROM aggregated
    )
SELECT *
FROM add_ids_and_meta
```

## Template B — Multiple source tables

Use when recipe aggregates from 2+ all_data tables. Each source gets its own `base_<name>` CTE. Totals are combined via scalar subqueries in `base_all_data`. Apply any source-specific filters (e.g. campaign type) inside the relevant base CTE.

```sql
WITH
    base_table AS
    (
        SELECT 1 AS dummy
    ),
    apply_filter AS
    (
        SELECT *
        FROM base_table
        WHERE 1 = 1
    ),
    base_<source1> AS
    (
        SELECT
            sum(<metric_1>) AS sum_<metric_1>,
            sum(<metric_2>) AS sum_<metric_2>
        FROM <db>.<source1_all_data_table>
        WHERE date >= addMonths(today(), -1)
        -- AND <optional source-specific filter>
    ),
    base_<source2> AS
    (
        SELECT
            sum(<metric_1>) AS sum_<metric_1>,
            sum(<metric_2>) AS sum_<metric_2>
        FROM <db>.<source2_all_data_table>
        WHERE date >= addMonths(today(), -1)
        -- AND <optional source-specific filter>
    ),
    base_all_data AS
    (
        SELECT
            (SELECT sum_<metric_1> FROM base_<source1>) + (SELECT sum_<metric_1> FROM base_<source2>) AS sum_<metric_1>,
            (SELECT sum_<metric_2> FROM base_<source1>) + (SELECT sum_<metric_2> FROM base_<source2>) AS sum_<metric_2>
    ),
    base_recipe AS
    (
        SELECT
            sum(<recipe_metric_1>) AS sum_<metric_1>,
            sum(<recipe_metric_2>) AS sum_<metric_2>
        FROM <db>.<recipe_view>
        WHERE date >= addMonths(today(), -1)
    ),
    group_by_cte AS
    (
        SELECT
            coalesce(a.sum_<metric_1>, 0) AS all_data_<metric_1>,
            coalesce(r.sum_<metric_1>, 0) AS recipe_<metric_1>,
            coalesce(a.sum_<metric_2>, 0) AS all_data_<metric_2>,
            coalesce(r.sum_<metric_2>, 0) AS recipe_<metric_2>,
            abs(coalesce(a.sum_<metric_1>, 0) - coalesce(r.sum_<metric_1>, 0)) AS diff_<metric_1>,
            abs(coalesce(a.sum_<metric_2>, 0) - coalesce(r.sum_<metric_2>, 0)) AS diff_<metric_2>
        FROM base_all_data AS a, base_recipe AS r
    ),
    add_ids_and_meta AS
    (
        SELECT
            '<Datasource Name>' AS datasource,
            '<Datasource Name> Performance Data Consistency' AS rule_name,
            'Verifies that metrics (<metric_1>, <metric_2>) in all_data tables (<source1> + <source2>) match the <recipe_view>. Detects duplicates or missing data.' AS rule_description,
            toString(round(all_data_<metric_1>, 2)) AS all_data_<metric_1>_,
            toString(round(recipe_<metric_1>, 2)) AS recipe_<metric_1>_,
            toString(round(diff_<metric_1>, 2)) AS diff_<metric_1>_,
            toString(round(all_data_<metric_2>, 2)) AS all_data_<metric_2>_,
            toString(round(recipe_<metric_2>, 2)) AS recipe_<metric_2>_,
            toString(round(diff_<metric_2>, 2)) AS diff_<metric_2>_,
            multiIf(diff_<metric_1> != 0 OR diff_<metric_2> != 0, 'rule broken', 'rule followed') AS check_result,
            '<datasource_slug>:consistency_check' AS check_entity_id,
            'date within last 1 month' AS rule_filters,
            'Any difference in <metric_1> or <metric_2> between all_data sources and recipe' AS violation_if,
            '<datasource_slug>' AS rule_granularity,
            'Metric Compliance' AS compliance_category,
            'Quality' AS business_category,
            'High' AS severity,
            'placeholder' AS rule_owners,
            'Enabled' AS status,
            'Daily' AS run_frequency,
            'Investigate data discrepancy between source tables and recipe' AS action_required
        FROM group_by_cte
    )
SELECT *
FROM add_ids_and_meta
```

**For UNION ALL multi-source variant** (e.g. IAS with two ingestion tables that should be summed before comparing), use separate base CTEs with UNION ALL inside `base_all_data`, then aggregate in `total_all_data`:

```sql
    base_all_data AS
    (
        SELECT sum(viewable_impressions) AS sum_impressions, 0 AS sum_clicks
        FROM <db>.<source1_table>
        WHERE date >= addMonths(today(), -1)
        UNION ALL
        SELECT sum(viewable_impressions) AS sum_impressions, 0 AS sum_clicks
        FROM <db>.<source2_table>
        WHERE date >= addMonths(today(), -1)
    ),
    total_all_data AS
    (
        SELECT sum(sum_impressions) AS sum_impressions, sum(sum_clicks) AS sum_clicks
        FROM base_all_data
    ),
```
Then join `total_all_data` with `base_recipe` using cross join (`, ` syntax) in `group_by_cte`.

## Key Rules

- **Single source:** date filters in `prep_data` (UNION ALL requires it, exception to standard)
- **Multi-source:** date filters inside each `base_<source>` and `base_recipe` CTE
- `base_table as (select 1 as dummy)` + `apply_filter where 1=1` — structural boilerplate required by the recipe QA runner framework; do not remove
- `round(val, 2)` on all numeric values in output
- String exposures: trailing `_` suffix; numeric exposures: no suffix
- `violation_if` lists all checked metrics
- `rule_description` names all source tables in parentheses: `(table1 + table2)`
