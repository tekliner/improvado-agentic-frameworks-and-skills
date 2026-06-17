# Union Cell (Blend Data)

## Overview

Union cells combine data from multiple sources using `UNION ALL`. They are used for:
- Merging data from different platforms (Google Ads + Facebook Ads)
- Standardizing column names across sources
- Row-level transformations and formulas
- Adding metadata columns (data source labels, constants)

## Content Structure

Content — `output_schema.columns` must be typed objects `{"name": "...", "type": "..."}`:

```json
{
  "output_schema": {
    "columns": [
      {"name": "date", "type": "date"},
      {"name": "campaign_id", "type": "string"},
      {"name": "campaign_name", "type": "string"},
      {"name": "spend", "type": "number"}
    ],
    "conditions": null
  },
  "tables": [
    {
      "name": "ads_10873_google_ads_ql_all_data",
      "columns": [
        {"original_name": ["date"], "new_name": "date"},
        {"original_name": ["campaign_id"], "new_name": "campaign_id"},
        {"original_name": ["campaign_name"], "new_name": "campaign_name"},
        {"original_name": ["cost"], "new_name": "spend"}
      ]
    },
    {
      "name": "ads_age_gender_10873_facebook_all_data",
      "columns": [
        {"original_name": ["date"], "new_name": "date"},
        {"original_name": ["campaign_id"], "new_name": "campaign_id"},
        {"original_name": ["campaign_name"], "new_name": "campaign_name"},
        {"original_name": ["spend"], "new_name": "spend"}
      ]
    }
  ]
}
```

## Key Rules

- `output_schema.columns` is array of `{"name": "col", "type": "type"}` objects
- Each table column mapping: `{"original_name": ["source_col"], "new_name": "output_col"}`
- Source columns can be renamed: `{"original_name": ["cost"], "new_name": "spend"}`
- Context for run: `"blend_data"`

## Column Mapping Types

### 1. Simple Column Mapping

Maps a source column directly. Regular columns use `"conditions": []` (empty array):

```json
{"original_name": ["date"], "new_name": "date", "conditions": []}
```

### 2. Column Rename

Source column name differs from output name:

```json
{"original_name": ["cost"], "new_name": "spend", "conditions": []}
```

### 3. String Constants

Wrap string values in escaped single quotes:

```json
{"original_name": ["'Google Ads'"], "new_name": "data_source", "conditions": []}
```

### 4. Numeric Constants

```json
{"original_name": ["0.0"], "new_name": "views", "conditions": []}
```

### 5. Formulas and Expressions

See [formulas-and-expressions.md](formulas-and-expressions.md) for detailed documentation on:
- Arithmetic expressions
- CASE WHEN logic
- Calculated columns
- KPI computations

## CRITICAL: No Aggregations in Formulas

**⚠️ NO AGGREGATIONS in Blend Data formulas.** The underlying CTE is a `UNION ALL` — every custom formula runs per-row, not as an aggregate. You **cannot** use `SUM()`, `COUNT()`, `AVG()`, `MIN()`, `MAX()`, or any aggregate function in formulas.

- ❌ `"new_title": ["SUM(spend)"]` — will fail
- ❌ `"new_title": ["COUNT(CASE WHEN clicks > 0 THEN 1 END)"]` — will fail
- ✅ `"new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"]` — row-level, works

**If you need aggregations**, use the proper cell combination:
1. **Blend Data** → map and rename columns, apply row-level CASE WHEN logic
2. **Group By** → aggregate with SUM, COUNT, AVG, etc.
3. **Filter** → remove unwanted rows before or after aggregation

## Empty Template

```json
{
  "cell_type": "union",
  "content": {
    "output_schema": {"columns": [], "conditions": null},
    "tables": []
  },
  "title": "Blend data",
  "context": "blend_data"
}
```

## Full Example with Multiple Sources

```json
{
  "output_schema": {
    "columns": [
      {"name": "date", "type": "date"},
      {"name": "campaign_id", "type": "string"},
      {"name": "campaign_name", "type": "string"},
      {"name": "data_source", "type": "string"},
      {"name": "spend", "type": "number"},
      {"name": "clicks", "type": "number"},
      {"name": "impressions", "type": "number"}
    ],
    "conditions": null
  },
  "tables": [
    {
      "name": "campaign_10873_google_ads_ql_all_data",
      "columns": [
        {"original_name": ["date"], "new_name": "date", "conditions": []},
        {"original_name": ["campaign_id"], "new_name": "campaign_id", "conditions": []},
        {"original_name": ["campaign_name"], "new_name": "campaign_name", "conditions": []},
        {"original_name": ["'Google Ads'"], "new_name": "data_source", "conditions": []},
        {"original_name": ["cost"], "new_name": "spend", "conditions": []},
        {"original_name": ["clicks"], "new_name": "clicks", "conditions": []},
        {"original_name": ["impressions"], "new_name": "impressions", "conditions": []}
      ]
    },
    {
      "name": "ads_age_gender_10873_facebook_all_data",
      "columns": [
        {"original_name": ["date"], "new_name": "date", "conditions": []},
        {"original_name": ["campaign_id"], "new_name": "campaign_id", "conditions": []},
        {"original_name": ["campaign_name"], "new_name": "campaign_name", "conditions": []},
        {"original_name": ["'Facebook Ads'"], "new_name": "data_source", "conditions": []},
        {"original_name": ["spend"], "new_name": "spend", "conditions": []},
        {"original_name": ["clicks"], "new_name": "clicks", "conditions": []},
        {"original_name": ["impressions"], "new_name": "impressions", "conditions": []}
      ]
    }
  ]
}
```
