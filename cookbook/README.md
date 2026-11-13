# Marketing analytics cookbook for AI agents

These recipes show an agent how to answer common marketing questions with traceable data. They work with authorized exports or connected tools, including Improvado MCP where available. They do not require access to Improvado's internal systems.

| Question | Recipe |
| --- | --- |
| What was our return on ad spend across channels? | [Cross-channel ROAS](cross-channel-roas.md) |
| What changed last week? | [Weekly performance report](weekly-performance-report.md) |
| Did spend change unexpectedly? | [Spend anomaly investigation](spend-anomaly.md) |
| Which Google Ads campaigns need review? | [Google Ads campaign review](google-ads-campaign-review.md) |
| Which Meta Ads ad sets need review? | [Meta Ads ad set review](meta-ads-ad-set-review.md) |
| How do GA4 sessions and key events change? | [GA4 acquisition review](ga4-acquisition-review.md) |
| What do the metrics mean? | [Metric glossary](metric-glossary.md) |

## How to use a recipe

1. Give the agent access only to approved data for the requested accounts.
2. State the period, timezone, currency, account scope, and conversion definition.
3. Paste the recipe's prompt into your agent. Supply an export or authorize its existing connector.
4. Check the output's source, retrieval time, coverage, formulas, and unknowns before acting.

A connected agent should inspect available tools and schemas before calling them. It must not guess endpoint names, API versions, account IDs, or field mappings. The [Discovery API skill](../skills/discovery-api/SKILL.md) documents one supported route for one-time live platform reads; scheduled reporting needs an approved recurring data pipeline.

These are analysis recipes. They do not authorize campaign changes, data writes, or messages to other people. Platform figures can disagree because conversion definitions, attribution windows, timezones, currencies, and reporting freshness differ. Preserve those differences in the output.
