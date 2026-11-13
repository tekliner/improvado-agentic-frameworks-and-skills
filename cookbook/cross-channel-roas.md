# Calculate cross-channel ROAS

**Question:** How much tracked conversion value did each paid channel return per unit of spend?

## Required inputs

- Approved spend and conversion-value data by date, channel, and account for the same requested period.
- Currency for every account; an approved exchange-rate table if currencies differ.
- The conversion action, value source, attribution window, timezone, and data refresh time for every source.
- A documented rule for deduplicating conversion value across platforms, if a blended total is requested.

## Prompt

> Calculate ROAS for the requested period by paid channel. Use only the approved data I provide or tools I authorize. First list the exact source, account, date range, timezone, currency, conversion-value definition, attribution window, and refresh time for each channel. Compute channel ROAS as conversion value divided by spend. Show a blended ROAS only if conversion value is deduplicated and comparable across channels; otherwise show channel figures and explain why no valid blended total exists. Include the underlying sums, formula, coverage gaps, and links or identifiers for the source records. Do not estimate missing values or recommend budget changes from ROAS alone.

## Agent steps

1. Resolve authorized accounts and retrieve daily rows. Keep platform-native metrics separate from GA4 or CRM value.
2. Confirm complete dates, matching currencies, consistent spend units, and nonnegative amounts. Convert currency only with an approved rate and date.
3. Sum spend and value before dividing. Never average daily or campaign ROAS ratios.
4. Reconcile totals against each source's aggregate report. Mark incomplete or delayed rows.
5. Present channels separately. Compute a blended figure only under the supplied deduplication rule.

## Output contract

A table with channel, spend, conversion value, ROAS, currency, period, source, refresh time, and coverage status. Follow it with calculation notes and unresolved discrepancies. If spend is zero, ROAS is undefined.

## Failure checks and safe claims

Missing conversion value means ROAS is unavailable, not zero. Platform-attributed values may overlap across channels. A higher ROAS is an observed reporting result, not proof that a channel caused more incremental revenue.

**Reference:** [Google Ads metrics](https://developers.google.com/google-ads/api/fields/v25/metrics), including conversion value per cost and cost in micros; [GA4 conversion and key event differences](https://support.google.com/analytics/answer/13965727?hl=en).
