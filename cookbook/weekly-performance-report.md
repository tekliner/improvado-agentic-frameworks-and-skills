# Create a weekly marketing performance report

**Question:** What changed during the completed week, and what needs investigation?

## Required inputs

- Daily approved data for the completed week and a comparable prior week.
- Account and channel list, business timezone, currency, metric definitions, and target if pacing is requested.
- Source links or export identifiers and last refresh times.

## Prompt

> Prepare a weekly paid-marketing performance report for the last completed Monday through Sunday in my stated timezone. Compare it with the previous complete week using the same account and metric scope. Show spend, impressions, clicks, conversions, and conversion value where available. Derive CTR, CPC, CPA, and ROAS from summed numerators and denominators. Identify the three largest material changes with their contributing channels or campaigns. Separate observations from possible explanations, and name the next read needed to test each explanation. Cite each source, its refresh time, and missing coverage. Do not invent targets or claim a change was caused by a campaign edit without change history.

## Agent steps

1. Fix exact start and end dates for both full weeks. Exclude the current partial week.
2. Retrieve daily rows and verify every expected account-date pair. Keep late conversion data visible.
3. Sum base metrics at each level before calculating rates. Compare absolute and percent changes; use "undefined" when the prior denominator is zero.
4. Rank changes by a user-approved materiality threshold or show the absolute ranking without labeling it material.
5. For each candidate explanation, inspect a relevant breakdown or change log. Report untested hypotheses as such.

## Output contract

Lead with a short summary. Include a week-over-week metric table, a channel contribution table, three evidence-linked findings, coverage and freshness notes, and follow-up reads. A finding includes observation, source, comparison, and confidence limit.

## Failure checks and safe claims

Do not combine unlike currencies or conversion actions. Do not convert correlation into cause. A missing prior week prevents a week-over-week claim. A recent week may have incomplete conversions.

**Reference:** [Google Ads reporting metrics and segments](https://developers.google.com/google-ads/api/fields/v25/overview); [GA4 attribution settings](https://support.google.com/analytics/answer/10597962?hl=en).
