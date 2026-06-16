# Duplicate Check

**Pattern:** Count rows per full grain; surface max count. Single output row — `rule broken` if `max_cnt > 1`.

## Standard Granularity Columns

Cast actual recipe columns to these aliases in `base_table`. Substitute `CAST('', 'String')` for absent columns.

| Alias | Typical source column | Type |
|---|---|---|
| `date` | `date` | `Date` |
| `account_id` | `__account_id` or `account_id` | `String` |
| `advertiser_id` | `__account_id`, `advertiser_id`, or `campaign_advertiser_id` | `String` |
| `campaign_id` | `campaign_id` or `campaign_external_id` | `String` |
| `media_buy_id` | `ad_group_id`, `line_id`, `placement_id`, `media_buy_external_id` | `String` |
| `creative_id` | `ad_id`, `ad_key`, `creative_key` | `String` |
| `exchange_name` | `''` (if absent) | `String` |

**Non-standard grains:** Some recipes have additional dimension columns (e.g. `datasource`, `conversion_tag_id`, `keyword_id`). Include all actual key columns from the recipe. When the recipe is multi-datasource (e.g. `cross_channel_keywords_recipe`), include `datasource` in the grain and use `datasource` as the `check_entity_id` prefix. Also group `aggregated` by `datasource` in that case (see variant B below).

**Datasource filter in base_table:** Some recipes contain data for multiple datasources filtered by a `WHERE datasource = 'X'` condition (e.g. `email_import_custom_mapping_recipe`). Apply this filter directly in `base_table`'s `FROM` clause subquery rather than in `apply_filter`, since it's not a date filter.

## Template A — Standard (single datasource)

```sql
WITH
    base_table AS
    (
        SELECT
            CAST(date, 'Date') AS date,
            CAST(<account_col>, 'String') AS account_id,
            CAST(<advertiser_col>, 'String') AS advertiser_id,
            CAST(<campaign_col>, 'String') AS campaign_id,
            CAST(<media_buy_col>, 'String') AS media_buy_id,
            CAST(<creative_col>, 'String') AS creative_id,
            CAST('', 'String') AS exchange_name
        FROM <db>.<recipe_view>
    ),
    apply_filter AS
    (
        SELECT *
        FROM base_table
        WHERE date >= (today() - toIntervalWeek(1))
    ),
    group_by_cte AS
    (
        SELECT
            date, account_id, advertiser_id, campaign_id, media_buy_id, creative_id, exchange_name,
            count(*) AS cnt
        FROM apply_filter
        GROUP BY date, account_id, advertiser_id, campaign_id, media_buy_id, creative_id, exchange_name
    ),
    aggregated AS
    (
        SELECT max(cnt) AS max_cnt
        FROM group_by_cte
    ),
    add_ids_and_meta AS
    (
        SELECT
            '<Datasource Name>' AS datasource,
            '<Datasource Name> Granularity Check' AS rule_name,
            '<Datasource Name> data granularity check — no duplicates across key dimensions' AS rule_description,
            toString(max_cnt) AS max_duplicate_count_,
            multiIf(max_cnt > 1, 'rule broken', 'rule followed') AS check_result,
            'datasource:<Datasource Name>' AS check_entity_id,
            'date >= today() - 1 week' AS rule_filters,
            'Duplicate records (max_cnt > 1) for: date, account_id, advertiser_id, campaign_id, media_buy_id, creative_id, exchange_name' AS violation_if,
            '<Datasource Name>' AS rule_granularity,
            'Data Integrity' AS compliance_category,
            'Data Quality' AS business_category,
            'High' AS severity,
            'Check the data source and eliminate duplicates in the recipe' AS action_required,
            'placeholder' AS rule_owners,
            'Enabled' AS status,
            'Daily' AS run_frequency
        FROM aggregated
    )
SELECT *
FROM add_ids_and_meta
```

## Template B — Multi-datasource recipe (group by datasource)

Use when the recipe aggregates multiple datasources (e.g. `cross_channel_keywords_recipe`, `global_custom_mapping_conversions_recipe`). Group `aggregated` by `datasource` to surface the worst duplicate per datasource.

