# Formulas and Expressions in Blend Data

## Overview

Blend Data cells support custom formulas for:
- Arithmetic calculations (multiplication, division, addition, subtraction)
- Conditional logic (CASE WHEN)
- String manipulation
- KPI computations (CTR, CPC, ROAS, etc.)

**CRITICAL:** All formulas run **per-row** (not aggregated). Use Group By for aggregations.

## Formula Structure Pattern

**There is NO shorthand for formulas.** All custom calculations MUST use this pattern:

```json
{
  "original_name": ["Calculated {descriptive label}"],
  "new_name": "output_column_name",
  "conditions": [
    {
      "table_name": "source_table_name",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "output_column_name",
          "new_title": ["SQL EXPRESSION HERE"],
          "conditions": null
        }
      ]
    }
  ]
}
```

## Key Rules for Formulas

1. `original_name`: Always `["Calculated {descriptive label}"]`
2. `new_name`: **MUST match** a column name from `output_schema.columns`
3. `conditions[].table_name`: **MUST match** the table's `name` field (same hash!)
4. `conditions[].else_condition`: Always include, usually `null`
5. `conditions[].mapping[].original_title`: Use the **`new_name` of this calculated column** (the output schema column name)
6. `conditions[].mapping[].new_title`: **Array** with ONE element: the SQL expression
7. `conditions[].mapping[].conditions`: Always `null`

## Adding a Calculated Column (2 Steps Required)

**Step 1:** Add to output schema:
```json
{
  "output_schema": {
    "columns": [
      {"name": "spend", "type": "number"},
      {"name": "clicks", "type": "number"},
      {"name": "cpc", "type": "number"}  // ← New calculated column
    ]
  }
}
```

**Step 2:** Add the formula mapping:
```json
{
  "original_name": ["Calculated CPC"],
  "new_name": "cpc",  // ← Must match output_schema column name
  "conditions": [
    {
      "table_name": "cell_4_sql_query_label_1172071557",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "cpc",  // ← Must match new_name
          "new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"  // ← Required!
}
```

## Arithmetic Expressions

### Multiply by Constant

Apply 1.3x markup to spend:

```json
{
  "original_name": ["Calculated Facebook Spend with Markup"],
  "new_name": "spend",
  "conditions": [
    {
      "table_name": "campaign_3756_facebook_all_data",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "spend",
          "new_title": ["spend * 1.3"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "spend * 1.3"
}
```

### Divide Two Columns

Calculate ROI (conversion_value / spend):

```json
{
  "original_name": ["Calculated ROI"],
  "new_name": "roi",
  "conditions": [
    {
      "table_name": "campaign_data_table",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "roi",
          "new_title": ["conversion_value / spend"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "conversion_value / spend"
}
```

### Addition/Subtraction

Total conversions = direct_conversions + assisted_conversions:

```json
{
  "original_name": ["Calculated Total Conversions"],
  "new_name": "total_conversions",
  "conditions": [
    {
      "table_name": "ads_table",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "total_conversions",
          "new_title": ["direct_conversions + assisted_conversions"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "direct_conversions + assisted_conversions"
}
```

## Conditional Logic (CASE WHEN)

### Important: CASE Expressions Format

**All CASE expressions must be written in single-line format** for JSON compatibility:

```
CASE WHEN condition THEN value WHEN condition2 THEN value2 ELSE default END AS column_name
```

**NOT** multi-line:
```
// ❌ WRONG - Don't use line breaks
CASE
    WHEN condition THEN value
    ELSE default
END AS column_name
```

### Simple Condition

Filter spend by account ID (only count if account matches, else 0):

```json
{
  "original_name": ["Calculated Facebook Ads - Ads Age Gender spend"],
  "new_name": "spend",
  "conditions": [
    {
      "table_name": "ads_age_gender_10873_facebook_all_data",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "spend",
          "new_title": ["CASE WHEN __account_id = 'GOOGLE_CUSTOMER_ID' THEN spend ELSE 0.0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN __account_id = 'GOOGLE_CUSTOMER_ID' THEN spend ELSE 0.0 END"
}
```

### Categorize by Value

Map campaign names to channel categories:

