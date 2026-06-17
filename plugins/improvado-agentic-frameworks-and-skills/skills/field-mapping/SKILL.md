---
name: field-mapping
description: Field mapping and data extraction setup - find report types and validate fields
---

## Data Dictionary and Field Mapping

When users ask about field mapping, available fields for data extraction, or need to find the right report type:

- Follow the complete trajectory in field_mapping_validation_trajectory
- ALWAYS show at least 3 coverage options with dimension/metric breakdown
- Use BOTH Extract Templates Tool AND Data Dictionary for validation
- Extract Templates provide structure, Data Dictionary provides field details

## CRITICAL RULES FOR DATA DICTIONARY USAGE

### 1. Always Show Multiple Coverage Options

- **MANDATORY**: Show at least 3 coverage options when 100% coverage is not available
- Order options by total coverage percentage (descending)
- Include dimension/metric breakdown for each option

### 2. Coverage Breakdown Requirements

- **Dimensions/Properties**: Show X/Y fields covered with percentage
- **Metrics**: Show X/Y fields covered with percentage
- **Total Coverage**: Show overall percentage
- **Missing Fields**: List key missing fields for each option

### 3. Integration with Extract Templates

- **ALWAYS** use Extract Templates Tool for template IDs and configuration
- **ALWAYS** use Data Dictionary (src_improvado_datasource_fields) for field validation and types
- Never rely on Extract Templates alone - validate fields with Data Dictionary
- Extract Templates provide structure, Data Dictionary provides field details

### 4. Field Search: NEVER Say "Not Found" Without Fuzzy Search

- **MANDATORY**: When searching for a field, try exact → partial → keyword matching
- **Query Pattern**: Use ILIKE with variations: `'%ad%group%'`, `'%adgroup%'`, `'%ad_group%'`
- **Always show 3-5 alternatives** if exact match fails, let user decide
- **Only say "not found"** after showing all partial matches = 0 results

---

## 0. CRITICAL: Determine Database Schema

Before querying src_improvado_datasource_fields, ALWAYS determine the correct database:

```sql
SELECT database, name
FROM system.tables
WHERE name = 'src_improvado_datasource_fields' LIMIT 1
```

Use the found database in ALL queries including subqueries. If the table is in a specific schema (e.g., common_db), use
fully qualified names:

- In main queries: `{database}.src_improvado_datasource_fields`
- In subqueries: `{database}.src_improvado_datasource_fields` (REQUIRED to avoid errors)

---

User might ask you to perform a Field Mapping and Validation per specific data source. This trajectory guides you
through the process of mapping fields from external data sources to Improvado's data model and validating the mappings.

IMPORTANT: Common datasource name mappings you should know:

- "YouTube organic" → youtube_organic
- "YouTube paid", "YouTube ads" → google_ads_ql (Google Ads contains YouTube paid data)
- "Google Analytics 4", "GA4" → analyticsdata
- "Facebook", "Meta" → facebook
- "Google Campaign Manager" → google_cm
- "Google DV360" → google_dbm
- "TikTok" → tiktok_ads
- "Pinterest" → pinterest_ads

1. Input: List of Original Fields
   When starting with a list of original fields from an external data source (API, export, or requirements), you should:

Document each field name exactly as provided
Note any metadata provided (types, descriptions, etc.)
Identify required vs optional fields
Document any known validation rules or constraints

2. Identify Data Source in Improvado
   To find the correct data source in Improvado:

SELECT DISTINCT
datasource_name,
datasource_title
FROM src_improvado_datasource_fields
Select the appropriate
datasource_name
for your target (e.g., 'tiktok_ads')
Verify the selection with available documentation
Note any specific version or API requirements

3. Get Distinct Fields for the Data Source
   Query the data dictionary for the selected data source:

SELECT
field_title,
field_sql_name,
field_kind,
field_type,
groupArray(DISTINCT report_type) as report_types
FROM src_improvado_datasource_fields
WHERE LOWER(datasource_name) = '{your_data_source}'
GROUP BY
field_title,
field_sql_name,
field_kind,
field_type
ORDER BY field_title

4. Analyze Field Coverage Across Reports
   Determine which reports provide the best coverage for the requested fields:

WITH requested_fields AS (
SELECT 'field_name_1' AS original_field UNION ALL
SELECT 'field_name_2' AS original_field UNION ALL
-- Add all requested fields
),
mappings AS (
-- Define mappings between original fields and Improvado fields
SELECT 'field_name_1' AS original_field, 'improvado_field_1' AS field_name UNION ALL
SELECT 'field_name_2' AS original_field, 'improvado_field_2' AS field_name
-- Add all possible mappings including alternatives
)

