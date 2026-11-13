# Marketing metric glossary for agents

This glossary gives calculation rules, not a promise that every source uses identical definitions. Always keep the source's field definition, attribution settings, currency, and reporting window beside a number.

| Metric | Calculation from base measures | Check before comparing |
| --- | --- | --- |
| Spend | Sum of advertising cost in account currency | Google Ads API cost may be reported in micros; confirm normalization. |
| Impressions | Sum of delivered ad impressions | An impression is not a unique person. |
| Clicks | Sum of the chosen click metric | Platforms may distinguish all clicks, link clicks, and outbound clicks. |
| CTR | Chosen clicks / impressions | Name the click type; report undefined for zero impressions. |
| CPC | Spend / chosen clicks | Report undefined for zero clicks. |
| Conversions or results | Sum of the selected action or event | Name the action, attribution window, and counting method. |
| CPA or cost per result | Spend / selected conversions or results | Report undefined for zero results. |
| Conversion value | Sum of the selected attributed values | Confirm whether values represent orders, leads, or another assigned value. |
| ROAS | Conversion value / spend | Report undefined for zero spend; value sources may overlap. |
| Session key event rate | Sessions in which the selected key event occurred / sessions | Use GA4's event-specific rate metric; raw event count / sessions is not this rate. |

## Aggregation rule

Sum the numerators and denominators first. Then calculate the ratio. An unweighted average of campaign ROAS, CPA, CTR, or CPC can be misleading.

## Prompt

> Before calculating a marketing metric, list its source field, unit, numerator, denominator, attribution setting, conversion or event definition, period, timezone, and refresh time. Compute ratios from summed base measures. Mark zero-denominator ratios undefined. Keep incompatible source definitions separate and state the limitation in plain language.

## Failure checks and safe claims

Do not equate platform-attributed conversion value with incremental revenue. Do not sum reach across audiences without deduplication. Do not call a missing value zero. Do not compare currencies without an approved exchange rate.

**References:** [Google Ads metrics](https://developers.google.com/google-ads/api/fields/v25/metrics); [GA4 Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema); [GA4 conversions and key events](https://support.google.com/analytics/answer/13965727?hl=en).
