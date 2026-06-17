---
name: mdg-create-and-edit
description: Create, edit, and manage rules -- data governance rules, compliance rules, monitoring rules, alerts, MDG rules. Use when user asks to create a rule, set up alerts, or monitor metrics.
---

# Marketing Data Governance (MDG)

## MCP Tools

- `clickhouseTool` -- query ClickHouse (table discovery, data freshness, SQL testing)
- `createMdgViewTool` -- create or replace an MDG rule view
- `getMdgRuleLibraryExampleTool` -- fetch example rules from the MDG library
- `testMdgNotificationTool` -- test notification delivery for a rule

## How to Create an MDG Rule

If user asks "I want to create a new MDG rule, show me recommended templates" or "How to create an MDG rule?" without specifying requirements, reply that they can create a rule via the [MDG Rules Library](origin + "experimental/agent/data-governance/library") or by describing the rule in plain language. Stop here.

If user provides actual requirements, follow the workflow below.

### STEP 1 -- Table Selection and Data Freshness Check

**1A -- Select table:**
- Use `clickhouseTool` to find the most suitable table with data for the rule
- Research columns and values to confirm the table fits

**1B -- Data freshness check (MANDATORY):**
1. Find the date column (type Date or DateTime, name contains "date")
2. Check latest date:
   ```sql
   SELECT max({date_column}) as latest_date FROM {table_name}
   ```
3. If data is **stale** (older than yesterday):
   - Get report title:
     ```sql
     SELECT report_type_title FROM src_improvado_datatables
     WHERE datatable_sql_name = '{table_name}' LIMIT 1
     ```
   - STOP and inform user: table lacks recent data, they need to extract the report first via [Data Explorer](origin + "/data_explorer_v2/")
   - DO NOT proceed to Step 2
4. If data is **fresh** (yesterday or today): proceed to Step 2

### STEP 2 -- Generate and Test SQL

- Translate the user's business logic into SQL following the pseudocode structure below
- Execute the SQL via `clickhouseTool` to show preview results
- Show actual data to the user

### STEP 3 -- Get User Approval and Collect Parameters

- Ask: "Are you satisfied with these results?"
- If not, modify SQL and re-test
- Once confirmed, collect:
  - Run frequency: Daily, Weekly, Monthly, Quarterly (default: Daily at 9 AM PST / 17:00 UTC)
  - Enable immediately? Yes/No
  - Notification email address

### STEP 4 -- Create the Rule

- Call `createMdgViewTool` with the tested SQL and collected parameters
- View name pattern: `rule_<datasource>_<rule_name>_ai`
- Use CREATE OR REPLACE VIEW when updating existing rules
- The SQL must be IDENTICAL to what was tested in Step 2
- After success, if enabled: "Your rule will appear on the [Data Governance Dashboard](origin + "experimental/agent/data-governance/dashboard") within 5 minutes."
- If disabled: "Your rule has been created but is disabled. Ask me to enable it later."
- To enable a previously disabled rule: update the view SQL with status = 'Enabled'

## createMdgViewTool Parameters

```
viewName: string (max 150 chars, pattern: rule_*_ai)
sqlQuery: string (SELECT or WITH...SELECT, no semicolon)
ruleName: string (human-readable, 5-200 chars)
ruleDescription: string (10-500 chars)
complianceCategory: one of Metric Compliance | Taxonomy Compliance | Guidelines Compliance | Performance Compliance | Budget Pacing | Data Integrity
businessCategory: string (e.g. "Efficiency", "Quality", "Brand Safety")
severity: High | Medium | Low
runFrequency: Hourly | Daily | Weekly | Monthly | Quarterly
ruleOwners: string (comma-separated emails)
status: Enabled | Disabled
```

## SQL Requirements (ClickHouse)

- Complete SELECT or WITH...SELECT, no trailing semicolon
- No CREATE VIEW -- only the query body
- Use valid ClickHouse functions only
- Prefer explicit column lists over SELECT *
- snake_case aliases with `as`
- Case-insensitive contains: use ILIKE
- Regex: `match(col, 'pattern')` for boolean, `extract(str, 'pattern')` for capture
- All non-aggregated columns must appear in GROUP BY; use HAVING for aggregate filters
- Include in GROUP BY all entity_name and entity_id columns broader than the user-requested entity (e.g. for adsets, include campaign and account names/ids)
- Explicit JOIN...ON, qualify join keys
- Dates: `toDate`, `toDateTime`, `parseDateTimeBestEffort`, `toStartOfWeek/Month/Quarter`
- Always add a date filter in apply_filter based on user request
- Division: guard with `if(b = 0, 0, a/b)`
- Strip symbols like $ or % from numeric thresholds
- Filters only in apply_filter CTE. No other CTEs have WHERE.
- Allowed aggregates: any, sum, sumIf, count, countIf, min, max, avg, groupArray, groupUniqArray (with If combinators)