SELECT
report_type,
COUNT(DISTINCT rf.original_field) AS matching_fields_count,
COUNT(DISTINCT rf.original_field) / (SELECT COUNT(*) FROM requested_fields) * 100 AS coverage_percentage,
groupArray(DISTINCT rf.original_field) AS fields_covered
FROM requested_fields rf
JOIN mappings m ON rf.original_field = m.original_field
JOIN src_improvado_datasource_fields bdf ON
(m.field_name != '' AND bdf.field_sql_name = m.field_name)
WHERE
bdf.datasource_name = '{your_data_source}'
GROUP BY report_type
ORDER BY matching_fields_count DESC

## 4.1 Coverage Options Analysis (MANDATORY)

When 100% coverage is not available, ALWAYS provide at least 3 coverage options with dimension/metric breakdown:

WITH requested_fields AS (
-- Your requested fields here
),
field_categories AS (
SELECT DISTINCT
field_sql_name,
field_kind,
CASE
WHEN field_kind = 'dimension' THEN 'Dimension/Property'
WHEN field_kind = 'metric' THEN 'Metric'
ELSE 'Other'
END as field_category
FROM src_improvado_datasource_fields
WHERE datasource_name = '{your_data_source}'
),
coverage_by_report AS (
SELECT
df.report_type,
df.report_type_title,
-- Dimension coverage
COUNT(DISTINCT CASE WHEN fc.field_category = 'Dimension/Property' THEN rf.original_field END) as dimensions_covered,
(SELECT COUNT(DISTINCT original_field) FROM requested_fields rf2
JOIN field_categories fc2 ON rf2.original_field = fc2.field_sql_name
WHERE fc2.field_category = 'Dimension/Property') as total_dimensions,

    -- Metric coverage
    COUNT(DISTINCT CASE WHEN fc.field_category = 'Metric' THEN rf.original_field END) as metrics_covered,
    (SELECT COUNT(DISTINCT original_field) FROM requested_fields rf2
     JOIN field_categories fc2 ON rf2.original_field = fc2.field_sql_name
     WHERE fc2.field_category = 'Metric') as total_metrics,

    -- Total coverage
    COUNT(DISTINCT rf.original_field) as total_covered,
    (SELECT COUNT(*) FROM requested_fields) as total_requested,

    -- Missing fields
    groupArray(DISTINCT rf.original_field) as covered_fields

FROM requested_fields rf
LEFT JOIN src_improvado_datasource_fields df
ON rf.original_field = df.field_sql_name
AND df.datasource_name = '{your_data_source}'
LEFT JOIN field_categories fc ON rf.original_field = fc.field_sql_name
GROUP BY df.report_type, df.report_type_title
)
SELECT
report_type,
report_type_title,
dimensions_covered,
total_dimensions,
ROUND(dimensions_covered * 100.0 / NULLIF(total_dimensions, 0), 1) as dimension_coverage_pct,
metrics_covered,
total_metrics,
ROUND(metrics_covered * 100.0 / NULLIF(total_metrics, 0), 1) as metric_coverage_pct,
total_covered,
total_requested,
ROUND(total_covered * 100.0 / total_requested, 1) as total_coverage_pct,
covered_fields
FROM coverage_by_report
ORDER BY total_coverage_pct DESC
LIMIT 3;

### Output Format for Coverage Options:

📊 **Coverage Analysis Results:**

**Option 1: [Report Name]** - **[Total]% Coverage**

- ✅ Dimensions: [X]/[Y] (**[%]%** coverage)
- ✅ Metrics: [X]/[Y] (**[%]%** coverage)
- ❌ Missing: [comma-separated list of key missing fields]

**Option 2: [Report Name]** - **[Total]% Coverage**

- ✅ Dimensions: [X]/[Y] (**[%]%** coverage)
- ✅ Metrics: [X]/[Y] (**[%]%** coverage)
- ❌ Missing: [comma-separated list of key missing fields]

**Option 3: [Report Name]** - **[Total]% Coverage**

- ✅ Dimensions: [X]/[Y] (**[%]%** coverage)
- ✅ Metrics: [X]/[Y] (**[%]%** coverage)
- ❌ Missing: [comma-separated list of key missing fields]

**Recommendation**: [Brief explanation of which option to choose based on user needs]

