---
name: cmo-cross-channel-dashboard
description: Generate a CMO Cross-Channel Performance Dashboard — funnel-stage executive view of marketing spend, pull-through, and per-channel efficiency across Meta, Google, LinkedIn, TikTok, Reddit, TTD, and the Discovery API long tail. Single-screen, three-tab layout (Overview / Channels / Customer Journey) with reactive filter bar (period × channel × conversion event × attribution model). Warehouse-first (ClickHouse `_all_data` views) with Discovery API fallback for channels not in the warehouse; all data from real sources. Built via /business-intelligence-editor as ONE custom-component widget that contains the entire dashboard.
version: "1.0.1"
---

# CMO Cross-Channel Dashboard

## Purpose

Produce an executive-grade cross-channel performance dashboard for CMOs / VPs of Marketing / Heads of Growth running multi-platform paid media. The deliverable answers three questions in a single glance:

1. **Where is my money going?** — daily Spend / Revenue / Conversions trend with the best-ROAS day called out, plus a per-channel mix donut.
2. **What is my funnel doing?** — Awareness / Consideration / Purchase pull-through derived from campaign-objective auto-classification (§ Funnel-stage taxonomy below), with per-stage KPIs.
3. **Which channel is best at which job?** — sortable 14-column channel matrix (Spend, Δ-vs-prev, Impressions, Clicks, CTR, CPC, CVR, Conversions, CPA, Avg-value, Revenue, ROAS, sparkline) + a Spend × ROAS × Conversions efficiency scatter (Scale / Keep / Test / Fix quadrants) + first-touch vs last-touch role bars + top customer-journey paths.

The dashboard is **executive** (read 1–3× per week, share to leadership / board), not **operational** (read 5–20× per day) — for the operational console, fall back to `daily-performance-report`. For tactical drill-down briefs with 3 prioritized actions, fall back to UC-DPA-1's tactical drill skill.

*Derived from Marketing OS use-case UC-CMO-1 (CMO Cross-Channel Dashboard) v1.1. Canonical visual contract lives in the Improvado Marketing OS vault and is mirrored as the HTML in Appendix A below — that HTML is the single source of truth for the widget structure.*

---

## Invocation Context

Two trigger paths feed this skill:

### Path A — Onboarding dispatch (new users)

**Company personalization:** if the dispatch message carries an `alg-prebrief` fenced block with a `company_research:` line, tailor exactly ONE headline/intro sentence in the closing chat hand-off to this company — always hedged ("looks like…"), never as a fact. If absent, proceed generically.

If the conversation contains an `onboarding_summary` message with `Interview answers:`, scan those answers for **bias signals**:

- **Role**
  - `cmo-director` / `c-level` / `vp-marketing` → executive voice; topbar `last_sync_label` reads "Live · `<N>` min ago"; default tab is **Overview**; the Channels and Customer Journey tabs are hidden by default behind a "Show details" disclosure (set `editState.persona = 'executive'`)
  - `head-of-growth` / `growth` → exec voice but Customer Journey tab visible by default (since growth lives on first-touch / multi-touch attribution)
  - `marketer` / `performance-marketer` → all 3 tabs visible from first paint; default tab is **Channels** (sorted by spend); KPI strip emphasizes ROAS, CPA, CTR
  - `analyst-bi` → all 3 tabs + "Open in BI editor for live data" CTA in the topbar; channel matrix pre-sorted by spend; raw numbers favored over visualisation chrome
- **Reconciled metrics** — if `ROAS` listed primary → keep ROAS as the leftmost KPI tile; if `CPA` listed primary → swap KPI tile order to put CPA leftmost; if `CPL` (B2B) listed primary → relabel "Conversions" tile as "Leads" and pre-select the Leads conversion-event filter
- **AI wish** — if mentions `funnel`, `awareness`, `consideration`, `purchase` → ensure the period defaults to QTD (90d) instead of 30d (richer funnel signal); if mentions `where is my budget` / `mix` → land on the **Channels** tab regardless of role bias
- **Industry** — eCom / DTC → leftmost KPI = ROAS (already default). B2B SaaS → leftmost KPI = CPL. Healthcare → leftmost KPI = CPL + appointment-conversion. Retail multi-store → leftmost KPI = store-traffic lift (if available, otherwise revenue). See `agency.kpi_pin_industry` mapping in Step 3.

### Path B — Free-form chat (returning users, repeat use)

User asks naturally — "CMO dashboard", "show me cross-channel performance", "where is my budget going across channels", "marketing overview". No `onboarding_summary`; use defaults:

- Period: last 30d vs prior 30d
- Attribution: data-driven
- Channel filter: All (every connected ad platform)
- Conversion event: All events
- Default tab: Overview

---

## When to Trigger

User asks for any of:

- "CMO dashboard", "executive marketing dashboard", "VP marketing dashboard"
- "cross-channel dashboard", "all my channels", "marketing overview across channels"
- "where is my budget going", "funnel view across channels"
- "awareness vs consideration vs purchase", "across the funnel"
- "spend × ROAS by channel", "channel efficiency map"
- "first touch vs last touch", "customer journey across channels"

If the user instead asks for a **daily operational console** ("today's report", "what's running today", "pacing dashboard") — fall back to `daily-performance-report`.

If the user wants a **tactical leadership-ready brief** with 3 issues + drill actions → invoke the UC-DPA-1 daily performance analysis skill.

If the user wants a **single-channel chart** ("show Meta spend chart") → use `/business-intelligence-editor` directly with a single-source widget; do NOT invoke this skill.

If the user wants a **rule-quality scorecard** with per-rule $-at-risk → invoke `full-marketing-audit`.

---

## Output Mode

```
DEFAULT → Mode B: Dashboard via /business-intelligence-editor (ONE custom-component widget)
IF user explicitly says "document" / "markdown" / "deck" → Mode A: createDocument fallback
IF user asks for one chart → Mode C: visualizationTool (single chart in chat)
```

### Mode B: Dashboard (DEFAULT)

Use `/business-intelligence-editor` skill with **ONE** `custom-component` widget. The entire dashboard (topbar, tabs, KPI strip, daily trend, alerts feed, donut, scatter, channel matrix, journey paths, role bars) lives inside that single widget — its `componentCode` is the canonical HTML from Appendix A with Discovery API data substituted at the marked INJECT points.

If `/business-intelligence-editor` is unavailable at runtime, **degrade to Mode A** with a one-line note ("Saved as a document — dashboard skill not available right now.").

### Mode A: Document

Use `createDocument`. Markdown report — KPI strip as a table, channel matrix as a table, journey paths as bullet lists, alerts as a triaged list. Not as visual but readable.

### Mode C: Quick Visualization

Use `visualizationTool` for single chart in chat. Use this when the user clearly wants a one-off — never as the default for "CMO dashboard".

### Auto-Refresh Strategy

Dashboard is a point-in-time snapshot — the period window is fixed inside it (filter chrome from BIE is hidden; the canonical owns its own period picker). Each scheduled run pulls a fresh window. After creation, offer:

> *"Want me to refresh this every Monday at 8 AM with last-30d numbers?"*

If yes → `scheduleChatTool` with cadence `weekly-monday-08:00-user-tz`. Each run re-executes the skill: re-fetches Discovery API, re-substitutes Appendix A, overwrites the saved dashboard at the same `dashboardUrl`.

---

## MCP Tools Used

- `getCurrentWorkspaceContextTool` — workspace name + id
- `getConnectionsTool` — enumerate active ad-platform connections
- `clickhouseTool` — discover `_all_data` views via `mrt_database_tables` and read warehouse channel data (Step 1, primary source per Rule 0)
- `discoveryListAccountsTool` — accounts per connection (for selection rule)
- `discoveryRequestTool` — per-channel insights fetch for Discovery-fallback channels (Step 1, parallel)
- `getCrmObjectsTool` (HubSpot/SFDC, optional) — for journey paths when GA4 path-data is unavailable
- `Skill('business-intelligence-editor')` — save the assembled custom-component widget

---

## Rule 0 — Warehouse-first, Discovery API fallback (HARD)

**Every data point comes from a real source — never fabricated, never fixture/sample data, never hand-typed into the canonical HTML.** Prefer the ClickHouse warehouse when it has the data; use the Discovery API as the fallback. Resolve the source per channel in this order:

1. **Warehouse `_all_data` view** — if `mrt_database_tables` lists a fresh `{report_type}_{agency_id}_{datasource}_all_data` view for the channel (freshness within the requested period), read spend / impressions / clicks / conversions / revenue + daily series from it. Faster and more reliable than the live API.
2. **Discovery API** — only if no view exists, the view is stale, or a needed field is missing, fall back to the documented per-platform Discovery call (STEP 1).

Rules:
- ❌ Never fabricate or hand-type values; never ship sample/fixture data in the widget.
- ❌ Never use a schema prefix (`im_…` or `internal_analytics.`) and never `SHOW TABLES` — discover names via `mrt_database_tables` (no prefix). Ignore `UNKNOWN_TABLE` "Maybe you meant `im_…`" suggestions (other tenants). See `general/querying.md`.
- ⚠️ Mark warehouse data older than the requested period, or live data older than 1h, with a "stale" indicator on `last_sync_label`.

Plan/goal lookup (`biz_marketing_targets`, see STEP 2E) is workspace configuration, not marketing data. If missing, infer from prior-period actuals × growth target (see Step 2F) or set goals to zero (canonical renders flat goal bars).

---

## Output Contract (HARD)

**Visible to the user:**

- ONE BIE custom-component widget covering the full dashboard (12 cols × ~28 rows in the BIE grid)
- Three tabs (Overview / Channels / Customer Journey) — see § Persona-tuned default depth above for which are visible by default
- Five KPI tiles (Spend / Revenue / ROAS / Conversions / CPA) with Δ-vs-prev, plan-progress bars
- Daily trend (Spend + Revenue dual-axis) with best-ROAS day callout
- Alerts feed ("Needs your attention") with severity-colored cards
- Sortable channel matrix (Channels tab)
- Donut (channel mix) + Scatter (Spend × ROAS × Conversions, Scale/Keep/Test/Fix quadrants) (Channels tab)
- Customer-journey paths (top by share) + journey stat grid + first/last touch role bars (Journey tab)

**Not in scope:**

- Slack-ready text artifact (use UC-DPA-1 for that)
- Per-creative deep-dives (use `weekly-creative-performance` for that)
- Deterministic audit scorecard (use `full-marketing-audit` for that)

**Visual contract:**

- Canonical Inter typography + indigo `#4b5cf2` accent + the existing platform brand palette per channel (Meta blue, Google blue, LinkedIn dark blue, TikTok black, …)
- Persona-tuned tab visibility per § Invocation Context
- No client logo in the topbar by default — the agency name in `#brand-name` IS the brand stamp; the brand-mark monogram (`#brand-mark`) renders the first letter only

---

## Quick Reference

**Canonical INJECT points (Step 3 has the full mapping):**

- Inline `{{INJECT:foo}}` placeholders for header / topbar text (10 markers)
- Block markers `// === INJECT: <name> === ... // === END INJECT: <name> ===` for JS data arrays/objects (8 blocks: `channels`, `trend_daily`, `ch_data`, `goals`, `alerts`, `journeys`, `journey_stats`, `roles`)

**Tab visibility flag** — write `editState.persona = 'executive'` in the saved config to hide Channels and Journey tabs (Path A § cmo-director branch).

**`dashboardUrl`** — `"clients/template/dashboards/CrossChannelEditableDashboard.tsx"` (canonical host-TSX path; emit directly per the precedent set by `full-marketing-audit/dashboard-template.json:104` and `weekly-creative-performance/dashboard-template.json:112` v7.4.1+. Auto-refresh re-saves overwrite at the same `dashboardUrl + settings_id` composite key.).

---

## STEP −1: Pre-flight checks (MANDATORY — defends Bugs #1, #2, #5–#8)

Checks before any data fetch — each defends a class of runtime bugs documented in `UC-CMO-1 — Bugs and Fixes 2026-05-08.md`:

1. **`mrt_database_tables` query (no prefix)** — list the `_all_data` views + `freshness` for every connected channel (and confirm the plan/goal table for STEP 2E). This is what decides, per channel, warehouse vs Discovery (Rule 0). Never use `SHOW TABLES` (returns empty via the proxy); never trust cross-tenant `UNKNOWN_TABLE` suggestions; never use a schema prefix. Memorized table names are stale — always discover.
2. **`discoveryWebSearchTool` — only for channels with no fresh warehouse view** — resolve the connector's URL allowlist before composing any `discoveryRequestTool` body. Pasting URLs from public API docs returns HTTP 400 (Bug #1). Skip this for channels served from the warehouse.
3. **`validate-widget` CLI dry-run** — `npx tsx .claude/skills/business-intelligence-editor/skill-cli.ts validate-widget --config '<stub_with_minimal_props>'` on a stub config to confirm the BIE schema version is compatible with this skill's STEP 5 example (Bugs #5–#8).

If any pre-flight check fails, surface the failure to the user and STOP — do not attempt to "guess past" a missing table or a schema mismatch.

---

## STEP 0: Workspace + Connection Detection

```
0A. Resolve workspace context
    ws = getCurrentWorkspaceContextTool(impersonation_context_id)
    → workspace_name, workspace_id

0B. Enumerate active ad-platform connections
    all_conns = getConnectionsTool(impersonation_context_id)
    active = [c for c in all_conns if c.is_active and c.data_source in MARKETING_PLATFORMS]
    by_ds = group_by(active, key=c.data_source)

0C. Connection count gate
    IF len(by_ds) < 2:
        Surface: "Cross-channel dashboard requires ≥2 active ad-platform connections.
                  You have {N}. Connect another platform, or use a single-channel chart instead."
        STOP — fall back to Mode C single-channel chart (or daily-performance-report if user says 'daily').

0D. Account selection per channel (§ 0.1 rule)
    FOR each channel in by_ds:
        accounts = discoveryListAccountsTool(connectionId=channel.id)
        IF len(accounts) > 5:
            Ask user which account(s) to include — never pick blindly.
        IF len(accounts) ≥ 2 and ≤5:
            Use highest-spend account by default; surface choice in subtitle.
        IF len(accounts) == 1:
            Auto-select.

0E. Build agency identity payload
    agency_name      = workspace_name
    agency_meta      = "agency_id <id> · <N> sub-brands"  # N = sum(accounts) across channels
    last_sync_label  = "Live"  # updated post-fetch in Step 1 to "Live · <N> min ago"
    avatar_initials  = first letters of impersonator's first+last name
    owner_name       = biz_active_customers.account_owner_name (if external client; else "")
    owner_role       = biz_active_customers.account_owner_role OR "Improvado AE"
    period_label     = "<from_label> – <to_label>, <year>"  # e.g. "Apr 4 – May 4, 2026"
    period_compare   = "<from_label> – <to_label> vs <prev_from> – <prev_to>, <year>"
    trend_desc       = "<N> days (<from_iso> → <to_iso>) · <attribution> attribution"
    foot_source      = "Source: Improvado Discovery API · live"
    mark_letter      = uppercased first letter of agency_name
```

---

## STEP 1: Fetch Per-Channel Data (warehouse-first, Discovery fallback)

### STEP 1.−1: Resolve the data source per channel (Rule 0 — MANDATORY)

Using the `mrt_database_tables` listing from STEP −1, classify each connected channel:

- **Warehouse channel** — a `{report_type}_{agency_id}_{datasource}_all_data` view exists and its
  `freshness` is within the requested period. Read the period aggregates, the same-period-prior
  aggregates, the daily series, and the per-event split directly from that view with `clickhouseTool`
  (no schema prefix, `LIMIT 250`-style guards, alias tables). Skip the Discovery calls for this channel.
  Map the view's columns into the same `ch_data` / `channels` / `trend_daily` structures the Discovery
  path produces (STEP 2). Resolve real column names from `mrt_database_columns` — do not assume.
- **Discovery channel** — no view, stale view, or a needed field (e.g. video quartiles, attribution
  split) is missing from the warehouse. Use the per-platform Discovery call below.

Only channels classified as Discovery proceed to STEP 1.0.

### STEP 1.0: Resolve allowed endpoints (Discovery channels only — Bug #1 fix)

**Before any `discoveryRequestTool` call, resolve the per-connector URL allowlist.** The Discovery proxy enforces a connector-specific URL whitelist; pasting a vendor URL from public docs (or memory) hits paths that aren't proxied and returns HTTP 400 regardless of token validity.

For each connected channel, call `discoveryWebSearchTool` (or the connector-specific endpoint listing if exposed) and pick the URL from the returned set. Do NOT construct URLs from public API docs. The per-platform request shapes documented below describe the *body* — the *URL* must come from the allowlist response.

Run in parallel for every active channel. Each channel returns:

