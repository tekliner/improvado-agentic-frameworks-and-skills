# Healer — Auth Expired (per-platform re-auth nudges)

When `getConnectionsTool` returns `auth_error` for a platform, the v4 skill emits ONE concise inline assistant message (no chat narration, no skill jargon) with a deep link to the workspace's reconnection page. Then it issues a single Discovery probe; if the probe returns 200 within **10 s**, the channel is marked **healed** and gets full audit treatment. Otherwise the channel exits Phase A with `BLOCKED — auth_error`.

The skill does **not** auto-reauth on the user's behalf — OAuth flows require a real human click, and impersonating that would be both technically broken and ethically wrong.

## Per-platform deep-link templates

Substitute `{workspace_id}` from `createImpersonationContext`. Each URL drops the user directly into the Improvado reconnection screen for that data source.

| Platform | Reconnect URL | Owner-attribution hint |
|---|---|---|
| `google_ads_ql` | `https://report.improvado.io/create_data_source_connection/google_ads_ql/?workspace={workspace_id}` | Often the agency-OAuth owner — `getConnectionsTool` response `connection.account_name` is the human to ping. |
| `facebook` | `https://report.improvado.io/create_data_source_connection/facebook/?workspace={workspace_id}` | Often the marketing manager who authed the Business Manager. |
| `linkedin_ads` | `https://report.improvado.io/create_data_source_connection/linkedin_ads/?workspace={workspace_id}` | LinkedIn tokens expire frequently (~30-day cycle). The 2026-05-08 Andrey audit caught Roman Vinogradov's connection auth-expired — common pattern. |
| `tiktok_ads` | `https://report.improvado.io/create_data_source_connection/tiktok_ads/?workspace={workspace_id}` | TikTok For Business OAuth holder. |
| `reddit` | `https://report.improvado.io/create_data_source_connection/reddit/?workspace={workspace_id}` | Reddit Ads campaign owner. Note: data source name is `reddit` on both lisbon AND montana, NOT `reddit_ads` (PLAYBOOKS § Reddit pre-flight gotcha). |
| `the_trade_desk_api` | `https://report.improvado.io/create_data_source_connection/the_trade_desk_api/?workspace={workspace_id}` | TTD seat-holder. Less frequent expiry. |

## Inline message template

```
{platform_label} authorization expired (connection "{connection.account_name}").
Re-auth in 60 seconds: {reconnect_url}
```

That's the entire message. No "I'll check back in 10 seconds." No "this is blocking the audit." No "please." Just the fact + the link. The user clicks, completes OAuth, the next probe-tick succeeds, the channel proceeds.

## Probe-after-message contract

After emitting the inline message, the skill issues ONE `discoveryRequestTool` probe specific to the platform (the same probe used in Phase A.5 to detect liveness). Wait up to 10 s for response.

- **200 within 10 s** → mark `healed`, continue to Phase B for this channel.
- **Still 401/403** → mark `blocked_with_reauth_pending`. Phase B skips this channel; Phase C surfaces it in the dashboard's blocked list with the reconnect link.
- **5xx / timeout** → emit `T0-DISCOVERY-TIMEOUT` BLOCKED finding (not auth-related).

## What healing does NOT do

- ❌ Try to refresh OAuth tokens server-side. Improvado's connector layer handles refresh tokens automatically; if a token has hit `auth_error`, the refresh chain has already failed.
- ❌ Drive Playwright/dev-browser through the reconnection UI. The skill runs server-side per-turn; even if it could open a browser, the OAuth redirect would land in a context the user can't see.
- ❌ Page on Slack / send email. Future work — not v4 scope.

## Idempotence

The healer's deep-link URL is deterministic given `(platform, workspace_id)`. Re-running the audit after a successful re-auth produces a healed Phase A on the second pass — same audit input, same audit output (per the skill's idempotence rules).