5. Create Field-to-Report Availability Matrix
   Create a matrix showing which fields are available in which reports:

WITH original_fields AS (
-- List all original external fields
),
field_mapping AS (
-- Define mappings between external fields and Improvado fields
)

SELECT
ef.external_field,
MAX(CASE WHEN r1.report_type = 'report1' AND r1.field_sql_name IS NOT NULL THEN 1 ELSE 0 END) AS in_report1,
MAX(CASE WHEN r2.report_type = 'report2' AND r2.field_sql_name IS NOT NULL THEN 1 ELSE 0 END) AS in_report2
-- Add cases for all relevant report types
FROM
original_fields ef
LEFT JOIN
field_mapping fm ON ef.external_field = fm.external_field
LEFT JOIN
src_improvado_datasource_fields r1 ON fm.improvado_field = r1.field_sql_name
AND r1.datasource_name = '{your_data_source}' AND r1.report_type = 'report1'
-- Repeat for all relevant report types
GROUP BY ef.external_field
ORDER BY ef.external_field

6. Build the Comprehensive Mapping Table
   Create a detailed mapping table with the following columns:

Column Description
External Data Field Field name from the source system
Data Model Field Matched field name in Improvado
Primary Report Best report to use for this field
Available Reports Array of all reports containing this field
Data Type Data type in Improvado
Status Mapping status (Mapped, Not Mapped, etc.)
Notes Transformation details, considerations, etc.
Example mapping table:

External Data Field Data Model Field Primary Report Available Reports Data Type Status Notes
campaign_id campaign_id auction_audience_ads    ['auction_audience_ads', 'campaign_entity']    Dimension ✅ Mapped Direct
match
impressions impressions auction_audience_ads    ['auction_audience_ads', 'ads']    Metric ✅ Mapped Direct match

7. Calculate Coverage Statistics
   Provide clear metrics on mapping coverage:

Coverage by Report:

Fields covered by each report
Coverage percentage for each report
Unique fields only available in specific reports
Report Combination Coverage:

Total coverage with optimal report combination
Fields that remain unmapped
Percentage of total fields covered
Field Status Summary:

Count and percentage of directly mapped fields
Count and percentage of fields with acceptable alternatives
Count and percentage of completely unmapped fields

8. Validation Process
   For each mapped field:

Data Type Validation:

Verify source and target data types are compatible
Document any required type conversions
Note potential data loss or precision issues
Value Range Validation:

Check for min/max constraints
Verify enumerated values match
Document handling of out-of-range values
Null/Missing Value Handling:

Document nullable vs required fields
Specify default values if needed
Define error handling for missing required data
Format Validation:

Verify date/time formats match
Check string length constraints
Validate regex patterns if applicable

9. Provide Implementation Strategy
   When multiple reports are needed, include a clear join strategy:

Primary Report Selection:

Identify the report with highest field coverage
List all fields to extract from this primary report
Supplementary Reports:

List additional reports needed for full coverage
Specify which fields to extract from each report
Join Logic:

Provide SQL-like join logic between reports
Identify primary and secondary join keys
Document potential data fan-out issues
Schema Example:

-- Pseudo-SQL for the join strategy
SELECT
-- Fields from primary report
primary.field1 AS external_field1,
primary.field2 AS external_field2,

-- Fields from supplementary reports
report2.field3 AS external_field3,
report3.field4 AS external_field4,

-- Unmapped fields (NULL)
NULL AS unmapped_field1
FROM
primary_report primary
LEFT JOIN
report2 ON primary.join_key = report2.join_key
LEFT JOIN
report3 ON primary.join_key = report3.join_key

10. Field Transformation Logic
    For fields requiring transformation:

Simple Transformations:
-- Example: Convert percentage to decimal
CAST(source_field / 100.0 AS FLOAT64) AS target_field

-- Example: Format date
DATE_FORMAT(source_date, '%Y-%m-%d') AS formatted_date
Complex Transformations:
-- Example: Combine multiple fields
CONCAT(first_name, ' ', last_name) AS full_name

-- Example: Conditional mapping
CASE
WHEN status = 'active' THEN 1
WHEN status = 'inactive' THEN 0
ELSE -1
END AS status_code
Missing Field Derivation:
-- Example: Derive site name from URL
var url = csv['ad_creative_click_url'] || '';
try {
var hostname = new URL(url).hostname;
return hostname.replace('www.', '');
} catch (e) {
return null;
}

