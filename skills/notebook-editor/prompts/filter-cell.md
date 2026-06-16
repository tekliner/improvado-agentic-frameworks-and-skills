# Filter Cell (Conditional Mapping)

## Overview

Filter cells remove unwanted rows based on conditions. They are used for:
- Removing rows that don't meet criteria
- Date range filtering
- Including/excluding specific campaigns, accounts, values
- Complex AND/OR condition logic

Context for run: `"filter"`

## Content Structure

Content is an **array** (not object):

```json
[
  {
    "table_name": "cell_1_sql_query_label_1122749147",
    "else_condition": {
      "original_title": "",
      "new_title": ""
    },
    "mapping": [
      {
        "original_title": "",
        "new_title": "",
        "conditions": {
          "groups": {
            "and_": [
              {
                "and_": [
                  {
                    "id": "nxw0b8cuvo",
                    "column": "campaign_id",
                    "expression": "contains",
                    "value": ["120211677871930638"]
                  }
                ]
              },
              {
                "and_": [
                  {
                    "id": "hiszpe27a6",
                    "column": "spend",
                    "expression": ">",
                    "value": ["0"]
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
]
```

## Key Rules

- Content is an **array** (not object)
- `table_name`: the source table (real or virtual cell output)
- `else_condition`: always `{"original_title": "", "new_title": ""}` for filters
- `mapping`: array with ONE entry where `original_title` and `new_title` are both `""`
- Filter logic is in `mapping[].conditions.groups` using `and_`/`or_` structure
- Each condition has: `id` (random string), `column`, `expression`, `value` (always array)

## Condition Operators

### String/Number Operators

| Expression | Description |
|------------|-------------|
| `in` | Value is in list |
| `not in` | Value is not in list |
| `exactly matches` | Exact string match |
| `does not exactly match` | Not exact string match |
| `contains` | String contains value |
| `contains (ignore case)` | Case-insensitive contains |
| `does not contain` | String does not contain value |
| `does not contain (ignore case)` | Case-insensitive does not contain |
| `starts with` | String starts with value |
| `starts with (ignore case)` | Case-insensitive starts with |
| `ends with` | String ends with value |
| `split by` | Split string by delimiter |
| `matches regex` | Matches regular expression |
| `does not match regex` | Does not match regular expression |
| `is empty` | Value is empty/null |
| `is not empty` | Value is not empty/null |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `=` | Equals |

### Date Operators

| Expression | Description |
|------------|-------------|
| `is` | Exact date match |
| `is before` | Before date |
| `is after` | After date |
| `is on or before` | On or before date |
| `is on or after` | On or after date |
| `is between` | Between two dates |
| `is relative to today` | Relative date (e.g., last 7 days) |
| `is empty` | Date is empty/null |
| `is not empty` | Date is not empty/null |

## AND Logic

All conditions must match:

```json
{
  "groups": {
    "and_": [
      {
        "and_": [
          {
            "id": "abc123",
            "column": "spend",
            "expression": ">",
            "value": ["0"]
          }
        ]
      },
      {
        "and_": [
          {
            "id": "def456",
            "column": "campaign_name",
            "expression": "contains",
            "value": ["brand"]
          }
        ]
      }
    ]
  }
}
```

This filters for rows where `spend > 0 AND campaign_name contains 'brand'`.

## OR Logic

Any condition must match:

```json
{
  "groups": {
    "or_": [
      {
        "and_": [
          {
            "id": "abc123",
            "column": "campaign_name",
            "expression": "contains",
            "value": ["brand"]
          }
        ]
      },
      {
        "and_": [
          {
            "id": "def456",
            "column": "campaign_name",
            "expression": "contains",
            "value": ["search"]
          }
        ]
      }
    ]
  }
}
```

This filters for rows where `campaign_name contains 'brand' OR campaign_name contains 'search'`.

## Empty Template

```json
{
  "cell_type": "conditional_mapping",
  "content": [
    {
      "table_name": "",
      "else_condition": {"original_title": "", "new_title": ""},
      "mapping": [
        {
          "original_title": "",
          "new_title": "",
          "conditions": {
            "groups": {
              "and_": []
            }
          }
        }
      ]
    }
  ],
  "title": "Filter data",
  "context": "filter"
}
```

## Example 1: Filter by Spend

Keep only rows where spend > 0:

```json
[
  {
    "table_name": "cell_1_sql_query_label_1122749147",
    "else_condition": {"original_title": "", "new_title": ""},
    "mapping": [
      {
        "original_title": "",
        "new_title": "",
        "conditions": {
          "groups": {
            "and_": [
              {
                "and_": [
                  {
                    "id": "filter1",
                    "column": "spend",
                    "expression": ">",
                    "value": ["0"]
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
]
```

## Example 2: Filter by Campaign Name (Contains)

Keep only campaigns with "Brand" in the name:

```json
[
  {
    "table_name": "cell_2_sql_query_label_987654",
    "else_condition": {"original_title": "", "new_title": ""},
    "mapping": [
      {
        "original_title": "",
        "new_title": "",
        "conditions": {
          "groups": {
            "and_": [
              {
                "and_": [
                  {
                    "id": "filter2",
                    "column": "campaign_name",
                    "expression": "contains (ignore case)",
                    "value": ["brand"]
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
]
```

## Example 3: Multiple AND Conditions

Keep rows where spend > 0 AND impressions > 100:

```json
[
  {
    "table_name": "cell_1_sql_query_label_123456",
    "else_condition": {"original_title": "", "new_title": ""},
    "mapping": [
      {
        "original_title": "",
        "new_title": "",
        "conditions": {
          "groups": {
            "and_": [
              {
                "and_": [
                  {
                    "id": "filter3a",
                    "column": "spend",
                    "expression": ">",
                    "value": ["0"]
                  }
                ]
              },
              {
                "and_": [
                  {
                    "id": "filter3b",
                    "column": "impressions",
                    "expression": ">",
                    "value": ["100"]
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
]
```

## Example 4: Date Range Filter

Keep only data from last 30 days:

```json
[
  {
    "table_name": "cell_1_sql_query_label_555555",
    "else_condition": {"original_title": "", "new_title": ""},
    "mapping": [
      {
        "original_title": "",
        "new_title": "",
        "conditions": {
          "groups": {
            "and_": [
              {
                "and_": [
                  {
                    "id": "filter4",
                    "column": "date",
                    "expression": "is relative to today",
                    "value": ["last 30 days"]
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
]
```

## Example 5: Exclude Test Campaigns

Remove campaigns with "test" in the name:

```json
[
  {
    "table_name": "cell_3_sql_query_label_777777",
    "else_condition": {"original_title": "", "new_title": ""},
    "mapping": [
      {
        "original_title": "",
        "new_title": "",
        "conditions": {
          "groups": {
            "and_": [
              {
                "and_": [
                  {
                    "id": "filter5",
                    "column": "campaign_name",
                    "expression": "does not contain (ignore case)",
                    "value": ["test"]
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
]
```

## Common Use Cases

### 1. Remove Zero-Spend Rows
```
spend > 0
```

### 2. Date Range
```
date >= '2024-01-01' AND date <= '2024-12-31'
```

### 3. Active Campaigns Only
```
campaign_status = 'ENABLED'
```

### 4. Exclude Test Data
```
campaign_name does not contain 'test'
AND ad_group_name does not contain 'test'
```

### 5. Specific Accounts
```
__account_id IN ['123', '456', '789']
```

### 6. Performance Threshold
```
clicks > 10 AND impressions > 1000
```