```json
{
  "original_name": ["Calculated channel category"],
  "new_name": "channel",
  "conditions": [
    {
      "table_name": "ads_google",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "channel",
          "new_title": ["CASE WHEN campaign_name LIKE '%brand%' THEN 'Brand' WHEN campaign_name LIKE '%search%' THEN 'Search' ELSE 'Other' END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN campaign_name LIKE '%brand%' THEN 'Brand' WHEN campaign_name LIKE '%search%' THEN 'Search' ELSE 'Other' END"
}
```

### Zero Out Invalid Values

Only keep clicks if there are impressions:

```json
{
  "original_name": ["Calculated filtered clicks"],
  "new_name": "clicks",
  "conditions": [
    {
      "table_name": "campaign_data",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "clicks",
          "new_title": ["CASE WHEN impressions > 0 THEN clicks ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN impressions > 0 THEN clicks ELSE 0 END"
}
```

## Advanced Conditional Mappings

### Conditional Mappings with AND/OR Logic

For complex conditional mappings (multiple WHEN clauses with different values), use the `conditions.groups` structure with `and_` or `or_` arrays.

#### Datasource Normalization Example

Map various source names to canonical values:

```json
{
  "original_name": ["Calculated datasource"],
  "new_name": "datasource",
  "conditions": [
    {
      "table_name": "session_data",
      "mapping": [
        {
          "original_title": "datasource",
          "new_title": "'facebook'",
          "conditions": {
            "groups": {
              "or_": [
                {"id": "cond1", "column": "session_source", "expression": "in", "value": ["facebook", "fg", "ig"]}
              ]
            }
          }
        },
        {
          "original_title": "datasource",
          "new_title": "'google'",
          "conditions": {
            "groups": {
              "or_": [
                {"id": "cond2", "column": "session_source", "expression": "in", "value": ["google", "adwords"]}
              ]
            }
          }
        }
      ],
      "else_condition": {
        "original_title": "session_source",
        "new_title": "datasource"
      }
    }
  ],
  "formula": "CASE WHEN session_source IN ('facebook', 'fg', 'ig') THEN 'facebook' WHEN session_source IN ('google', 'adwords') THEN 'google' ELSE session_source END"
}
```

#### Platform Taxonomy Example

Map taxonomy codes to platform names:

```json
{
  "original_name": ["Calculated platform"],
  "new_name": "platform",
  "conditions": [
    {
      "table_name": "campaign_data",
      "mapping": [
        {
          "original_title": "platform",
          "new_title": "'Paid Social'",
          "conditions": {
            "groups": {
              "and_": [
                {"id": "cond3", "column": "program_taxo", "expression": "=", "value": ["'05PS'"]}
              ]
            }
          }
        },
        {
          "original_title": "platform",
          "new_title": "'Retail Display'",
          "conditions": {
            "groups": {
              "and_": [
                {"id": "cond4", "column": "program_taxo", "expression": "=", "value": ["'05RD'"]}
              ]
            }
          }
        },
        {
          "original_title": "platform",
          "new_title": "'Retail Search'",
          "conditions": {
            "groups": {
              "and_": [
                {"id": "cond5", "column": "program_taxo", "expression": "=", "value": ["'05RS'"]}
              ]
            }
          }
        }
      ],
      "else_condition": {
        "original_title": "'Unknown'",
        "new_title": "platform"
      }
    }
  ],
  "formula": "CASE WHEN program_taxo = '05PS' THEN 'Paid Social' WHEN program_taxo = '05RD' THEN 'Retail Display' WHEN program_taxo = '05RS' THEN 'Retail Search' ELSE 'Unknown' END"
}
```

#### Multiple AND Conditions

Segment based on cost and conversions:

```json
{
  "original_name": ["Calculated segment"],
  "new_name": "segment",
  "conditions": [
    {
      "table_name": "campaign_data",
      "mapping": [
        {
          "original_title": "segment",
          "new_title": "'High Value'",
          "conditions": {
            "groups": {
              "and_": [
                {"id": "cond6", "column": "cost", "expression": ">", "value": ["10000"]},
                {"id": "cond7", "column": "conversions", "expression": ">", "value": ["100"]}
              ]
            }
          }
        },
        {
          "original_title": "segment",
          "new_title": "'Medium Value'",
          "conditions": {
            "groups": {
              "and_": [
                {"id": "cond8", "column": "cost", "expression": ">", "value": ["5000"]},
                {"id": "cond9", "column": "cost", "expression": "<=", "value": ["10000"]}
              ]
            }
          }
        }
      ],
      "else_condition": {
        "original_title": "'Low Value'",
        "new_title": "segment"
      }
    }
  ],
  "formula": "CASE WHEN cost > 10000 AND conversions > 100 THEN 'High Value' WHEN cost > 5000 AND cost <= 10000 THEN 'Medium Value' ELSE 'Low Value' END"
}
```