```sql
WITH
    base_table AS
    (
        SELECT
            CAST(date, 'Date') AS date,
            CAST(datasource, 'String') AS datasource,
            CAST(<account_col>, 'String') AS account_id,
            -- ... other grain columns ...
            CAST(<extra_key_col>, 'String') AS <extra_key_alias>
        FROM <db>.<recipe_view>
    ),
    apply_filter AS
    (
        SELECT *
        FROM base_table
        WHERE date >= (today() - toIntervalWeek(1))
    ),
    group_by_cte AS
    (
        SELECT
            datasource,
            count(*) AS cnt
        FROM apply_filter
        GROUP BY
            datasource, date, account_id, advertiser_id, campaign_id, media_buy_id, creative_id, <extra_key_alias>
    ),
    aggregated AS
    (
        SELECT
            datasource,
            max(cnt) AS max_cnt
        FROM group_by_cte
        GROUP BY datasource
    ),
    add_ids_and_meta AS
    (
        SELECT
            datasource,
            '<Recipe Label> Granularity Check' AS rule_name,
            '<Recipe Label> data granularity check — no duplicates across key dimensions per datasource' AS rule_description,
            toString(max_cnt) AS max_duplicate_count_,
            multiIf(max_cnt > 1, 'rule broken', 'rule followed') AS check_result,
            'datasource:' || toString(datasource) AS check_entity_id,
            'date >= today() - 1 week' AS rule_filters,
            'Duplicate records (max_cnt > 1) for: date, datasource, account_id, ...' AS violation_if,
            'datasource' AS rule_granularity,
            'Data Integrity' AS compliance_category,
            'Data Quality' AS business_category,
            'High' AS severity,
            'Check the data source and eliminate duplicates in the recipe' AS action_required,
            'placeholder' AS rule_owners,
            'Enabled' AS status,
            'Daily' AS run_frequency
        FROM aggregated
    )
SELECT *
FROM add_ids_and_meta
```

## Template C — JOIN Fan-Out Detection

Use when the recipe contains JOINs between source tables. Detects row multiplication caused by non-unique JOIN keys (fan-out). If the output row count significantly exceeds the largest input table's row count, the JOIN is likely producing duplicates.

**When to apply:** Any recipe with `JOIN` in its SQL steps. Extract all source tables from `FROM`/`JOIN` clauses in the recipe DDL.

```sql
WITH
    source_counts AS
    (
        SELECT '{source_table_1}' AS source, count(*) AS row_count
        FROM <db>.{source_table_1}
        WHERE date >= toStartOfMonth(today())
        UNION ALL
        SELECT '{source_table_2}' AS source, count(*) AS row_count
        FROM <db>.{source_table_2}
        WHERE date >= toStartOfMonth(today())
        -- Add UNION ALL for each additional source table
    ),
    max_source AS
    (
        SELECT max(row_count) AS max_source_rows
        FROM source_counts
    ),
    output_count AS
    (
        SELECT count(*) AS output_rows
        FROM <db>.{recipe_view}
        WHERE date >= toStartOfMonth(today())
    ),
    add_ids_and_meta AS
    (
        SELECT
            '<Recipe Label>' AS datasource,
            '<Recipe Label> JOIN Fan-Out Check' AS rule_name,
            'Verifies that JOINs in the recipe did not multiply rows beyond expected bounds' AS rule_description,
            toString(o.output_rows) AS output_row_count_,
            toString(m.max_source_rows) AS max_source_row_count_,
            toString(round(o.output_rows / m.max_source_rows, 2)) AS fan_out_ratio_,
            multiIf(o.output_rows > m.max_source_rows * 1.5, 'rule broken', 'rule followed') AS check_result,
            'join_fanout:<Recipe Label>' AS check_entity_id,
            'date >= toStartOfMonth(today())' AS rule_filters,
            'Output row count exceeds 1.5x the largest source table row count — likely JOIN fan-out' AS violation_if,
            'recipe' AS rule_granularity,
            'Data Integrity' AS compliance_category,
            'Data Quality' AS business_category,
            'High' AS severity,
            'Investigate which JOIN produces the fan-out. Check JOIN key uniqueness in each source table. Fix by adding deduplication before the JOIN or tightening JOIN conditions.' AS action_required,
            'placeholder' AS rule_owners,
            'Enabled' AS status,
            'Daily' AS run_frequency
        FROM output_count o, max_source m
    )
SELECT *
FROM add_ids_and_meta
```

**Threshold:** The default 1.5x multiplier flags fan-out when output rows exceed 150% of the largest source table. If the recipe's QRD specifies a different expected ratio (e.g., many-to-many JOIN is intentional), use the QRD value instead.

**On failure:** Do NOT auto-fix. Report the fan-out ratio, source row counts vs output row count, and offer to investigate which specific JOIN is causing the multiplication in interactive chat mode.

## Key Rules

- Use `CAST(col, 'Type')` syntax (not `::Type`)
- Use only columns present in recipe; absent standard columns → `CAST('', 'String')`
- Date filter only in `apply_filter`, never in `base_table` or `group_by_cte`
- `rule_owners` = `'placeholder'` always
- Non-date filters (e.g. `datasource = 'Flipkart'`) go in `base_table`'s SELECT subquery, not `apply_filter`
