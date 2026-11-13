# Review acquisition in GA4

**Question:** How did traffic and key events change by acquisition channel?

## Required inputs

- Authorized GA4 property data for two comparable, complete periods.
- Property timezone, selected acquisition dimension, event or key event name, filters, and data refresh time.
- A clear choice between session acquisition and user acquisition.

## Prompt

> Compare acquisition for the specified GA4 property across two complete periods. State whether this is session acquisition or user acquisition, and name the exact dimension and key event. Show sessions or users, the chosen key event count, and the derived rate by channel where the metric combination is valid. Use the same property, filters, identity settings, and date boundaries in both periods. Cite the report or query, refresh time, and coverage. Explain any mismatch with ad-platform conversions using attribution and event definitions. Do not describe a GA4 key event count as paid-platform revenue or causally credit a channel without supporting analysis.

## Agent steps

1. Select a dimension and compatible metrics using the current GA4 Data API schema or an approved export. Do not substitute one dimension for another.
2. Verify property timezone and complete dates. Keep totals and channel-level results from the same report configuration.
3. Calculate rate as selected key events divided by the relevant sessions or users, only when that denominator matches the question.
4. Compare channel changes and inspect landing page or campaign breakdowns for specific shifts.
5. Describe attribution settings and reporting lag when comparing GA4 with ad-platform data.

## Output contract

Include property scope, dimension, key event, period, source, refresh time, channel table, formula, top changes, and unresolved mismatches. Mark unavailable metrics as unavailable.

## Failure checks and safe claims

GA4 key events and Google Ads conversions can have different settings and uses. Session and first-user acquisition answer different questions. A changed channel mix is an observation, not a causal explanation.

**Reference:** [GA4 Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema); [GA4 key events and conversions](https://support.google.com/analytics/answer/13965727?hl=en).