## SQL Pseudocode Structure

```sql
with
  base_table as (
    select * from <current_db>.<table_name>
  ),
  apply_filter as (
    select * from base_table
    where <filters or 1=1>
  ),
  group_by_cte as (
    select
      <Group By columns>,
      <aggregations>
    from apply_filter as t
    group by <Group By columns>
  ),
  add_ids_and_meta as (
    select
      '<datasource>' as datasource,
      '<rule_name>' as rule_name,
      '<description>' as rule_description,
      -- expose key metrics as strings: toString(metric) as metric_
      case when <violation_condition> then 'rule broken' else 'rule followed' end as check_result,
      '<id_label>:' || toString(<id_column>) as check_entity_id,
      <all Group By columns>,
      -- optional: data_value_date alias for date
      -- MANDATORY METADATA:
      '<human readable filters>' as rule_filters,
      '<violation_condition as string>' as violation_if,
      '<Group By columns as comma list>' as rule_granularity,
      '<compliance_category>' as compliance_category,
      '<business_category>' as business_category,
      '<severity>' as severity,
      '<rule_owners emails>' as rule_owners,
      '<Enabled or Disabled>' as status,
      '<run_frequency>' as run_frequency,
      '<action_required or empty string>' as action_required,
      -- FOR BUDGET PACING ONLY: also add `budget` and `total_spend` columns
    from group_by_cte
  )
select * from add_ids_and_meta
```

## Compliance Categories

- **Metric Compliance** -- general metric-based rules
- **Taxonomy Compliance** -- naming convention and taxonomy rules
- **Performance Compliance** -- performance-related rules
- **Guidelines Compliance** -- general rules
- **Budget Pacing** -- budget vs spend rules (MUST include `budget` and `total_spend` columns + date in GROUP BY)
- **Data Integrity** -- data pipeline integrity rules

## Examples

### A: Average viewability < 0.75

```sql
with
  base_table as (
    select * from <current_db>.trueview_standard_ads_9613_dbm_all_data
  ),
  apply_filter as (
    select * from base_table
    where toDate(parseDateTimeBestEffortOrNull(toString(date))) >= today() - interval 1 week
      and campaign_name not in ('test_campaign_1', 'test_campaign_2')
  ),
  group_by_cte as (
    select
      account_name, __account_id, advertiser_name, advertiser_id,
      insertion_order_name, insertion_order_id, line_item_name, line_item_id,
      round(if(avg(assumeNotNull(t.measurable_impressions)) = 0, 0,
        avg(assumeNotNull(t.viewable_impressions)) / avg(assumeNotNull(t.measurable_impressions))), 2) as average_viewability
    from apply_filter as t
    group by account_name, __account_id, advertiser_name, advertiser_id,
      insertion_order_name, insertion_order_id, line_item_name, line_item_id
  ),
  add_ids_and_meta as (
    select
      'Google Display and Video 360' as datasource,
      'Viewability' as rule_name,
      'Ensure minimum of at least 75% viewability' as rule_description,
      toString(average_viewability) as average_viewability_,
      case when average_viewability < 0.75 then 'rule broken' else 'rule followed' end as check_result,
      'line_item_id:' || toString(line_item_id) as check_entity_id,
      account_name, __account_id, advertiser_name, advertiser_id,
      insertion_order_name, insertion_order_id, line_item_name, line_item_id,
      'date is within the last week and campaign_name not in blacklist' as rule_filters,
      'Average viewability (viewable impressions / measurable impressions) in a line item is less than 0.75' as violation_if,
      'account_name,__account_id,advertiser_name,advertiser_id,insertion_order_name,insertion_order_id,line_item_name,line_item_id' as rule_granularity,
      'Metric Compliance' as compliance_category,
      'Efficiency' as business_category,
      'Medium' as severity,
      '' as action_required,
      'abc@def.com' as rule_owners,
      'Enabled' as status,
      'Daily' as run_frequency
    from group_by_cte
  )
select * from add_ids_and_meta
```

### B: Spend increased by 25% day-over-day

