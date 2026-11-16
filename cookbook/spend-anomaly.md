# Investigate a spend anomaly

**Question:** Did spend depart from its normal pattern, and where did the change occur?

## Required inputs

- Daily spend by account, channel, and campaign for the investigation window and a comparable baseline.
- Timezone, currency, budget or planned-spend context, and data refresh time.
- Optional change history, billing status, and campaign status if available.

## Prompt

> Check whether paid-media spend on the specified date or week differs from a comparable baseline. Use only approved source data. State the baseline method before judging the change. Show actual spend, baseline spend, absolute difference, percent difference where defined, and the campaigns contributing most. Check completeness, currency, reporting delay, weekday and seasonality effects, and known budget or status changes. Classify each finding as observed change, explained change, or unexplained change. Provide source links and a specific next check. Do not call an anomaly "waste" or recommend changing budgets without outcome data and authorization.

## Agent steps

1. Choose a baseline of comparable weekdays or complete weeks. Record exclusions such as holidays or promotions if supplied.
2. Reconcile aggregate spend with campaign rows and verify that both windows use the same account scope and currency.
3. Compute difference as actual minus baseline. If baseline is zero, show an absolute change without a percent.
4. Attribute the aggregate difference to campaigns by their individual spend differences. Confirm their sum matches the aggregate change.
5. Review available change history and outcome metrics. Treat temporal proximity as a clue, not causal proof.

## Output contract

Include date, baseline method, actual, baseline, difference, percent difference, top contributors, coverage status, possible explanations with evidence, and next checks. Report any failed reconciliation.

## Failure checks and safe claims

A delayed or partial extract can mimic a drop. Account currency and timezone mismatches can mimic a spike. Spend alone does not show campaign quality or incremental effect.

**Reference:** [Google Ads reporting fields](https://developers.google.com/google-ads/api/fields/v25/overview), including date segments and cost.
