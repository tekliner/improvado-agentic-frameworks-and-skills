# Healer — Dead Extract (no pipeline / 0 rows)

When `getConnectionsTool` reports a connection as `live` but a Phase A probe shows **HTTP 200 + `data: []`**, OR an explicit "no extract configured" signal, the connector exists but no data is flowing. Distinct from `auth_error` (handled by the sibling healer).

## Decision

v4 is **Discovery API only** — no ClickHouse fallback. So a dead pipeline does not gate the audit; we DON'T run extracts. We mark the channel BLOCKED with a specific reason and surface the fix in the audit-paper.

The historic alternative — auto-trigger `runExtractTool` to start a pipeline — is intentionally NOT in v4. Reasons:
1. Discovery probes hit the live ad-platform API directly; they don't need a warehouse pipeline.
2. Triggering an extract on the user's behalf is a side-effect with billing/cost implications.
3. The 2026-05-08 Andrey audit showed Facebook with 0 ClickHouse rows AND working Discovery — pipeline status is orthogonal to whether we can audit.

## When we still emit `dead_extract` BLOCKED

Three concrete signatures:

| Signature | Why we BLOCK rather than retry |
|---|---|
| Discovery returns HTTP 200 with empty `data: []` for the account-list endpoint | The token works but the connector has no accounts mapped — the user's connection points at an empty MCC / business manager. |
| Discovery returns 200 but the spend-bearing endpoint (insights / GAQL search) is empty for the audit window | The accounts exist but produced no data in the last 30 days. Could be intentional (paused account) or a configuration gap. We surface as BLOCKED + observed fact, not FAIL. |
| Connector is `live` but the per-platform pre-flight gotcha fires (Reddit alias, LinkedIn connector-pick) | The connection picker resolved the wrong connector. Phase A retries with the corrected alias before declaring BLOCKED. |

## BLOCKED-finding shape

```json
{
  "rule_id": "T0-PIPE-EMPTY",
  "text": "Facebook Ads — connection live but no accounts/spend in the audit window. Reconnect with the right Business Manager OR check that campaigns ran in the last 30 days."
}
```

Surfaced in the audit-paper's `blockeds` list with a fix sentence. **No retry loop, no extract trigger.** The audit completes for the other channels.

## Why this is BETTER than the v3.x ClickHouse fallback

v3.x treated "ClickHouse 0 rows" as a strong signal to BLOCK the platform — but the Andrey audit caught the agent treating it as authoritative when Facebook had 7 active ad accounts, just not surfaced through a configured extract. Discovery API would have seen them. v4 trusts the platform API, not the warehouse.

## Future work (NOT v4)

- A separate `/business-intelligence-editor` flow could optionally trigger a `runExtractTool` for users who want warehouse data alongside the audit. This belongs in a new "warehouse-onboarding" skill, not the audit.
- A "ping the connection owner" healer (Slack/email) — out of scope.
