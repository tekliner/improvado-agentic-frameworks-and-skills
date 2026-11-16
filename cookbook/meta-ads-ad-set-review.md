# Review Meta Ads ad set performance

**Question:** Which ad sets explain a change in Meta Ads results?

## Required inputs

- Authorized Meta Ads Insights at ad set level for comparable periods.
- Ad account currency and timezone, result event or action type, attribution setting, and data refresh time.
- Campaign and ad set status; optional change history and placement breakdown.

## Prompt

> Review ad set performance for the specified Meta Ads account over two complete periods. Confirm account, dates, currency, timezone, attribution setting, result event, and data freshness. Show spend, impressions, reach where available, clicks, and the selected result count or value. Derive rates from summed base measures. Rank ad sets by their contribution to the change in spend and the selected result. Inspect placement or campaign breakdown only where it helps explain a specific finding. State when results cannot be compared because settings or definitions differ. Cite source records. Do not edit campaigns or audiences.

## Agent steps

1. Retrieve only authorized data. Discover the currently supported API version and Insights fields through official documentation or the connected tool; do not hardcode a version from an old example.
2. Fix one result event and attribution setting for the comparison. Keep differently defined result rows separate.
3. Check pagination, account coverage, and full period completeness. Sum base measures before calculating rates.
4. Reconcile ad set sums with the account report. Investigate filters or reporting delay if they differ.
5. Identify largest contributors and inspect available change history before offering an explanation.

## Output contract

Include scope, result definition, ad set comparison table, contribution ranking, source and refresh time, reconciliation, and unresolved questions. State the requested event beside every result rate.

## Failure checks and safe claims

Reach may not add across ad sets because people can appear in multiple sets. Reported actions can change after the period due to attribution delay. Platform-attributed results do not prove incremental impact.

**Reference:** [Meta Marketing API documentation](https://developers.facebook.com/docs/marketing-apis/).