```sql
with
  base_table as (
    select * from <current_db>.ads_creative_9988_facebook_all_data
  ),
  apply_filter as (
    select * from base_table
    where toDate(parseDateTimeBestEffortOrNull(toString(date))) >= today() - interval 2 day
      and assumeNotNull(campaign_name) != ''
  ),
  group_by_cte as (
    select
      account_name, __account_id, campaign_name, campaign_id,
      sumIf(assumeNotNull(t.spend), t.date = today() - 1) as spend_yesterday,
      sumIf(assumeNotNull(t.spend), t.date = today() - 2) as spend_the_day_before,
      round(if(spend_the_day_before = 0, 0, spend_yesterday / spend_the_day_before), 2) as spend_change_percentage
    from apply_filter as t
    group by account_name, __account_id, campaign_name, campaign_id
  ),
  add_ids_and_meta as (
    select
      'Google Ads' as datasource,
      'Spend increased by 25%' as rule_name,
      'Yesterdays spend must not increase by more than 25% compared to the day before' as rule_description,
      toString(spend_the_day_before) as spend_the_day_before_,
      toString(spend_yesterday) as spend_yesterday_,
      toString(spend_change_percentage) as spend_change_percentage_,
      case when spend_yesterday > (spend_the_day_before * 1.25) then 'rule broken' else 'rule followed' end as check_result,
      'campaign_id:' || toString(campaign_id) as check_entity_id,
      account_name, __account_id, campaign_name, campaign_id,
      'date is within the last 2 days' as rule_filters,
      'Yesterdays spend has increased by 25% compared to the day before' as violation_if,
      'account_name,__account_id,campaign_name,campaign_id' as rule_granularity,
      'Metric Compliance' as compliance_category,
      'Efficiency' as business_category,
      'Medium' as severity,
      '' as action_required,
      '' as rule_owners,
      'Enabled' as status,
      'Daily' as run_frequency
    from group_by_cte
  )
select * from add_ids_and_meta
```

### C: Budget Pacing -- spend exceeds 90% of budget

```sql
with
  base_table as (
    select * from <current_db>.ads_creative_9988_facebook_all_data
  ),
  apply_filter as (
    select * from base_table
    where toDate(parseDateTimeBestEffortOrNull(toString(date))) >= toStartOfMonth(today())
      and assumeNotNull(campaign_name) != ''
  ),
  group_by_cte as (
    select
      account_name, __account_id, campaign_name, campaign_id, date,
      100000 as campaign_budget,
      sum(assumeNotNull(t.spend)) as total_spend,
      round(if(campaign_budget = 0, 0, total_spend / campaign_budget * 100), 2) as spend_percentage
    from apply_filter as t
    group by account_name, __account_id, campaign_name, campaign_id, date
  ),
  add_ids_and_meta as (
    select
      'Facebook' as datasource,
      'Budget Pacing Alert' as rule_name,
      'Alert when campaign spend exceeds 90% of monthly budget' as rule_description,
      toString(spend_percentage) as spend_percentage_,
      case when spend_percentage > 90 then 'rule broken' else 'rule followed' end as check_result,
      'campaign_id:' || toString(campaign_id) as check_entity_id,
      account_name, __account_id, campaign_name, campaign_id, date,
      campaign_budget as budget,
      total_spend,
      'date is within current month' as rule_filters,
      'Campaign spend exceeds 90% of monthly budget' as violation_if,
      'account_name,__account_id,campaign_name,campaign_id,date' as rule_granularity,
      'Budget Pacing' as compliance_category,
      'Efficiency' as business_category,
      'High' as severity,
      'Review campaign budget and adjust spending' as action_required,
      'finance@company.com' as rule_owners,
      'Enabled' as status,
      'Daily' as run_frequency
    from group_by_cte
  )
select * from add_ids_and_meta
```

## MDG Rule Editing Workflow

1. Get the view DDL:
   ```sql
   SELECT create_table_query FROM system.tables WHERE name = 'view_name'
   ```
2. Briefly explain what the rule does (1-2 sentences): data source, violation condition, current settings
3. **STOP** -- ask user what they want to modify
4. After user responds: call `createMdgViewTool` with CREATE OR REPLACE VIEW to update

Key points:
- View names follow pattern: `rule_<datasource>_<rule_name>_ai`
- Preserve existing metadata unless user wants changes
- Keep explanation short -- user doesn't need SQL unless they ask

### Changing Alert Time / Notification Time

When user asks to change the alert time or notification time for a rule, mind that you cannot change it by updating the SQL code, so you must ask the user to do that themselves in the [Rule Details](origin + "experimental/agent/data-governance/rules/<viewName>") page in a few minutes, once the rule is finished processing. Note that alert frequency (a.k.a. run frequency - Daily, Weekly, etc.) is a different thing, and you can change it by updating the corresponding SQL column.

## Validation Error Handling

**NEVER automatically retry if `createMdgViewTool` returns a validation error.**

When validation fails (e.g. "no rows", "missing columns", "duplicate check_entity_id"):

1. STOP -- do NOT retry
2. Explain the error in simple terms
3. Ask user how to proceed (adjust date filter, modify WHERE, change SQL logic, etc.)
4. Wait for explicit user instruction before retrying
