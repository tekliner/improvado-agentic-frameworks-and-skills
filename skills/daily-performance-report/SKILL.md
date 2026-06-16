---
name: daily-performance-report
description: Generate a Daily Performance Console — multi-channel operational dashboard for performance marketers. Blended KPI strip (Spend / Impressions / Clicks / CTR / Conversions / CPA / CR / ROAS), per-channel split with health flags, universal trend chart with date / metric / channel filters, and three tabs (Warnings / Recommendations / Monthly Pacing). Discovery API only, all data live. Built via /business-intelligence-editor as ONE custom-component widget that contains the entire console.
version: "2.0.1"
---

# Daily Performance Console

## Purpose

Produce a daily operational dashboard for performance marketers running multi-platform paid media. Single-screen, blended-then-drilled, action-oriented:

- **Glance KPI strip** — 8 blended metrics with DoD deltas + MTD pacing flags.
- **Per-channel split** — health card per platform (spend, daily avg, ROAS, CPA, plan-pct meter).
- **Revenue progress bar** — current vs monthly plan, EOM projection, variance.
- **Universal trend chart** — line chart with three filter dropdowns (Granularity / Metric × 1–2 / Channels) + date-range picker.
- **Tabs** — Warnings (cap-exhaustion, CPA spikes, ad-disapprovals), Recommendations (3 actionable cards), Monthly Pacing (channel-stacked bar).

The console is **operational** (read 5–20× per day, act on warnings within hours), not a brief or a deck. Sharing happens via dashboard URL or screenshot — there is no Slack-ready text artifact.

*Derived from Marketing OS use-case UC-DPA-1 v2.1 (Daily Performance Console). Canonical visual contract lives in the Improvado Obsidian vault and is mirrored as the HTML in Appendix A below — that HTML is the single source of truth for the widget structure.*

This skill **replaces v1.0.0** (the prior tactical Slack-brief format). The XML `<analytics><changes><actions>` artifact and "VP-of-Marketing voice" are deprecated. v2.0.0 ships a dashboard.

---

## Invocation Context

Two trigger paths feed this skill:

### Path A — ALG dispatch (post-onboarding, new users)

**Company personalization:** if the dispatch message carries an `alg-prebrief` fenced block with a `company_research:` line, tailor exactly ONE headline/intro sentence in the closing chat hand-off to this company — always hedged ("looks like…"), never as a fact. If absent, proceed generically.

When invoked via `/alg-onboarding` §3.6 dispatch, the conversation contains an `onboarding_summary` message with `Interview answers:`. Scan those answers for **bias signals**:

- **Role**
  - `marketer` / `performance-marketer` → operator voice; KPI strip surfaces all 8 metrics; Warnings tab is the default landing tab; Recommendations card severity emphasised
  - `cmo-director` / `c-level` → executive voice; subtitle prepends a one-line summary of pacing + top warning; default tab is **Monthly Pacing** instead of Warnings
  - `analyst-bi` → analyst voice; Universal trend chart pre-selects two metrics (CPA + ROAS) so the dual-axis is visible from first paint; warnings + recos shown but de-emphasised
- **Reconciled metrics** — if `ROAS` / `CPA` listed as primary, pre-pin those as the default Universal-chart metrics (overrides default `spend`)
- **AI wish** — if mentions "what's wasting money" / "wasted spend", auto-open the **Action needed** recommendation card; if mentions "pacing" / "vs plan", default tab → Monthly Pacing
- **Reporting cadence** — if mentions "daily standup" / "morning review", set auto-refresh suggestion to weekday-mornings; if "weekly review", suggest weekly cadence

### Path B — Free-form chat (returning users, repeat use)

User asks naturally — "give me today's report", "what's running today", "show me the daily numbers", "where am I vs plan". No `onboarding_summary`; use defaults (Warnings tab open, Spend selected in chart, all channels visible).

---

## When to Trigger

User asks for any of:

- "daily report", "daily performance", "daily KPI report"
- "daily console", "daily dashboard", "show me my numbers"
- "what's running today", "what changed this week"
- "send me the daily numbers", "leadership-ready report"
- "where am I vs plan", "pacing dashboard"
- "send to leadership", "daily VP brief"
- "tuesday vs tuesday", "drill into <channel>"
- "spend ROAS CPA today", "week over week performance"

If the user instead asks for **funnel-stage / executive cross-channel narrative** ("CMO dashboard", "Awareness vs Consideration vs Purchase", "where is my money going across the funnel") — fall back to a different skill (CMO Cross-Channel Dashboard, separate UC).

If the user wants an **ad-hoc single-channel chart** ("show me Meta spend chart") — use `/business-intelligence-editor` directly with the relevant single-source widget; do NOT invoke this skill.

If the user wants an **exhaustive rule-quality scorecard** with per-rule $-at-risk — invoke the audit-orchestrator skill instead.

---

## Output Mode

```
DEFAULT → Mode B: Dashboard via /business-intelligence-editor (ONE custom-component widget)
IF user explicitly says "document" / "markdown" / "deck" → Mode A: createDocument fallback
IF user asks for one chart → Mode C: visualizationTool (single chart in chat)
```

### Mode B: Dashboard (DEFAULT)

Use `/business-intelligence-editor` skill with **ONE** `custom-component` widget. The entire console (KPI strip, channel split, universal chart, tabs, warnings, recommendations, pacing) lives inside that single widget — its `componentCode` is the canonical HTML from Appendix A with Discovery API data substituted at the marked INJECT points.

**This is the load-bearing pattern.** Do NOT decompose the console into multiple BI widgets (KPI tile widget + chart widget + table widget — that breaks the visual contract). The console is ONE atomic widget.

If `/business-intelligence-editor` is unavailable at runtime, **degrade to Mode A** with a one-line note ("Saved as a document — dashboard skill not available right now.").

### Mode A: Document (fallback)

Use `createDocument`. Markdown report with:
- KPI table (8 metrics × today / DoD / MTD / pacing flag columns)
- Channel split table
- Warnings list
- Recommendations list with $-impact

No HTML, no charts. This mode is the v1-style deliverable — kept only as a fallback when the dashboard mode is unavailable.

### Mode C: Quick Visualization (single chart)

Use `visualizationTool` for a single chart in chat. Useful when user asks "just show me spend trend by channel". Skip the dashboard / document; return one chart with the requested metric × channel × granularity.

### Auto-Refresh Strategy

The console is a point-in-time snapshot — but the natural cadence is daily. After save, offer:

> "Want me to refresh this dashboard every morning at 9 AM with the latest 24h of data?"

If yes → `scheduleChatTool` re-runs the skill daily at 09:00 user-local. Each run pulls a fresh 30-day rolling window for the chart and refreshes today's KPI / warnings / recos.

If user mentions "weekly review" in onboarding → suggest Monday morning cadence instead.

---

## MCP Tools Used

- `discoveryListConnectorsTool` — find ad-platform connectors per workspace
- `discoveryListAccountsTool` — resolve ad accounts when >1 per platform (use § 0.1 account-selection rule from Marketing OS — ask user if >5)
- `discoveryRequestTool` — fetch all KPI / channel / daily-trend / drill data (Rule 0 — see below)
- `clickhouseTool` — **NOT used by default**; only as fallback for 28-day σ-baseline computations if the channel's API doesn't expose history
- `getCurrentWorkspaceContextTool` — workspace name + ID for header
- `getConnectionsTool` — enumerate active marketing platforms (without `datasourceName` filter)
- `/business-intelligence-editor` skill — Mode B dashboard save
- `createDocument` — Mode A fallback
- `visualizationTool` — Mode C single chart
- `scheduleChatTool` — daily auto-refresh

For ClickHouse-fallback table coverage (rare path, only when API history is unavailable), see `discovery-api/marketing-platforms-reference.md` in this repo.

---

## Rule 0 — Discovery API mandatory for ALL data queries (HARD)

**EVERY data query for this skill MUST go through `discoveryRequestTool`.** No exceptions. No fallbacks to `clickhousePalantirTool` for marketing data, no direct SDK calls, no local API keys, no scraped CSVs.