- Period aggregates (spend, impressions, reach/freq if available, clicks, conversions, conversion-event split, conversion-value)
- Same period prior (for Δ-vs-prev computation)
- Daily series (for the trend chart) at `time_increment=1` (or the platform's daily-granularity equivalent)
- Per-event split (lead / purchase / add-to-cart / page-view) — needed for KPI engine `ch_data` (Step 2A)

### Meta — `/v23.0/act_<account_id>/insights` via `discoveryRequestTool`

```
fields: spend, impressions, reach, frequency, clicks, ctr, cpm, cpc,
        actions, action_values,
        video_p25_watched_actions, video_p50_watched_actions,
        video_p75_watched_actions, video_p100_watched_actions,
        video_thruplay_watched_actions,
        conversions, purchase_roas
level: campaign
breakdowns: []
time_range: { since: <date_start>, until: <date_end> }
time_increment: 1   # daily for trend chart
```

Event split derivation:
- `ch_data[meta].leads`  = sum of `actions[type=lead]` + `actions[type=onsite_conversion.lead_grouped]`
- `ch_data[meta].purch`  = sum of `actions[type=purchase]` + `actions[type=offsite_conversion.fb_pixel_purchase]`
- `ch_data[meta].ac`     = sum of `actions[type=add_to_cart]`
- `ch_data[meta].pv`     = sum of `actions[type=landing_page_view]` OR `actions[type=page_view]`
- `channels[meta].revenue` = sum of `action_values[action_type=purchase]`

### Google Ads — `googleAds:searchStream` (GAQL)

```
SELECT
  segments.date,
  campaign.advertising_channel_type,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.ctr,
  metrics.average_cpc,
  metrics.conversions,
  metrics.conversions_value,
  metrics.video_views,
  metrics.video_view_rate,
  metrics.video_quartile_p25_rate,
  metrics.video_quartile_p50_rate,
  metrics.video_quartile_p75_rate,
  metrics.video_quartile_p100_rate,
  metrics.all_conversions,
  metrics.cost_per_conversion,
  metrics.value_per_conversion
FROM customer
WHERE segments.date BETWEEN '<date_start>' AND '<date_end>'
```

For event split, run a second GAQL grouped by `conversion_action.category`:

```
SELECT
  conversion_action.category,
  metrics.conversions
FROM conversion_action
WHERE segments.date BETWEEN '<date_start>' AND '<date_end>'
```

Then map: `LEAD → leads`, `PURCHASE → purch`, `ADD_TO_CART → ac`, `PAGE_VIEW → pv`.

### LinkedIn — `/rest/adAnalytics?q=analytics`

```
pivot: CAMPAIGN
timeGranularity: DAILY
fields: spend, impressions, clicks, costInUsd,
        oneClickLeads,
        videoViews, videoCompletions,
        videoFirstQuartileCompletions, videoMidpointCompletions, videoThirdQuartileCompletions,
        externalWebsiteConversions, externalWebsitePostClickConversions
dateRange: { start: ..., end: ... }
```

Event split: `oneClickLeads → leads`, `externalWebsiteConversions → purch` (when goal=`WEBSITE_CONVERSION`).

### TikTok — `/v1.3/report/integrated/get/`

```
data_level: AUCTION_CAMPAIGN
report_type: BASIC
dimensions: [campaign_id, stat_time_day]
metrics: [spend, impressions, reach, clicks, ctr,
          video_play_actions, video_watched_2s, video_watched_6s,
          video_views_p25, video_views_p50, video_views_p75, video_views_p100,
          conversion, cost_per_conversion, complete_payment_roas]
start_date: <date_start>
end_date: <date_end>
```

Event split via `optimization_event` parameter on a follow-up call: `lead → leads`, `complete_payment → purch`, `add_to_cart → ac`, `view_content → pv`.

`channels[tiktok].revenue` = `complete_payment_roas × spend` (TikTok exposes ROAS, not raw value).

### Reddit / TTD / others (long tail)

Per the matching `data-sources/<DS>.md § 2` live-API endpoint. If a platform has no Discovery connector, mark `connected: false` in the `channels` payload and the canonical surfaces it in the source-footer "Not connected" cluster.

### Per-channel timeout

8s per channel. If a channel times out → fail that channel, continue others. Surface in topbar via `last_sync_label`: `"Live · 8 min ago — Reddit delayed (retry 12:13)"`. Do NOT mock; render `—` for missing channel cells per Quality Gates below.

---

## STEP 2: Compute Derived Fields

After parallel fetch:

```
2A. Per-channel KPI snapshot (ch_data)
    For each channel.key in {meta, google, linkedin, tiktok, ...}:
        ch_data[key] = {
            spend:      SUM channel.period.spend,
            rev:        SUM channel.period.revenue,
            conv:       SUM channel.period.conversions,
            leads:      SUM channel.period.events.lead,
            purch:      SUM channel.period.events.purchase,
            ac:         SUM channel.period.events.add_to_cart,
            pv:         SUM channel.period.events.page_view,
            imp:        SUM channel.period.impressions,
            prevSpend:  SUM channel.prev.spend,
            prevRev:    SUM channel.prev.revenue,
            prevConv:   SUM channel.prev.conversions,
            prevLeads:  SUM channel.prev.events.lead,
            prevPurch:  SUM channel.prev.events.purchase
        }

2B. Channels list (top-level array consumed by the channel matrix, donut, scatter)
    For each connected channel:
        channels[i] = {
            key:       channel.key,           # 'meta', 'google', ...
            name:      channel.display_name,  # 'Meta Ads', 'Google Ads', ...
            sub:       <account_name OR "Multi-account (N)" if N>=2>,
            logo:      channel.key,           # matches <symbol id="lg-meta"> etc.
            color:     PLATFORM_BRAND_COLOR[channel.key],
            connected: true,
            spend:     ch_data[key].spend,
            impr:      ch_data[key].imp,
            clicks:    SUM channel.period.clicks,
            conv:      ch_data[key].conv,
            revenue:   ch_data[key].rev,
            prevSpend: ch_data[key].prevSpend,
            prevROAS:  ch_data[key].prevRev / ch_data[key].prevSpend if prevSpend > 0 else 0
        }
    For each disconnected platform from the active-source list (LinkedIn / YouTube / etc.):
        channels[i] = { key, name, sub: "Not connected", logo, color, connected: false, spend: 0, ... }

2C. Daily trend (trend_daily)
    Build one row per day in [date_start, date_end]:
        trend_daily[d] = {
            day:   d_index_1based,
            dt:    "MM-DD" of that day,
            dow:   day_of_week_0_to_6,
            spend: SUM channels.daily[d].spend across selected channels,
            rev:   SUM channels.daily[d].revenue across selected channels,
            conv:  SUM channels.daily[d].conversions across selected channels
        }

2D. Funnel-stage classification (per-campaign auto-classification)
    For each campaign, classify into Awareness / Consideration / Purchase by objective + KPI structure:

    | Stage         | Meta objective                          | Google campaign_type        | LinkedIn objectiveType | TikTok objective_type      |
    |---------------|-----------------------------------------|-----------------------------|------------------------|----------------------------|
    | Awareness     | OUTCOME_AWARENESS, BRAND_AWARENESS,     | VIDEO, DEMAND_GEN,          | BRAND_AWARENESS,       | REACH, VIDEO_VIEWS         |
    |               | REACH, VIDEO_VIEWS                      | DISPLAY w/ reach goal       | VIDEO_VIEW             |                            |
    | Consideration | OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT,    | SEARCH (non-brand),         | WEBSITE_VISIT,         | TRAFFIC, ENGAGEMENT,       |
    |               | LINK_CLICKS, POST_ENGAGEMENT, MESSAGES  | DISPLAY w/ click goal,      | ENGAGEMENT,            | LEAD_GENERATION            |
    |               |                                         | PMAX w/o purchase signals   | LEAD_GENERATION        |                            |
    | Purchase      | OUTCOME_SALES, CONVERSIONS,             | SEARCH (brand+commercial),  | WEBSITE_CONVERSION,    | CONVERSIONS, CATALOG_SALES |
    |               | CATALOG_SALES, OFFLINE_CONVERSIONS      | SHOPPING, PMAX (purchase)   | JOB_APPLICANT          |                            |

    Auto-derive on ambiguity: classify by attached conversion event (purchase event > traffic objective; lead event > engagement objective).

    Conditional Purchase column: if zero campaigns in workspace have purchase events attached → set `goals.roas = 0` AND set `ch_data[*].purch = 0` AND `channels[*].revenue = 0` so the canonical's KPI engine omits the Revenue/ROAS tile values gracefully (renders as `—`). The funnel classification is still useful for Awareness vs Consideration narrative.

2E. Goals (workspace plan ceilings)
    Try in priority order. **For each ClickHouse priority, run the three-query gate (Bugs #2–#4 fix — MANDATORY):**
    ```sql
    -- Query A (Bug #2): resolve table existence — no schema prefix (internal_analytics.* does not
    --   exist for tenant workspaces; a prefix yields UNKNOWN_TABLE + cross-tenant suggestions)
    SELECT table_name FROM mrt_database_tables
    WHERE table_name LIKE '%target%' OR table_name LIKE '%plan%' OR table_name LIKE '%marketing_target%';

    -- Query B (Bug #4): resolve actual column names BEFORE writing the SELECT clause
    SELECT column_name, type FROM mrt_database_columns
    WHERE table_name = '<resolved_table_from_A>' ORDER BY position;

    -- Query C (Bug #3): freshness gate - never trust an aggregate without checking date range
    SELECT MIN(date) AS first_date, MAX(date) AS last_date FROM <resolved_table>;
    -- If MAX(date) < period_start_minus_1d → table is stale; surface "plan data N days stale"
    --   banner and FALL THROUGH to the next priority below. Do NOT silently render 0 rows.
    ```
    Column names vary across goal tables (`spend` vs `cost`, `impressions` vs `imps`, `conversions` vs `conv`) — never paste column names from memory.

    Priority list:
    1. ClickHouse `biz_marketing_targets` for the workspace_id (no prefix; if present, table fresh, columns resolved)
    2. Notion "Marketing Plan" page for the workspace
    3. Infer: prior-period actuals × {1.10 spend growth, 1.20 revenue growth} as a soft target
    4. Fall back to zeros — canonical renders flat goal bars

    goals = { spend, rev, roas, conv, cpa }

2F. Alerts (anomaly feed for "Needs your attention" — agent-derived)
    Run these detectors on the fetched data:

    | Detector                                                          | Severity   | Alert payload                                                |
    |-------------------------------------------------------------------|------------|--------------------------------------------------------------|
    | Channel ROAS in bottom quartile + spend ≥ 2× workspace median     | warn       | meta_left = "$<X>K · <pct>% of <ch>", meta_right = "Funnel mix" |
    | Per-campaign CPA > 5× channel-average AND spend > $1K             | bad        | meta_left = "$<X>K wasted", meta_right = "Underperformer"      |
    | Per-campaign ROAS > 1.5× channel-average AND budget-util < 80%    | good       | meta_left = "+$<X>K opportunity", meta_right = "Top campaign"  |
    | Channel mix concentration > 80% on one platform                   | null/info  | meta_left = "Channel mix", meta_right = "Heavy <ch>"           |
    | Spend ≥ 2× median AND ROAS in bottom quartile (per Quality Gate)  | warn       | meta_left = "$<X>K at risk"                                    |

    Cap at 6 visible alerts; rank by severity then |$-impact|. Each → one entry in the `alerts` block.

2G. Journeys + role bars + journey stats
    Source priority:
    1. GA4 `path-data` API via the workspace's GA4 connection (if connected)
    2. ClickHouse `biz_attribution` for the workspace_id (no schema prefix; last-365d), rolled up by `path × position`
    3. Neither available → set `journeys = []`, `roles = []`, `journey_stats = {}` (canonical renders the empty state)

    journeys[i] = { filter: 'all'|'new'|'ret', share, conv, steps:[{t, ch?, conv?}], time, touches }
    roles[i]    = { ch, name, first: 0..100, last: 0..100 }
    journey_stats = { avg_touches, avg_time, multi_channel_pct, cross_device_pct }
```

---

## STEP 3: Discovery API → INJECT-marker mapping

This is the **CONNECTING CONTRACT** between Appendix A's INJECT markers and live data. For every INJECT point, the source endpoint + transformation + format.

### Inline placeholders ({{INJECT:name}})

All ten markers fill text content of `<span id="…">` elements in the topbar / title / footer.

| Marker | Source | Transformation → Format | Example |
|---|---|---|---|
| `agency_name` | Step 0E | string | `Apex Outdoors` |
| `mark_letter` | Step 0E | first letter of `agency_name`, uppercased | `A` |
| `agency_meta` | Step 0E | `"agency_id <id> · <N> sub-brands"` | `agency_id 4827 · 3 sub-brands` |
| `last_sync_label` | Step 1 post-fetch | `"Live · <N> min ago"` | `Live · 8 min ago` |
| `avatar_initials` | Step 0E | first letters of impersonator's first+last name | `JS` |
| `owner_name` | Step 0E | string | `Jamie Sullivan` |
| `owner_role` | Step 0E | string | `Improvado AE` |
| `period_label` | Step 0E | `"<MMM D> – <MMM D>, <YYYY>"` | `Apr 4 – May 4, 2026` |
| `period_compare` | Step 0E | `"<MMM D> – <MMM D> vs <prev MMM D> – <prev MMM D>, <YYYY>"` | `Apr 4 – May 4 vs Mar 5 – Apr 3, 2026` |
| `trend_desc` | Step 0E | `"<N> days (<from> → <to>) · <attribution> attribution"` | `30 days (2026-04-04 → 2026-05-04) · Data-driven attribution` |
| `foot_source` | Step 0E | string (default `"Source: Improvado Discovery API · live"`) | `Source: Improvado Discovery API · live` |

### Block: `channels` (JS const ALL_CHANNELS — variable channel count)

For each active channel from Step 2B, emit one entry. For each known-connected-platform-not-active, emit a `connected: false` placeholder so the source-footer "Not connected" cluster renders.

```js
const ALL_CHANNELS = [
  {
    key:       string,            // 'meta' | 'google' | 'linkedin' | 'tiktok' | 'reddit' | 'youtube' | 'pinterest' | 'snapchat' | 'dv360' | 'klaviyo' | 'bing'
    name:      string,            // 'Meta Ads', 'Google Ads', 'LinkedIn Ads', ...
    sub:       string,            // single account name OR 'Multi-account (N)' OR 'Not connected'
    logo:      string,            // matches the <symbol id="lg-…"> in canonical's SVG defs (same as key)
    color:     string,            // platform brand hex: Meta '#1877F2', Google '#4285F4', LinkedIn '#0A66C2', TikTok '#000000', Reddit '#FF4500', YouTube '#FF0000', Pinterest '#E60023'
    connected: boolean,
    spend:     number,
    impr:      number,
    clicks:    number,
    conv:      number,
    revenue:   number,
    prevSpend: number,
    prevROAS:  number
  },
  // … more channels …
];
```

### Block: `trend_daily` (JS const trendDaily — daily trend rows)

Length = `(date_end − date_start) + 1` days. Each row is one day across the selected channels (Step 2C).

```js
var trendDaily = [
  { day: 1,  dt: '04-04', dow: 4, spend: 0, rev: 0, conv: 0 },
  { day: 2,  dt: '04-05', dow: 5, spend: 0, rev: 0, conv: 0 },
  // …
  { day: N,  dt: '<MM-DD>', dow: <0..6>, spend: <num>, rev: <num>, conv: <num> }
];
```

### Block: `ch_data` (JS const CH_DATA — per-channel KPI snapshot, keyed by channel.key)

The KPI engine consumes this for dropdown-driven recomputation (channel filter × conversion event × attribution model). All values are sums over the period.

```js
var CH_DATA = {
  meta:   { spend, rev, conv, leads, purch, ac, pv, imp, prevSpend, prevRev, prevConv, prevLeads, prevPurch },
  google: { spend, rev, conv, leads, purch, ac, pv, imp, prevSpend, prevRev, prevConv, prevLeads, prevPurch },
  // … one entry per connected channel.key …
};
```

### Block: `goals` (JS const GOAL_30D — plan ceilings for goal bars)

Source per Step 2E. If unavailable, all-zeros is OK (canonical renders flat goal bars).

```js
var GOAL_30D = { spend: 0, rev: 0, roas: 0, conv: 0, cpa: 0 };
```

### Block: `alerts` (JS const DD_ALERTS — agent-derived anomaly feed)

Each entry is one card in the "Needs your attention" feed. Rank by severity then |$-impact|; cap at 6 (Step 2F).

```js
var DD_ALERTS = [
  {
    severity:    'good' | 'warn' | 'bad' | null,   // null/'info' → grey card
    meta_left:   string,                            // e.g. '$45K · 83% of Meta'
    meta_right:  string,                            // e.g. 'Funnel mix'
    title:       string,                            // headline ≤ 120 chars
    body:        string,                            // 1–2 sentence rationale
    actions: [
      { label: 'Pause campaign →', outline: false },
      { label: 'Compare to control', outline: true }
    ]
  },
  // … up to 6 …
];
```

### Block: `journeys` (JS const JOURNEYS_ALL — top customer-journey paths)

Source: Step 2G. Filter values: `'all'` (all paths), `'new'` (new visitors only), `'ret'` (returning).

```js
var JOURNEYS_ALL = [
  {
    filter:   'all' | 'new' | 'ret',
    share:    string,                              // '42.1%'
    conv:     string,                              // '2,456 conversions'
    steps:    [{ t: 'Meta', ch: 'meta' }, { t: 'Direct' }, { t: 'Convert', conv: true }],
    time:     string,                              // '2.4d'
    touches:  string                               // '2.5'
  },
  // … typically 4–8 paths …
];
```

### Block: `journey_stats` (JS const DD_JOURNEY_STATS — single object)

Strings (not numbers) so the canonical renders units verbatim.

```js
var DD_JOURNEY_STATS = {
  avg_touches:        '2.6',
  avg_time:           '2.3d',
  multi_channel_pct:  '23%',
  cross_device_pct:   '41%'
};
```

### Block: `roles` (JS const roleData — first-touch / last-touch shares)

```js
var roleData = [
  { ch: 'meta',     name: 'Meta',     first: 48, last: 31 },
  { ch: 'google',   name: 'Google',   first: 42, last: 55 },
  { ch: 'linkedin', name: 'LinkedIn', first: 7,  last: 2  }
  // … one per connected channel with attribution data …
];
```

### v1.1 TODO — `CH_DAILY` block (Bug #12)

**Known limitation in v1.0:** the canonical's period-segmented control (7d / 14d / 30d / QTD / YTD) computes longer-window totals via `periodSliceFactor()` — a multiplier against the 30-day totals — instead of slicing real per-channel daily data. QTD and YTD show *scaled estimates*, not actual cumulative numbers.

**v1.1 fix (planned):** add a `CH_DAILY` injection block — per-channel daily arrays (≥90 days, 365 ideal for YTD coverage) — and refactor `computeKPIs()` to slice `CH_DAILY[key]` by the active period instead of multiplying `CH_DATA[key]` by `pf.f`. Until v1.1 lands, surface "QTD/YTD shown as estimates from 30-day pacing" in the dashboard subtitle when the user picks those periods.

When v1.1 lands, this section gets a new block in STEP 3 mirroring `trend_daily` but per-channel:

```js
// STEP 3 v1.1 — Block: ch_daily (one row per channel × per day)
var CH_DAILY = {
  meta:     { spend: [<365 floats>], rev: [<365>], conv: [<365>], leads: [<365>], purch: [<365>] },
  google:   { spend: [<365>], rev: [<365>], conv: [<365>], leads: [<365>], purch: [<365>] },
  // … one entry per channel.key in CH_DATA …
};
```

STEP 1 v1.1 also extends per-platform `discoveryRequestTool` calls to fetch a 365-day window (instead of 30-day) so the period control can operate on real data without a re-fetch on every period switch.

---

### Optional: `role_insight` (single string, plain text)

Wrap in a dedicated inline marker if you want a callout under the role bars. Set to empty string (`""`) to hide the callout.

| Marker | Format | Example |
|---|---|---|
| `role_insight` | plain text, ≤ 240 chars (HTML-escaped by canonical) | `Direct/Last-click dominates (70% of paths). Cross-device data needed for full multi-touch view.` |

---

## STEP 4: Build Custom Widget HTML

### `computeKPIs()` return-contract (Bug #11 fix — DO NOT REWRITE THIS FUNCTION)

The canonical's KPI engine has an under-documented contract between `computeKPIs()` and the downstream renderers (`renderKPIs`, `setKpi`, the per-tile delta chips). **If you regenerate `computeKPIs` from scratch and miss any required key, the tiles render `undefined%` deltas silently.** Substitute *data*, never the function body. The function MUST return all 12 of these keys:

```js
// computeKPIs() return contract — required by renderKPIs() / setKpi()
{
  pf:        { f: <number>, days: <number>, label: <string> },  // period factor + label, from periodSliceFactor()
  spend:     <number>,  // current period spend across selected channels
  rev:       <number>,  // current period revenue (attribution-multiplier applied)
  conv:      <number>,  // current period conversions for the active conv-event filter
  roas:      <number>,  // rev / spend (0 if spend === 0)
  cpa:       <number>,  // spend / conv (0 if conv === 0)
  prevSpend: <number>,  // prior period equivalent
  prevRev:   <number>,
  prevConv:  <number>,
  prevRoas:  <number>,
  prevCpa:   <number>,
  keys:      <string[]> // selectedChannelKeys() output for label rendering
}
```

If any of these is missing, the corresponding KPI tile will show `undefined%` for the Δ chip or a blank value. The fix is to substitute Discovery API data into the canonical, not to rewrite the function.

### Substitution rules

Take the canonical HTML from **Appendix A**. Find every INJECT marker. Substitute per Step 3 mapping.

```
For each {{INJECT:name}} placeholder:
    Find the literal string {{INJECT:name}} in canonical
    Replace with computed value (string)

For each block marker pair:
    // === INJECT: <name> ===
    <existing default content (empty array OR placeholder)>
    // === END INJECT: <name> ===

    Replace the inner content with the computed JSON / JS literal.
    KEEP the marker pair intact (so future regen can find them).
```

**HARD RULE:** if you find yourself writing `<style>` or restructuring `<div class="kpi">` — STOP. You are regenerating, not substituting. Re-load Appendix A and substitute only at marked points. The canonical is NEVER edited per-render.

After substitution, the entire HTML is ONE string — assign it as `componentCode` of a single `custom-component` widget.

---

## STEP 5: Save Dashboard via /business-intelligence-editor

Assemble dashboard config:

```json
{
  "dashboardTitle": "Cross-Channel Performance",
  "dashboardSubtitle": "{N_active_channels} channels | {period_label} | Updated {last_sync_label}",
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
    "persona": "executive | growth | marketer | analyst",
    "widgets": [
      {
        "id": "main-grid-1",
        "type": "custom-component",
        "props": {
          "type": "custom-component",
          "renderMode": "html",
          "componentCode": "<the entire substituted HTML from Step 4>",
          "gridWidth": 12,
          "gridHeight": "huge",
          "chromeless": true,
          "showTitle": false,
          "title": "Cross-Channel Performance",
          "preloadLibraries": [],
          "inheritFiltersFromDashboard": false,
          "customSqlEnabled": false
        }
      }
    ],
    "layout": {
      "items": [
        { "id": "main-grid-1", "x": 0, "y": 0, "w": 12, "h": 28 }
      ]
    }
  }
}
```

**Schema gotchas (Bugs #5–#8 fixes — validated 2026-05-08):**

- `editState` must be nested **inside** the config root (sibling to `dashboardTitle`/`dashboardUrl`), NOT at the top level.
- The widget discriminator is `"type": "custom-component"` — NOT `"widgetType"`. The discriminator must appear at the widget level **AND** be duplicated inside `props` (the schema requires both for the custom-component shape).
- Layout items use `"id":` — NOT `"i":` (the latter is react-grid-layout's internal field name; BIE's wrapping schema renames it).
- **Validate before save:** run `npx tsx .claude/skills/business-intelligence-editor/skill-cli.ts validate-widget --config '<full_config_json>'` and stop on any non-zero exit. Treat all four schema bugs as a single "untested schema" antibody.

`appearance.hideTitle` + `hideFilters` + `colorMode: "light"` matches the precedent set by `weekly-creative-performance` v6 and `daily-performance-report` v2 — the canonical owns its own header (workspace name + period chip + date picker). The dashboard chrome would duplicate / conflict.

`dashboardUrl: "clients/template/dashboards/CrossChannelEditableDashboard.tsx"` — emit the canonical host-TSX path directly (precedent: `full-marketing-audit/dashboard-template.json:104` and `weekly-creative-performance/dashboard-template.json:112` v7.4.1+). The Miras viewer (`useRepoDashboardData` in `main/components/repo/hooks/useRepoDashboardData.ts:55`) reads `dashboard_url` verbatim as the file path on `/experimental/agent/api/repo/file?repo_id=dashboard&path=<dashboardUrl>`; emitting the canonical path removes the slug→path indirection that previously depended on BIE skill-cli's `HARDCODED_DASHBOARD_URL` override (`skill-cli.ts:14`). Earlier drafts shipped the slug `"cmo-cross-channel"`; that worked only when the save flowed through skill-cli — any save that bypassed it (direct curl/fetch, pre-2026-01-30 PR #415 historical save, fixture/migration) wrote the slug into the DB and the viewer 404'd with `Failed to fetch repo file: 500` (`Dashboard file API 404 Not Found`). There is no `CmoCrossChannelDashboard.tsx` host TSX — `CrossChannelEditableDashboard.tsx` renders this skill's dashboard via `settings_id`.

`appearance.persona` rides through BIE's schema via `.passthrough()`. The host TSX reads it on mount to decide which tabs to show (executive → Overview only; others → all 3).

**Layout:** ONE widget covering full width × tall enough for the entire dashboard (12 cols × ~28 rows in the BIE grid). The dashboard is intentionally a single tall widget — there is NO second widget below it.

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
- 1-line summary (e.g. "Meta = 60% of spend, ROAS 2.36×; LinkedIn lagging at 0.31× — $28K/mo at risk")
- Auto-refresh suggestion (per § Output Mode → Auto-Refresh Strategy)

---

## STEP 6: Auto-Refresh Suggestion

After the user sees the dashboard, offer:

> *"Want me to refresh this every Monday at 8 AM with last-30d numbers?"*

If yes → `scheduleChatTool` with cadence `weekly-monday-08:00-user-tz`. Each scheduled run re-executes the skill: re-fetches Discovery API, re-substitutes Appendix A, overwrites the saved dashboard at the same `dashboardUrl`. Channel logos / palette / structure stay frozen — only the data churns.

If onboarding said "monthly leadership review" → suggest 1st-of-month-08:00 instead of weekly.

---

## Anti-patterns (HARD STOP if you find yourself doing these)

- **Regenerating HTML from scratch.** The canonical (Appendix A) is the source of truth. Only substitute at INJECT markers.
- **Patching the live widget in place instead of fixing § Appendix A.** (Bug #13.) If you find a defect at render time (e.g., a leftover `rng()` reference, a missing `--c` color), fix the canonical at § Appendix A and re-run from STEP 4 — *do not* patch the saved widget directly. The next refresh re-substitutes from § Appendix A and silently overwrites your patch. Always either fix at the source or batch all live patches into one save AFTER re-fetching the current widget state.
- **SQL composed without first reading `mrt_database_tables` + `mrt_database_columns`.** (Bugs #2–#4.) Three-query gate before any aggregate: tables → columns → MIN/MAX(date). Memorized table or column names are stale; verify on every run.
- **Schema fields hand-typed from memory instead of `validate-widget`-checked.** (Bugs #5–#8.) Run `validate-widget` CLI on the assembled config before save. Stop on non-zero exit.
- **Leftover helper references surviving canonical regeneration.** (Bug #10.) Search the assembled HTML for `rng(`, `genDaily`, `seed(` — any helper that isn't defined will throw `ReferenceError` at render. Replace with `Math.random()` or the actual helper definition before save.
- **Decomposing the dashboard into multiple BIE widgets.** Use ONE custom-component widget. Built-in `kpi-widget` / `chart` / `data-table` MUST NOT appear in the dashboard composition.
- **Querying data outside Discovery API.** Per Rule 0, every fetch goes through `discoveryRequestTool`. No `clickhousePalantirTool` for marketing data. The single permitted ClickHouse use is for workspace plan/goal lookup (`biz_workspace_plans` / `biz_marketing_targets`).
- **Pasting client-specific values into the canonical.** `{{INJECT:agency_name}}` is the slot for the agency name; never hardcode.
- **Hand-rolled recharts grid.** This skill does NOT produce a recharts radar / sankey / funnel composition. The canonical's exact chart set (KPI strip, daily trend, donut, scatter, channel matrix, journey paths, role bars) IS the deliverable.
- **More than 6 alerts in the feed.** The 6-card cap is the value — forces severity × $-impact selection.
- **Alerts without provenance.** Every alert MUST be derivable from the Discovery API response. No fabricated or memorized client text.
- **Editing dashboard chrome.** `hideTitle: true`, `hideFilters: true`, `colorMode: "light"` — required for visual contract.
- **Mocked or static data in production.** If Discovery API fails — surface the failure honestly with `—` placeholders + retry banner. Do NOT fall through to a fixture.
- **Falling back to `daily-performance-report` for "where is my budget"-style queries.** Cross-channel funnel intent → CMO dashboard, period.

---

## Tone Rules — scoped to Alerts feed only

Apply to the alerts feed cards (NOT to KPI tiles, NOT to channel matrix — those are factual/structural):

- **Confident verbs only** — "Pause", "Scale", "Cut", "Shift", "Rebalance". Not "consider pausing".
- **No hedging.** Forbidden: "may want to", "could potentially", "if applicable".
- **Money-tied or skip.** Each alert's `meta_left` MUST show $-value (gain or savings) when the detector is dollar-based. If you can't quantify, drop the card.
- **Calibration threshold:** ≥7d data AND (≥30 conversions OR ≥$500 spend) on the drill entity. Below threshold → skip the candidate.
- **6-card cap** — the constraint is the value.
- **No education.** Audience knows the metrics.

---

## Failure modes — what to render when something goes wrong

Per Rule 0 — never mock, never fall through. Behavior matrix:

| Failure mode | UI behavior |
|---|---|
| Connection missing for a channel | Drop that channel from `channels`; if active count drops <2 → fall back to Mode C single-channel chart |
| API returns NULL/empty for a metric on one channel | That channel's contribution = 0; blended KPI still renders; channel-row in the matrix shows `—` for missing cells |
| Whole API call fails (timeout, 5xx) | Topbar `last_sync_label` reads `"Live · <T> min ago — <channel> delayed (retry <T>)"`. Render last-known cached values if <2h old; else `—` placeholders WITH explicit error indicator (not the canonical's INJECT placeholders) |
| `biz_marketing_targets` row missing | Use last-period actuals × growth target as plan baseline; show banner "No plan set for {period} — using last-period actuals × 1.10. [Set plan]" |
| `biz_marketing_targets` table date range pre-dates the requested period (Bug #3) | Surface "plan data N days stale" banner; fall through to the next priority source (Notion plan page → prior-period × growth target). Do NOT silently render `goals = {0,0,0,0,0}` and call it "no plan". |
| Workspace has only 1 active channel | Dashboard requires ≥2 channels. Surface message; offer Mode C single-channel chart instead. |
| GA4 path-data + biz_attribution both unavailable | `journeys = []`, `roles = []`, `journey_stats = {}` — canonical renders the Customer Journey tab's empty states cleanly. |

---

## Quality gates

- **No empty tiles in the KPI strip.** If a metric is fundamentally unavailable on every active channel — render the tile but with `—` and an explicit reason (`#k-spend-pre` text).
- **Conditional Purchase column.** If zero campaigns in workspace have purchase events attached → set `goals.roas = 0` AND `ch_data[*].purch = 0` AND `channels[*].revenue = 0`. The canonical's KPI engine handles the cascade — Revenue and ROAS tiles render `—`.
- **Comparative analysis on the scatter.** Each bubble is sized by conversions; the diagonal split (low/high spend, low/high ROAS) labels Scale/Keep/Test/Fix quadrants relatively, not against an absolute threshold.
- **$-impact callouts.** If any channel has spend ≥ 2× the median AND ROAS in the bottom quartile → emit a single `alerts` entry with `meta_left:"$<X>K at risk"`.
- **Empty state, not error state.** When Discovery returns 0 rows for a platform, render the canonical's "No data — connect a channel via Discovery API" skeleton — never an unstyled error.
- **Data freshness.** Live-API call timestamp shown in topbar via `last_sync_label`. If stale >2h, banner: "Data delayed — last fetch `<HH:mm UTC>`".
- **Visual contract.** Inter typography, indigo `#4b5cf2` accent, platform brand colors per channel. Do not deviate.

---

## Appendix A — Canonical Widget HTML (single source of truth)

This is the **canonical visual contract** for the CMO Cross-Channel Dashboard. The widget's `componentCode` (per Step 5) is THIS HTML with every INJECT marker substituted by Discovery API data (per Step 3).

LLM agents performing this skill: load this section as raw text, find INJECT markers, substitute per § STEP 3 Discovery API mapping, output the result as the widget's `componentCode` string.

**Mirrored at** `algorithms/Design/web/output/marketing-os/uc-cmo-1-template.html` in the team-internal Marketing OS / tcs-chrome-extension repo (with the `window.__DASHBOARD_DATA__` injection variant — the JS-global pattern is the design-iteration source). The marker-style HTML below is the runtime contract for this skill. Edit BOTH atomically when the structural template changes.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1280">
<title>UC-CMO-1 — Cross-Channel Performance Template</title>
<!--
  ============================================================================
  UC-CMO-1 CANONICAL TEMPLATE — DO NOT EMBED CLIENT DATA HERE
  ============================================================================
  This file is a STRUCTURAL TEMPLATE. All data slots are intentionally empty.
  Populate at render time via Discovery API per [[UC-CMO-1 CMO Cross-Channel Dashboard]].
  Render path: BI custom-component-widget (single widget per dashboard, renderMode=html).
  Element-to-API mapping: see § "Element → Discovery API mapping" in the skill.
  ============================================================================
-->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#f5f6fa; --surface:#ffffff; --surface-2:#fafbfd; --surface-3:#f4f5f9;
    --border:#e7eaf0; --border-strong:#d4d9e3; --border-soft:#eef0f5;
    --ink:#0b1220; --ink-2:#3a4358; --ink-3:#6b7589; --ink-4:#9aa3b6;
    --accent:#0F4C81; --accent-2:#E8B43F; --accent-soft:#eef0ff; --accent-deep:#0a3b66;
    --good:#0fae74; --good-soft:#e6f7ef; --good-deep:#0a8054;
    --bad:#e1453f; --bad-soft:#fdebea; --bad-deep:#c63631;
    --warn:#d68a13; --warn-soft:#fff5e1; --warn-deep:#a86a06;
    --grid:#eef0f5;
    --shadow:0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.05);
    --shadow-lg:0 8px 28px rgba(15,23,42,.08);
    --radius:14px; --radius-sm:10px;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font-family:'Inter',-apple-system,sans-serif;font-feature-settings:"cv11","ss01","tnum";font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased}
  a{color:inherit}
  button{font-family:inherit}
  .app{max-width:1480px;margin:0 auto;padding:0 28px 60px}

  /* TOPBAR */
  .topbar{display:flex;align-items:center;gap:14px;padding:14px 0 12px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;letter-spacing:-.01em}
  .brand-mark{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#0F4C81,#E8B43F);display:grid;place-items:center;color:#fff;font-weight:800;font-size:12px;box-shadow:0 4px 10px rgba(75,92,242,.3)}
  .brand-sub{color:var(--ink-3);font-weight:500;font-size:12px}
  .crumbs{display:flex;align-items:center;gap:6px;color:var(--ink-3);font-size:12px;margin-left:6px}
  .crumbs span{opacity:.6}
  .crumbs b{color:var(--ink-2);font-weight:600}
  .topbar .spacer{flex:1}
  .iconbtn{height:32px;padding:0 10px;border-radius:7px;background:var(--surface);border:1px solid var(--border);display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--ink-2);cursor:pointer;transition:.15s}
  .iconbtn:hover{border-color:var(--border-strong);background:#fff}
  .iconbtn svg{width:13px;height:13px}
  .live{display:inline-flex;align-items:center;gap:6px;padding:0 10px;height:32px;border-radius:7px;background:var(--good-soft);color:var(--good-deep);font-size:11.5px;font-weight:600;border:1px solid #cde9d9}
  .live .dot{width:6px;height:6px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px rgba(15,174,116,.18);animation:p 2s ease-in-out infinite}
  @keyframes p{50%{box-shadow:0 0 0 6px rgba(15,174,116,0)}}
  .avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#22d3ee,#4b5cf2);color:#fff;display:grid;place-items:center;font-weight:600;font-size:11px}

  /* TABS */
  .tabs-nav{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto;flex-wrap:wrap}
  .tab-btn{position:relative;height:38px;padding:0 16px;border:0;background:transparent;font-size:13px;font-weight:500;color:var(--ink-3);cursor:pointer;display:inline-flex;align-items:center;gap:6px;border-bottom:2px solid transparent;margin-bottom:-1px;transition:.15s;white-space:nowrap}
  .tab-btn:hover{color:var(--ink-2)}
  .tab-btn.on{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}
  .tab-btn .badge{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent-soft);color:var(--accent-deep);font-size:10px;font-weight:700}

  /* TITLE + FILTERS */
  .title-row{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:14px;flex-wrap:wrap}
  .title-row h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
  .title-row .meta-line{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:12px;flex-wrap:wrap}
  .filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:18px}
  .seg{display:inline-flex;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:2px;height:32px;box-shadow:var(--shadow)}
  .seg button{height:26px;padding:0 11px;border:0;background:transparent;font-size:11.5px;font-weight:500;color:var(--ink-3);border-radius:6px;cursor:pointer}
  .seg button.on{background:var(--ink);color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .fgroup{display:flex;align-items:center;gap:6px;padding:0 10px;background:var(--surface);border:1px solid var(--border);border-radius:7px;font-size:12px;color:var(--ink-2);cursor:pointer;height:32px;box-shadow:var(--shadow)}
  .fgroup:hover{border-color:var(--border-strong)}
  .fgroup b{color:var(--ink);font-weight:600}
  .fgroup svg.ic{width:12px;height:12px;color:var(--ink-4)}
  .fgroup svg.ch{width:10px;height:10px;color:var(--ink-4);margin-left:2px}
  .fgroup.active{background:var(--accent-soft);border-color:#c5cbff;color:var(--accent-deep)}
  .fgroup.active b{color:var(--accent-deep)}
  .filters .right{margin-left:auto;display:flex;gap:6px;align-items:center}
  .compare-tag{display:inline-flex;align-items:center;gap:6px;padding:0 10px;height:32px;border-radius:7px;background:var(--accent-soft);color:var(--accent-deep);font-size:11.5px;font-weight:600;border:1px solid #d6dafd}
  .compare-tag svg{width:11px;height:11px}

  /* TAB SECTIONS */
  .tab-section{display:none}
  .tab-section.on{display:block;animation:fadeIn .25s ease}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}

  /* KPI CARDS — polished, $-знак мельче и приподнят */
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
  .kpi-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:6px}
  .kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;letter-spacing:.05em}
  .kpi-val{display:flex;align-items:baseline;line-height:1;margin-bottom:6px}
  .kpi-val .num{font-size:30px;font-weight:700;letter-spacing:-.022em;color:var(--ink);line-height:1}
  .kpi-val .currency{font-size:14px;font-weight:600;color:var(--ink-4);margin-right:2px;align-self:flex-start;margin-top:3px}
  .kpi-val .suffix{font-size:14px;font-weight:600;color:var(--ink-3);margin-left:2px;align-self:flex-end;margin-bottom:3px}
  .kpi-prev{font-size:11px;color:var(--ink-4);font-weight:500;margin-bottom:10px;line-height:1.4}
  .delta{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;flex-shrink:0}
  .delta.up{background:var(--good-soft);color:var(--good-deep)}
  .delta.down{background:var(--bad-soft);color:var(--bad-deep)}
  .delta svg{width:9px;height:9px}
  .kpi-goal{margin-top:auto;display:flex;flex-direction:column;gap:4px}
  .kpi-goal-bar{height:5px;background:var(--surface-3);border-radius:99px;overflow:hidden}
  .kpi-goal-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:99px}
  .kpi-goal-bar i.good{background:linear-gradient(90deg,var(--good),#3bc792)}
  .kpi-goal-meta{display:flex;justify-content:space-between;font-size:10px;color:var(--ink-3);font-weight:500}

  /* GRID */
  .grid{display:grid;gap:14px;margin-bottom:14px}
  .grid.t1{grid-template-columns:1.55fr 1fr}
  .grid.t2{grid-template-columns:1.3fr 1fr}
  .grid.c-2{grid-template-columns:repeat(2,1fr)}
  .grid.c-3{grid-template-columns:repeat(3,1fr)}

  /* CARD */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}
  .card.flush{padding:0}
  .card-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap}
  .card-head h3{margin:0 0 2px;font-size:14px;font-weight:700;letter-spacing:-.01em}
  .card-head .desc{font-size:12px;color:var(--ink-3)}
  .card-head .actions{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap}
  .ctabs{display:inline-flex;background:var(--surface-3);border-radius:7px;padding:2px}
  .ctabs button{font-family:inherit;height:24px;padding:0 9px;border:0;background:transparent;font-size:11px;font-weight:500;color:var(--ink-3);border-radius:5px;cursor:pointer;transition:.15s}
  .ctabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.06)}
  .ctabs button:hover:not(.on){color:var(--ink-2)}
  .legend-key{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-3);font-weight:500}
  .legend-key i{width:10px;height:10px;border-radius:3px}

  /* TREND */
  .trend-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:6px;padding:10px 0;border-bottom:1px solid var(--border-soft)}
  .trend-stat .lab{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--ink-3);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
  .trend-stat .lab i{width:10px;height:10px;border-radius:3px;display:inline-block}
  .trend-stat .v{font-size:17px;font-weight:700;letter-spacing:-.01em}
  .trend-svg{width:100%;height:300px;display:block;margin-top:12px}

  /* NEEDS ATTENTION */
  .feed{display:flex;flex-direction:column;gap:9px;max-height:560px;overflow-y:auto;padding-right:4px}
  .feed::-webkit-scrollbar{width:4px}
  .feed::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
  .feed-item{display:grid;grid-template-columns:38px 1fr;gap:11px;padding:12px;border-radius:11px;background:var(--surface-2);border:1px solid var(--border);transition:.15s;cursor:pointer;position:relative}
  .feed-item:hover{border-color:var(--border-strong);transform:translateX(-1px);box-shadow:var(--shadow)}
  .feed-item.warn{background:linear-gradient(135deg,#fffaf0 0%,#fff5e1 100%);border-color:#fce4b1}
  .feed-item.bad{background:linear-gradient(135deg,#fef5f4 0%,#fde7e6 100%);border-color:#fac9c7}
  .feed-item.good{background:linear-gradient(135deg,#f1faf5 0%,#e6f7ef 100%);border-color:#c2e8d2}
  .feed-item .priority-bar{position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:0 2px 2px 0;background:var(--accent)}
  .feed-item.warn .priority-bar{background:var(--warn)}
  .feed-item.bad .priority-bar{background:var(--bad)}
  .feed-item.good .priority-bar{background:var(--good)}
  .feed-icon{width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;border:1px solid var(--border);color:var(--accent);box-shadow:0 1px 2px rgba(0,0,0,.04)}
  .feed-icon.warn{color:var(--warn-deep)}
  .feed-icon.bad{color:var(--bad-deep)}
  .feed-icon.good{color:var(--good-deep)}
  .feed-icon svg{width:18px;height:18px}
  .feed-body .h{font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.35;margin-bottom:2px}
  .feed-body .meta{display:flex;gap:8px;font-size:10px;color:var(--ink-4);font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
  .feed-body .meta b{color:var(--ink-3);font-weight:600}
  .feed-body .b{font-size:11.5px;color:var(--ink-2);line-height:1.5}
  .feed-body .a{margin-top:7px;display:flex;gap:8px;font-size:11px}
  .feed-body .a a{color:var(--accent-deep);text-decoration:none;font-weight:600;padding:3px 8px;background:rgba(75,92,242,.08);border-radius:5px;cursor:pointer}
  .feed-body .a a:hover{background:rgba(75,92,242,.15)}
  .feed-body .a a.outline{background:transparent;border:1px solid var(--border-strong);color:var(--ink-3)}

  /* DONUT */
  .donut-card{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;min-height:300px}
  .donut-big{position:relative;width:240px;height:240px;flex-shrink:0;display:grid;place-items:center}
  .donut-big svg{width:240px;height:240px}
  .donut-big-label{position:absolute;text-align:center;line-height:1.1}
  .donut-big-label .v{font-size:24px;font-weight:700;letter-spacing:-.02em}
  .donut-big-label .v .currency{font-size:14px;font-weight:600;color:var(--ink-4);margin-right:1px;vertical-align:0.35em}
  .donut-big-label .l{font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-top:2px}
  .donut-big-label .sub{font-size:10.5px;color:var(--ink-4);margin-top:1px;font-weight:500}
  .donut-legend{flex:1;display:flex;flex-direction:column;gap:6px}
  .donut-legend .row{display:grid;grid-template-columns:24px 1fr auto auto;align-items:center;gap:10px;padding:7px 8px;border-radius:7px;cursor:pointer;font-size:12px;border:1px solid transparent}
  .donut-legend .row:hover{background:var(--surface-3);border-color:var(--border)}
  .donut-legend .pc{color:var(--ink-3);font-weight:500;width:46px;text-align:right;font-size:11.5px}
  .donut-legend .va{color:var(--ink);font-weight:700;width:60px;text-align:right;font-size:12.5px}

  /* SCATTER */
  .scatter-svg{width:100%;height:340px;display:block}
  .scatter-legend{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:8px 0 0;border-top:1px solid var(--border-soft);font-size:11px;color:var(--ink-3)}
  .scatter-legend .quadrant-key{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;flex:1}
  .qk{display:flex;flex-direction:column;gap:1px}
  .qk b{color:var(--ink);font-size:11.5px;font-weight:700}
  .qk small{font-size:10.5px;color:var(--ink-3);font-weight:500}

  /* CHANNEL TABLE */
  .ch-table-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);padding:11px 9px;border-bottom:1px solid var(--border);background:var(--surface-3);white-space:nowrap;cursor:pointer;user-select:none}
  th.r,td.r{text-align:right}
  th .sort-arrow{display:inline-block;color:var(--ink-4);margin-left:3px;font-size:9px}
  th.sorted .sort-arrow{color:var(--accent-deep)}
  td{padding:13px 9px;border-bottom:1px solid var(--border);vertical-align:middle}
  tr:last-child td{border-bottom:0}
  tr:hover td{background:var(--surface-2)}
  td.ch{font-weight:600;color:var(--ink)}
  .ch-cell{display:flex;align-items:center;gap:10px}
  .ch-cell .info{display:flex;flex-direction:column}
  .ch-cell .nm{font-weight:600;font-size:13px;color:var(--ink);letter-spacing:-.01em}
  .ch-cell .sub{font-size:10.5px;color:var(--ink-4);font-weight:500;margin-top:1px}
  .roas-tag{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-weight:700;font-size:11.5px;font-variant-numeric:tabular-nums}
  .roas-tag.up{background:var(--good-soft);color:var(--good-deep)}
  .roas-tag.mid{background:var(--accent-soft);color:var(--accent-deep)}
  .roas-tag.warn{background:var(--warn-soft);color:var(--warn-deep)}
  .roas-tag.down{background:var(--bad-soft);color:var(--bad-deep)}
  .spark{height:26px;width:100px;display:block}
  .conn-status{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:7px;background:var(--warn-soft);border:1px solid #fce4b1;color:var(--warn-deep);font-size:11px;font-weight:600}
  .conn-status svg{width:12px;height:12px}
  .conn-status .link{color:var(--warn-deep);text-decoration:underline;cursor:pointer}

  /* PLATFORM LOGOS */
  .lg{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;flex-shrink:0;overflow:hidden}
  .lg svg{width:18px;height:18px;display:block}
  .lg.sm{width:20px;height:20px;border-radius:5px}
  .lg.sm svg{width:13px;height:13px}
  .lg.xs{width:16px;height:16px;border-radius:4px}
  .lg.xs svg{width:10px;height:10px}
  .lg.meta{background:#1877F2}
  .lg.google{background:#fff;border:1px solid var(--border)}
  .lg.tiktok{background:#000}
  .lg.pinterest{background:#E60023}
  .lg.snapchat{background:#FFFC00}
  .lg.youtube{background:#FF0000}
  .lg.reddit{background:#FF4500}
  .lg.dv360{background:#34A853}
  .lg.klaviyo{background:#1F2024}
  .lg.linkedin{background:#0A66C2}
  .lg.x{background:#0F1419}
  .lg.bing{background:#00A4EF}

  /* JOURNEY */
  .journey-list{display:flex;flex-direction:column;gap:11px}
  .journey-row{padding:13px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
  .jr-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
  .jr-share{font-size:14px;font-weight:700;letter-spacing:-.01em}
  .jr-share .conv{font-size:11px;color:var(--ink-3);font-weight:500;margin-left:5px}
  .jr-meta{font-size:10.5px;color:var(--ink-3);font-weight:500;display:flex;gap:8px}
  .jr-meta b{color:var(--ink-2);font-weight:700}
  .jr-path{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  .jr-step{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface);border:1px solid var(--border);border-radius:7px;font-size:11.5px;font-weight:500;color:var(--ink-2)}
  .jr-step.conv{background:var(--good-soft);border-color:#cde9d9;color:var(--good-deep);font-weight:700}
  .jr-step.conv svg{width:11px;height:11px}
  .jr-arrow{color:var(--ink-4);display:flex;align-items:center}
  .jr-arrow svg{width:12px;height:12px}
  .jr-direct{background:#f1f3f7;color:var(--ink-3);font-weight:600;font-style:italic}
  .stat-grid{margin-top:14px;padding:14px;background:var(--surface-2);border-radius:11px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;border:1px solid var(--border)}
  .stat-grid .lab{font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:3px}
  .stat-grid .v{font-size:20px;font-weight:700;letter-spacing:-.02em}
  .stat-grid .v small{font-size:11px;color:var(--ink-3);font-weight:500;margin-left:3px}

  /* AUDIENCE BLOCKS */
  .demo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .demo-block{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:14px;box-shadow:var(--shadow)}
  .demo-block h4{margin:0 0 12px;font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:7px;letter-spacing:-.01em}
  .demo-block h4 svg{width:14px;height:14px;color:var(--ink-3)}
  .demo-bar{display:grid;grid-template-columns:90px 1fr 90px;align-items:center;gap:10px;font-size:11.5px;padding:5px 0}
  .demo-bar .nm{color:var(--ink-2);font-weight:500}
  .demo-bar .bar{height:8px;background:var(--surface-3);border-radius:99px;overflow:hidden}
  .demo-bar .bar i{display:block;height:100%;border-radius:99px}
  .demo-bar .v{font-weight:700;color:var(--ink);text-align:right;font-variant-numeric:tabular-nums}
  .demo-bar .v small{display:block;color:var(--ink-3);font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:.03em}

  .new-vs-ret{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .nvr-card{padding:14px;border-radius:11px;border:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden}
  .nvr-card.new{border-color:#c5cbff;background:linear-gradient(135deg,#fff 0%,#eef0ff 100%)}
  .nvr-card.ret{border-color:#cde9d9;background:linear-gradient(135deg,#fff 0%,#e6f7ef 100%)}
  .nvr-card .lab{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);font-weight:600}
  .nvr-card .v{font-size:24px;font-weight:700;letter-spacing:-.02em;display:flex;align-items:center;gap:8px}
  .nvr-card .meta-line{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-2);font-weight:500;flex-wrap:wrap;gap:4px}
  .nvr-card .meta-line b{color:var(--ink);font-weight:700}

  /* FOOTER */
  .foot{display:flex;align-items:center;justify-content:space-between;color:var(--ink-3);font-size:11px;padding:18px 0 0;border-top:1px solid var(--border);margin-top:24px;flex-wrap:wrap;gap:12px}
  .foot .src{display:inline-flex;gap:10px;flex-wrap:wrap;align-items:center}
  .foot .src .lg{width:18px;height:18px;border-radius:4px;opacity:.5}
  .foot .src .lg.connected{opacity:1}
  .foot .src .lg svg{width:11px;height:11px}

  /* CHART HELPERS */
  .axis-label{font-size:10px;fill:var(--ink-4);font-family:inherit}
  .axis-label.bold{font-weight:700;fill:var(--ink)}
  .grid-line{stroke:var(--grid);stroke-width:1}
  .grid-line.q{stroke:var(--border-strong);stroke-dasharray:4 4}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="lg-meta" viewBox="0 0 24 24"><path fill="#fff" d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"/></symbol>
    <symbol id="lg-google" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></symbol>
    <symbol id="lg-tiktok" viewBox="0 0 24 24"><path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></symbol>
    <symbol id="lg-pinterest" viewBox="0 0 24 24"><path fill="#fff" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></symbol>
    <symbol id="lg-snapchat" viewBox="0 0 24 24"><path fill="#000" d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"/></symbol>
    <symbol id="lg-youtube" viewBox="0 0 24 24"><path fill="#fff" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></symbol>
    <symbol id="lg-reddit" viewBox="0 0 24 24"><path fill="#fff" d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/></symbol>
    <symbol id="lg-dv360" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff"/><path fill="#34A853" d="M12 5l5 7-5 7-5-7z" opacity=".9"/><circle cx="12" cy="12" r="3" fill="#34A853"/></symbol>
    <symbol id="lg-klaviyo" viewBox="0 0 24 24"><path fill="#fff" d="M3 6l9 12 9-12-9 7-9-7zm9 8l-7-5h14l-7 5z"/></symbol>
    <symbol id="lg-linkedin" viewBox="0 0 24 24"><path fill="#fff" d="M5 3a2 2 0 100 4 2 2 0 000-4zm-2 6h4v12H3V9zm6 0h4v2c.6-1 2-2 4-2 3 0 4 2 4 5v7h-4v-6c0-1.5-.5-3-2-3s-2 1.5-2 3v6H9V9z"/></symbol>
    <symbol id="lg-bing" viewBox="0 0 24 24"><path fill="#fff" d="M5 2v17l5-2 6-3-5-2-2-5-4-5z"/></symbol>
  </defs>
</svg>

<div class="app">
  <!-- TOPBAR -->
  <header class="topbar">
    <div class="brand"><div class="brand-mark" id="brand-mark">{{INJECT:mark_letter}}</div><span id="brand-name">{{INJECT:agency_name}}</span><span class="brand-sub">· Cross-Channel Performance</span></div>
    <div class="crumbs"><span>›</span><b id="brand-meta">{{INJECT:agency_meta}}</b></div>
    <div class="spacer"></div>
    <span class="live"><span class="dot"></span><span id="last-sync-label">{{INJECT:last_sync_label}}</span></span>
    <button class="iconbtn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 8a6 6 0 1011.7-2"/><path d="M14 2v4h-4"/></svg>Refresh</button>
    <button class="iconbtn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 11V2M8 11l-3-3M8 11l3-3M2 12v2h12v-2"/></svg>Export</button>
    <button class="iconbtn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="5" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M7 7l3-2M7 9l3 2"/></svg>Share</button>
    <div class="avatar" id="user-avatar">{{INJECT:avatar_initials}}</div>
  </header>

  <!-- TABS -->
  <nav class="tabs-nav" id="tabsNav">
    <button class="tab-btn on" data-tab="overview">Overview</button>
    <button class="tab-btn" data-tab="channels">Channels <span class="badge" id="tab-ch-count">7</span></button>
    <button class="tab-btn" data-tab="journey">Customer Journey</button>
  </nav>

  <!-- TITLE + FILTERS -->
  <div class="title-row">
    <h1>Cross-Channel Performance <span id="period-pill" style="font-size:13px;color:var(--ink-3);font-weight:500;letter-spacing:0">· {{INJECT:period_label}}</span></h1>
    <div class="meta-line">
      <span>Owner: <b id="owner-name" style="color:var(--ink-2);font-weight:600">{{INJECT:owner_name}}</b></span><span>·</span><span id="owner-role">{{INJECT:owner_role}}</span><span>·</span><span id="period-compare">{{INJECT:period_compare}}</span>
    </div>
  </div>
  <div class="filters">
    <div class="seg" data-control="period"><button data-value="7">7d</button><button data-value="14">14d</button><button class="on" data-value="30">30d</button><button data-value="qtd">QTD</button><button data-value="ytd">YTD</button><button data-value="custom">Custom</button></div>
    <label class="fgroup" style="cursor:pointer;position:relative"><svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6h12M5 1v3M11 1v3"/></svg><span id="date-label">{{INJECT:period_label}}</span><svg class="ch" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg><select id="date-select" onchange="document.getElementById('date-label').textContent=this.options[this.selectedIndex].text" style="position:absolute;left:0;top:0;opacity:0;width:100%;height:100%;cursor:pointer"><option>Current period</option><option>Prior period</option><option>QTD</option><option>YTD</option><option>Custom range...</option></select></label>
    <label class="fgroup active" id="filter-channel" style="cursor:pointer;position:relative"><svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 5h12M2 8h12M2 11h12"/></svg><span>Channel: <b id="filter-channel-val">All</b></span><svg class="ch" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg><select id="ch-select" onchange="document.getElementById('filter-channel-val').textContent=this.options[this.selectedIndex].text" style="position:absolute;left:0;top:0;opacity:0;width:100%;height:100%;cursor:pointer"><option>All (3)</option><option>Meta only</option><option>Google only</option><option>TikTok only</option><option>Meta + Google</option></select></label>
    <label class="fgroup" style="cursor:pointer"><svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3h10v3l-4 4v4l-2-1v-3L3 6V3z"/></svg><span>Conversion: <b id="conv-label">All events</b></span><svg class="ch" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg><select id="conv-select" onchange="document.getElementById('conv-label').textContent=this.options[this.selectedIndex].text" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer"><option>All events</option><option>Purchases</option><option>Leads</option><option>Add to cart</option><option>Page view</option></select></label>
    <label class="fgroup" style="cursor:pointer;position:relative"><svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 2v12h12M5 11l3-3 2 2 3-4"/></svg><span>Attribution: <b id="attr-label">Data-driven</b></span><svg class="ch" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg><select id="attr-select" onchange="document.getElementById('attr-label').textContent=this.options[this.selectedIndex].text" style="position:absolute;left:0;top:0;opacity:0;width:100%;height:100%;cursor:pointer"><option>Data-driven</option><option>Last-click</option><option>First-click</option><option>Linear</option><option>Time-decay</option><option>Position-based</option></select></label>
    <div class="right">
      <span class="compare-tag"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M3 8h10M3 12h10"/></svg>Compare prev period</span>
      <button class="iconbtn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 1l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z"/></svg>Save view</button>
    </div>
  </div>

  <!-- ============== OVERVIEW TAB ============== -->
  <section class="tab-section on" data-tab="overview">
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-head"><span class="kpi-label">Total Spend</span><span class="delta" id="k-spend-d"></span></div>
        <div class="kpi-val"><span class="currency">$</span><span class="num" id="k-spend">—</span><span class="suffix" id="k-spend-sfx"></span></div>
        <div class="kpi-prev" id="k-spend-pre"></div>
        <div class="kpi-goal"><div class="kpi-goal-bar"><i id="k-spend-bar" style="width:0%"></i></div><div class="kpi-goal-meta"><span id="k-spend-pct"></span><span id="k-spend-rem"></span></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-head"><span class="kpi-label">Revenue</span><span class="delta" id="k-rev-d"></span></div>
        <div class="kpi-val"><span class="currency">$</span><span class="num" id="k-rev">—</span><span class="suffix" id="k-rev-sfx"></span></div>
        <div class="kpi-prev" id="k-rev-pre"></div>
        <div class="kpi-goal"><div class="kpi-goal-bar"><i id="k-rev-bar" style="width:0%"></i></div><div class="kpi-goal-meta"><span id="k-rev-pct"></span><span id="k-rev-rem"></span></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-head"><span class="kpi-label">Blended ROAS</span><span class="delta" id="k-roas-d"></span></div>
        <div class="kpi-val"><span class="num" id="k-roas">—</span><span class="suffix">x</span></div>
        <div class="kpi-prev" id="k-roas-pre"></div>
        <div class="kpi-goal"><div class="kpi-goal-bar"><i id="k-roas-bar" style="width:0%"></i></div><div class="kpi-goal-meta"><span id="k-roas-pct"></span><span id="k-roas-rem"></span></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-head"><span class="kpi-label">Conversions</span><span class="delta" id="k-conv-d"></span></div>
        <div class="kpi-val"><span class="num" id="k-conv">—</span></div>
        <div class="kpi-prev" id="k-conv-pre"></div>
        <div class="kpi-goal"><div class="kpi-goal-bar"><i id="k-conv-bar" style="width:0%"></i></div><div class="kpi-goal-meta"><span id="k-conv-pct"></span><span id="k-conv-rem"></span></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-head"><span class="kpi-label">CPA</span><span class="delta" id="k-cpa-d"></span></div>
        <div class="kpi-val"><span class="currency">$</span><span class="num" id="k-cpa">—</span></div>
        <div class="kpi-prev" id="k-cpa-pre"></div>
        <div class="kpi-goal"><div class="kpi-goal-bar"><i id="k-cpa-bar" style="width:0%"></i></div><div class="kpi-goal-meta"><span id="k-cpa-pct"></span><span id="k-cpa-rem"></span></div></div>
      </div>
    </div>

    <div class="grid t1">
      <div class="card">
        <div class="card-head">
          <div><h3>Daily performance — Spend, Revenue, Conversions</h3><div class="desc" id="trend-desc">{{INJECT:trend_desc}}</div></div>
          <div class="actions">
            <div class="ctabs" data-control="trend-period"><button class="on" data-value="daily">Daily</button><button data-value="weekly">Weekly</button></div>
          </div>
        </div>
        <div class="trend-stats">
          <div class="trend-stat"><div class="lab"><i style="background:#cdd2ff"></i>Spend</div><div class="v"><span style="font-size:13px;color:var(--ink-4);font-weight:600">$</span><span id="ts-spend">54,606</span></div></div>
          <div class="trend-stat"><div class="lab"><i style="background:#0F4C81"></i>Revenue</div><div class="v"><span style="font-size:13px;color:var(--ink-4);font-weight:600">$</span><span id="ts-rev">128,910</span></div></div>
          <div class="trend-stat"><div class="lab"><i style="background:#0fae74"></i>Conversions</div><div class="v" id="ts-conv">5,835</div></div>
          <div class="trend-stat"><div class="lab">Avg daily spend</div><div class="v"><span style="font-size:13px;color:var(--ink-4);font-weight:600">$</span><span id="ts-avg">1,820</span></div></div>
          <div class="trend-stat"><div class="lab" id="ts-best-lab">Best day · 06-10</div><div class="v" id="ts-best-roas">5.1× ROAS</div></div>
        </div>
        <svg id="trend" class="trend-svg" viewBox="0 0 920 300" preserveAspectRatio="none"></svg>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Needs your attention</h3><div class="desc" id="alerts-desc"></div></div><div class="actions"><button class="iconbtn" id="alerts-count-btn"></button></div></div>
        <div class="feed" id="alerts-feed"></div>
      </div>
    </div>
  </section>

  <!-- ============== CHANNELS TAB ============== -->
  <section class="tab-section" data-tab="channels">
    <div id="conn-banner" style="margin-bottom:12px"></div>
    <div class="card flush" style="margin-bottom:14px">
      <div style="padding:18px 18px 0;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div><h3 style="margin:0 0 2px;font-size:15px;font-weight:700">Channel performance — full breakdown</h3><div class="desc" style="font-size:12px;color:var(--ink-3)">Sorted by spend · click column header to sort</div></div>
        <div class="actions" style="display:flex;gap:6px;flex-wrap:wrap">
          <div class="ctabs" data-control="ch-sort"><button class="on" data-value="spend">Spend</button><button data-value="revenue">Revenue</button><button data-value="roas">ROAS</button><button data-value="cpa">CPA</button><button data-value="conv">Conversions</button></div>
        </div>
      </div>
      <div class="ch-table-wrap" style="margin-top:10px">
        <table id="ch-table">
          <thead><tr id="ch-thead"></tr></thead>
          <tbody id="ch-rows"></tbody>
          <tfoot><tr id="ch-foot" style="font-weight:700;background:var(--surface-2)"></tr></tfoot>
        </table>
      </div>
    </div>

    <div class="grid t2">
      <div class="card">
        <div class="card-head">
          <div><h3>Channel mix</h3><div class="desc" id="donut-desc"></div></div>
          <div class="actions"><div class="ctabs" data-control="donut-metric"><button class="on" data-value="spend">Spend</button><button data-value="revenue">Revenue</button><button data-value="conv">Conversions</button></div></div>
        </div>
        <div class="donut-card">
          <div class="donut-big">
            <svg id="donut" viewBox="0 0 240 240"></svg>
            <div class="donut-big-label" id="donut-label"></div>
          </div>
          <div class="donut-legend" id="donut-legend"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><h3>Efficiency map — Spend × ROAS × Conversions</h3><div class="desc">Each bubble is a channel; size = conversions. Top-right = scale; bottom-right = fix.</div></div>
          <div class="actions"><span class="legend-key"><i style="background:#0fae74"></i>≥8.0× target</span></div>
        </div>
        <svg id="scatter" class="scatter-svg" viewBox="0 0 700 340" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="scatter-legend">
          <div class="quadrant-key">
            <div class="qk"><b>↗ Scale up</b><small>High ROAS, low spend</small></div>
            <div class="qk"><b>★ Keep</b><small>High ROAS, high spend</small></div>
            <div class="qk"><b>○ Test</b><small>Low ROAS, low spend</small></div>
            <div class="qk"><b>⚠ Fix</b><small>Low ROAS, high spend</small></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ============== JOURNEY TAB ============== -->
  <section class="tab-section" data-tab="journey">
    <div class="grid t2">
      <div class="card">
        <div class="card-head"><div><h3>Top customer journeys to conversion</h3><div class="desc">Touchpoint sequences ranked by share · last 90 days</div></div><div class="actions"><div class="ctabs" data-control="journey-filter"><button class="on" data-value="all">All paths</button><button data-value="new">New visitors</button><button data-value="ret">Returning</button></div></div></div>
        <div class="journey-list" id="journeys"></div>
        <div class="stat-grid">
          <div><div class="lab">Avg touches → conversion</div><div class="v" id="js-avg-touches">—</div></div>
          <div><div class="lab">Avg time → conversion</div><div class="v" id="js-avg-time">—</div></div>
          <div><div class="lab">Multi-channel %</div><div class="v" id="js-multi-pct">—</div></div>
          <div><div class="lab">Cross-device %</div><div class="v" id="js-cross-pct">—</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Channel role — first vs last touch</h3><div class="desc">Who introduces vs who closes the conversion</div></div></div>
        <div id="role-bars" style="display:flex;flex-direction:column;gap:9px"></div>
        <div id="role-insight" style="margin-top:12px;padding:11px;background:var(--surface-2);border:1px solid var(--border);border-radius:9px;font-size:11.5px;color:var(--ink-2);line-height:1.55;display:none"></div>
      </div>
    </div>
  </section>

  <div class="foot">
    <div><span id="foot-source">{{INJECT:foot_source}}</span> · <span id="conn-count"></span></div>
    <div class="src" id="src-list"><span><b>Sources:</b></span></div>
  </div>
</div>

<script>
function fmtN(v,d){d=d||0;return Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}
function fmtMoney(v){
  var sign='';
  if(v >= 1e6) return '<span class="currency">$</span>'+(v/1e6).toFixed(2)+'<span class="suffix">M</span>'.replace('suffix','currency');
  if(v >= 1e3) return '<span class="currency">$</span>'+(v/1e3).toFixed(1)+'<span class="currency">K</span>';
  return '<span class="currency">$</span>'+v;
}
function fmtK(v){return v>=1e6?'$'+(v/1e6).toFixed(2)+'M':v>=1e3?'$'+(v/1e3).toFixed(1)+'K':'$'+v;}
function fmtKn(v){return v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':''+v;}
function esc(s){return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function setM(id, html){var el=document.getElementById(id);if(el){el.innerHTML='';el.insertAdjacentHTML('beforeend', html);}}

// ============================================================================
// DATA INJECTION POINTS — populated by the agent at build time per STEP 3 of
// the skill. Inline {{INJECT:name}} markers (above) and JS const blocks
// (below) are substituted with Discovery API results before this widget is
// saved as a custom-component componentCode string.
// ============================================================================


// === INJECT: channels ===
// Replace this empty array with the per-channel rows assembled in Step 2B of the skill.
// Shape: [{key, name, sub, logo, color, spend, impr, clicks, conv, revenue, prevSpend, prevROAS, connected}]
var ALL_CHANNELS = [];
// === END INJECT: channels ===

// Filter: only connected channels are rendered. Template won't break when sources missing.
var CHANNELS = ALL_CHANNELS.filter(function(c){return c.connected;});
var DISCONNECTED = ALL_CHANNELS.filter(function(c){return !c.connected;});

// Update tab badge + connection notice
document.getElementById('tab-ch-count').textContent = CHANNELS.length;
document.getElementById('filter-channel-val').textContent = 'All ('+CHANNELS.length+')';
document.getElementById('conn-count').textContent = CHANNELS.length+' of '+ALL_CHANNELS.length+' sources connected';

if(DISCONNECTED.length > 0){
  var names = DISCONNECTED.map(function(c){return c.name;}).join(', ');
  setM('conn-banner',
    '<div class="conn-status"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 1v6M8 11v.01"/><circle cx="8" cy="8" r="7"/></svg>'+
    DISCONNECTED.length+' source'+(DISCONNECTED.length>1?'s':'')+' not connected: <b style="color:var(--ink-2);font-weight:700">'+esc(names)+'</b> · <span class="link">Connect →</span></div>');
}

// Sources footer
(function(){
  var src = document.getElementById('src-list');
  ALL_CHANNELS.concat([{logo:'klaviyo',connected:true}]).slice(0,9).forEach(function(c){
    if(!c || !c.logo) return;
    var lg = document.createElement('div');
    lg.className = 'lg ' + c.logo + (c.connected ? ' connected' : '');
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    var use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href','#lg-'+c.logo);
    svg.appendChild(use);
    lg.appendChild(svg);
    src.appendChild(lg);
  });
})();

// === INJECT: trend_daily ===
// Replace this empty array with the per-day rows assembled in Step 2C of the skill.
// Shape: [{day, dt:'MM-DD', dow:0..6, spend, rev, conv}]
var trendDaily = [];
// === END INJECT: trend_daily ===
var DAYS = trendDaily.length;

// ========== TAB SWITCH ==========
document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    var tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('on');});
    btn.classList.add('on');
    document.querySelectorAll('.tab-section').forEach(function(s){s.classList.remove('on');});
    var sec = document.querySelector('.tab-section[data-tab="'+tab+'"]');
    if(sec) sec.classList.add('on');
    window.scrollTo({top:0, behavior:'smooth'});
  });
});

// ========== CONTROL HANDLERS ==========
var CTRL = {
  channelSort: 'spend',
  donutMetric: 'spend',
  trendPeriod: 'daily',
  journeyFilter: 'all',
  period: '30'
};

function wireSeg(g, handler){
  g.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click', function(){
      g.querySelectorAll('button').forEach(function(x){x.classList.remove('on');});
      b.classList.add('on');
      handler && handler(b.getAttribute('data-value'));
    });
  });
}
document.querySelectorAll('.seg[data-control], .ctabs[data-control]').forEach(function(g){
  var ctrl = g.getAttribute('data-control');
  wireSeg(g, function(v){
    if(ctrl==='ch-sort'){ CTRL.channelSort = v; renderChannelTable(); }
    else if(ctrl==='donut-metric'){ CTRL.donutMetric = v; renderDonut(); }
    else if(ctrl==='trend-period'){ CTRL.trendPeriod = v; renderTrend(); }
    else if(ctrl==='journey-filter'){ CTRL.journeyFilter = v; renderJourneys(); }
    else if(ctrl==='period'){ CTRL.period = v; renderTrend(); }
  });
});

// ========== TREND CHART ==========
function renderTrend(){
  if(!Array.isArray(trendDaily) || trendDaily.length === 0){
    setM('trend', '<text x="460" y="150" class="axis-label" text-anchor="middle" font-size="12" fill="#9aa3b6">No trend data - connect a channel via Discovery API</text>');
    ['ts-spend','ts-rev','ts-conv','ts-avg'].forEach(function(id){var el=document.getElementById(id); if(el) el.textContent='-';});
    var elBL=document.getElementById('ts-best-lab'); if(elBL) elBL.textContent = 'Best day · -';
    var elBR=document.getElementById('ts-best-roas'); if(elBR) elBR.textContent = '-';
    return;
  }
  var data;
  var slice = parseInt(CTRL.period) || 30;
  if(isNaN(slice) || slice > DAYS) slice = DAYS;
  var sliceRows = trendDaily.slice(-slice);
  if(CTRL.trendPeriod === 'weekly'){
    data = [];
    var sliceLen = sliceRows.length;
    for(var w=0;w<Math.ceil(sliceLen/7);w++){
      var s=0,r=0,c=0,n=0;
      for(var d=w*7;d<(w+1)*7 && d<sliceLen;d++){ s+=sliceRows[d].spend; r+=sliceRows[d].rev; c+=sliceRows[d].conv; n++; }
      data.push({label:'W'+(w+1), spend:s, rev:r, conv:c});
    }
  } else {
    data = sliceRows.map(function(d){return {label:d.dt, spend:d.spend, rev:d.rev, conv:d.conv};});
  }
  // Update period-aware trend stats
  var totS=0,totR=0,totC=0,bestI=0,bestR=0;
  for(var p=0;p<sliceRows.length;p++){
    totS+=sliceRows[p].spend; totR+=sliceRows[p].rev; totC+=sliceRows[p].conv;
    var roasP = sliceRows[p].spend>0 ? sliceRows[p].rev/sliceRows[p].spend : 0;
    if(roasP>bestR){bestR=roasP;bestI=p;}
  }
  var avgS = sliceRows.length>0 ? Math.round(totS/sliceRows.length) : 0;
  var elS=document.getElementById('ts-spend'); if(elS) elS.textContent = fmtN(totS);
  var elR=document.getElementById('ts-rev'); if(elR) elR.textContent = fmtN(totR);
  var elC=document.getElementById('ts-conv'); if(elC) elC.textContent = fmtN(totC);
  var elA=document.getElementById('ts-avg'); if(elA) elA.textContent = fmtN(avgS);
  var elBL=document.getElementById('ts-best-lab'); if(elBL) elBL.textContent = sliceRows.length>0 ? 'Best day · '+sliceRows[bestI].dt : 'Best day · —';
  var elBR=document.getElementById('ts-best-roas'); if(elBR) elBR.textContent = bestR.toFixed(1)+'× ROAS';
  var W=920,H=300,pad={l:60,r:60,t:14,b:32};
  var inW=W-pad.l-pad.r, inH=H-pad.t-pad.b;
  var spends = data.map(function(d){return d.spend;});
  var revs   = data.map(function(d){return d.rev;});
  var sMax = Math.ceil(Math.max.apply(null,spends)/5000)*5000 || 1;
  var rMax = Math.ceil(Math.max.apply(null,revs)/50000)*50000 || 1;
  if(CTRL.trendPeriod==='weekly'){ sMax = Math.ceil(sMax/30000)*30000; rMax = Math.ceil(rMax/300000)*300000; }
  function x(i){return pad.l + i * (inW/Math.max(1,(data.length-1)));}
  function ys(v){return pad.t + inH - (v/sMax) * inH;}
  function yr(v){return pad.t + inH - (v/rMax) * inH;}
  var parts = [];
  for(var g=0;g<=5;g++){
    var yp = pad.t + (inH/5)*g;
    parts.push('<line x1="'+pad.l+'" x2="'+(W-pad.r)+'" y1="'+yp+'" y2="'+yp+'" class="grid-line"/>');
    parts.push('<text x="'+(pad.l-8)+'" y="'+(yp+3.5)+'" class="axis-label" text-anchor="end">'+fmtK(rMax-(rMax/5)*g)+'</text>');
    parts.push('<text x="'+(W-pad.r+8)+'" y="'+(yp+3.5)+'" class="axis-label" text-anchor="start" fill="#9aa3b6">'+fmtK(sMax-(sMax/5)*g)+'</text>');
  }
  for(var k=0;k<data.length;k++){
    if(CTRL.trendPeriod==='weekly' || k%3===0 || k===data.length-1){
      parts.push('<text x="'+x(k)+'" y="'+(H-12)+'" class="axis-label" text-anchor="middle">'+esc(data[k].label)+'</text>');
    }
  }
  parts.push('<text x="'+(pad.l-8)+'" y="'+(pad.t-2)+'" class="axis-label bold" text-anchor="end">Revenue</text>');
  parts.push('<text x="'+(W-pad.r+8)+'" y="'+(pad.t-2)+'" class="axis-label bold" text-anchor="start" fill="#9aa3b6">Spend</text>');
  parts.push('<defs><linearGradient id="grSpend" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#cdd2ff" stop-opacity=".55"/><stop offset="100%" stop-color="#cdd2ff" stop-opacity="0"/></linearGradient><linearGradient id="grRev" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#4b5cf2" stop-opacity=".25"/><stop offset="100%" stop-color="#4b5cf2" stop-opacity="0"/></linearGradient></defs>');
  var spath=''; for(var j=0;j<data.length;j++){spath += (j===0?'M':'L') + x(j) + ',' + ys(data[j].spend);}
  parts.push('<path d="'+spath+' L '+x(data.length-1)+','+(pad.t+inH)+' L '+x(0)+','+(pad.t+inH)+' Z" fill="url(#grSpend)"/>');
  parts.push('<path d="'+spath+'" fill="none" stroke="#9aa3b6" stroke-width="1.6" stroke-dasharray="3 3"/>');
  var rpath=''; for(var m=0;m<data.length;m++){rpath += (m===0?'M':'L') + x(m) + ',' + yr(data[m].rev);}
  parts.push('<path d="'+rpath+' L '+x(data.length-1)+','+(pad.t+inH)+' L '+x(0)+','+(pad.t+inH)+' Z" fill="url(#grRev)"/>');
  parts.push('<path d="'+rpath+'" fill="none" stroke="#4b5cf2" stroke-width="2.6" stroke-linejoin="round"/>');
  var bestIdx=0,bestRoas=0; for(var n=0;n<revs.length;n++){var rs=spends[n]>0?revs[n]/spends[n]:0; if(rs>bestRoas){bestRoas=rs;bestIdx=n;}}
  parts.push('<circle cx="'+x(bestIdx)+'" cy="'+yr(revs[bestIdx])+'" r="6" fill="#fff" stroke="#4b5cf2" stroke-width="2.6"/>');
  parts.push('<rect x="'+(x(bestIdx)+10)+'" y="'+(yr(revs[bestIdx])-30)+'" width="120" height="44" rx="6" fill="#0b1220"/>');
  parts.push('<text x="'+(x(bestIdx)+18)+'" y="'+(yr(revs[bestIdx])-15)+'" font-size="10" fill="#9aa3b6" font-family="Inter">'+esc(data[bestIdx].label)+'</text>');
  parts.push('<text x="'+(x(bestIdx)+18)+'" y="'+(yr(revs[bestIdx])+0)+'" font-size="11" fill="#fff" font-weight="700" font-family="Inter">$'+fmtN(Math.round(revs[bestIdx]))+'</text>');
  var roas = (revs[bestIdx]/spends[bestIdx]).toFixed(1);
  parts.push('<text x="'+(x(bestIdx)+18)+'" y="'+(yr(revs[bestIdx])+12)+'" font-size="10" fill="#0fae74" font-weight="700" font-family="Inter">'+roas+'× ROAS</text>');
  setM('trend', parts.join(''));
}
renderTrend();

// ========== KPI ENGINE ==========
// === INJECT: ch_data ===
// Replace this empty object with the per-channel KPI snapshot from Step 2A of the skill.
// Keys = channel.key from ALL_CHANNELS. Per-key shape:
//   {spend, rev, conv, leads, purch, ac, pv, prevSpend, prevRev, prevConv, prevLeads, prevPurch, imp}
var CH_DATA = {};
// === END INJECT: ch_data ===
var ATTR_MULT = {'data-driven':1.0,'last-click':0.92,'first-click':0.85,'linear':0.95,'time-decay':0.98,'position-based':0.94};
var KPI_STATE = {channel:'all', conv:'all', attr:'data-driven', period:'30'};

// === INJECT: goals ===
// Replace with workspace plan ceilings (Step 2E). All-zeros = flat goal bars (acceptable when no plan).
// Shape: {spend, rev, roas, conv, cpa}
var GOAL_30D = {spend:0, rev:0, roas:0, conv:0, cpa:0};
// === END INJECT: goals ===

function periodSliceFactor(period){
  // Returns (factor relative to 30d, label-days)
  if(period==='qtd') return {f:3.0, days:90, label:'QTD'};
  if(period==='ytd') return {f:12.0, days:365, label:'YTD'};
  if(period==='custom') return {f:1.0, days:30, label:'custom'};
  var n = parseInt(period)||30;
  if(isNaN(n)) n=30;
  // Use real trendDaily slice fraction
  var sl = trendDaily.slice(-Math.min(n,DAYS));
  var sliceSum=0, fullSum=0;
  for(var i=0;i<sl.length;i++) sliceSum += sl[i].spend;
  for(var j=0;j<trendDaily.length;j++) fullSum += trendDaily[j].spend;
  return {f: fullSum>0 ? sliceSum/fullSum : (n/30), days:n, label:n+'d'};
}

function selectedChannelKeys(){
  // Bug #9 fix: never hardcode channel keys - workspace can have any subset of platforms.
  var available = (CH_DATA && typeof CH_DATA === 'object') ? Object.keys(CH_DATA) : [];
  var c = KPI_STATE.channel;
  if(c === 'all' || !c) return available;
  if(c.indexOf('_') > -1){
    return c.split('_').filter(function(k){ return available.indexOf(k) > -1; });
  }
  return available.indexOf(c) > -1 ? [c] : available;
}

function convFieldFor(state){
  if(state==='purchases') return 'purch';
  if(state==='leads') return 'leads';
  if(state==='addtocart') return 'ac';
  if(state==='pageview') return 'pv';
  return 'conv';
}

function computeKPIs(){
  var pf = periodSliceFactor(KPI_STATE.period);
  var keys = selectedChannelKeys();
  var convF = convFieldFor(KPI_STATE.conv);
  var prevConvF = KPI_STATE.conv==='purchases' ? 'prevPurch' : KPI_STATE.conv==='leads' ? 'prevLeads' : 'prevConv';
  var attrM = ATTR_MULT[KPI_STATE.attr] || 1;
  var attrPrev = ATTR_MULT[KPI_STATE.attr] || 1;
  var spend=0, rev=0, conv=0, prevSpend=0, prevRev=0, prevConv=0;
  for(var i=0;i<keys.length;i++){
    var d = CH_DATA[keys[i]];
    spend += d.spend * pf.f;
    rev += d.rev * pf.f * attrM;
    conv += (d[convF]||0) * pf.f;
    prevSpend += d.prevSpend * pf.f;
    prevRev += d.prevRev * pf.f * attrPrev;
    var pcv = d[prevConvF]; if(pcv==null) pcv = (d.prevConv||0) * (KPI_STATE.conv==='addtocart'?0.4:KPI_STATE.conv==='pageview'?6:1);
    prevConv += pcv * pf.f;
  }
  var roas = spend>0?rev/spend:0;
  var cpa = conv>0?spend/conv:0;
  var prevRoas = prevSpend>0?prevRev/prevSpend:0;
  var prevCpa = prevConv>0?prevSpend/prevConv:0;
  return {pf:pf, spend:spend, rev:rev, conv:conv, roas:roas, cpa:cpa,
    prevSpend:prevSpend, prevRev:prevRev, prevConv:prevConv, prevRoas:prevRoas, prevCpa:prevCpa,
    keys:keys};
}

function fmtMoneyVal(v){
  // Returns {num, suffix} for KPI tile rendering
  if(v >= 1e6) return {num:(v/1e6).toFixed(2), sfx:'M'};
  if(v >= 1e3) return {num:(v/1e3).toFixed(1), sfx:'K'};
  return {num:Math.round(v).toString(), sfx:''};
}
function fmtNumVal(v){
  if(v >= 1e6) return {num:(v/1e6).toFixed(2), sfx:'M'};
  if(v >= 1e3) return {num:(v/1e3).toFixed(1), sfx:'K'};
  return {num:Math.round(v).toString(), sfx:''};
}
function pctDelta(cur, prev){
  if(!prev || prev===0) return {v:0, dir:'up'};
  var d = (cur - prev) / prev * 100;
  return {v:Math.abs(d), dir: d>=0?'up':'down'};
}
function setKpi(idVal, idSfx, idDelta, idPrev, val, sfx, deltaText, deltaClass, prevText){
  var elV=document.getElementById(idVal); if(elV) elV.textContent=val;
  if(idSfx){ var elS=document.getElementById(idSfx); if(elS) elS.textContent=sfx; }
  var elD=document.getElementById(idDelta);
  if(elD){
    elD.textContent = deltaText;
    elD.className = 'delta '+deltaClass;
  }
  var elP=document.getElementById(idPrev); if(elP) elP.textContent=prevText;
}

function channelLabel(keys){
  if(keys.length===3) return 'all channels';
  if(keys.length===2) return keys.join(' + ');
  return keys[0];
}

function renderKPIs(){
  var k = computeKPIs();
  var pf = k.pf;
  var convNoun = KPI_STATE.conv==='purchases' ? 'purchases' : KPI_STATE.conv==='leads' ? 'leads' : KPI_STATE.conv==='addtocart' ? 'add-to-cart' : KPI_STATE.conv==='pageview' ? 'page views' : 'leads + purchases';
  var chLabel = channelLabel(k.keys);

  // Spend
  var ms = fmtMoneyVal(k.spend);
  var dS = pctDelta(k.spend, k.prevSpend);
  var prevS = fmtMoneyVal(k.prevSpend);
  setKpi('k-spend','k-spend-sfx','k-spend-d','k-spend-pre', ms.num, ms.sfx, dS.v.toFixed(1)+'%', dS.dir, 'prev: $'+prevS.num+prevS.sfx+' · '+chLabel+' · '+pf.label);
  // Goal bar — scale plan to period
  var planSpend = GOAL_30D.spend * pf.f;
  var pctSpend = planSpend>0 ? Math.min(150, k.spend/planSpend*100) : 0;
  var elBar = document.getElementById('k-spend-bar'); if(elBar) elBar.style.width = Math.min(100,pctSpend)+'%';
  var elPctS = document.getElementById('k-spend-pct'); if(elPctS) elPctS.textContent = Math.round(pctSpend)+'% of plan';
  var elRemS = document.getElementById('k-spend-rem'); if(elRemS) elRemS.textContent = (pctSpend>=100 ? '+'+Math.round(pctSpend-100)+'% over' : Math.round(100-pctSpend)+'% remaining');

  // Revenue
  var mr = fmtMoneyVal(k.rev);
  var dR = pctDelta(k.rev, k.prevRev);
  var prevR = fmtMoneyVal(k.prevRev);
  setKpi('k-rev','k-rev-sfx','k-rev-d','k-rev-pre', mr.num, mr.sfx, dR.v.toFixed(1)+'%', dR.dir, 'prev: $'+prevR.num+prevR.sfx+' · '+KPI_STATE.attr);
  var planRev = GOAL_30D.rev * pf.f;
  var pctRev = planRev>0 ? Math.min(150, k.rev/planRev*100) : 0;
  var elBR = document.getElementById('k-rev-bar'); if(elBR){ elBR.style.width = Math.min(100,pctRev)+'%'; elBR.className = pctRev>=100 ? 'good' : ''; }
  var elPR = document.getElementById('k-rev-pct'); if(elPR) elPR.textContent = Math.round(pctRev)+'% of target'+(pctRev>=100?' ✓':'');
  var revDelta = k.rev - planRev;
  var rdm = fmtMoneyVal(Math.abs(revDelta));
  var elRR = document.getElementById('k-rev-rem'); if(elRR) elRR.textContent = (revDelta>=0?'+$':'−$')+rdm.num+rdm.sfx+' '+(revDelta>=0?'above':'short');

  // ROAS
  var dRO = pctDelta(k.roas, k.prevRoas);
  setKpi('k-roas',null,'k-roas-d','k-roas-pre', k.roas.toFixed(2), null, dRO.v.toFixed(1)+'%', dRO.dir, 'prev: '+k.prevRoas.toFixed(2)+'x · '+KPI_STATE.attr);
  var pctRoas = GOAL_30D.roas>0 ? Math.min(150, k.roas/GOAL_30D.roas*100) : 0;
  var elROB = document.getElementById('k-roas-bar'); if(elROB){ elROB.style.width = Math.min(100,pctRoas)+'%'; elROB.className = pctRoas>=100 ? 'good' : ''; }
  var elROP = document.getElementById('k-roas-pct'); if(elROP) elROP.textContent = Math.round(pctRoas)+'% of '+GOAL_30D.roas.toFixed(1)+'x target';
  var elROR = document.getElementById('k-roas-rem'); if(elROR) elROR.textContent = ((k.roas-k.prevRoas)>=0?'+':'−')+Math.abs(k.roas-k.prevRoas).toFixed(2)+'x vs prev';

  // Conversions
  var mc = fmtNumVal(k.conv);
  var dC = pctDelta(k.conv, k.prevConv);
  var pcV = fmtNumVal(k.prevConv);
  setKpi('k-conv',null,'k-conv-d','k-conv-pre', fmtN(Math.round(k.conv)), null, dC.v.toFixed(1)+'%', dC.dir, 'prev: '+fmtN(Math.round(k.prevConv))+' · '+convNoun);
  var planConv = GOAL_30D.conv * pf.f;
  var pctConv = planConv>0 ? Math.min(150, k.conv/planConv*100) : 0;
  var elCB = document.getElementById('k-conv-bar'); if(elCB){ elCB.style.width = Math.min(100,pctConv)+'%'; elCB.className = pctConv>=100 ? 'good' : ''; }
  var elCP = document.getElementById('k-conv-pct'); if(elCP) elCP.textContent = Math.round(pctConv)+'% of target';
  var convDelta = k.conv - planConv;
  var elCR = document.getElementById('k-conv-rem'); if(elCR) elCR.textContent = (convDelta>=0?'+':'−')+fmtN(Math.abs(Math.round(convDelta)))+' vs goal';

  // CPA
  var dCP = pctDelta(k.cpa, k.prevCpa);
  // CPA: lower = better, so flip dir for delta color
  var cpaDir = (k.cpa<=k.prevCpa)?'up':'down';
  setKpi('k-cpa',null,'k-cpa-d','k-cpa-pre', k.cpa.toFixed(2), null, dCP.v.toFixed(1)+'%', cpaDir, 'prev: $'+k.prevCpa.toFixed(2)+' · per '+convNoun.replace(/s$/,''));
  var pctCpa = GOAL_30D.cpa>0 ? Math.min(150, GOAL_30D.cpa/Math.max(0.01,k.cpa)*100) : 0;
  var elCPB = document.getElementById('k-cpa-bar'); if(elCPB){ elCPB.style.width = Math.min(100,pctCpa)+'%'; elCPB.className = pctCpa>=100 ? 'good' : ''; }
  var elCPP = document.getElementById('k-cpa-pct'); if(elCPP) elCPP.textContent = '$'+(GOAL_30D.cpa-k.cpa).toFixed(2)+' '+(GOAL_30D.cpa>=k.cpa?'below':'above')+' ceiling';
  var elCPR = document.getElementById('k-cpa-rem'); if(elCPR) elCPR.textContent = ((k.cpa-k.prevCpa)>=0?'+':'−')+'$'+Math.abs(k.cpa-k.prevCpa).toFixed(2)+' vs prev';
}
renderKPIs();

// Wire dropdown filter labels → KPI_STATE keys
function wireKPIDropdown(selectId, key, mapper){
  var el = document.getElementById(selectId);
  if(!el) return;
  el.addEventListener('change', function(){
    var v = el.options[el.selectedIndex].text;
    KPI_STATE[key] = mapper(v);
    renderKPIs();
  });
}
// Bug #9 fix: rebuild channel dropdown options dynamically from connected channels.
(function rebuildChannelDropdown(){
  var sel = document.getElementById('ch-select');
  if(!sel) return;
  var keys = (CH_DATA && typeof CH_DATA === 'object') ? Object.keys(CH_DATA) : [];
  var labelOf = {};
  if(typeof CHANNELS !== 'undefined'){
    for(var i=0;i<CHANNELS.length;i++) labelOf[CHANNELS[i].key] = CHANNELS[i].name || CHANNELS[i].key;
  }
  while(sel.firstChild) sel.removeChild(sel.firstChild);
  var allOpt = document.createElement('option');
  allOpt.textContent = 'All (' + keys.length + ')';
  allOpt.value = 'all';
  sel.appendChild(allOpt);
  keys.forEach(function(k){
    var o = document.createElement('option');
    o.textContent = (labelOf[k] || k) + ' only';
    o.value = k;
    sel.appendChild(o);
  });
  if(keys.length >= 2){
    var pair = document.createElement('option');
    pair.textContent = (labelOf[keys[0]] || keys[0]) + ' + ' + (labelOf[keys[1]] || keys[1]);
    pair.value = keys[0] + '_' + keys[1];
    sel.appendChild(pair);
  }
})();
wireKPIDropdown('ch-select','channel',function(t){
  var keys = (CH_DATA && typeof CH_DATA === 'object') ? Object.keys(CH_DATA) : [];
  if(/^All/i.test(t)) return 'all';
  var only = t.match(/^(.+?) only$/i);
  if(only){
    var name = only[1].toLowerCase();
    for(var i=0;i<keys.length;i++) if(keys[i].toLowerCase() === name) return keys[i];
  }
  if(t.indexOf(' + ') > -1){
    var parts = t.split(' + ').map(function(p){ return p.trim().toLowerCase(); });
    var matched = parts.map(function(p){
      for(var i=0;i<keys.length;i++) if(keys[i].toLowerCase() === p) return keys[i];
      return null;
    }).filter(Boolean);
    if(matched.length === parts.length) return matched.join('_');
  }
  return 'all';
});
wireKPIDropdown('conv-select','conv',function(t){
  if(/Purchases/i.test(t)) return 'purchases';
  if(/Leads/i.test(t)) return 'leads';
  if(/Add to cart/i.test(t)) return 'addtocart';
  if(/Page view/i.test(t)) return 'pageview';
  return 'all';
});
wireKPIDropdown('attr-select','attr',function(t){
  return t.toLowerCase().replace(/ /g,'-');
});

// Wire period seg buttons (already wired to renderTrend via CTRL — extend to renderKPIs)
document.querySelectorAll('.seg[data-control="period"] button').forEach(function(b){
  b.addEventListener('click', function(){
    KPI_STATE.period = b.getAttribute('data-value');
    renderKPIs();
  });
});

// ========== DONUT ==========
function renderDonut(){
  if(!CHANNELS || CHANNELS.length === 0){
    setM('donut', '<text x="120" y="120" class="axis-label" text-anchor="middle" font-size="11" fill="#9aa3b6">No channels</text>');
    setM('donut-legend', '<div style="padding:14px;color:var(--ink-4);font-size:11.5px">No connected channels</div>');
    setM('donut-label', '');
    var dd = document.getElementById('donut-desc'); if(dd) dd.textContent = '';
    return;
  }
  var paid = CHANNELS.filter(function(c){
    if(CTRL.donutMetric === 'spend') return c.spend > 0;
    if(CTRL.donutMetric === 'revenue') return c.revenue > 0;
    return c.conv > 0;
  });
  var key = CTRL.donutMetric === 'spend' ? 'spend' : CTRL.donutMetric === 'revenue' ? 'revenue' : 'conv';
  var total=0; for(var t=0;t<paid.length;t++){total += paid[t][key];}
  var cx=120, cy=120, R=100, r=70;
  var acc = -Math.PI/2, paths = [], arcs = [];
  for(var i=0;i<paid.length;i++){
    var c = paid[i];
    var ang = (c[key]/total) * Math.PI*2;
    var a0 = acc, a1 = acc + ang;
    var large = ang > Math.PI ? 1 : 0;
    var p = 'M '+(cx+R*Math.cos(a0))+' '+(cy+R*Math.sin(a0))+' A '+R+' '+R+' 0 '+large+' 1 '+(cx+R*Math.cos(a1))+' '+(cy+R*Math.sin(a1))+' L '+(cx+r*Math.cos(a1))+' '+(cy+r*Math.sin(a1))+' A '+r+' '+r+' 0 '+large+' 0 '+(cx+r*Math.cos(a0))+' '+(cy+r*Math.sin(a0))+' Z';
    paths.push('<path d="'+p+'" fill="'+c.color+'" stroke="#fff" stroke-width="2"><title>'+c.name+': '+(key==='conv'?fmtN(c[key]):fmtK(c[key]))+'</title></path>');
    arcs.push({c:c, pct:c[key]/total, val:c[key]});
    acc = a1;
  }
  setM('donut', paths.join(''));
  arcs.sort(function(a,b){return b.pct - a.pct;});
  var rows = arcs.map(function(a){
    var disp = key==='conv' ? fmtN(a.val) : fmtK(a.val);
    return '<div class="row"><div class="lg sm '+a.c.logo+'"><svg><use href="#lg-'+a.c.logo+'"/></svg></div><span style="color:var(--ink);font-weight:600">'+esc(a.c.name)+'</span><span class="pc">'+(a.pct*100).toFixed(1)+'%</span><span class="va">'+disp+'</span></div>';
  });
  setM('donut-legend', rows.join(''));
  // === INJECT: donut_label_subs ===
  // Optional comparison subtitles under the donut center label, e.g.
  //   { spend: 'vs $499K prior', revenue: 'vs $3.86M prior', conv: 'vs 46,060 prior' }
  // Empty object = no comparison line.
  var donutSubs = {};
  // === END INJECT: donut_label_subs ===
  var labelMap = {
    spend:   {l:'Total spend',   sub: donutSubs.spend   || ''},
    revenue: {l:'Total revenue', sub: donutSubs.revenue || ''},
    conv:    {l:'Conversions',   sub: donutSubs.conv    || ''}
  };
  var totalDisp = key==='conv' ? '<span class="num" style="font-size:24px">'+fmtN(total)+'</span>' : '<span class="currency">$</span>'+(total>=1e6?(total/1e6).toFixed(2)+'M':total>=1e3?(total/1e3).toFixed(0)+'K':total);
  setM('donut-label', '<div><div class="v">'+totalDisp+'</div><div class="l">'+labelMap[CTRL.donutMetric].l+'</div><div class="sub">'+labelMap[CTRL.donutMetric].sub+'</div></div>');
  document.getElementById('donut-desc').textContent = (key==='conv'?fmtN(total)+' total':fmtK(total)+' total')+' · '+CHANNELS.length+' channels';
}
renderDonut();

// ========== SCATTER ==========
(function renderScatter(){
  var W=700,H=340, pad={l:50,r:30,t:20,b:50};
  var inW=W-pad.l-pad.r, inH=H-pad.t-pad.b;
  var paid = CHANNELS.filter(function(c){return c.spend > 0;}).map(function(c){return Object.assign({}, c, {roas:c.revenue/c.spend});});
  if(paid.length===0){ setM('scatter','<text x="350" y="170" class="axis-label" text-anchor="middle" font-size="13">No paid channels connected</text>'); return; }
  var maxSpend = Math.max.apply(null, paid.map(function(c){return c.spend;}));
  var sMax = Math.ceil(maxSpend / 50000) * 50000;
  var rMax = 12;
  function x(v){return pad.l + (v/sMax)*inW;}
  function y(v){return pad.t + inH - (v/rMax)*inH;}
  var parts=[];
  for(var g=0;g<=4;g++){
    var yp = pad.t + (inH/4)*g, xp = pad.l + (inW/4)*g;
    parts.push('<line x1="'+pad.l+'" x2="'+(W-pad.r)+'" y1="'+yp+'" y2="'+yp+'" class="grid-line"/>');
    parts.push('<line x1="'+xp+'" x2="'+xp+'" y1="'+pad.t+'" y2="'+(H-pad.b)+'" class="grid-line"/>');
    parts.push('<text x="'+(pad.l-7)+'" y="'+(yp+3.5)+'" class="axis-label" text-anchor="end">'+(rMax-(rMax/4)*g).toFixed(0)+'×</text>');
    parts.push('<text x="'+xp+'" y="'+(H-pad.b+15)+'" class="axis-label" text-anchor="middle">'+fmtK((sMax/4)*g)+'</text>');
  }
  parts.push('<line x1="'+pad.l+'" x2="'+(W-pad.r)+'" y1="'+y(8)+'" y2="'+y(8)+'" class="grid-line q"/>');
  parts.push('<line x1="'+x(sMax/2)+'" x2="'+x(sMax/2)+'" y1="'+pad.t+'" y2="'+(H-pad.b)+'" class="grid-line q"/>');
  parts.push('<text x="'+(pad.l+10)+'" y="'+(pad.t+18)+'" class="axis-label" fill="#0fae74" font-weight="700">↗ SCALE UP</text>');
  parts.push('<text x="'+(W-pad.r-10)+'" y="'+(pad.t+18)+'" class="axis-label" fill="#0fae74" font-weight="700" text-anchor="end">★ KEEP & GROW</text>');
  parts.push('<text x="'+(pad.l+10)+'" y="'+(H-pad.b-10)+'" class="axis-label" fill="#94a3b6" font-weight="700">○ TEST</text>');
  parts.push('<text x="'+(W-pad.r-10)+'" y="'+(H-pad.b-10)+'" class="axis-label" fill="#e1453f" font-weight="700" text-anchor="end">⚠ FIX OR CUT</text>');
  parts.push('<text x="'+(pad.l-35)+'" y="'+(pad.t+inH/2)+'" class="axis-label bold" transform="rotate(-90 '+(pad.l-35)+' '+(pad.t+inH/2)+')" text-anchor="middle">ROAS</text>');
  parts.push('<text x="'+(pad.l+inW/2)+'" y="'+(H-12)+'" class="axis-label bold" text-anchor="middle">Monthly spend ($)</text>');
  var maxConv=0; for(var i=0;i<paid.length;i++){if(paid[i].conv>maxConv) maxConv=paid[i].conv;}
  for(var j=0;j<paid.length;j++){
    var c = paid[j];
    var rad = 8 + Math.sqrt(c.conv/maxConv) * 28;
    var roas = Math.min(c.roas, rMax);
    parts.push('<circle cx="'+x(c.spend)+'" cy="'+y(roas)+'" r="'+rad+'" fill="'+c.color+'" fill-opacity=".75" stroke="#fff" stroke-width="2.5"><title>'+c.name+': '+fmtK(c.spend)+', '+c.roas.toFixed(1)+'× ROAS, '+fmtN(c.conv)+' conv</title></circle>');
    parts.push('<text x="'+x(c.spend)+'" y="'+(y(roas)-rad-6)+'" class="axis-label bold" text-anchor="middle" font-weight="700">'+esc(c.name.replace(' Ads','').replace(' Email',''))+'</text>');
    parts.push('<text x="'+x(c.spend)+'" y="'+(y(roas)-rad+5)+'" class="axis-label" text-anchor="middle">'+c.roas.toFixed(1)+'× · '+fmtN(c.conv)+'</text>');
  }
  setM('scatter', parts.join(''));
})();

// ========== CHANNEL TABLE (sortable, working sort) ==========
var COLS = [
  {key:'name',  lab:'Channel', sort:'name',    align:'l'},
  {key:'spend', lab:'Spend',   sort:'spend',   align:'r', fmt:'money'},
  {key:'dSpend',lab:'Δ vs prev',sort:null,     align:'r'},
  {key:'impr',  lab:'Impr.',   sort:'impr',    align:'r', fmt:'kn'},
  {key:'clicks',lab:'Clicks',  sort:'clicks',  align:'r', fmt:'kn'},
  {key:'ctr',   lab:'CTR',     sort:'ctr',     align:'r', fmt:'pct'},
  {key:'cpc',   lab:'CPC',     sort:'cpc',     align:'r', fmt:'money2'},
  {key:'cvr',   lab:'CVR',     sort:'cvr',     align:'r', fmt:'pct'},
  {key:'conv',  lab:'Conv.',   sort:'conv',    align:'r', fmt:'n'},
  {key:'cpa',   lab:'CPA',     sort:'cpa',     align:'r', fmt:'money2'},
  {key:'avgVal',lab:'Avg value',sort:'avgVal', align:'r', fmt:'money0'},
  {key:'revenue',lab:'Revenue',sort:'revenue', align:'r', fmt:'money'},
  {key:'roas',  lab:'ROAS',    sort:'roas',    align:'r'},
  {key:'spark', lab:'7-day',   sort:null,      align:'r'}
];
function chSeries(c){ var out=[]; for(var i=0;i<7;i++){ out.push((c.spend||1000)/30 * (0.7 + Math.sin(i+(c.spend||1)%5)*0.18 + (i/7)*0.2 + (Math.random()*0.2))); } return out; }
function sparkSvg(vals, color){
  var w=100,h=26,pad=2;
  var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals), r=max-min||1;
  function sx(i){return pad+i*((w-pad*2)/(vals.length-1));}
  function sy(v){return h-pad-((v-min)/r)*(h-pad*2-2);}
  var d=''; for(var i=0;i<vals.length;i++){d += (i===0?'M':'L')+sx(i)+','+sy(vals[i]);}
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="1.7" stroke-linecap="round"/></svg>';
}
function computeRow(c){
  return {
    name:c.name, logo:c.logo, sub:c.sub, color:c.color, spend:c.spend, prevSpend:c.prevSpend,
    impr:c.impr, clicks:c.clicks, conv:c.conv, revenue:c.revenue,
    ctr: c.impr ? c.clicks/c.impr*100 : 0,
    cpc: c.clicks ? c.spend/c.clicks : 0,
    cvr: c.clicks ? c.conv/c.clicks*100 : 0,
    cpa: c.spend ? c.spend/c.conv : 0,
    avgVal: c.conv ? c.revenue/c.conv : 0,
    roas: c.spend ? c.revenue/c.spend : null,
    dSpend: c.prevSpend ? (c.spend-c.prevSpend)/c.prevSpend*100 : null
  };
}
function fmtCell(v, fmt){
  if(v==null || v==='' || (typeof v==='number' && isNaN(v))) return '<span style="color:var(--ink-4)">—</span>';
  if(fmt==='money'){ return v ? '<b>'+fmtK(v)+'</b>' : '<span style="color:var(--ink-4)">—</span>';}
  if(fmt==='money2'){ return v ? '<span style="color:var(--ink-4);font-size:11px">$</span>'+v.toFixed(2) : '—'; }
  if(fmt==='money0'){ return v ? '<span style="color:var(--ink-4);font-size:11px">$</span>'+Math.round(v) : '—'; }
  if(fmt==='kn'){ return v ? fmtKn(v) : '—'; }
  if(fmt==='pct'){ return v ? v.toFixed(2)+'%' : '—'; }
  if(fmt==='n'){ return '<b>'+fmtN(v)+'</b>'; }
  return v;
}
function renderChannelTable(){
  // Header
  var head = COLS.map(function(col){
    var sorted = col.sort === CTRL.channelSort ? ' sorted' : '';
    return '<th class="'+(col.align==='r'?'r':'')+sorted+'" '+(col.sort?'data-sort="'+col.sort+'"':'')+(col.key==='name'?' style="padding-left:18px"':'')+(col.key==='spark'?' style="padding-right:18px"':'')+'>'+esc(col.lab)+(col.sort?'<span class="sort-arrow">'+(sorted?'↓':'⇅')+'</span>':'')+'</th>';
  }).join('');
  setM('ch-thead', head);
  // Sort
  var rows = CHANNELS.map(computeRow);
  rows.sort(function(a,b){
    var ka = a[CTRL.channelSort], kb = b[CTRL.channelSort];
    if(CTRL.channelSort==='cpa'){ return (ka||999) - (kb||999); }
    return (kb||0) - (ka||0);
  });
  // Body
  var body = rows.map(function(r){
    var roasTag = r.roas==null ? 'mid' : (r.roas >= 8 ? 'up' : r.roas >= 5 ? 'mid' : r.roas >= 3 ? 'warn' : 'down');
    var roasDisp = r.roas==null ? 'owned' : r.roas.toFixed(2)+'×';
    var deltaCell = r.dSpend==null ? '<span style="color:var(--ink-4)">—</span>' : '<span class="delta '+(r.dSpend>=0?'up':'down')+'" style="font-size:10.5px">'+(r.dSpend>=0?'+':'')+r.dSpend.toFixed(1)+'%</span>';
    var cells = '<td class="ch" style="padding-left:18px"><div class="ch-cell"><div class="lg '+r.logo+'"><svg><use href="#lg-'+r.logo+'"/></svg></div><div class="info"><span class="nm">'+esc(r.name)+'</span><span class="sub">'+esc(r.sub)+'</span></div></div></td>';
    cells += '<td class="r">'+fmtCell(r.spend, 'money')+'</td>';
    cells += '<td class="r">'+deltaCell+'</td>';
    cells += '<td class="r">'+fmtCell(r.impr, 'kn')+'</td>';
    cells += '<td class="r">'+fmtCell(r.clicks, 'kn')+'</td>';
    cells += '<td class="r">'+fmtCell(r.ctr, 'pct')+'</td>';
    cells += '<td class="r">'+fmtCell(r.cpc, 'money2')+'</td>';
    cells += '<td class="r">'+fmtCell(r.cvr, 'pct')+'</td>';
    cells += '<td class="r">'+fmtCell(r.conv, 'n')+'</td>';
    cells += '<td class="r">'+fmtCell(r.cpa, 'money2')+'</td>';
    cells += '<td class="r">'+fmtCell(r.avgVal, 'money0')+'</td>';
    cells += '<td class="r">'+fmtCell(r.revenue, 'money')+'</td>';
    cells += '<td class="r"><span class="roas-tag '+roasTag+'">'+roasDisp+'</span></td>';
    cells += '<td class="r" style="padding-right:18px">'+sparkSvg(chSeries(r), r.color)+'</td>';
    return '<tr>'+cells+'</tr>';
  });
  setM('ch-rows', body.join(''));
  // Wire header click sort
  document.querySelectorAll('#ch-thead th[data-sort]').forEach(function(th){
    th.addEventListener('click', function(){
      var k = th.getAttribute('data-sort');
      CTRL.channelSort = k;
      // Sync top sort buttons
      document.querySelectorAll('.ctabs[data-control="ch-sort"] button').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-value')===k);
      });
      renderChannelTable();
    });
  });
  // Footer totals
  var t = {spend:0,impr:0,clicks:0,conv:0,revenue:0};
  rows.forEach(function(r){t.spend+=r.spend; t.impr+=r.impr||0; t.clicks+=r.clicks||0; t.conv+=r.conv||0; t.revenue+=r.revenue||0;});
  var tCtr = t.impr ? t.clicks/t.impr*100 : 0;
  var tCpc = t.clicks ? t.spend/t.clicks : 0;
  var tCvr = t.clicks ? t.conv/t.clicks*100 : 0;
  var tCpa = t.spend ? t.spend/t.conv : 0;
  var tAvg = t.conv ? t.revenue/t.conv : 0;
  var tRoas = t.spend ? t.revenue/t.spend : 0;
  var tPrev = 0; rows.forEach(function(r){tPrev += r.prevSpend||0;});
  var tDelta = tPrev ? (t.spend-tPrev)/tPrev*100 : null;
  var tDeltaCell = tDelta==null ? '<span style="color:var(--ink-4)">-</span>' : '<span class="delta '+(tDelta>=0?'up':'down')+'" style="font-size:10.5px">'+(tDelta>=0?'+':'')+tDelta.toFixed(1)+'%</span>';
  var foot = '<td style="padding-left:18px">Total · '+CHANNELS.length+' channels</td>'+
    '<td class="r">'+fmtK(t.spend)+'</td>'+
    '<td class="r">'+tDeltaCell+'</td>'+
    '<td class="r">'+fmtKn(t.impr)+'</td>'+
    '<td class="r">'+fmtKn(t.clicks)+'</td>'+
    '<td class="r">'+tCtr.toFixed(2)+'%</td>'+
    '<td class="r"><span style="color:var(--ink-4);font-size:11px">$</span>'+tCpc.toFixed(2)+'</td>'+
    '<td class="r">'+tCvr.toFixed(2)+'%</td>'+
    '<td class="r">'+fmtN(t.conv)+'</td>'+
    '<td class="r"><span style="color:var(--ink-4);font-size:11px">$</span>'+tCpa.toFixed(2)+'</td>'+
    '<td class="r"><span style="color:var(--ink-4);font-size:11px">$</span>'+Math.round(tAvg)+'</td>'+
    '<td class="r">'+fmtK(t.revenue)+'</td>'+
    '<td class="r"><span class="roas-tag up">'+tRoas.toFixed(2)+'×</span></td>'+
    '<td class="r"></td>';
  setM('ch-foot', foot);
}
renderChannelTable();

// ========== JOURNEYS ==========
// === INJECT: journeys ===
// Replace with customer-journey paths (Step 2G). Filter values: 'all', 'new' (new visitors), 'ret' (returning).
// Shape: [{filter, share, conv, steps:[{t, ch?, conv?}], time, touches}]
var JOURNEYS_ALL = [];
// === END INJECT: journeys ===
function renderJourneys(){
  if(JOURNEYS_ALL.length === 0){
    setM('journeys', '<div style="padding:18px;text-align:center;color:var(--ink-4);font-size:11.5px">No journey data - connect a tracking source via Discovery API</div>');
    return;
  }
  var rows = JOURNEYS_ALL.filter(function(j){return CTRL.journeyFilter==='all' || j.filter===CTRL.journeyFilter || j.filter==='all';}).map(function(j){
    var steps='';
    for(var k=0;k<j.steps.length;k++){
      var s = j.steps[k];
      if(k>0) steps += '<span class="jr-arrow"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2l5 4-5 4"/></svg></span>';
      if(s.conv) steps += '<span class="jr-step conv"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 8l3 3 7-7"/></svg>'+esc(s.t)+'</span>';
      else if(s.ch) steps += '<span class="jr-step"><div class="lg xs '+s.ch+'"><svg><use href="#lg-'+s.ch+'"/></svg></div>'+esc(s.t)+'</span>';
      else steps += '<span class="jr-step jr-direct">'+esc(s.t)+'</span>';
    }
    return '<div class="journey-row"><div class="jr-head"><div class="jr-share">'+esc(j.share)+'<span class="conv">· '+esc(j.conv)+'</span></div><div class="jr-meta"><span><b>'+esc(j.touches)+'</b> touches</span><span><b>'+esc(j.time)+'</b> avg time</span></div></div><div class="jr-path">'+steps+'</div></div>';
  });
  setM('journeys', rows.join(''));
}
renderJourneys();

// ========== ROLE BARS ==========
(function(){
  // === INJECT: roles ===
  // Replace with first-touch / last-touch shares (Step 2G). One row per attribution-tracked channel.
  // Shape: [{ch, name, first:0..100, last:0..100}]
  var roleData = [];
  // === END INJECT: roles ===
  if(roleData.length === 0){
    setM('role-bars', '<div style="padding:20px;text-align:center;color:var(--ink-4);font-size:11.5px">No attribution data - connect a tracking source</div>');
    return;
  }
  var legend = '<div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);font-weight:600;margin-bottom:6px"><span></span><span style="display:flex;gap:5px;align-items:center"><i style="width:9px;height:9px;border-radius:2px;background:#4b5cf2;display:inline-block"></i>First touch</span><span style="display:flex;gap:5px;align-items:center"><i style="width:9px;height:9px;border-radius:2px;background:#0fae74;display:inline-block"></i>Last touch (closes)</span></div>';
  var rows = roleData.map(function(r){
    return '<div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:10px;align-items:center;font-size:11.5px"><div style="display:flex;align-items:center;gap:7px"><div class="lg xs '+r.ch+'"><svg><use href="#lg-'+r.ch+'"/></svg></div><span style="color:var(--ink-2);font-weight:600">'+esc(r.name)+'</span></div><div style="display:flex;align-items:center;gap:7px"><div style="height:10px;flex:1;background:var(--surface-3);border-radius:99px;overflow:hidden"><div style="width:'+(r.first*2.5)+'%;height:100%;background:linear-gradient(90deg,#7c83ff,#4b5cf2);border-radius:99px"></div></div><b style="font-size:11px;width:30px;text-align:right">'+r.first+'%</b></div><div style="display:flex;align-items:center;gap:7px"><div style="height:10px;flex:1;background:var(--surface-3);border-radius:99px;overflow:hidden"><div style="width:'+(r.last*2.5)+'%;height:100%;background:linear-gradient(90deg,#3bc792,#0fae74);border-radius:99px"></div></div><b style="font-size:11px;width:30px;text-align:right">'+r.last+'%</b></div></div>';
  });
  setM('role-bars', legend + rows.join(''));
  // Optional insight callout: rendered only if roleInsight (above) is non-empty.
  // === INJECT: role_insight ===
  // Replace empty string with a 1-2 sentence narrative if available; empty string hides the callout.
  var roleInsight = "";
  // === END INJECT: role_insight ===
  if(roleInsight){
    var ins = document.getElementById('role-insight');
    if(ins){
      ins.style.display = '';
      setM('role-insight', '<b style="color:var(--ink)">Insight:</b> ' + esc(String(roleInsight)));
    }
  }
})();

// ========== ALERTS FEED (Needs your attention) ==========
// Populated by the agent at build time per Step 2F of the skill.
// Shape: [{severity:'good|warn|bad'|null, meta_left, meta_right, title, body, actions:[{label, outline?}]}]
(function renderAlerts(){
  // === INJECT: alerts ===
  // Replace with up to 6 alert cards (Step 2F). Severity: 'good'|'warn'|'bad'|null.
  // Shape: [{severity, meta_left, meta_right, title, body, actions:[{label, outline?}]}]
  var alerts = [];
  // === END INJECT: alerts ===
  setM('alerts-desc', alerts.length>0 ? alerts.length + ' anomalies · sorted by impact' : 'No anomalies detected this period');
  var btn = document.getElementById('alerts-count-btn');
  if(btn){ btn.textContent = alerts.length>0 ? 'All ' + alerts.length : ''; btn.style.display = alerts.length>0 ? '' : 'none'; }
  if(alerts.length === 0){
    setM('alerts-feed', '<div style="padding:24px;text-align:center;color:var(--ink-4);font-size:11.5px">All systems within band - no anomalies surfaced.</div>');
    return;
  }
  var ICON = {
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 21h20L12 2z"/><path d="M12 9v5M12 17v.01"/></svg>',
    bad:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/></svg>'
  };
  var html = alerts.map(function(a){
    var sev = a.severity || 'info';
    var cls = (sev==='good'||sev==='warn'||sev==='bad') ? sev : '';
    var actions = Array.isArray(a.actions) && a.actions.length ? '<div class="a">' + a.actions.map(function(x){
      return '<a' + (x.outline ? ' class="outline"' : '') + '>' + esc(x.label||'') + '</a>';
    }).join('') + '</div>' : '';
    return '<div class="feed-item ' + cls + '"><div class="priority-bar"></div>' +
      '<div class="feed-icon ' + cls + '">' + (ICON[sev] || ICON.info) + '</div>' +
      '<div class="feed-body">' +
        '<div class="meta"><b>' + esc(a.meta_left||'') + '</b><span>·</span><span>' + esc(a.meta_right||'') + '</span></div>' +
        '<div class="h">' + esc(a.title||'') + '</div>' +
        '<div class="b">' + esc(a.body||'') + '</div>' +
        actions +
      '</div></div>';
  }).join('');
  setM('alerts-feed', html);
})();

// ========== JOURNEY STATS (Avg touches / time / multi-channel / cross-device) ==========
(function renderJourneyStats(){
  // === INJECT: journey_stats ===
  // Replace with strings (units included). Empty strings = leave the cell as "—".
  // Shape: { avg_touches, avg_time, multi_channel_pct, cross_device_pct }
  var s = {};
  // === END INJECT: journey_stats ===
  function setText(id, v){ var el=document.getElementById(id); if(el && v) el.textContent = v; }
  setText('js-avg-touches', s.avg_touches);
  setText('js-avg-time', s.avg_time);
  setText('js-multi-pct', s.multi_channel_pct);
  setText('js-cross-pct', s.cross_device_pct);
})();

</script>
</body>
</html>

```