### Conditional Mapping Structure Reference

```json
{
  "conditions": {
    "groups": {
      "and_": [/* array of conditions combined with AND */],
      "or_": [/* array of conditions combined with OR */]
    }
  }
}
```

Each condition object:
```json
{
  "column": "column_name",
  "expression": "=|!=|>|<|>=|<=|in|not in|like|not like",
  "value": "single_value or ['array', 'for', 'IN']"
}
```

### Available Operators

- `=` - equals
- `!=` or `<>` - not equals
- `>`, `<`, `>=`, `<=` - comparisons
- `in` - value in list (use array for value)
- `not in` - value not in list
- `like` - pattern matching with wildcards
- `not like` - not matching pattern

### The `formula` Field

**CRITICAL: You MUST populate the `formula` field yourself when creating formulas.**

The `formula` field is a **required field** that contains the final SQL expression for the calculated column. When you create any formula (simple arithmetic or conditional mappings), you must:

1. **Write the SQL expression in `formula`** - this is the actual SQL that will be used
2. **Format it as single-line** (no line breaks)
3. **Include the full expression** as it would appear in SELECT clause (without AS alias)

#### For Simple Formulas (Arithmetic, KPIs)

Extract the expression from `new_title` and put it in `formula`:

```json
{
  "original_name": ["Calculated CPC"],
  "new_name": "cpc",
  "conditions": [{
    "table_name": "cell_4_sql_query_label_1172071557",
    "else_condition": null,
    "mapping": [{
      "original_title": "cpc",
      "new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"],
      "conditions": null
    }]
  }],
  "formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"
}
```

#### For Conditional Mappings (conditions.groups)

Generate the CASE expression from the mapping array and put it in `formula`:

```json
{
  "original_name": ["Calculated datasource"],
  "new_name": "datasource",
  "conditions": [{
    "table_name": "session_data",
    "mapping": [
      {
        "original_title": "datasource",
        "new_title": "'facebook'",
        "conditions": {
          "groups": {
            "or_": [
              {"id": "cond10", "column": "session_source", "expression": "in", "value": ["facebook", "fg", "ig"]}
            ]
          }
        }
      },
      {
        "original_title": "datasource",
        "new_title": "'google'",
        "conditions": {
          "groups": {
            "or_": [
              {"id": "cond11", "column": "session_source", "expression": "in", "value": ["google", "adwords"]}
            ]
          }
        }
      }
    ],
    "else_condition": {
      "original_title": "session_source",
      "new_title": "datasource"
    }
  }],
  "formula": "CASE WHEN session_source IN ('facebook', 'fg', 'ig') THEN 'facebook' WHEN session_source IN ('google', 'adwords') THEN 'google' ELSE session_source END"
}
```

#### Formula Field Rules

1. **Always required** - never omit the `formula` field
2. **Single line** - no newlines or line breaks
3. **No AS alias** - just the expression itself (e.g., `spend * 1.3`, not `spend * 1.3 AS adjusted_spend`)
4. **Match the logic** - must correspond exactly to what's in `new_title` or generated from `conditions.groups`
5. **Use actual column references** - reference source table columns directly

#### Examples of formula Field

**Arithmetic:**
```json
"formula": "spend * 1.3"
```

**Division with safety:**
```json
"formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"
```

**Conditional mapping:**
```json
"formula": "CASE WHEN cost > 10000 AND conversions > 100 THEN 'High Value' WHEN cost > 5000 AND cost <= 10000 THEN 'Medium Value' ELSE 'Low Value' END"
```

**String literal:**
```json
"formula": "'facebook'"
```

## KPI Formulas

### CTR (Click-Through Rate)

CTR = (clicks / impressions) * 100:

