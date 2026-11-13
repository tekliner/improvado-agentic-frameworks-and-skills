# Review Google Ads campaign performance

**Question:** Which campaigns explain a change in Google Ads performance?

## Required inputs

- Authorized campaign-level Google Ads metrics for two complete, comparable periods.
- Account currency, timezone, conversion actions included in the report, and data refresh time.
- Campaign status and change history if a change explanation is requested.

## Prompt

> Review the specified Google Ads account's campaign performance for two complete periods. First confirm the account, dates, timezone, currency, conversion definition, and source freshness. Show campaign spend, impressions, clicks, conversions, conversion value, CTR, CPC, CPA, and ROAS where defined. Rank campaigns by contribution to the account-level spend and conversion-value changes. Separate Search, Performance Max, and other campaign types when their behavior differs. Flag incomplete data and plausible areas to inspect. Use campaign change history before suggesting that an edit explains a shift. Provide source identifiers and do not change campaigns.

## Agent steps

1. Use an authorized export or a connected tool. For live Discovery reads, follow the [Discovery API skill](../skills/discovery-api/SKILL.md): discover the current API version and supported fields before requesting data.
2. Normalize Google Ads cost in micros to account currency units where relevant. Avoid treating a conversion value field as cash revenue without checking its definition.
3. Sum campaign rows to the account total. If they differ, resolve filters, deleted campaigns, and reporting lag.
4. Compute rates from summed base metrics and identify the campaigns driving changes.
5. Check change history only for the identified campaigns; label explanations unverified until supported.

## Output contract

Include an account summary, campaign comparison table, three evidence-linked findings, reconciliation result, and next checks. Each finding cites campaign, metric, period, and source.

## Failure checks and safe claims

Zero conversions make CPA undefined. Zero spend makes ROAS undefined. Google Ads attributed conversion value may differ from GA4 or CRM value because attribution and conversion settings differ.

**Reference:** [Google Ads report field catalog](https://developers.google.com/google-ads/api/fields/v25/overview); [Google Ads metric definitions](https://developers.google.com/google-ads/api/fields/v25/metrics).