11. Documentation Requirements
    For each mapping, document:

Field Level:

Source and target field details
Primary source report for each field
Data type transformations
Validation rules
Default values
Error handling
Report Level:

Selected report justification with coverage percentages
Performance considerations
Known limitations
Implementation Notes:

Required joins/unions with exact join keys
Transformation logic
Special handling cases
Testing requirements

12. Quality Assurance Steps
    Verify field coverage is complete
    Test data type conversions
    Validate transformation logic
    Check for data loss scenarios
    Test error handling
    Verify performance impact
    Document test cases and results
    IMPORTANT GUIDELINES:

Always verify field existence in Improvado before mapping
Always specify the PRIMARY source report for each field
Look for equivalent fields when direct mappings aren't available (e.g., campaign_type for campaign_category)
Calculate and present coverage percentages for each report and combination
Document ALL assumptions and decisions
Consider performance impact of transformations and joins
Test with representative data samples
Maintain mapping documentation
Review edge cases and error scenarios
Consider future maintenance needs

EXAMPLE 1: Finding YouTube Reports with Clicks and Views

When user asks: "What reports should I use to get YouTube paid and organic data like clicks and views?"

Query to find the reports:

```sql
WITH youtube_reports AS (SELECT datasource_name,
                                datasource_title,
                                report_type,
                                report_type_title,
                                groupArray(DISTINCT field_sql_name)                                        as available_fields,
                                countIf(field_sql_name IN ('clicks', 'video_views', 'impressions',
                                                           'statistics_view_count'))                       as key_metrics_count
                         FROM src_improvado_datasource_fields
                         WHERE datasource_name IN ('youtube_organic', 'google_ads_ql')
                           AND field_sql_name IN ('clicks', 'video_views', 'impressions', 'statistics_view_count')
                         GROUP BY datasource_name, datasource_title, report_type, report_type_title)
SELECT datasource_title,
       report_type_title,
       report_type,
       available_fields,
       CASE
           WHEN datasource_name = 'youtube_organic' THEN 'Organic YouTube data'
           WHEN datasource_name = 'google_ads_ql' THEN 'Paid YouTube ads data'
           END AS use_case
FROM youtube_reports
WHERE key_metrics_count > 0
ORDER BY datasource_name, key_metrics_count DESC LIMIT 10
```

Recommended reports:

- **YouTube Organic**: Use `video_details` report - contains `statistics_view_count` for views
- **YouTube Paid (Google Ads)**: Use `video_report` - contains `clicks`, `impressions`, and `video_views`

Key metric mappings:

- YouTube Organic views: `statistics_view_count` (field name: statistics.viewCount)
- Google Ads clicks: `clicks` (field name: metrics.clicks)
- Google Ads impressions: `impressions` (field name: metrics.impressions)
- Google Ads video views: `video_views` (field name: metrics.video_views)

---

EXAMPLE 2: Field Search - User Asks for "AD group name" in CM360

**User**: "I need AD group name from Google CM360"

❌ **WRONG Approach**: "Field 'AD group name' not found in CM360"

✅ **CORRECT Approach**:

```sql
-- Step 1: Try exact match
SELECT field_sql_name, field_title, groupArray(DISTINCT report_type) as reports
FROM src_improvado_datasource_fields
WHERE datasource_name = 'google_cm'
  AND (LOWER(field_sql_name) = 'ad_group_name' OR LOWER(field_title) = 'ad group name')
GROUP BY field_sql_name, field_title
-- If returns 0 rows → proceed to fuzzy search

-- Step 2: Fuzzy search with multiple patterns
SELECT field_sql_name,
       field_title,
       groupArray(DISTINCT report_type) as reports,
       COUNT(DISTINCT report_type)      as report_count
FROM src_improvado_datasource_fields
WHERE datasource_name = 'google_cm'
  AND (field_sql_name ILIKE '%ad%group%'
       OR field_sql_name ILIKE '%adgroup%'
       OR field_title ILIKE '%ad%group%')
GROUP BY field_sql_name, field_title
ORDER BY report_count DESC LIMIT 10
```

**Response to user**:
"I found these related fields in Google CM360:

- `ad_group_1` (available in 3 reports: campaign_report, ad_report, placement_report)
- `ad_group` (available in 2 reports: ad_report, placement_report)
- `ad_group_id` (available in 2 reports: ad_report, creative_report)

The `ad_group` field is most likely what you need for ad group names. Would you like me to check which reports contain
it?