```json
{
  "original_name": ["Calculated CTR"],
  "new_name": "ctr",
  "conditions": [
    {
      "table_name": "cell_4_sql_query_label_1172071557",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "ctr",
          "new_title": ["CASE WHEN impressions > 0 THEN (clicks / impressions) * 100 ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN impressions > 0 THEN (clicks / impressions) * 100 ELSE 0 END"
}
```

### CPC (Cost Per Click)

CPC = spend / clicks:

```json
{
  "original_name": ["Calculated CPC"],
  "new_name": "cpc",
  "conditions": [
    {
      "table_name": "cell_4_sql_query_label_1172071557",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "cpc",
          "new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"
}
```

### ROAS (Return on Ad Spend)

ROAS = conversion_value / spend:

```json
{
  "original_name": ["Calculated ROAS"],
  "new_name": "roas",
  "conditions": [
    {
      "table_name": "cell_4_sql_query_label_1172071557",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "roas",
          "new_title": ["CASE WHEN spend > 0 THEN conversion_value / spend ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN spend > 0 THEN conversion_value / spend ELSE 0 END"
}
```

### CPM (Cost Per Thousand Impressions)

CPM = (spend / impressions) * 1000:

```json
{
  "original_name": ["Calculated CPM"],
  "new_name": "cpm",
  "conditions": [
    {
      "table_name": "ads_data",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "cpm",
          "new_title": ["CASE WHEN impressions > 0 THEN (spend / impressions) * 1000 ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN impressions > 0 THEN (spend / impressions) * 1000 ELSE 0 END"
}
```

### Conversion Rate

Conversion Rate = (conversions / clicks) * 100:

```json
{
  "original_name": ["Calculated Conversion Rate"],
  "new_name": "conversion_rate",
  "conditions": [
    {
      "table_name": "campaign_data",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "conversion_rate",
          "new_title": ["CASE WHEN clicks > 0 THEN (conversions / clicks) * 100 ELSE 0 END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN clicks > 0 THEN (conversions / clicks) * 100 ELSE 0 END"
}
```

## ClickHouse-Specific Functions

When writing formulas for ClickHouse, you can use these common functions:

### String Functions
- `concat(str1, str2, ...)` - concatenate strings
- `lower(str)`, `upper(str)` - case conversion
- `length(str)` - string length
- `substring(str, offset, length)` - extract substring
- `replaceAll(str, pattern, replacement)` - replace all occurrences

### Date Functions
- `toDate(expr)`, `toDateTime(expr)` - convert to date/datetime
- `formatDateTime(datetime, format)` - format datetime
- `dateDiff('unit', date1, date2)` - difference between dates (units: 'day', 'month', 'year')
- `addDays(date, num)`, `addMonths(date, num)` - add to date
- `toYear(date)`, `toMonth(date)` - extract date parts

### Mathematical Functions
- `round(x, N)` - round to N decimal places
- `floor(x)`, `ceil(x)` - round down/up
- `abs(x)` - absolute value

### NULL Handling
- `ifNull(expr, alt)` - return alt if expr is NULL
- `coalesce(expr1, expr2, ...)` - return first non-NULL
- `nullIf(expr1, expr2)` - return NULL if expr1 == expr2

### Example: Using ClickHouse Functions in Formulas

```json
{
  "original_name": ["Calculated adjusted cost"],
  "new_name": "adjusted_cost",
  "conditions": [
    {
      "table_name": "campaign_data",
      "else_condition": null,
      "mapping": [
        {
          "original_title": "adjusted_cost",
          "new_title": ["CASE WHEN country = 'USA' THEN round(cost * 1.15, 2) WHEN country = 'UK' THEN round(cost * 1.10, 2) ELSE cost END"],
          "conditions": null
        }
      ]
    }
  ],
  "formula": "CASE WHEN country = 'USA' THEN round(cost * 1.15, 2) WHEN country = 'UK' THEN round(cost * 1.10, 2) ELSE cost END"
}
```

## Common Mistakes to Avoid

### ❌ WRONG: Multi-line CASE expressions
```json
{
  "new_title": ["CASE\n    WHEN x > 0\n    THEN y\n    END"]
}
```

### ✅ CORRECT: Single-line CASE expressions
```json
{
  "new_title": ["CASE WHEN x > 0 THEN y END"]
}
```

