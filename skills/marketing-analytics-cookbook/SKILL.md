---
name: marketing-analytics-cookbook
description: Use public, source-backed recipes to calculate marketing metrics, create weekly reports, investigate spend changes, and review Google Ads, Meta Ads, or GA4 without inventing data.
---

# Marketing analytics cookbook

Use this skill when a user asks an agent to explain or perform a marketing analytics task. The recipes live in the [public cookbook](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/tree/master/cookbook). Read the matching recipe before using tools.

## Quick start

1. Select the matching recipe from the table below.
2. Confirm the account, period, timezone, currency, metric and conversion definitions, and authorized data source.
3. Discover connected tool capabilities and current schemas. Never guess endpoint names, field mappings, API versions, or account IDs.
4. Retrieve the minimum needed data. Preserve source links or query identifiers and refresh times.
5. Run the recipe's calculation, reconciliation, and failure checks.
6. Return the recipe's output contract, with observed facts separate from hypotheses and unavailable data.

| Request | Recipe |
| --- | --- |
| ROAS by channel | [Cross-channel ROAS](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/cross-channel-roas.md) |
| Weekly report | [Weekly performance report](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/weekly-performance-report.md) |
| Unexpected spend | [Spend anomaly](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/spend-anomaly.md) |
| Google Ads campaign performance | [Google Ads campaign review](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/google-ads-campaign-review.md) |
| Meta Ads ad set performance | [Meta Ads ad set review](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/meta-ads-ad-set-review.md) |
| GA4 traffic and key events | [GA4 acquisition review](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/ga4-acquisition-review.md) |
| Metric definitions | [Metric glossary](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/cookbook/metric-glossary.md) |

If live platform data is requested through Improvado Discovery, read the [Discovery API skill](https://github.com/tekliner/improvado-agentic-frameworks-and-skills/blob/master/skills/discovery-api/SKILL.md). If the connector or data is unavailable, give the user the precise missing input and stop the unsupported calculation. Analysis is read-only unless the user explicitly authorizes an external action.