This applies to:
- All per-channel KPI fetches (Meta `/insights`, Google `searchStream`, TikTok `/report/integrated/get/`, LinkedIn `/rest/adAnalytics`, Pinterest `/v5/.../analytics`, etc.)
- 28-day σ-baseline windows (use API where available; ClickHouse fallback table only if the platform doesn't expose history)
- DoD comparison data (today vs same-day-last-week)
- MTD pacing aggregates
- Channel split metrics
- Universal-chart custom date ranges
- Warning-source data (search-term reports, asset-group breakdowns, ad-disapproval lists)
- Recommendation evidence (creative CTR-decay curves, IS-lost ratios)

**Flow:** `getAvailableClusters` → `createImpersonationContext` → `discoveryListConnectorsTool(dataSource=<channel>)` → `discoveryRequestTool(connectionId, method, path, body_data)`.

If a connector is missing — surface honestly: *"No active connection for `<channel>` in this workspace. Connect it at <link> to populate this section."* Do **NOT** mock data; do **NOT** fall through to other sources.

---

## Output Contract (HARD)

**The result of this skill is the canonical widget HTML (Appendix A) with every INJECT point filled by Discovery API data — NOT the canonical alone, NOT the data alone, NOT regenerated HTML.**

Two pieces, atomically combined:

```
  ┌────────────────────────┐      ┌──────────────────────────┐
  │ Canonical widget HTML  │      │ Discovery API responses  │
  │ (Appendix A)           │  +   │ (per § Discovery Mapping)│
  │ — fixed structure      │      │ — live workspace data    │
  │ — INJECT markers       │      │                          │
  │ — visual contract      │      │                          │
  └─────────┬──────────────┘      └────────────┬─────────────┘
            │                                  │
            └────────────► SUBSTITUTE ◄────────┘
                                │
                                ▼
                  ┌─────────────────────────────┐
                  │ Filled HTML → componentCode  │
                  │ for ONE custom widget        │
                  │ → /business-intelligence-    │
                  │   editor save                │
                  └─────────────────────────────┘
```

**The deliverable is NEVER:**
- The canonical alone (placeholders show literally — broken UI).
- A new HTML written from scratch (regeneration breaks visual fidelity).
- Data without the canonical (no UI to deliver).
- Canonical filled with mocked or static data (violates Rule 0).

---

## Quick Reference

- **Channels supported:** Google Ads, Meta, TikTok, Pinterest, LinkedIn, Reddit, The Trade Desk (any active Discovery API ad-platform connector). The widget chip row + KPI blend adapt to whatever is connected. **Minimum:** 2 active channels (else fall back to single-channel ad-hoc chart).
- **8 KPIs (in this fixed order):** Spend, Impressions, Clicks, CTR, Conversions, CPA, CR, ROAS.
- **Universal chart:** 1–2 metrics × 1–N channels × Daily/Weekly/Monthly granularity × custom date range. If 2 metrics — secondary y-axis, secondary line dashed.
- **Tabs:** Warnings (default) / Recommendations / Monthly Pacing.
- **Recommendations:** exactly **3 cards**, ranked by `|$-impact|`. Below threshold (<7 days data, <30 conversions, <$500 spend) — drop the candidate.
- **Visual chrome:** product chrome (Inter typography, indigo `#4F46E5` accent). NOT client-branded. No Brandfetch, no per-client palette.

---

## STEP 0: Workspace + Connection Detection

```
0A. Resolve workspace context
    ws = getCurrentWorkspaceContextTool(impersonation_context_id)
    → workspace_name, workspace_id

0B. Enumerate active ad-platform connections
    all_conns = getConnectionsTool(impersonation_context_id)  # no datasourceName filter
    active = [c for c in all_conns if c.is_active and c.data_source in MARKETING_PLATFORMS]
    by_ds = group_by(active, key=c.data_source)

0C. Connection count gate
    IF len(by_ds) < 2:
        Surface: "Daily Performance Console requires ≥2 active ad-platform connections. You have {N}.
                  Connect another platform, or use a single-channel chart instead."
        STOP — fall back to Mode C single-channel.

0D. Account selection per channel
    FOR each channel in by_ds:
        accounts = discoveryListAccountsTool(connectionId=channel.id)
        IF len(accounts) > 5:
            Ask user which account(s) to include (don't pick blindly — § 0.1 rule).
        IF len(accounts) ≥ 2 and ≤5:
            Use highest-spend account by default; surface choice in subtitle.
        IF len(accounts) == 1:
            Auto-select.
```

---

## STEP 1: Fetch Per-Channel Data (Discovery API parallel calls)

Run in parallel for every active channel. Each channel returns:
- Today's metrics (last 24h close)
- Same-day-last-week metrics (for DoD delta)
- MTD aggregates
- 30-day daily series (for chart granularity)
- Drill-deep data (search-term reports, asset-group breakdowns, ad-disapproval lists — only fetched when warnings/recos generation needs them)

### Google Ads — `googleAds:searchStream` via `discoveryRequestTool`

```
GAQL: SELECT
  segments.date,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.ctr,
  metrics.average_cpc,
  metrics.conversions,
  metrics.conversions_value,
  metrics.value_per_conversion,
  metrics.search_impression_share,
  metrics.search_budget_lost_impression_share
FROM customer
WHERE segments.date BETWEEN '<date_start>' AND '<date_end>'

# For warnings drill-deep: search_term_view, asset_group_performance_view, etc.
```

### Meta — `/v23.0/act_<id>/insights`

```
fields: spend, impressions, clicks, ctr, frequency, actions, action_values, purchase_roas
level: account
time_increment: 1
date_preset: custom
since: <date_start>, until: <date_end>

# For warnings drill: level=ad_set or level=ad with breakdowns
```

### TikTok — `/v1.3/report/integrated/get/`

```
data_level: AUCTION_ADVERTISER
dimensions: ['stat_time_day']
metrics: [spend, impressions, clicks, ctr, conversion, cost_per_conversion,
          complete_payment_value, complete_payment_roas]
start_date: <date_start>
end_date: <date_end>
```

### LinkedIn — `/rest/adAnalytics?q=analytics`

```
pivot: ACCOUNT
timeGranularity: DAILY
fields: spend, impressions, clicks, costInUsd, oneClickLeads, externalWebsiteConversions
dateRange: { start: ..., end: ... }
```

### Pinterest — `/v5/ad_accounts/<id>/analytics`

```
granularity: DAY
columns: SPEND_IN_DOLLAR, IMPRESSION_1, CLICKTHROUGH_1, CLICKTHROUGH_RATE,
         TOTAL_CONVERSIONS, COST_PER_CONVERSION, TOTAL_CONVERSION_VALUE_IN_DOLLAR
start_date: ..., end_date: ...
```

### Per-channel timeout

8s per channel. If a channel times out → fail that channel, continue others. Surface in topbar: `"Live · 12:08 UTC — Pinterest delayed (retry 12:13)"`. Do NOT mock; render `—` for missing channel cells.

---

## STEP 2: Compute Derived Fields

After parallel fetch:

```
2A. Blended KPIs (top strip, 8 metrics)
    today_spend     = SUM channel.today.spend across channels
    today_impr      = SUM channel.today.impressions
    today_clicks    = SUM channel.today.clicks
    today_ctr       = today_clicks / today_impr * 100
    today_conv      = SUM channel.today.conversions
    today_cpa       = today_spend / today_conv if today_conv > 0 else null
    today_cr        = today_conv / today_clicks * 100 if today_clicks > 0 else null
    today_revenue   = SUM channel.today.conversion_value
    today_roas      = today_revenue / today_spend if today_spend > 0 else null

    # Same for MTD aggregates (replace today.* with mtd.*)
    # Same for last-week-same-day (for DoD delta)

    DoD_delta(metric) = (today.metric - last_week.metric) / last_week.metric * 100
    # Use 'pp' (percentage points) for CTR, CR. Use '×' for ROAS.

2B. Pacing flags per metric
    pct_elapsed = days_elapsed_in_month / days_in_month * 100
    mtd_pct = mtd.metric / plan.metric * 100  # uses biz_workspace_plans
    deviation_pct = mtd_pct - pct_elapsed
    flag = 'ok' if abs(deviation_pct) ≤ 5
           else 'warn' if abs(deviation_pct) ≤ 15
           else 'over'

    EOM_projection = mtd.metric / pct_elapsed * 100   # linear extrapolation

2C. Channel split objects (per-channel cards)
    For each channel:
        mtd_spend = MTD spend
        daily_avg = mtd_spend / days_elapsed
        plan      = biz_workspace_plans.channel_spend_plans[channel] OR Edit-plan modal
        share     = mtd_spend / total_mtd_spend * 100
        roas, cpa = MTD-aggregated
        health    = 'ok' if (ROAS ≥ target AND CPA ≤ target)
                    else 'warn' if one missed
                    else 'bad' if both missed OR CPA >150% target
        note      = derived 1-liner from health + dominant signal

2D. Warnings — rule-based scan over fetched data
    See § "Warnings rule library" below.

2E. Recommendations — rule-based candidate generator + $-impact ranking
    See § "Recommendations rule library" below. Cap at 3.

2F. Pacing-block aggregation
    MTD_total_spend  = SUM channel.mtd_spend
    Plan_total_spend = SUM channel.plan
    EOM_proj_spend   = MTD_total_spend / pct_elapsed
    Variance         = (EOM_proj_spend - Plan_total_spend) / Plan_total_spend * 100

2G. Revenue progress bar
    rev_current  = SUM channel.mtd.conversion_value
    rev_plan     = biz_workspace_plans.revenue_plan OR Edit-plan modal
    rev_pct      = rev_current / rev_plan * 100
    rev_proj     = rev_current / pct_elapsed
    rev_proj_class = 'good' if rev_proj ≥ rev_plan
                     else 'warn' if rev_proj ≥ rev_plan * 0.95
                     else 'bad'
```

---

## STEP 3: Discovery API → INJECT-marker mapping

This is the **CONNECTING CONTRACT** between Appendix A's INJECT markers and live data. For every INJECT point, the source endpoint + transformation + format.

### Inline placeholders ({{INJECT:name}})

| Marker | Source | Transformation → Format | Example |
|---|---|---|---|
| `workspace_name` | `getCurrentWorkspaceContextTool()` | `.workspace_name` | `Apex Outdoors` |
| `workspace_id` | same | `.workspace_id` | `wkspc-7892` |
| `updated_at` | system clock (UTC) | `HH:mm UTC` | `12:08 UTC` |
| `period_label` | derived from selected range | `<MMM YYYY>` of start_date | `May 2026` |
| `day_counter` | derived from `now()` + month length | `Day {dom} of {dim} · {pct}% elapsed` | `Day 4 of 31 · 13% elapsed` |
| `date_range_label` | from date-picker state | `<MMM D> – <MMM D>` | `Apr 4 – May 4` |
| `date_start`, `date_end` | from date-picker | ISO `YYYY-MM-DD` | `2026-04-04` |
| `rev_current` | per-channel revenue (per Step 1 + 2G) | SUM, format `$N,NNN` | `$58,272` |
| `rev_plan` | `biz_workspace_plans.revenue_plan` ← OR ← Edit-plan modal | format `$NNN,NNN` | `$500,000` |
| `rev_pct` | `(rev_current / rev_plan) × 100` | 1 decimal `N.N%` | `11.7%` |
| `rev_proj_label` | `(rev_current / pct_elapsed)` + delta vs plan | `↗ Proj $XK · ±N% above\|below plan` | `↗ Proj $564K · +12.7% above plan` |
| `rev_proj_class` | rule on projection vs plan | `good`/`warn`/`bad` | `good` |
| `rev_fill_pct` | `min((rev_current / rev_plan) × 100, 100)` | `N.NN%` | `11.65%` |
| `rev_today_pct` | `(today_dom / days_in_month) × 100` | `N.N%` | `13.0%` |

### Block: `channels_data` (JS const C — variable channel count)

For each active channel from `getConnectionsTool` filtered to ad-platforms, emit one entry:

```js
const C = {
  <key>: {
    name:       string,            // 'Google', 'Meta', 'TikTok', 'Pinterest', 'LinkedIn', 'Reddit'
    color:      string,            // canonical brand hex (Google #4285F4, Meta #0866FF, TikTok #000000, Pinterest #E60023)
    logo:       string,            // SVG symbol id 'logo-google' / 'logo-meta' / 'logo-tiktok' / 'logo-pinterest' (from <defs>)
    mtd_spend:  number,            // dollars MTD
    daily_avg:  number,            // dollars/day MTD
    plan:       number,            // monthly spend plan from biz_workspace_plans
    share:      number,            // % of total spend
    roas:       number,            // ROAS x
    cpa:        number,            // dollars
    health:     'ok'|'warn'|'bad',
    note:       string             // ≤30 chars
  }
};
```

### Block: `today_kpis` (JS const TODAY — 8 metrics, fixed order)

```js
const TODAY = {
  spend:       { v, d, dc, mtd, plan, flag, note },
  impressions: { v, d, dc, mtd, plan, flag, note },
  clicks:      { v, d, dc, mtd, plan, flag, note },
  ctr:         { v, d, dc, mtd, plan, flag, note },
  conversions: { v, d, dc, mtd, plan, flag, note },
  cpa:         { v, d, dc, mtd, plan, flag, note },
  cr:          { v, d, dc, mtd, plan, flag, note },
  roas:        { v, d, dc, mtd, plan, flag, note }
};

// v   = today's value, formatted ($N,NNN / N / N.NN% / N.NNx)
// d   = DoD delta string with sign (+12% DoD, −9% DoD, +0.14pp)
// dc  = 'up'|'down'|'cost-up'|'cost-down' (cost-* for spend, CPA where increase = bad)
// mtd = abbreviated MTD ($13.5K, 1.42M, 742)
// plan = abbreviated plan ($120K, 11.4M, 6,200)
// flag = 'ok'|'warn'|'over' (per Step 2B)
// note = ≤20-char pacing line ('Proj +9%', 'On track', '−9% target')
```

### Block: `daily_base` (per-channel daily series)

For real data, replace the synthetic `genDaily()` function in canonical with pre-fetched arrays:

```js
const DAILY = {
  google:    { spend: [...], impressions: [...], clicks: [...], ctr: [...],
               conversions: [...], cpa: [...], cr: [...], roas: [...] },
  meta:      { ... },
  tiktok:    { ... },
  pinterest: { ... }
  // any other connected channel
};
```

Each array length = `(date_end − date_start)` in days. The `aggregate()` function in canonical handles weekly/monthly rollups from the daily base.

### Block: `warnings_block` (rule-based scan)

| Rule | Trigger | Severity | API source |
|---|---|---|---|
| Daily-budget-cap exhaustion | projected exhaustion before EOD AND positive-ROAS campaign | `critical` | per-campaign `daily_budget` + cumulative `cost` for current day |
| CPA spike vs target | CPA > target +50% AND spend ≥ $500 in last 3 days | `high` | per-ad-group/ad-set CPA |
| Ad disapproval | any disapproved ad serving | `info` | platform ad-status field |
| Creative fatigue | CTR decline >30% AND creative age >7 days | `high` | per-creative CTR over last 14 days |
| IS lost to budget | Google `search_budget_lost_impression_share` >25% on positive-ROAS campaign | `high` | Google `searchStream` |

Cap at 6 visible warnings; surface top by severity then $-impact. Each → one `<div class="warning ...">` per Appendix A widget shape.

### Block: `recos_block` (3-card cap, $-impact ranked)

| Type | Trigger | $-impact computation |
|---|---|---|
| **Shift & scale** (`opportunity`) | Channel A: CPA >150% target AND ROAS < target; Channel B: daily-budget-capped >50% of last 30d AND ROAS > target × 1.5 | shifted_spend × (B.ROAS − A.ROAS) per week × 4 |
| **Pause** (`action`) | spend ≥ $500 over ≥5 days AND zero/near-zero conversions AND no recovery trend | weekly_spend × 4 (savings) |
| **Expand & test** (`test`) | Creative theme/audience: CTR ≥ 2× account avg AND share <30% | (target_share − current_share) × current_revenue / current_share |

Rank by **|$-impact|**, take top 3. **Calibration threshold:** require ≥7d data AND (≥30 conversions OR ≥$500 spend) on the drill entity. Below threshold → drop candidate.

### Block: `pacing_block` (channel-stacked bar)

Channel segments come from `channels_data`. Header numbers from § Step 2F.

### Block: `plan_modal` (Edit Plan defaults)

Source: `biz_workspace_plans` (TODO if not exists). Fields: spend_plan, conversions_plan, target_cpa, revenue_plan, target_roas, target_ctr.

---

## STEP 4: Build Custom Widget HTML

Take the canonical HTML from **Appendix A**. Find every INJECT marker. Substitute per Step 3 mapping.

```
For each {{INJECT:name}} placeholder:
    Find the literal string {{INJECT:name}} in canonical
    Replace with computed value (string)

For each block marker pair:
    // === INJECT: <name> ===
    <existing default content>
    // === END INJECT: <name> ===

    Replace the inner content with the computed JSON / HTML.
    KEEP the marker pair intact (so future regen can find them).
```

**HARD RULE:** if you find yourself writing `<style>` or restructuring `<div class="kpi">` — STOP. You are regenerating, not substituting. Re-load Appendix A and substitute only at marked points. The canonical is NEVER edited per-render.

After substitution, the entire HTML is ONE string — assign it as `componentCode` of a single `custom-component` widget.

---

## STEP 5: Save Dashboard via /business-intelligence-editor

Assemble dashboard config:

```json
{
  "dashboardTitle": "Daily Performance Console",
  "dashboardSubtitle": "{N_active_channels} channels | {date_range_label} | Updated {updated_at}",
  "dashboardUrl": "clients/template/dashboards/CrossChannelEditableDashboard.tsx",
  "isMenuItem": true,
  "defaultTimePeriod": "30",
  "editState": {
    "schemaVersion": 2,
    "appearance": {
      "hideTitle": true,
      "hideFilters": true,
      "colorMode": "light"
    },
    "widgets": [
      {
        "id": "main-grid-1",
        "widgetType": "custom-component",
        "componentCode": "<the entire substituted HTML from Step 4>"
      }
    ],
    "layout": {
      "items": [
        { "i": "main-grid-1", "x": 0, "y": 0, "w": 12, "h": 24 }
      ]
    }
  }
}
```

`appearance.hideTitle` + `hideFilters` + `colorMode: "light"` matches the precedent set by `weekly-creative-performance` v6 — the canonical owns its own header (workspace name + chips + date picker). The dashboard chrome would duplicate / conflict.

`dashboardUrl: "clients/template/dashboards/CrossChannelEditableDashboard.tsx"` — emit the canonical host-TSX path directly (precedent: `full-marketing-audit/dashboard-template.json:104` and `weekly-creative-performance/dashboard-template.json:112` v7.4.1+). The Miras viewer (`useRepoDashboardData` in `main/components/repo/hooks/useRepoDashboardData.ts:55`) reads `dashboard_url` verbatim as the file path on `/experimental/agent/api/repo/file?repo_id=dashboard&path=<dashboardUrl>`; emitting the canonical path here removes the slug→path indirection that previously depended on BIE skill-cli's `HARDCODED_DASHBOARD_URL` override (`skill-cli.ts:14`). Earlier drafts shipped the slug `"daily-performance"`; that worked only when the save flowed through skill-cli — any save that bypassed it (direct curl/fetch, pre-2026-01-30 PR #415 historical save, fixture/migration) wrote the slug into the DB and the viewer 404'd with `Failed to fetch repo file: 500` (`Dashboard file API 404 Not Found`). There is no `DailyPerformanceDashboard.tsx` host TSX — `CrossChannelEditableDashboard.tsx` renders this skill's dashboard via `settings_id`.

`appearance` and `schemaVersion` ride through BIE's schema via `.passthrough()`. `editState.widgets` and `editState.layout.items` are required by `DashboardConfigSchema`.

**Layout:** ONE widget covering full width × tall enough for the entire console (12 cols × ~24 rows in the BIE grid). The console is intentionally a single tall widget — there is NO second widget below it.

Save:

```
Skill('business-intelligence-editor') with the assembled JSON
# CLI form: npx tsx .claude/skills/business-intelligence-editor/skill-cli.ts save --config '<full_config_json>'
```

Open preview (always with `--production`):

```
python3 frontend-cli.py open-preview --production "clients/template/dashboards/CrossChannelEditableDashboard.tsx?settings_id={NEW_ID}"
```

Present to user with:
- Dashboard URL
- 1-line summary of what's surfaced (top warning + top reco)
- Auto-refresh suggestion (per § Auto-Refresh Strategy)

---

## STEP 6: Auto-Refresh Suggestion

After the user sees the dashboard, offer:

> *"Want me to refresh this every morning at 9 AM with last-24h numbers?"*

If yes → `scheduleChatTool` with cadence `weekday-09:00-user-tz` (or `daily-09:00` if onboarding said "every day"). Each scheduled run re-executes the skill: re-fetches Discovery API, re-substitutes Appendix A, overwrites the saved dashboard at the same `dashboardUrl`. Channel logos / palette / structure stay frozen — only the data churns.

If onboarding said "weekly review" → suggest Monday-09:00 instead of daily.

---

## Anti-patterns (HARD STOP if you find yourself doing these)

- **Regenerating HTML from scratch.** The canonical (Appendix A) is the source of truth. Only substitute at INJECT markers.
- **Decomposing the console into multiple BIE widgets.** Use ONE custom-component widget. Built-in KPI/chart/table widgets MUST NOT appear in the dashboard composition.
- **Querying data outside Discovery API.** Per Rule 0, every fetch goes through `discoveryRequestTool`. No `clickhousePalantirTool` for marketing data.
- **Applying client-brand resolution.** This is product chrome — fixed Inter typography + indigo `#4F46E5` accent. No Brandfetch, no client logo in header, no per-client palette.
- **Producing the v1 Slack-text artifact.** v1 deprecated. Sharing happens via dashboard URL or screenshot.
- **Stopping at campaign-level for warnings/recos.** Drill to keyword (search) / creative (social) / asset-group (PMax) / SKU (shopping) / line item (programmatic) / subreddit (Reddit).
- **More than 3 recommendations.** The 3-card cap is the value — forces $-impact selection.
- **Recommendations without $-impact.** Money-tied or skip.
- **Hedging in recommendations.** Forbidden: "may want to consider", "could potentially", "if applicable". Confident verbs only: "Pause", "Raise", "Cut", "Shift", "Expand".
- **Education in the brief.** "ROAS measures the return on ad spend..." — the audience knows. Skip the lecture.
- **Mocked or static data in production.** If Discovery API fails — surface the failure honestly with `—` placeholders + retry banner.
- **Editing dashboard chrome.** `hideTitle: true`, `hideFilters: true`, `colorMode: "light"` — required for visual contract.

---

## Tone Rules — scoped to Recommendations cards only

Apply to the 3 recommendation cards (NOT to KPI tiles, NOT to warnings — those are factual/structural):

- **Confident verbs only** — "Pause", "Raise", "Cut", "Shift", "Expand", "Pin". Not "consider pausing".
- **No hedging.** Forbidden: "may want to", "could potentially", "if applicable".
- **Money-tied or skip.** Each card's `.reco-impact` MUST show $-value (gain or savings). If you can't quantify, drop the card.
- **Calibration threshold:** ≥7d data AND (≥30 conversions OR ≥$500 spend) on the drill entity. Below threshold → skip the candidate.
- **3-card cap** — the constraint is the value.
- **No education.** Audience knows the metrics.

Warnings tone: factual + actionable, brief. No tone constraints beyond clarity.

---

## Channel-Aware Drill Matrix

When generating warnings or recommendations, drill to the lowest controllable entity per channel:

| Channel | Drill entity | Channel-native KPI | Common issue patterns |
|---|---|---|---|
| **Paid Search** (Google/Bing) | Keyword → ad group | Quality Score, Search IS (lost: budget vs rank), CVR/keyword | Generic broad-match leak; brand cannibalization; IS lost to budget on top converters |
| **YouTube/Video** (Google) | Video asset | View rate, completion (25/50/75/100%), CPV | Low completion = wrong audience or weak hook; non-skippable starving spend |
| **Performance Max** | Asset group → product | ROAS by asset group, conversion mix (search vs display vs YT) | Brand cannibalization; spend imbalance to display; weak audience signals |
| **Shopping** | Product/SKU | ROAS/SKU, IS/SKU, % zero-impression catalog | Long tail of zero-imp SKUs; OOS still serving |
| **Meta** | Ad creative → ad set | Hook rate (3s/imp), Hold rate (15s+/3s), Frequency, CTR | Frequency >5; single creative carrying spend; ASC w/o exclusions |
| **LinkedIn** | Ad creative + audience segment | CTR vs platform avg, lead form CR, CPL by job title/seniority | Audience too narrow (<5K); single creative across segments |
| **TikTok** | Ad creative | Hook rate (2s), 6s view rate, completion (p25–p100), creative freshness >7d | Stale creatives >7d; sound-off completion drop |
| **Pinterest** | Pin / creative | Save rate, outbound CTR, idea-pin completion | Static-pin fatigue; missing Verified Merchant Program tag |
| **Reddit** | Ad creative + subreddit | Comment sentiment, engagement rate, CVR by subreddit | Subreddit blocklist gaps; non-native creative tone |

**Cross-cutting drills (all channels):** pacing (delivery vs plan), dayparting/hour-of-day, device split, geo target, audience saturation / new-vs-returning mix.

---

## Failure modes — what to render when something goes wrong

Per Rule 0 — never mock, never fall through. Behavior matrix:

| Failure mode | UI behavior |
|---|---|
| Connection missing for a channel | Drop that channel from `channels_data`; if active count drops <2 → fall back to Mode C single-channel chart |
| API returns NULL/empty for a metric on one channel | That channel's `today_kpis` contribution = 0; blended metric still renders; channel-card health flag → `bad` with note "No data" |
| Whole API call fails (timeout, 5xx) | Topbar banner: "Live · {time} — `<channel>` delayed (retry {next_retry})". Render last-known cached values if <2h old; else `—` placeholders WITH explicit error indicator (not the canonical's INJECT placeholders) |
| `biz_workspace_plans` row missing | Use last-month actuals as plan baseline; show banner "No plan set for {month} — using last-month actuals as baseline. [Set plan]" |
| Workspace has only 1 active channel | Console requires ≥2 channels. Surface message; offer Mode C single-channel chart instead. |

---

## Quality gates

- **No empty tiles in the KPI strip.** If a metric is fundamentally unavailable on every active channel — render the tile but with `—` and an explicit reason.
- **Pacing flag accuracy.** `flag: 'over'` means projecting >15% deviation from monthly plan. Don't mark `ok` for missing data.
- **Recommendation $-impact.** Every card MUST surface $-value. Never publish a recommendation without it.
- **Data freshness.** Live-API call timestamp shown in topbar. If stale >2h, banner: "Data delayed — last fetch HH:mm UTC".
- **Visual contract.** Indigo accent, Inter typography, Chart.js for trend chart, custom HTML for KPI strip and channel cards. Do not deviate.

---

## Appendix A — Canonical Widget HTML (single source of truth)

This is the **canonical visual contract** for the Daily Performance Console. The widget's `componentCode` (per Step 5) is THIS HTML with every INJECT marker substituted by Discovery API data (per Step 3).

LLM agents performing this skill: load this section as raw text, find INJECT markers, substitute per § Discovery API mapping, output the result as the widget's `componentCode` string.

**Mirrored at** `algorithms/revenue_div/marketing_dpt/01_projects/alg/claude/daily-performance/canonical.html` in the team-internal Marketing OS repo for filesystem-level access during design iteration. Edit BOTH atomically when the template changes.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Daily Performance · {{INJECT:workspace_name}} — All Channels</title>
<!--
  ════════════════════════════════════════════════════════════════════════════
  CANONICAL TEMPLATE — UC-DPA-1 Daily Performance Console
  ════════════════════════════════════════════════════════════════════════════
  This file is the canonical visual template for UC-DPA-1.
  Spec: data_sources/obsidian/vault/Improvado/05-Product/Marketing OS (Operational System)/use-cases/UC-DPA-1 Daily Performance Analysis.md

  USAGE FOR LLM AGENTS:
    1. Load this file as raw text
    2. Find INJECT markers (see list below)
    3. Substitute data between START/END markers, OR replace {{INJECT:name}} placeholders
    4. Output the resulting HTML — DO NOT regenerate structure from scratch

  INJECTION POINTS:
    Inline placeholders ({{INJECT:name}}):
      - workspace_name, workspace_id     — topbar / title
      - date_range_label                 — date picker pill text
      - date_start, date_end             — date picker inputs (YYYY-MM-DD)
      - period_label                     — "May 2026"
      - day_counter                      — "Day 4 of 31 · 13% elapsed"
      - rev_current, rev_plan, rev_pct   — revenue block numbers
      - rev_proj_label, rev_proj_class   — "↗ Proj $564K · +12.7%" / class: good|warn|bad
      - rev_fill_pct, rev_today_pct      — bar widths

    Block markers (<!-- === INJECT: name === --> ... <!-- === END INJECT: name === -->):
      - channels_data    — JS const C = {...}
      - today_kpis       — JS const TODAY = {...}
      - daily_base       — JS daily-data base values per channel/metric
      - warnings_block   — array of warning HTML cards
      - recos_block      — array of recommendation HTML cards
      - pacing_block     — pacing tab content
      - plan_modal       — edit-plan modal default values

  EDIT POLICY:
    Update both this template AND the spec atomically.
    See spec § "Data shape contracts" for required JSON shapes.
  ════════════════════════════════════════════════════════════════════════════
-->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg:        #FAFBFC;
    --surface:   #FFFFFF;
    --surface-2: #F5F7FA;
    --line:      #E5E9EF;
    --line-soft: #EFF2F6;

    --ink:       #0F172A;
    --text:      #1F2937;
    --muted:     #64748B;
    --subtle:    #94A3B8;

    --accent:        #4F46E5;
    --accent-soft:   #EEF2FF;
    --accent-hover:  #4338CA;

    --good:       #047857;
    --good-bg:    #ECFDF5;
    --good-line:  #A7F3D0;

    --warn:       #B45309;
    --warn-bg:    #FFFBEB;
    --warn-line:  #FCD34D;

    --bad:        #B91C1C;
    --bad-bg:     #FEF2F2;
    --bad-line:   #FCA5A5;

    --info:       #0369A1;
    --info-bg:    #F0F9FF;
    --info-line:  #BAE6FD;

    --c-google:    #4285F4;
    --c-meta:      #0866FF;
    --c-tiktok:    #000000;
    --c-pinterest: #E60023;

    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 12px;
    --shadow-sm: 0 1px 0 rgba(15,23,42,0.04);
    --shadow:    0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.05);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 14px/1.5 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--text); background: var(--bg);
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  .num  { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }

  .page { max-width: 1340px; margin: 0 auto; padding: 16px 24px 24px; }

  /* ── LOGO MARKS ───────────────────────── */
  .logo {
    display: inline-block; flex: 0 0 auto;
    border-radius: 4px; overflow: hidden;
    width: 18px; height: 18px;
  }
  .logo svg { display: block; width: 100%; height: 100%; }
  .logo.sm { width: 14px; height: 14px; border-radius: 3px; }
  .logo.md { width: 22px; height: 22px; border-radius: 5px; }
  .logo.lg { width: 28px; height: 28px; border-radius: 6px; }

  /* ── TOP BAR ──────────────────────────── */
  .topbar {
    display: flex; align-items: center; gap: 10px;
    padding-bottom: 12px; border-bottom: 1px solid var(--line);
    margin-bottom: 14px;
  }
  .crumb { font-size: 13px; color: var(--muted); font-weight: 500; }
  .crumb b { color: var(--text); font-weight: 600; }
  .topbar-spacer { flex: 1; }
  .control-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--line);
    font-size: 12.5px; font-weight: 500; color: var(--text);
    cursor: pointer; transition: all .15s;
  }
  .control-pill:hover { border-color: var(--subtle); background: var(--surface-2); }
  .control-pill.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .control-pill.primary:hover { background: var(--accent-hover); }
  .dot-live { width: 6px; height: 6px; background: #22C55E; border-radius: 50%; box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }

  /* ── HEADER ───────────────────────────── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 14px; flex-wrap: wrap; margin-bottom: 12px;
  }
  .header-left h1 { margin: 0; font-size: 21px; font-weight: 700; color: var(--ink); letter-spacing: -0.015em; line-height: 1.2; }
  .header-left .meta { margin-top: 3px; font-size: 13px; color: var(--muted); }
  .header-left .meta b { color: var(--text); font-weight: 600; }
  .header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .channel-chips { display: flex; gap: 5px; flex-wrap: wrap; }
  .channel-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 11px 3px 4px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--line);
    font-size: 12px; font-weight: 600; color: var(--text);
  }
  .channel-chip .logo { width: 16px; height: 16px; border-radius: 4px; }

  /* ── REVENUE PROGRESS BAR (replaces TLDR) ───── */
  .rev-block {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md); padding: 12px 16px;
    margin-bottom: 14px; box-shadow: var(--shadow-sm);
  }
  .rev-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin-bottom: 8px;
  }
  .rev-title-group { display: flex; align-items: baseline; gap: 8px; }
  .rev-title {
    font-size: 11px; font-weight: 700; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.07em;
  }
  .rev-day { font-size: 11.5px; color: var(--subtle); font-weight: 500; }
  .rev-numbers {
    display: flex; align-items: baseline; gap: 14px; font-size: 13px;
    flex-wrap: wrap;
  }
  .rev-numbers .nm-current {
    font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.015em;
  }
  .rev-numbers .nm-plan { color: var(--muted); }
  .rev-numbers .nm-plan b { color: var(--text); font-weight: 600; }
  .rev-numbers .nm-pct {
    background: var(--accent-soft); color: var(--accent);
    padding: 3px 10px; border-radius: 999px;
    font-size: 11.5px; font-weight: 700;
  }
  .rev-numbers .nm-proj {
    font-size: 12px; color: var(--good); font-weight: 600;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .rev-numbers .nm-proj.warn { color: var(--warn); }
  .rev-numbers .nm-proj.bad  { color: var(--bad); }
  .rev-bar {
    position: relative; height: 12px; background: var(--surface-2);
    border-radius: 6px; overflow: hidden; border: 1px solid var(--line-soft);
  }
  .rev-bar .rev-fill {
    height: 100%; background: linear-gradient(90deg, var(--accent), #6366F1);
    border-radius: 6px; transition: width .3s;
  }
  .rev-bar .rev-projection {
    position: absolute; top: 0; bottom: 0;
    background: repeating-linear-gradient(135deg, rgba(79,70,229,0.15), rgba(79,70,229,0.15) 4px, rgba(79,70,229,0.04) 4px, rgba(79,70,229,0.04) 8px);
    border-right: 2px dashed var(--accent);
  }
  .rev-bar .rev-today {
    position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink);
  }
  .rev-bar .rev-today::after {
    content: 'Today'; position: absolute; top: -16px; left: 50%; transform: translateX(-50%);
    background: var(--ink); color: #fff;
    font: 700 9px 'Inter', sans-serif; padding: 1px 5px; border-radius: 3px;
    white-space: nowrap;
  }
  .rev-bar .rev-plan-marker {
    position: absolute; right: 0; top: 0; bottom: 0; width: 2px;
    background: var(--good); opacity: 0.6;
  }

  /* ── CHANNEL SPLIT ────────────────────── */
  .channel-split { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  .channel-card {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md); padding: 12px 14px;
    box-shadow: var(--shadow-sm);
  }
  .ch-row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .ch-row1 .nm { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .ch-row1 .sh { margin-left: auto; font-size: 11.5px; color: var(--muted); font-weight: 600; }
  .ch-row2 { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 5px; }
  .ch-spend { font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; line-height: 1.1; }
  .ch-roas { font-size: 13px; font-weight: 700; }
  .ch-roas.good { color: var(--good); }
  .ch-roas.warn { color: var(--warn); }
  .ch-roas.bad  { color: var(--bad); }
  .ch-row3 {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 12px; color: var(--muted); margin-bottom: 6px;
  }
  .ch-row3 b { color: var(--text); font-weight: 600; }
  .ch-row3 .sep { color: var(--subtle); margin: 0 4px; }
  .ch-meter { height: 4px; background: var(--line-soft); border-radius: 2px; overflow: hidden; }
  .ch-meter > .fill { height: 100%; }
  .ch-row4 {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 6px;
  }
  .ch-health {
    font-size: 11.5px; color: var(--muted);
    display: inline-flex; align-items: center; gap: 5px;
  }
  .ch-health::before { content: ''; width: 6px; height: 6px; border-radius: 50%; }
  .ch-health.ok::before    { background: var(--good); }
  .ch-health.warn::before  { background: var(--warn); }
  .ch-health.bad::before   { background: var(--bad); }
  .ch-pct { font-size: 11.5px; color: var(--muted); font-weight: 500; }
  .ch-pct b { color: var(--text); font-weight: 600; }

  /* ── SPLIT PANEL ──────────────────────── */
  .split-panel {
    display: grid; grid-template-columns: 380px 1fr; gap: 12px;
    margin-bottom: 14px;
  }
  .panel {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }
  .panel-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid var(--line-soft);
    background: var(--surface-2);
    gap: 8px; flex-wrap: wrap;
  }
  .panel-title {
    font-size: 12px; font-weight: 600; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.06em;
  }

  .kpi-panel-body { padding: 10px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .kpi {
    background: var(--surface); border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm); padding: 10px 12px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .kpi-row1 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kpi-label {
    font-size: 10.5px; font-weight: 700; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
  }
  .kpi-delta {
    font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 3px;
    line-height: 1.3; white-space: nowrap;
  }
  .kpi-delta.up    { color: var(--good); background: var(--good-bg); }
  .kpi-delta.down  { color: var(--bad);  background: var(--bad-bg); }
  .kpi-delta.cost-up   { color: var(--bad);  background: var(--bad-bg); }
  .kpi-delta.cost-down { color: var(--good); background: var(--good-bg); }
  .kpi-value {
    font-size: 19px; font-weight: 700; color: var(--ink); line-height: 1.1;
    letter-spacing: -0.018em;
  }
  .kpi-mtd {
    display: flex; align-items: baseline; justify-content: space-between;
    font-size: 11px; color: var(--muted); gap: 6px;
  }
  .kpi-mtd b { color: var(--text); font-weight: 600; }
  .kpi-mtd .flag { font-weight: 700; }
  .kpi-mtd .flag.ok    { color: var(--good); }
  .kpi-mtd .flag.warn  { color: var(--warn); }
  .kpi-mtd .flag.over  { color: var(--bad); }

  /* Chart panel */
  .chart-controls { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .chart-body { padding: 12px 14px 4px; height: 250px; position: relative; }
  .chart-legend {
    display: flex; gap: 6px; flex-wrap: wrap; padding: 0 14px 12px;
    justify-content: center;
  }
  .legend-item {
    appearance: none; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px 4px 6px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--line);
    font: 600 11.5px 'Inter', sans-serif; color: var(--text);
    transition: all .15s;
  }
  .legend-item:hover { background: var(--surface-2); }
  .legend-item.hidden { opacity: 0.4; text-decoration: line-through; }
  .legend-item .legend-line {
    width: 14px; height: 2px; border-radius: 1px; flex: 0 0 auto;
  }

  /* Custom dropdown */
  .select { position: relative; }
  .select-btn {
    appearance: none; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 6px;
    background: var(--surface); border: 1px solid var(--line);
    font: 600 11.5px 'Inter', sans-serif; color: var(--text);
    transition: all .15s; white-space: nowrap;
  }
  .select-btn:hover { border-color: var(--subtle); }
  .select-btn .arrow { color: var(--muted); font-size: 9px; }
  .select-btn .lbl { color: var(--muted); font-weight: 500; margin-right: 2px; }
  .select-btn .val { color: var(--ink); }
  .select-btn .badge {
    background: var(--accent-soft); color: var(--accent);
    padding: 0 5px; border-radius: 999px; font-size: 10px; font-weight: 700;
    margin-left: 2px;
  }
  .select-menu {
    position: absolute; top: calc(100% + 4px); right: 0;
    min-width: 180px; max-height: 320px; overflow-y: auto;
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 28px rgba(15,23,42,0.12);
    padding: 5px; z-index: 50;
    display: none;
  }
  .select.open .select-menu { display: block; }
  .select-menu label {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 9px; border-radius: 5px;
    font-size: 12.5px; cursor: pointer; user-select: none;
    transition: background .12s;
  }
  .select-menu label:hover { background: var(--surface-2); }
  .select-menu input { margin: 0; cursor: pointer; }
  .select-menu .menu-section {
    font-size: 10px; color: var(--muted); font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 6px 9px 3px;
  }
  .select-menu .menu-divider { height: 1px; background: var(--line-soft); margin: 4px 2px; }
  .select-menu .ch-logo-wrap { display: inline-block; flex: 0 0 auto; }
  /* Date picker (left of granularity) */
  .date-picker .select-menu { min-width: 240px; left: 0; right: auto; }
  .date-picker .select-btn .icon { font-size: 11px; }
  .date-custom-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
    padding: 8px 9px; border-top: 1px solid var(--line-soft);
    margin-top: 4px;
  }
  .date-custom-row label {
    display: block; padding: 0;
    background: transparent !important;
  }
  .date-custom-row .field {
    display: block;
    font-size: 9.5px; color: var(--muted); font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 3px;
  }
  .date-custom-row input {
    width: 100%; padding: 5px 8px; border: 1px solid var(--line);
    border-radius: 5px; font: 500 11.5px 'JetBrains Mono', monospace;
    color: var(--ink); background: var(--surface);
  }
  .date-custom-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

  /* ── TABS ─────────────────────────────── */
  .tabs {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-lg); box-shadow: var(--shadow);
    overflow: hidden;
  }
  .tabs-nav {
    display: flex; gap: 0; padding: 0 8px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-2);
  }
  .tab-btn {
    appearance: none; cursor: pointer;
    padding: 11px 16px; border: 0; background: transparent;
    font: 600 13px 'Inter', sans-serif;
    color: var(--muted); position: relative;
    transition: color .15s;
    display: inline-flex; align-items: center; gap: 7px;
  }
  .tab-btn:hover { color: var(--text); }
  .tab-btn.active { color: var(--accent); }
  .tab-btn.active::after {
    content: ''; position: absolute; left: 14px; right: 14px; bottom: -1px;
    height: 2px; background: var(--accent);
  }
  .tab-btn .count {
    background: var(--surface); border: 1px solid var(--line);
    color: var(--text); font: 700 10.5px 'Inter', sans-serif;
    padding: 1px 7px; border-radius: 999px;
    min-width: 20px; text-align: center;
  }
  .tab-btn.active .count { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-soft); }
  .tab-btn .count.danger { background: var(--bad-bg); color: var(--bad); border-color: var(--bad-line); }
  .tab-content { padding: 14px 16px; min-height: 240px; }
  .tab-content[hidden] { display: none; }

  /* WARNINGS */
  .warnings { display: grid; gap: 8px; }
  .warning {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px;
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }
  .warning .severity { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .warning.critical .severity { background: var(--bad);  box-shadow: 0 0 0 3px rgba(185,28,28,0.15); }
  .warning.high     .severity { background: var(--warn); box-shadow: 0 0 0 3px rgba(180,83,9,0.15); }
  .warning.info     .severity { background: var(--info); box-shadow: 0 0 0 3px rgba(3,105,161,0.15); }
  .warning .ch-tag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 8px 2px 3px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--line);
    font-size: 11.5px; font-weight: 600; color: var(--text);
    flex: 0 0 auto;
  }
  .warning .badge {
    flex: 0 0 auto;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 4px;
  }
  .warning.critical .badge { background: var(--bad-bg);  color: var(--bad);  border: 1px solid var(--bad-line); }
  .warning.high     .badge { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-line); }
  .warning.info     .badge { background: var(--info-bg); color: var(--info); border: 1px solid var(--info-line); }
  .warning .body { flex: 1; font-size: 12.5px; line-height: 1.5; }
  .warning .body b { color: var(--ink); font-weight: 600; }
  .warning .body .target {
    display: inline-block; padding: 1px 5px;
    background: var(--surface-2); border-radius: 3px;
    font: 500 11.5px 'JetBrains Mono', monospace; color: var(--text);
    margin: 0 2px;
  }
  .warning .cta {
    flex: 0 0 auto;
    font-size: 12px; font-weight: 600; color: var(--accent);
    text-decoration: none;
    padding: 5px 10px; border-radius: var(--radius-sm);
    transition: background .15s; white-space: nowrap;
  }
  .warning .cta:hover { background: var(--accent-soft); }

  /* RECOMMENDATIONS */
  .recos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .reco {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius-md); padding: 14px 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .reco-tag-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .reco-tag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .reco-tag.opportunity { background: var(--good-bg); color: var(--good); border: 1px solid var(--good-line); }
  .reco-tag.action      { background: var(--bad-bg);  color: var(--bad);  border: 1px solid var(--bad-line); }
  .reco-tag.test        { background: var(--info-bg); color: var(--info); border: 1px solid var(--info-line); }
  .reco-ch {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 9px 2px 3px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--line);
    font-size: 10.5px; font-weight: 600; color: var(--text);
  }
  .reco-title { font-size: 13.5px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .reco-target {
    background: var(--surface-2); border-radius: var(--radius-sm);
    padding: 7px 10px; font: 500 11px 'JetBrains Mono', monospace;
    color: var(--text); border: 1px solid var(--line-soft); line-height: 1.45;
  }
  .reco-evidence { font-size: 12px; color: var(--muted); line-height: 1.5; }
  .reco-evidence b { color: var(--text); }
  .reco-impact {
    display: flex; align-items: center; gap: 7px;
    padding-top: 9px; border-top: 1px dashed var(--line);
    font-size: 11.5px;
  }
  .reco-impact .lbl { color: var(--muted); }
  .reco-impact .val { color: var(--good); font-weight: 700; }
  .reco-impact.cost .val { color: var(--bad); }
  .reco-actions { display: flex; gap: 6px; margin-top: auto; }
  .btn {
    appearance: none; cursor: pointer;
    padding: 6px 11px; border-radius: var(--radius-sm);
    font: 600 12px 'Inter', sans-serif;
    border: 1px solid var(--line); background: var(--surface); color: var(--text);
    transition: all .15s;
  }
  .btn:hover { background: var(--surface-2); border-color: var(--subtle); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary:hover { background: var(--accent-hover); }

  /* PACING tab */
  .pacing-block { padding: 12px 16px; background: var(--surface-2); border: 1px solid var(--line-soft); border-radius: var(--radius-md); }
  .pacing-header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  .pacing-title { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .pacing-title .day { color: var(--muted); font-weight: 500; margin-left: 7px; font-size: 12.5px; }
  .edit-plan {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; margin-left: 8px;
    background: var(--accent-soft); color: var(--accent);
    border: 1px solid var(--accent-soft); border-radius: 999px;
    font-size: 11px; font-weight: 600; cursor: pointer;
  }
  .edit-plan:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .pacing-numbers { display: flex; gap: 18px; align-items: baseline; font-size: 12px; flex-wrap: wrap; }
  .pacing-numbers .item { display: inline-flex; gap: 6px; align-items: baseline; }
  .pacing-numbers .lbl { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .pacing-numbers .val { color: var(--ink); font-weight: 700; font-size: 13px; }
  .pacing-numbers .val.warn { color: var(--warn); }
  .pacing-bar {
    position: relative; height: 28px; background: var(--surface);
    border-radius: 6px; overflow: hidden; border: 1px solid var(--line-soft);
    display: flex;
  }
  .pacing-seg {
    height: 100%; display: flex; align-items: center; padding-left: 7px;
    color: #fff; font-size: 11px; font-weight: 600;
    overflow: hidden; white-space: nowrap;
  }
  .pacing-bar .projection {
    position: absolute; top: 0; bottom: 0;
    background: repeating-linear-gradient(135deg, rgba(79,70,229,0.18), rgba(79,70,229,0.18) 4px, rgba(79,70,229,0.05) 4px, rgba(79,70,229,0.05) 8px);
    border-right: 2px dashed var(--accent);
  }
  .pacing-bar .today-marker { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink); }
  .pacing-bar .plan-marker { position: absolute; right: 0; top: 0; bottom: 0; width: 2px; background: var(--good); opacity: 0.6; }
  .pacing-legend { display: flex; gap: 14px; margin-top: 8px; flex-wrap: wrap; }
  .pacing-legend-item {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; color: var(--muted);
  }
  .pacing-legend-item b { color: var(--text); font-weight: 600; }

  /* MODAL */
  .modal-bg { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: none; align-items: center; justify-content: center; z-index: 200; }
  .modal-bg.open { display: flex; }
  .modal { background: var(--surface); border-radius: var(--radius-lg); padding: 22px 24px; width: 480px; max-width: 90vw; box-shadow: 0 20px 60px rgba(15,23,42,0.25); }
  .modal h3 { margin: 0 0 14px; font-size: 16px; font-weight: 700; color: var(--ink); }
  .modal label { display: block; font-size: 11px; color: var(--muted); font-weight: 600; margin-top: 10px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .modal input { width: 100%; padding: 8px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); font: 500 13.5px 'JetBrains Mono', monospace; color: var(--ink); background: var(--surface); }
  .modal input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .modal .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 16px; }

  @media (max-width: 1100px) {
    .split-panel { grid-template-columns: 1fr; }
    .channel-split { grid-template-columns: repeat(2, 1fr); }
    .recos { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<!-- ═══════ SVG LOGO SYMBOLS ═══════ -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="logo-google" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="4.5" fill="#fff" stroke="#E5E9EF" stroke-width="0.5"/>
      <g transform="translate(3 3) scale(0.75)">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.45c-.29 1.48-1.13 2.74-2.39 3.59v3h3.86c2.26-2.09 3.57-5.17 3.57-8.83z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.9l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
        <path fill="#FBBC04" d="M5.27 14.3c-.25-.72-.38-1.49-.38-2.3s.14-1.58.38-2.3V6.61H1.29C.47 8.23 0 10.06 0 12s.47 3.77 1.29 5.39l3.98-3.09z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.98 3.09C6.22 6.85 8.87 4.75 12 4.75z"/>
      </g>
    </symbol>
    <symbol id="logo-meta" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="4.5" fill="#0866FF"/>
      <path fill="#fff" d="M13.5 21v-7.5h2.51l.49-3h-3V8.66c0-.86.24-1.46 1.47-1.46H17V4.6c-.27-.04-1.18-.12-2.24-.12-2.22 0-3.74 1.36-3.74 3.85v2.17H8.5v3h2.52V21h2.48z"/>
    </symbol>
    <symbol id="logo-tiktok" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="4.5" fill="#000"/>
      <path fill="#25F4EE" transform="translate(-0.65 0.45)" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z"/>
      <path fill="#FE2C55" transform="translate(0.65 -0.45)" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z"/>
      <path fill="#fff" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z"/>
    </symbol>
    <symbol id="logo-pinterest" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="4.5" fill="#E60023"/>
      <path fill="#fff" d="M12 4c-4.42 0-8 3.58-8 8 0 3.21 1.91 5.97 4.65 7.21-.06-.55-.12-1.39.03-1.99.13-.54.85-3.42.85-3.42s-.22-.43-.22-1.07c0-1 .58-1.75 1.31-1.75.62 0 .92.46.92 1.02 0 .62-.39 1.55-.6 2.41-.17.72.36 1.31 1.07 1.31 1.28 0 2.27-1.36 2.27-3.32 0-1.74-1.25-2.95-3.03-2.95-2.06 0-3.27 1.55-3.27 3.15 0 .62.24 1.29.54 1.65.06.07.07.14.05.21-.05.22-.18.72-.2.82-.03.13-.1.16-.24.1-.9-.42-1.46-1.73-1.46-2.79 0-2.27 1.65-4.36 4.76-4.36 2.5 0 4.44 1.78 4.44 4.16 0 2.48-1.57 4.48-3.74 4.48-.73 0-1.42-.38-1.65-.83l-.45 1.71c-.16.62-.6 1.4-.9 1.87.68.21 1.39.32 2.13.32 4.42 0 8-3.58 8-8s-3.58-8-8-8z"/>
    </symbol>
  </defs>
</svg>

<div class="page">

  <!-- ════════ TOP BAR ════════ -->
  <div class="topbar">
    <div class="crumb"><b>{{INJECT:workspace_name}}</b> · All Channels · Workspace #{{INJECT:workspace_id}}</div>
    <div class="topbar-spacer"></div>
    <button class="control-pill"><span class="dot-live"></span> Live · {{INJECT:updated_at}}</button>
    <button class="control-pill primary">Refresh</button>
  </div>

  <!-- ════════ HEADER ════════ -->
  <div class="header">
    <div class="header-left">
      <h1>Daily Performance — All Channels</h1>
      <div class="meta">DoD vs same day last week · MTD pacing across <b>4 active platforms</b></div>
    </div>
    <div class="header-right">
      <div class="channel-chips" id="channel-chips"><!-- rendered from C --></div>
    </div>
  </div>

  <!-- ════════ REVENUE PROGRESS BAR ════════ -->
  <!-- === INJECT: revenue_block === -->
  <div class="rev-block">
    <div class="rev-row">
      <div class="rev-title-group">
        <span class="rev-title">Revenue · {{INJECT:period_label}}</span>
        <span class="rev-day">{{INJECT:day_counter}}</span>
      </div>
      <div class="rev-numbers">
        <span class="nm-current">{{INJECT:rev_current}}</span>
        <span class="nm-plan">of <b>{{INJECT:rev_plan}}</b> plan</span>
        <span class="nm-pct">{{INJECT:rev_pct}} complete</span>
        <span class="nm-proj {{INJECT:rev_proj_class}}">{{INJECT:rev_proj_label}}</span>
      </div>
    </div>
    <div class="rev-bar">
      <div class="rev-fill" style="width: {{INJECT:rev_fill_pct}};"></div>
      <div class="rev-projection" style="left: {{INJECT:rev_fill_pct}}; width: calc(100% - {{INJECT:rev_fill_pct}});"></div>
      <div class="rev-today" style="left: {{INJECT:rev_today_pct}};"></div>
      <div class="rev-plan-marker"></div>
    </div>
  </div>
  <!-- === END INJECT: revenue_block === -->

  <!-- ════════ CHANNEL SPLIT ════════ -->
  <div class="channel-split" id="channel-split"></div>

  <!-- ════════ SPLIT: KPIs + UNIVERSAL CHART ════════ -->
  <div class="split-panel">

    <!-- LEFT: KPIs -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">Glance · today + MTD</span>
        <span style="font-size: 11px; color: var(--subtle);">8 metrics · blended</span>
      </div>
      <div class="kpi-panel-body">
        <div class="kpi-grid" id="kpi-grid"></div>
      </div>
    </div>

    <!-- RIGHT: UNIVERSAL CHART -->
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">Universal trend</span>
        <div class="chart-controls">
          <!-- Date picker — leftmost -->
          <div class="select date-picker" data-id="date">
            <button class="select-btn">
              <span class="icon">📅</span>
              <span class="val" id="d-val">{{INJECT:date_range_label}}</span>
              <span class="arrow">▾</span>
            </button>
            <div class="select-menu">
              <div class="menu-section">Presets</div>
              <label><input type="radio" name="datepreset" value="7d"> Last 7 days</label>
              <label><input type="radio" name="datepreset" value="14d"> Last 14 days</label>
              <label><input type="radio" name="datepreset" value="30d" checked> Last 30 days</label>
              <label><input type="radio" name="datepreset" value="mtd"> Month to date</label>
              <label><input type="radio" name="datepreset" value="qtd"> Quarter to date</label>
              <label><input type="radio" name="datepreset" value="custom"> Custom range</label>
              <div class="date-custom-row">
                <label>
                  <span class="field">Start date</span>
                  <input type="date" id="d-start" value="{{INJECT:date_start}}" />
                </label>
                <label>
                  <span class="field">End date</span>
                  <input type="date" id="d-end" value="{{INJECT:date_end}}" />
                </label>
              </div>
            </div>
          </div>
          <!-- Granularity -->
          <div class="select" data-id="granularity">
            <button class="select-btn">
              <span class="lbl">Granularity</span>
              <span class="val" id="g-val">Daily</span>
              <span class="arrow">▾</span>
            </button>
            <div class="select-menu">
              <label><input type="radio" name="granularity" value="daily" checked> Daily</label>
              <label><input type="radio" name="granularity" value="weekly"> Weekly</label>
              <label><input type="radio" name="granularity" value="monthly"> Monthly</label>
            </div>
          </div>
          <!-- Metrics -->
          <div class="select" data-id="metrics">
            <button class="select-btn">
              <span class="lbl">Metric</span>
              <span class="val" id="m-val">Spend</span>
              <span class="badge" id="m-badge">1</span>
              <span class="arrow">▾</span>
            </button>
            <div class="select-menu">
              <div class="menu-section">Pick 1–2 metrics</div>
              <label><input type="checkbox" name="metric" value="spend" checked> Spend</label>
              <label><input type="checkbox" name="metric" value="impressions"> Impressions</label>
              <label><input type="checkbox" name="metric" value="clicks"> Clicks</label>
              <label><input type="checkbox" name="metric" value="ctr"> CTR</label>
              <label><input type="checkbox" name="metric" value="conversions"> Conversions</label>
              <label><input type="checkbox" name="metric" value="cpa"> CPA</label>
              <label><input type="checkbox" name="metric" value="cr"> CR</label>
              <label><input type="checkbox" name="metric" value="roas"> ROAS</label>
            </div>
          </div>
          <!-- Channels -->
          <div class="select" data-id="channels">
            <button class="select-btn">
              <span class="lbl">Channels</span>
              <span class="val" id="c-val">All</span>
              <span class="badge" id="c-badge">4</span>
              <span class="arrow">▾</span>
            </button>
            <div class="select-menu" id="channel-checkbox-menu"><!-- rendered from C --></div>
          </div>
        </div>
      </div>
      <div class="chart-body">
        <canvas id="universal-chart"></canvas>
      </div>
      <div class="chart-legend" id="chart-legend"></div>
    </div>

  </div>

  <!-- ════════ TABS ════════ -->
  <div class="tabs">
    <div class="tabs-nav">
      <button class="tab-btn active" data-tab="warnings">⚠ Warnings <span class="count danger">3</span></button>
      <button class="tab-btn" data-tab="recos">↗ Recommendations <span class="count">3</span></button>
      <button class="tab-btn" data-tab="pacing">🗓 Monthly pacing</button>
    </div>

    <div class="tab-content" data-tab="warnings">
      <!-- === INJECT: warnings_block === -->
      <div class="warnings">
        <div class="warning critical">
          <span class="severity"></span>
          <span class="ch-tag"><span class="logo sm"><svg><use href="#logo-google"/></svg></span>Google</span>
          <span class="badge">Critical</span>
          <div class="body">
            Campaign <span class="target">Brand — Search</span> hits daily budget cap in <b>~2h 20min</b> (78% spent at 12:00; trend exhausts at 14:30). Highest-converting Google campaign — pausing means lost conversions through end of day.
          </div>
          <a class="cta" href="#">Increase +$80 →</a>
        </div>
        <div class="warning high">
          <span class="severity"></span>
          <span class="ch-tag"><span class="logo sm"><svg><use href="#logo-tiktok"/></svg></span>TikTok</span>
          <span class="badge">High</span>
          <div class="body">
            Ad group <span class="target">Tents — Reels Prospecting</span> CPA <b>$124</b> vs target <b>$50</b> (+148%). Trending up 3 days. $1,840 spent since deviation, 3 conversions only.
          </div>
          <a class="cta" href="#">Investigate →</a>
        </div>
        <div class="warning info">
          <span class="severity"></span>
          <span class="ch-tag"><span class="logo sm"><svg><use href="#logo-meta"/></svg></span>Meta</span>
          <span class="badge">Info</span>
          <div class="body">
            Campaign <span class="target">Sale Promo — May</span> has <b>2 ads disapproved</b> (policy: superlatives). 67% of ad set impressions affected since 09:14.
          </div>
          <a class="cta" href="#">Review ads →</a>
        </div>
      </div>
      <!-- === END INJECT: warnings_block === -->
    </div>

    <div class="tab-content" data-tab="recos" hidden>
      <!-- === INJECT: recos_block === -->
      <div class="recos">
        <div class="reco">
          <div class="reco-tag-row">
            <span class="reco-tag opportunity">● Shift &amp; scale</span>
            <span class="reco-ch"><span class="logo sm"><svg><use href="#logo-tiktok"/></svg></span>TikTok</span>
            <span style="color: var(--muted); font-size: 10px;">→</span>
            <span class="reco-ch"><span class="logo sm"><svg><use href="#logo-google"/></svg></span>Google</span>
          </div>
          <div class="reco-title">Shift $5K/wk from TikTok Awareness to Google Search</div>
          <div class="reco-target">from: TikTok · Tents — Reels (CPA $124, ROAS 1.8×)<br>to: Google · Brand — Search (CPA $42, ROAS 8.4×)</div>
          <div class="reco-evidence">TikTok ad group missing CPA target by <b>+148%</b> with declining CTR. Google Brand has been daily-budget-capped <b>14 of 21 days</b>; estimated headroom <b>+40 conv/wk at $35 CPA</b>.</div>
          <div class="reco-impact"><span class="lbl">Net est. impact:</span><span class="val">+$5,200 / mo conversions</span></div>
          <div class="reco-actions"><button class="btn primary">Apply shift</button><button class="btn">Details</button></div>
        </div>
        <div class="reco">
          <div class="reco-tag-row">
            <span class="reco-tag action">⚠ Action needed</span>
            <span class="reco-ch"><span class="logo sm"><svg><use href="#logo-meta"/></svg></span>Meta</span>
          </div>
          <div class="reco-title">Pause <i>Spring Awareness — Reels</i></div>
          <div class="reco-target">campaign · Spring Awareness — Reels (Meta)</div>
          <div class="reco-evidence">5 days · <b>$2,400 spent</b> · <b>3 conversions</b>. CPA <b>$800</b> vs $50 target. CTR declined <b>−35%</b> since launch.</div>
          <div class="reco-impact cost"><span class="lbl">Est. savings:</span><span class="val">−$2,200 / mo wasted spend</span></div>
          <div class="reco-actions"><button class="btn primary">Pause campaign</button><button class="btn">Evidence</button></div>
        </div>
        <div class="reco">
          <div class="reco-tag-row">
            <span class="reco-tag test">↗ Expand &amp; test</span>
            <span class="reco-ch"><span class="logo sm"><svg><use href="#logo-pinterest"/></svg></span>Pinterest</span>
          </div>
          <div class="reco-title">Scale <i>lifestyle photography</i> creative pool</div>
          <div class="reco-target">creative_theme · lifestyle photography (12 ads)</div>
          <div class="reco-evidence">CTR <b>2.4%</b> vs Pinterest avg <b>1.1%</b> (<b>2.2×</b>). Currently <b>18%</b> of impressions. Increase to <b>40%</b> share by raising priority weighting.</div>
          <div class="reco-impact"><span class="lbl">Est. impact:</span><span class="val">+$1,000 / mo at current ROAS</span></div>
          <div class="reco-actions"><button class="btn primary">Boost weighting</button><button class="btn">See creatives</button></div>
        </div>
      </div>
      <!-- === END INJECT: recos_block === -->
    </div>

    <div class="tab-content" data-tab="pacing" hidden>
      <!-- === INJECT: pacing_block === -->
      <div class="pacing-block">
        <div class="pacing-header">
          <div class="pacing-title">
            Spend pacing — May 2026 <span class="day">Day 4 of 31 · 13% elapsed</span>
            <button class="edit-plan" onclick="document.getElementById('plan-modal').classList.add('open')">✎ Edit plan</button>
          </div>
          <div class="pacing-numbers">
            <span class="item"><span class="lbl">MTD</span><span class="val num">$13,520</span></span>
            <span class="item"><span class="lbl">Plan</span><span class="val num">$120,000</span></span>
            <span class="item"><span class="lbl">EOM proj.</span><span class="val num warn">$130,800</span></span>
            <span class="item"><span class="lbl">Variance</span><span class="val num warn">+9.0%</span></span>
          </div>
        </div>
        <div class="pacing-bar" id="pacing-bar">
          <div class="projection" style="left: 11.3%; width: 88.7%;"></div>
          <div class="today-marker" style="left: 13.0%;"></div>
          <div class="plan-marker" style="left: 100%;"></div>
        </div>
        <div class="pacing-legend" id="pacing-legend"></div>
      </div>
      <!-- === END INJECT: pacing_block === -->
    </div>
  </div>

</div>

<!-- ═══════ EDIT PLAN MODAL ═══════ -->
<div class="modal-bg" id="plan-modal">
  <div class="modal">
    <h3>Edit monthly plan</h3>
    <label>Spend plan ($)</label><input type="text" value="120,000" />
    <div class="row">
      <div><label>Conversions plan</label><input type="text" value="6,200" /></div>
      <div><label>Target CPA ($)</label><input type="text" value="50" /></div>
    </div>
    <div class="row">
      <div><label>Revenue plan ($)</label><input type="text" value="500,000" /></div>
      <div><label>Target ROAS (×)</label><input type="text" value="4.0" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('plan-modal').classList.remove('open')">Cancel</button>
      <button class="btn primary" onclick="document.getElementById('plan-modal').classList.remove('open')">Save plan</button>
    </div>
  </div>
</div>

<script>
// === INJECT: channels_data ===
// Shape: { [key]: { name, color, logo, mtd_spend, daily_avg, plan, share, roas, cpa, health: 'ok'|'warn'|'bad', note } }
// `key` must match `logo` symbol id without 'logo-' prefix; valid: google|meta|tiktok|pinterest|linkedin|reddit|...
// `color` is canonical brand color; `logo` is `logo-<key>` symbol id (defined in <defs>)
const C = {
  google:    { name: 'Google',    color: '#4285F4', logo: 'logo-google',    mtd_spend: 5800, daily_avg: 1450, plan: 48000, share: 42, roas: 8.1, cpa: 42, health: 'ok',   note: 'Brand search efficient' },
  meta:      { name: 'Meta',      color: '#0866FF', logo: 'logo-meta',      mtd_spend: 3920, daily_avg:  980, plan: 36000, share: 29, roas: 4.2, cpa: 48, health: 'warn', note: 'Display ROAS dropping' },
  tiktok:    { name: 'TikTok',    color: '#000000', logo: 'logo-tiktok',    mtd_spend: 2440, daily_avg:  610, plan: 22000, share: 18, roas: 1.8, cpa: 84, health: 'bad',  note: 'CPA +148% over plan' },
  pinterest: { name: 'Pinterest', color: '#E60023', logo: 'logo-pinterest', mtd_spend: 1360, daily_avg:  340, plan: 14000, share: 11, roas: 3.6, cpa: 52, health: 'ok',   note: 'Steady · creatives win' }
};
// === END INJECT: channels_data ===

/* Render channel chips (header) and channel checkboxes (chart filter) from C */
const chipsEl = document.getElementById('channel-chips');
Object.values(C).forEach(c => {
  const chip = document.createElement('span');
  chip.className = 'channel-chip';
  chip.innerHTML = `<span class="logo"><svg><use href="#${c.logo}"/></svg></span>${c.name}`;
  chipsEl.appendChild(chip);
});
const cbMenu = document.getElementById('channel-checkbox-menu');
Object.entries(C).forEach(([key, c]) => {
  const lbl = document.createElement('label');
  lbl.innerHTML = `<input type="checkbox" name="channel" value="${key}" checked> <span class="ch-logo-wrap"><span class="logo sm"><svg><use href="#${c.logo}"/></svg></span></span> ${c.name}`;
  cbMenu.appendChild(lbl);
});

/* Channel split with logos */
const csEl = document.getElementById('channel-split');
Object.values(C).forEach(c => {
  const card = document.createElement('div');
  card.className = 'channel-card';
  const meterFill = (c.mtd_spend / c.plan) * 100;
  const meterColor = c.health === 'bad' ? 'var(--bad)' : c.health === 'warn' ? 'var(--warn)' : c.color;
  card.innerHTML = `
    <div class="ch-row1">
      <span class="logo md"><svg><use href="#${c.logo}"/></svg></span>
      <span class="nm">${c.name}</span>
      <span class="sh">${c.share}% share</span>
    </div>
    <div class="ch-row2">
      <div class="ch-spend num">$${c.mtd_spend.toLocaleString()}</div>
      <div class="ch-roas ${c.roas >= 4 ? 'good' : c.roas >= 2.5 ? 'warn' : 'bad'} num">${c.roas.toFixed(1)}× ROAS</div>
    </div>
    <div class="ch-row3">
      <span><b class="num">$${c.daily_avg.toLocaleString()}</b>/day avg<span class="sep">·</span>CPA <b class="num">$${c.cpa}</b></span>
    </div>
    <div class="ch-meter"><div class="fill" style="width: ${Math.min(meterFill, 100)}%; background: ${meterColor};"></div></div>
    <div class="ch-row4">
      <span class="ch-health ${c.health}">${c.note}</span>
      <span class="ch-pct"><b class="num">${meterFill.toFixed(0)}%</b> of $${(c.plan/1000).toFixed(0)}K</span>
    </div>
  `;
  csEl.appendChild(card);
});

/* KPI grid 2×4 */
// === INJECT: today_kpis ===
// Shape per metric: { v: today_value, d: dod_delta, dc: 'up'|'down'|'cost-up'|'cost-down', mtd: mtd_str, plan: plan_str, flag: 'ok'|'warn'|'over', note: short_pacing_note }
// 8 metrics required, in order: spend, impressions, clicks, ctr, conversions, cpa, cr, roas
const TODAY = {
  spend:        { v: '$6,840',  d: '+12% DoD', dc: 'cost-up',    mtd: '$13.5K', plan: '$120K', flag: 'warn', note: 'Proj +9%' },
  impressions:  { v: '684,200', d: '+8% DoD',  dc: 'up',         mtd: '1.42M',  plan: '11.4M', flag: 'ok',   note: 'On track' },
  clicks:       { v: '14,800',  d: '+15% DoD', dc: 'up',         mtd: '32,400', plan: '264K',  flag: 'ok',   note: 'On track' },
  ctr:          { v: '2.16%',   d: '+0.14pp',  dc: 'up',         mtd: '2.28%',  plan: '2.30%', flag: 'ok',   note: 'Near plan' },
  conversions:  { v: '328',     d: '+22% DoD', dc: 'up',         mtd: '742',    plan: '6,200', flag: 'ok',   note: 'Proj +9%' },
  cpa:          { v: '$48.20',  d: '−9% DoD',  dc: 'cost-down',  mtd: '$45.30', plan: '$50',   flag: 'ok',   note: '−9% target' },
  cr:           { v: '2.22%',   d: '+0.31pp',  dc: 'up',         mtd: '2.29%',  plan: '2.10%', flag: 'ok',   note: '+9% plan' },
  roas:         { v: '4.42×',   d: '+0.4×',    dc: 'up',         mtd: '4.31×',  plan: '4.0×',  flag: 'ok',   note: '+8% plan' }
};
// === END INJECT: today_kpis ===
const labels = { spend:'Spend', impressions:'Impressions', clicks:'Clicks', ctr:'CTR', conversions:'Conversions', cpa:'CPA', cr:'CR', roas:'ROAS' };
const kpiOrder = ['spend','impressions','clicks','ctr','conversions','cpa','cr','roas'];
const ks = document.getElementById('kpi-grid');
kpiOrder.forEach(k => {
  const d = TODAY[k];
  const tile = document.createElement('div');
  tile.className = 'kpi';
  tile.innerHTML = `
    <div class="kpi-row1">
      <span class="kpi-label">${labels[k]}</span>
      <span class="kpi-delta ${d.dc}">${d.d}</span>
    </div>
    <div class="kpi-value num">${d.v}</div>
    <div class="kpi-mtd">
      <span><b class="num">${d.mtd}</b> / ${d.plan}</span>
      <span class="flag ${d.flag}">${d.note}</span>
    </div>
  `;
  ks.appendChild(tile);
});

/* Pacing bar (Pacing tab) */
const pb = document.getElementById('pacing-bar');
Object.values(C).forEach(c => {
  const widthPct = (c.mtd_spend / 120000) * 100;
  const seg = document.createElement('div');
  seg.className = 'pacing-seg';
  seg.style.cssText = `background: ${c.color}; width: ${widthPct}%;`;
  if (widthPct > 2.5) seg.textContent = '$' + (c.mtd_spend/1000).toFixed(1) + 'K';
  pb.insertBefore(seg, pb.firstChild);
});
const pl = document.getElementById('pacing-legend');
Object.values(C).forEach(c => {
  const item = document.createElement('span');
  item.className = 'pacing-legend-item';
  item.innerHTML = `<span class="logo sm"><svg><use href="#${c.logo}"/></svg></span>${c.name} <b class="num">$${(c.mtd_spend/1000).toFixed(1)}K</b> / $${(c.plan/1000).toFixed(0)}K`;
  pl.appendChild(item);
});

/* ───── DATA GENERATION ───── */
function seedRand(seed) { let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
function genDaily(channelKey, metric) {
  const rand = seedRand(channelKey.charCodeAt(0) * 31 + metric.charCodeAt(0));
  // === INJECT: daily_base ===
  // Shape: { [channelKey]: { spend, impressions, clicks, ctr, conversions, cpa, cr, roas } }
  // Used as base value × (1 + noise + trend) to generate 30 days of synthetic-ish data.
  // For real data, replace genDaily with direct array per channel/metric (see spec).
  const base = {
    google: { spend: 1450, impressions: 28000, clicks: 1380, ctr: 4.9, conversions: 35, cpa: 42, cr: 2.5, roas: 8.1 },
    meta:   { spend:  980, impressions: 38000, clicks:  720, ctr: 1.9, conversions: 20, cpa: 48, cr: 2.8, roas: 4.2 },
    tiktok: { spend:  610, impressions: 22000, clicks:  330, ctr: 1.5, conversions:  7, cpa: 84, cr: 2.1, roas: 1.8 },
    pinterest:{spend: 340, impressions:  6000, clicks:   95, ctr: 1.6, conversions:  6, cpa: 52, cr: 2.3, roas: 3.6 }
  }[channelKey][metric];
  // === END INJECT: daily_base ===
  const out = [];
  for (let i = 0; i < 30; i++) {
    const noise = (rand() - 0.5) * 0.25;
    const trend = (i / 30) * 0.15;
    out.push(base * (1 + noise + trend));
  }
  return out;
}
const DAILY = {};
['google','meta','tiktok','pinterest'].forEach(ch => {
  DAILY[ch] = {};
  ['spend','impressions','clicks','ctr','conversions','cpa','cr','roas'].forEach(m => {
    DAILY[ch][m] = genDaily(ch, m);
  });
});
const dayLabels = Array.from({length: 30}, (_, i) => {
  const d = new Date(2026, 3, 4 + i);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
});
function aggregate(daily, granularity) {
  if (granularity === 'daily') return { labels: dayLabels, data: daily };
  if (granularity === 'weekly') {
    const labels = [], data = [];
    for (let i = 0; i < daily.length; i += 7) {
      const slice = daily.slice(i, i + 7);
      labels.push(`Week of ${dayLabels[i]}`);
      data.push(slice.reduce((s, v) => s + v, 0) / slice.length);
    }
    return { labels, data };
  }
  if (granularity === 'monthly') {
    return { labels: ['Apr', 'May'], data: [
      daily.slice(0, 27).reduce((s,v)=>s+v,0) / 27,
      daily.slice(27).reduce((s,v)=>s+v,0) / Math.max(daily.slice(27).length, 1)
    ] };
  }
}

const metricLabels = { spend:'Spend', impressions:'Impressions', clicks:'Clicks', ctr:'CTR', conversions:'Conversions', cpa:'CPA', cr:'CR', roas:'ROAS' };
const metricFmt = {
  spend: v => '$' + Math.round(v).toLocaleString(),
  impressions: v => Math.round(v/1000) + 'K',
  clicks: v => Math.round(v).toLocaleString(),
  ctr: v => v.toFixed(2) + '%',
  conversions: v => Math.round(v),
  cpa: v => '$' + v.toFixed(2),
  cr: v => v.toFixed(2) + '%',
  roas: v => v.toFixed(1) + '×'
};

let chart;
const STATE = {
  granularity: 'daily',
  metrics: ['spend'],
  channels: ['google','meta','tiktok','pinterest']
};

/* Custom legend renderer with logos */
function renderCustomLegend() {
  const legendEl = document.getElementById('chart-legend');
  legendEl.innerHTML = '';
  if (!chart) return;
  chart.data.datasets.forEach((ds, i) => {
    if (ds.label && ds.label.startsWith('_')) return; // skip helper datasets
    const meta = chart.getDatasetMeta(i);
    const channelKey = ds._channelKey;
    const btn = document.createElement('button');
    btn.className = 'legend-item' + (meta.hidden ? ' hidden' : '');
    const logoHtml = channelKey
      ? `<span class="logo sm"><svg><use href="#${C[channelKey].logo}"/></svg></span>`
      : `<span class="legend-line" style="background: ${ds.borderColor}"></span>`;
    btn.innerHTML = `${logoHtml}${ds.label}`;
    btn.onclick = () => {
      meta.hidden = !meta.hidden;
      chart.update();
      renderCustomLegend();
    };
    legendEl.appendChild(btn);
  });
}

function renderChart() {
  const ctx = document.getElementById('universal-chart').getContext('2d');
  const datasets = [];
  let firstLabels = null;
  STATE.metrics.forEach((m, mi) => {
    STATE.channels.forEach(ch => {
      const agg = aggregate(DAILY[ch][m], STATE.granularity);
      if (!firstLabels) firstLabels = agg.labels;
      const ds = {
        label: STATE.metrics.length > 1 ? `${C[ch].name} · ${metricLabels[m]}` : C[ch].name,
        data: agg.data,
        borderColor: C[ch].color === '#000000' ? '#FE2C55' : C[ch].color, // tiktok: use pink for line vs black logo
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: mi === 1 ? [5,3] : [],
        tension: 0.32,
        pointBackgroundColor: C[ch].color === '#000000' ? '#FE2C55' : C[ch].color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        pointRadius: STATE.granularity === 'daily' ? 0 : 3,
        yAxisID: mi === 0 ? 'y' : 'y1'
      };
      ds._channelKey = ch;
      datasets.push(ds);
    });
  });
  if (chart) chart.destroy();
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#64748B';
  Chart.defaults.borderColor = '#EFF2F6';

  const yAxes = {};
  yAxes.y = {
    position: 'left',
    grid: { color: '#F2F4F8' },
    ticks: { callback: v => metricFmt[STATE.metrics[0]](v), font: { size: 10.5 } },
    title: { display: STATE.metrics.length > 1, text: metricLabels[STATE.metrics[0]], color: '#64748B', font: { size: 10.5, weight: '600' } }
  };
  if (STATE.metrics.length > 1) {
    yAxes.y1 = {
      position: 'right', grid: { display: false },
      ticks: { callback: v => metricFmt[STATE.metrics[1]](v), font: { size: 10.5 } },
      title: { display: true, text: metricLabels[STATE.metrics[1]] + ' (dashed)', color: '#64748B', font: { size: 10.5, weight: '600' } }
    };
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: firstLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, callbacks: {
          label: (item) => {
            const m = STATE.metrics[item.dataset.yAxisID === 'y1' ? 1 : 0];
            return `${item.dataset.label}: ${metricFmt[m](item.parsed.y)}`;
          }
        } }
      },
      scales: { ...yAxes, x: { grid: { display: false }, ticks: { maxTicksLimit: STATE.granularity === 'daily' ? 10 : 12, font: { size: 10.5 } } } }
    }
  });
  renderCustomLegend();
}

renderChart();

/* ───── DROPDOWNS ───── */
document.querySelectorAll('.select').forEach(sel => {
  const btn = sel.querySelector('.select-btn');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.select').forEach(s => { if (s !== sel) s.classList.remove('open'); });
    sel.classList.toggle('open');
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.select.open').forEach(s => s.classList.remove('open'));
});
document.querySelectorAll('.select-menu').forEach(m => m.addEventListener('click', e => e.stopPropagation()));

/* Date picker presets */
const presetLabels = { '7d':'Last 7 days', '14d':'Last 14 days', '30d':'Apr 4 – May 4', 'mtd':'Month to date', 'qtd':'Quarter to date', 'custom':'Custom' };
document.querySelectorAll('input[name="datepreset"]').forEach(inp => {
  inp.addEventListener('change', () => {
    document.getElementById('d-val').textContent = presetLabels[inp.value];
    if (inp.value !== 'custom') {
      document.querySelector('.date-picker').classList.remove('open');
    }
  });
});
document.getElementById('d-start')?.addEventListener('change', () => {
  document.querySelector('input[name="datepreset"][value="custom"]').checked = true;
  const s = document.getElementById('d-start').value;
  const e = document.getElementById('d-end').value;
  if (s && e) document.getElementById('d-val').textContent = `${s} → ${e}`;
});
document.getElementById('d-end')?.addEventListener('change', () => {
  document.querySelector('input[name="datepreset"][value="custom"]').checked = true;
  const s = document.getElementById('d-start').value;
  const e = document.getElementById('d-end').value;
  if (s && e) document.getElementById('d-val').textContent = `${s} → ${e}`;
});

/* Granularity */
document.querySelectorAll('input[name="granularity"]').forEach(inp => {
  inp.addEventListener('change', () => {
    STATE.granularity = inp.value;
    document.getElementById('g-val').textContent = inp.value.charAt(0).toUpperCase() + inp.value.slice(1);
    renderChart();
  });
});

/* Metrics */
document.querySelectorAll('input[name="metric"]').forEach(inp => {
  inp.addEventListener('change', () => {
    let checked = [...document.querySelectorAll('input[name="metric"]:checked')];
    if (checked.length > 2) {
      const oldest = checked.find(c => c !== inp);
      if (oldest) oldest.checked = false;
      checked = checked.filter(c => c !== oldest);
    }
    if (checked.length === 0) { inp.checked = true; checked = [inp]; }
    STATE.metrics = checked.map(c => c.value);
    document.getElementById('m-val').textContent = STATE.metrics.length === 1 ? metricLabels[STATE.metrics[0]] : 'Multi';
    document.getElementById('m-badge').textContent = STATE.metrics.length;
    renderChart();
  });
});

/* Channels */
document.querySelectorAll('input[name="channel"]').forEach(inp => {
  inp.addEventListener('change', () => {
    const checked = [...document.querySelectorAll('input[name="channel"]:checked')];
    if (checked.length === 0) { inp.checked = true; return; }
    STATE.channels = checked.map(c => c.value);
    document.getElementById('c-val').textContent = STATE.channels.length === 4 ? 'All' : STATE.channels.length === 1 ? C[STATE.channels[0]].name : 'Custom';
    document.getElementById('c-badge').textContent = STATE.channels.length;
    renderChart();
  });
});

/* Tabs */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach(c => c.hidden = c.dataset.tab !== tab);
  });
});
</script>
</body>
</html>

```

<!-- End of Appendix A — Canonical Widget HTML -->