### ❌ WRONG: Using arithmetic shorthand
```json
{"original_name": ["spend * 1.3"], "new_name": "spend", "conditions": []}
```

### ✅ CORRECT: Using full formula pattern
```json
{
  "original_name": ["Calculated spend with markup"],
  "new_name": "spend",
  "conditions": [{
    "table_name": "ads_table",
    "else_condition": null,
    "mapping": [{
      "original_title": "spend",
      "new_title": ["spend * 1.3"],
      "conditions": null
    }]
  }],
  "formula": "spend * 1.3"
}
```

### ❌ WRONG: Using aggregations in formulas
```json
{"new_title": ["SUM(spend)"]}  // Will fail - no aggregations in Blend Data
```

### ✅ CORRECT: Use Group By for aggregations
First aggregate in Group By cell, then reference the aggregated column in Blend Data.

### ❌ WRONG: Mismatched table_name
```json
{
  "original_name": ["Calculated CPC"],
  "new_name": "cpc",
  "conditions": [{
    "table_name": "wrong_table_name",  // Must match the actual table name/hash
    "else_condition": null,
    "mapping": [{
      "original_title": "cpc",
      "new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"],
      "conditions": null
    }]
  }],
  "formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"
}
```

### ✅ CORRECT: Matching table_name
```json
{
  "original_name": ["Calculated CPC"],
  "new_name": "cpc",
  "conditions": [{
    "table_name": "cell_4_sql_query_label_1172071557",  // Exact match
    "else_condition": null,
    "mapping": [{
      "original_title": "cpc",
      "new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"],
      "conditions": null
    }]
  }],
  "formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"
}
```

### ❌ WRONG: original_title doesn't match new_name
```json
{
  "original_name": ["Calculated CTR"],
  "new_name": "ctr",
  "conditions": [{
    "table_name": "campaign_data",
    "else_condition": null,
    "mapping": [{
      "original_title": "impressions",  // Wrong - should be "ctr"
      "new_title": ["(clicks / impressions) * 100"],
      "conditions": null
    }]
  }],
  "formula": "(clicks / impressions) * 100"
}
```

### ✅ CORRECT: original_title matches new_name
```json
{
  "original_name": ["Calculated CTR"],
  "new_name": "ctr",
  "conditions": [{
    "table_name": "campaign_data",
    "else_condition": null,
    "mapping": [{
      "original_title": "ctr",  // Correct
      "new_title": ["(clicks / impressions) * 100"],
      "conditions": null
    }]
  }],
  "formula": "(clicks / impressions) * 100"
}
```

## Full Example: Multiple KPIs

Blend Data cell output with 3 KPIs (CTR, CPC, ROAS):

```json
{
  "output_schema": {
    "columns": [
      {"name": "date", "type": "date"},
      {"name": "campaign_name", "type": "string"},
      {"name": "spend", "type": "number"},
      {"name": "clicks", "type": "number"},
      {"name": "impressions", "type": "number"},
      {"name": "conversion_value", "type": "number"},
      {"name": "ctr", "type": "number"},
      {"name": "cpc", "type": "number"},
      {"name": "roas", "type": "number"}
    ],
    "conditions": null
  },
  "tables": [
    {
      "name": "cell_4_sql_query_label_1172071557",
      "columns": [
        {"original_name": ["date"], "new_name": "date", "conditions": []},
        {"original_name": ["campaign_name"], "new_name": "campaign_name", "conditions": []},
        {"original_name": ["sum_spend"], "new_name": "spend", "conditions": []},
        {"original_name": ["sum_clicks"], "new_name": "clicks", "conditions": []},
        {"original_name": ["sum_impressions"], "new_name": "impressions", "conditions": []},
        {"original_name": ["sum_conversion_value"], "new_name": "conversion_value", "conditions": []},
        {
          "original_name": ["Calculated CTR"],
          "new_name": "ctr",
          "conditions": [{
            "table_name": "cell_4_sql_query_label_1172071557",
            "else_condition": null,
            "mapping": [{
              "original_title": "ctr",
              "new_title": ["CASE WHEN impressions > 0 THEN (clicks / impressions) * 100 ELSE 0 END"],
              "conditions": null
            }]
          }],
          "formula": "CASE WHEN impressions > 0 THEN (clicks / impressions) * 100 ELSE 0 END"
        },
        {
          "original_name": ["Calculated CPC"],
          "new_name": "cpc",
          "conditions": [{
            "table_name": "cell_4_sql_query_label_1172071557",
            "else_condition": null,
            "mapping": [{
              "original_title": "cpc",
              "new_title": ["CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"],
              "conditions": null
            }]
          }],
          "formula": "CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END"
        },
        {
          "original_name": ["Calculated ROAS"],
          "new_name": "roas",
          "conditions": [{
            "table_name": "cell_4_sql_query_label_1172071557",
            "else_condition": null,
            "mapping": [{
              "original_title": "roas",
              "new_title": ["CASE WHEN spend > 0 THEN conversion_value / spend ELSE 0 END"],
              "conditions": null
            }]
          }],
          "formula": "CASE WHEN spend > 0 THEN conversion_value / spend ELSE 0 END"
        }
      ]
    }
  ]
}
```

## No Aggregations Allowed

Remember: Blend Data formulas run **per-row**. For aggregations, use this workflow:

1. **Blend Data** → combine sources, rename columns, add metadata
2. **Group By** → aggregate with SUM, COUNT, AVG
3. **Blend Data** (again) → add calculated KPI columns using aggregated metrics
4. **Filter** → remove unwanted rows

Example:
```
[Blend Data] → Combine Google Ads + Facebook Ads
     ↓
[Group By] → SUM(spend), SUM(clicks), SUM(impressions) by date, campaign
     ↓
[Blend Data] → Add CTR = (clicks / impressions) * 100
     ↓
[Filter] → Keep only rows where impressions > 100
```

## Critical Formatting Rules

### 1. Column Name Consistency
In calculated columns, `original_title` must match `new_name`:

✅ **CORRECT:**
```json
{
  "new_name": "ctr",
  "conditions": [{
    "mapping": [{
      "original_title": "ctr",
      "new_title": ["(clicks / impressions) * 100"]
    }]
  }]
}
```

❌ **WRONG:**
```json
{
  "new_name": "ctr",
  "conditions": [{
    "mapping": [{
      "original_title": "clicks",  // Should be "ctr"
      "new_title": ["(clicks / impressions) * 100"]
    }]
  }]
}
```

### 2. String Literals in new_title
When using conditional mappings with literal strings, include quotes in the value:

✅ **CORRECT:**
```json
{"new_title": "'Facebook'"}  // String includes quotes
```

❌ **WRONG:**
```json
{"new_title": "Facebook"}  // Missing quotes - will be treated as column reference
```

### 3. Table Name Matching
The `table_name` in conditions must **exactly match** the table's `name` field:

✅ **CORRECT:**
```json
{
  "tables": [{"name": "cell_4_sql_query_label_1172071557", ...}],
  "columns": [
    {
      "conditions": [{
        "table_name": "cell_4_sql_query_label_1172071557"  // Exact match
      }]
    }
  ]
}
```

❌ **WRONG:**
```json
{
  "conditions": [{
    "table_name": "some_other_name"  // Doesn't match
  }]
}
```

### 4. IN Operator with Arrays
When using `in` operator in conditional mappings, provide value as array:

✅ **CORRECT:**
```json
{
  "column": "source",
  "expression": "in",
  "value": ["facebook", "google", "bing"]
}
```

❌ **WRONG:**
```json
{
  "column": "source",
  "expression": "in",
  "value": "facebook google bing"  // Should be array
}
```

## Summary Checklist

Before finalizing any formula:

- ✓ `formula` field is **always populated** with the SQL expression
- ✓ `formula` is single-line (no line breaks)
- ✓ `formula` has no AS alias (just the expression)
- ✓ `original_title` matches `new_name` for calculated columns
- ✓ `table_name` exactly matches the table's name field
- ✓ String literals in `new_title` include quotes: `'value'`
- ✓ Column added to `output_schema.columns` first
- ✓ No aggregations (SUM, AVG, etc.) in formulas
- ✓ Division protected with CASE WHEN to avoid divide-by-zero
- ✓ ClickHouse function syntax is correct
- ✓ IN operator uses array value: `["val1", "val2"]`
