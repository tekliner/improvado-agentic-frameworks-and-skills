# The Trade Desk — Audit Playbook

**Three tiers — Lighthouse, Library, Agent. Tenant-agnostic — predicate shapes universal, predicate values from `tenant_policy.yaml` loaded at runtime. TTD-specific: bid-line discipline, deal access, audience strategy, frequency caps, viewability + brand-safety integration are the leverage points.**

> **⚠️ Cold-path-FIRST audit (TTD is different from every other platform).** TTD's REST API v3 cannot be queried live for advertiser-level data through Improvado's Discovery proxy — the OAuth grants Improvado holds are scope-limited to what cold-path Extract Templates need.
>
> **Empirically verified across multiple connections / tenants (validation passes 2026-04-30):**
> - `POST /v3/advertiser/query` → **HTTP 405 `Allow: GET`** (Discovery proxy forces GET on this path).
> - `GET /v3/advertiser/query` → **HTTP 403** `{"Message":"You are not authorized to access Advertiser 'query'."}`.
> - Same 403/405 pattern reproduces on `/v3/campaign/query/advertiser`, `/v3/adgroup/query/campaign`, `/v3/creative/query/advertiser`. The OAuth tier grants reporting-only — entity reads are NOT in scope.
>
> **Therefore live-API audit is NOT supported.** Audit pipeline is: probe connection → trigger Extract Templates → wait for warehouse load → audit from cold-path warehouse rows in customer ClickHouse (`im_<agency>_<hash>.<table>`). Plan for ~3–10 minute audit latency vs ~5 second on other platforms. Resolve the destination at runtime via `getDestinationConnectionsTool` — don't hard-code paths.
>
> **Structural ingest gaps (validated as NOT tenant-specific across multiple independent retests):** TTD-V-Viewability (`measurable_impressions=0` despite IAS/MOAT/DV configured at TTD); TTD-T-Universal (tracking_tags entity table absent from default loaded extract set); TTD-F-Cap-Basis (`counter_attribute IN ('None','AllowUIGroupConfiguration')`, household/device basis not stored). These are **Improvado ingest-template gaps**, not policy violations — flag BLOCKED-extract-coverage and emit a `request_template` action; do NOT FAIL them. Resolution requires Improvado-side template upgrade, not customer action.

---

## 0. Pre-flight + per-tenant policy

**Step A — Connection check** (per [[Discovery API Write-Action Protocol]] § 1):

```python
ctx = mcp.createImpersonationContext(cluster=..., rtbm_agency_id=..., workspace_id=...)
conn = pick_active_connection(mcp.getConnectionsTool(impersonation_context_id=ctx, datasourceName='the_trade_desk_api'))
# If no active connection — surface https://report.improvado.io/create_data_source_connection/the_trade_desk/?workspace=<id> and stop.
advertiser_id = pick_account(mcp.discoveryListAccountsTool(impersonation_context_id=ctx, connectionId=conn.id))
```

**Step B — Cold-path data acquisition (mandatory before audit):**

```python
# Trigger the canonical extracts in parallel — these load from TTD's elevated worker tier
# Resolve actual templateIds via getExtractTemplatesTool(datasourceName='the_trade_desk_api') at runtime
template_targets = ["Bid Lines Entity", "Campaigns Entity", "Ad Groups Entity",
                    "Basic Performance", "Tracking Tags", "Audiences"]
extracts = {
    name: mcp.createExtractTool(
        datasourceName='the_trade_desk_api',
        connectionId=str(conn.id),
        templateId=resolve_template_id(name),
        accountId=advertiser_id,
        date_range='last_30_days',
    ) for name in template_targets
}

# Poll until done (~30–90s per template for 30-day window)
import time
for name, ex in extracts.items():
    while True:
        st = mcp.getExtractStatusTool(extract_id=ex.id)
        if st in ('completed', 'failed', 'error'): break
        time.sleep(15)

# Then query the loaded warehouse rows
data = mcp.queryDestinationTool(
    destinationConnectionId='<dwh_id>',
    query="SELECT * FROM <client_db>.bid_lines_ttd WHERE __extract_id = ...")
```

**Step C — Load tenant policy:**

```yaml
# tenant_policy.yaml — TTD section
the_trade_desk:
  budget:
    require_set_and_nonzero: true                   # L-TTD-Budget
  schedule:
    require_start_date_in_future_or_present: true   # L-TTD-Start
    require_end_date: false
  tracking:
    universal_pixel_required: true
    universal_pixel_event_freshness_days: 7         # L-TTD-Pixel
  brand_safety:
    required_provider_above_monthly_spend: 5000     # L-TTD-Brand-Safety
    accepted_providers: ["DoubleVerify", "IAS", "MOAT"]
  frequency_capping:
    awareness_objectives_require_cap: true          # L-TTD-FreqCap
    cap_basis_required: ["household", "device"]
  bid_lines:
    max_per_adgroup: 50                             # TTD-B
    cost_variance_max_pct: 0.40                     # tail-aggregation guard
    dead_bid_line_age_days: 14                      # 0 spend
  deals:
    pmp_utilization_min_share: 0.20                 # PMP / direct deal share of spend
  audience:
    first_party_segments_required_above_spend: 10000
  creative:
    refresh_cadence_max_days: 21
    require_format_diversity_min: 2
  viewability:
    minimum_score: 0.70                             # IAS / DV / MOAT viewability
    fraud_rate_max: 0.02
  kokai:
    require_kokai_migration: true                   # legacy Solimar features deprecating
```

---

## 1. Tier 1 — Lighthouse (must-run, ~6 checks — runs against warehouse rows from Step B)

| ID | Check | Source warehouse table | Pass condition | Severity |
|---|---|---|---|---|
| **L-TTD-Budget** | Campaign budget set | `campaigns_entity_ttd` | `Budget IS NOT NULL AND Budget > 0` for every `Status='ENABLED'` row | CRITICAL |
| **L-TTD-Start** | Start date set + valid | `campaigns_entity_ttd` | `StartDate IS NOT NULL` AND `StartDate >= today - 1` for every ENABLED row | CRITICAL — won't deliver |
| **L-TTD-Pixel** | Universal pixel firing | `tracking_tags_ttd` | At least one tag with `last_seen >= today - policy.tracking.universal_pixel_event_freshness_days` | CRITICAL |
| **L-TTD-Brand-Safety** | Brand-safety provider integrated when spend high | `campaigns_entity_ttd` joined with `basic_performance_ttd` | If `monthly_spend > policy.brand_safety.required_provider_above_monthly_spend`: provider in `accepted_providers` set | HIGH |
| **L-TTD-FreqCap** | Frequency cap on awareness/reach campaigns | `campaigns_entity_ttd` | If `goal IN ('Awareness','Reach')`: `freq_cap` set on basis required by policy | HIGH |
| **L-TTD-AllPaused** | At least one ENABLED campaign | `campaigns_entity_ttd` | `len(rows where Status='ENABLED') >= 1` | CRITICAL or expected |

---

## 2. Tier 2 — Library (universal predicate checks against warehouse rows)

Each rule conditionally fires if `policy.the_trade_desk.<key>` is set. Reference build target: `algorithms/revenue_div/projects/marketing experiments/google_ads_audit/checks_ttd.py` (TODO — implementation paralleling `checks_linkedin.py` / `checks_tiktok.py` / `checks_reddit.py`).

| ID | Check | Source table(s) | Pass condition |
|---|---|---|---|
| **TTD-B-Count** | Bid lines per ad group not bloated | `bid_lines_ttd` aggregated by `adgroup_id` | `len(bid_lines_per_adgroup) <= policy.bid_lines.max_per_adgroup` |
| **TTD-B-Variance** | Bid-line cost variance below tail-aggregation threshold | `bid_lines_ttd` | `stddev(cost_micros) / mean(cost_micros) <= policy.bid_lines.cost_variance_max_pct` per ad group |
| **TTD-B-Dead** | No dead bid lines (account-wide tail-bloat) | `ad_groups_entity_ttd` joined with `basic_performance_ttd` (filter ad_group_status=ENABLED, sum spend last 30d) | `share(enabled_ad_groups where spend_30d == 0) <= 0.30` (≤30% dead-line ratio acceptable). **Empirical:** observed >85 % dead-line ratios on multiple enterprise-tier accounts ($4.9M+/quarter spend) — massive tail-bloat is a structural pattern at scale, not an outlier. Above ~50% should escalate to a separate "TTD-B-Dead-Account-Wide" finding with $-recovery estimate. |
| **TTD-D-PMP** | PMP / direct deal utilization | `bid_lines_ttd` filter `inventory_source='PMP'` + spend | `pmp_spend / total_spend >= policy.deals.pmp_utilization_min_share` |
| **TTD-A-FirstParty** | First-party segments active at high spend | `ad_groups_entity_ttd` (audience_id, retargeting_audience_ids) + `basic_performance_ttd` | If `monthly_spend > policy.audience.first_party_segments_required_above_spend`: ≥10 % of enabled ad groups carry first-party retargeting seeds. **Empirical:** observed adoption rates of 0–1 % across multiple enterprise tenants spending 1,000×+ over policy threshold — 1P-data underutilization is consistently the highest-leverage TTD finding at scale. |
| **TTD-A-1P-Underuse** | Critical 1P data activation gap (account-wide) | same as TTD-A-FirstParty + spend tier | If `monthly_spend > $50k` AND `share(retargeting_enabled_ad_groups) < 0.10`: critical finding. Not a per-row predicate — an account-wide gate that fires alongside TTD-A-FirstParty for severity escalation. |
| **TTD-C-Refresh** | Creative refresh cadence | `entity_creatives_ttd` → max(create_time) per ad group; account-wide `share(creatives where (today - create_time) > 365d)` | `(today - max_creative_age) <= policy.creative.refresh_cadence_max_days` per ad group AND `share_creatives_older_than_1y < 0.50` account-wide. **Empirical:** observed 85–92 % staleness ratios on enterprise tenants — Kokai's freshness signal can't unlock new optimization features on stale inventory. |
| **TTD-C-Format** | Format diversity | `creatives_ttd` distinct format types | `len(distinct_formats) >= policy.creative.require_format_diversity_min` |
| **TTD-V-Viewability** | Viewability score above threshold | `basic_performance_ttd` viewability columns (`measurable_impressions`, `viewable_impressions`) | per-campaign `viewable_impressions / measurable_impressions >= policy.viewability.minimum_score`. **Caveat (extract-coverage gap):** if both columns are 0 across all rows despite IAS/MOAT/DV configured at TTD ad-group level, the Improvado ingest is missing viewability metrics — flag as **BLOCKED-extract-coverage**, not FAIL. Validated as a structural ingest gap across multiple tenants — needs extract-template upgrade before this rule can ever run. |
| **TTD-V-Fraud** | Fraud rate below threshold | `basic_performance_ttd` | `fraud_impressions / total_impressions <= policy.viewability.fraud_rate_max` |
| **TTD-K-Migration** | No legacy Solimar features in use | `campaigns_entity_ttd` and `adgroups_entity_ttd` | If `policy.kokai.require_kokai_migration`: every campaign uses Kokai-era settings (no `legacy_*` flags) |
| **TTD-T-Universal** | Universal Pixel installed AND viewability tag installed | `tracking_tags_entity_ttd` | both tag types present. **Caveat:** Tracking Tags Entity (Universal Pixel firing) extract template (17936 family) may not be present in the client's loaded set — flag **BLOCKED-extract-coverage** with a `request_template` action rather than FAIL. Validated as a structural gap — must request template enablement first. |
| **TTD-F-Cap-Basis** | Frequency cap basis matches policy | `campaign_frequency_configs_entity_ttd.counter_attribute` | basis IN `policy.frequency_capping.cap_basis_required`. **Caveat:** if `counter_attribute IN ('None','AllowUIGroupConfiguration')` → household/device/cookie basis is NOT stored in the extract; cannot validate per-household CTV caps from warehouse alone. Flag as BLOCKED-extract-coverage. Validated as a structural gap — would need TTD UI / live API access to verify, both currently out of scope. |
| **TTD-D-Open-Auction-Cost** | Open-auction cost not exceeding deal cost | join `bid_lines_ttd` open-auction × deal | open-auction CPM ≤ 1.5 × deal CPM (tunable in policy) |
| **TTD-Status** | Configured ↔ effective status drift | `campaigns_entity_ttd` | no drift |
| **TTD-Naming** | Active campaign naming | name regex | `policy.naming_convention.exclude_patterns` not present |

---

## 2.1 Performance comparatives — current spend / metric outliers (cold-path warehouse, 8 rules)

Per SKILL § 0.1: score per-entity vs account median, every finding has `$ at risk`. TTD live API blocked by OAuth scope (validated cross-tenant) — rules run against `basic_performance_ttd` warehouse rows joined with `campaigns_entity_ttd` / `ad_groups_entity_ttd`.

**Cold-path query template (auto-dispatch the Basic Performance extract first):**
```sql
SELECT campaign_id, ad_group_id, country, partner_id,
       SUM(cost) AS cost_30d, SUM(impressions) AS imp_30d,
       SUM(clicks) AS clicks_30d, SUM(conversions) AS conv_30d,
       SUM(cost) / NULLIF(SUM(impressions), 0) * 1000 AS cpm,
       SUM(cost) / NULLIF(SUM(clicks), 0) AS cpc,
       SUM(clicks) / NULLIF(SUM(impressions), 0) AS ctr,
       SUM(viewable_impressions) / NULLIF(SUM(measurable_impressions), 0) AS viewability
FROM basic_performance_ttd
WHERE date >= CURRENT_DATE - 30
  AND ad_group_status = 'ENABLED'
GROUP BY 1, 2, 3, 4
```

| ID | Check | Trigger / threshold | $ at risk formula |
|---|---|---|---|
| **TTD-Perf-Spend-Outlier** | Campaign spend >2× median | `cost_30d > 2× median` | `cost_30d − 1.5×median` |
| **TTD-Perf-CPM-Outlier** | Ad-group CPM >2× median (TTD CPMs vary widely by channel — flag within-channel) | `cpm > 2× median(cpm)` per channel; signal ≥10K imp | `(cpm − median) × imp / 1000` |
| **TTD-Perf-Viewability-Outlier** | Ad-group viewability <50% (industry standard ≥70%) | `viewable / measurable < 0.50 AND imp ≥ 10000` | `cost × (1 − viewability/0.7)` (literal non-viewable spend) |
| **TTD-Perf-Conv-Volume-Outlier** | Performance ad group with 0 conv in 30d | `goal_type='CPA' AND conv_30d == 0 AND cost_30d > $1000` | `full cost_30d` |
| **TTD-Perf-Channel-Concentration** | One channel (Display/Video/CTV/Audio/Native) >70% of spend | per-channel rollup | `spend_in_underweighted_channels` (mis-allocation across portfolio) |
| **TTD-Perf-Country-Concentration** | One country >70% of spend on multi-country ad group | per-country breakdown | `spend_in_unintended_countries` |
| **TTD-Perf-Partner-Quality** | One partner_id (publisher) consuming >20% of spend with bottom-decile CTR | per-partner CTR vs ad-group median | `partner_spend × (1 − partner_ctr/ag_median_ctr)` |
| **TTD-Perf-Frequency-Outlier** | CTV ad group with effective frequency >12/30d | `imp / unique_reached_users > 12` (when reach data available) | `cost × (freq − 4) / freq` (waste from over-saturation) |

## 3. Tier 3 — Mandatory edge-case exploration

This is the heaviest tier in the TTD playbook because Tier 2 is empty. Agent **must** cover ground that other-platform Tier 2 covers automatically.

### 3.1 Account state classification

Same 5 states as other playbooks (Active / Dormant / All-inactive / Mixed / New).

### 3.2 Per-channel-mix edge cases (TTD-unique)

TTD buys across many channels. The mix decides what matters.

| Channel | Edge cases |
|---|---|
| **CTV / OTT** | (a) Co-viewing measurement (b) Frequency cap by household (not device) (c) Inventory source quality (premium MVPDs vs ad-supported) (d) Reach measurement integration (Nielsen, Comscore) (e) Creative format (15s / 30s / 6s) |
| **Display** | (a) Viewability ≥70% (b) Brand-safety integration (c) Site allowlist/blocklist quality (d) IAB category exclusions (e) MOAT / IAS / DV integration |
| **Video (online)** | (a) VPAID / VAST compliance (b) Skip rate (c) Completion rate (d) View-through attribution window |
| **Audio** | (a) Inventory partners (Spotify, iHeart, Pandora) (b) Companion banner usage (c) Frequency cap (audio listeners are sensitive) |
| **Native** | (a) Creative-publisher fit; native that doesn't blend = wasted impression (b) Native exchange quality |
| **Mobile In-App** | (a) MMP integration (b) iOS 14.5+ SKAdNetwork (c) MAID-based targeting graceful degradation |

### 3.3 Per-vertical edge cases

| Vertical | Edge cases |
|---|---|
| **B2B** | TTD increasingly used for B2B reach + branding. (a) IP-based ABM via 6sense / Demandbase / Bombora integration (b) Inventory targeted to executive sites (c) Frequency cap aligned with sales cycle |
| **DTC eCommerce** | (a) Catalog DSP integration (b) PMAX-equivalent dynamic optimization (c) Cross-device reach measurement |
| **CPG / FMCG** | (a) Reach + Frequency optimization (b) Brand lift study integration (c) Retail deals (Walmart / Kroger Connect) |
| **Travel / Hospitality** | (a) Geo-targeted by destination (b) Seasonal cadence (c) Cross-device journey |
| **Healthcare** | (a) HIPAA compliance — no PII in URLs (b) Restricted creative categories (c) State-by-state regulatory |
| **Auto** | (a) In-market shopper segments (b) Local dealer feed integration (c) Service vs new-vehicle journey |
| **Politics / Issue** | (a) Political category disclosures (b) State-by-state limits (c) Brand-safety strict |

### 3.4 Per-spend-tier

| Tier | Monthly spend | Edge cases |
|---|---|---|
| **Below-DSP-threshold** | <$10k | TTD typically not viable below $10k — recommend social platforms |
| **Mid** | $10k-$100k | Single-channel focus; typically display + video; brand-safety integration mandatory |
| **Enterprise** | $100k-$1M | Multi-channel mix; PMP deals; advanced audience strategy; Kokai migration |
| **Mega** | $1M+ | Full programmatic stack; data-marketplace integrations; cross-DSP comparison; brand-lift studies |

### 3.5 Per-account-maturity

| Maturity | Audit focus |
|---|---|
| **<60d** | Setup correctness — tag deployment, brand-safety, deal access |
| **60-180d** | Channel mix optimization; bid line consolidation; deal vs open auction |
| **180+ days** | Full optimization; Kokai migration; cross-channel attribution; data-marketplace cost audit |

### 3.6 Cross-DS context

| Connected | Edge case |
|---|---|
| Other DSPs (DV360, Amazon DSP) | Audience overlap; deal access redundancy; cost comparison per channel |
| MMP (AppsFlyer / Adjust / Singular) | Mobile attribution conflict |
| GA4 / Adobe Analytics | Cross-channel attribution; UTM capture |
| Brand-safety vendors (DV / IAS / MOAT) | Verification tag firing |
| Identity (LiveRamp / ID5 / UID2) | Cookieless identity strategy |

### 3.7 TTD-unique signals to probe

- **Bid line tail aggregation** — pull `bid_lines` report; check cost concentration. Often 5% of bid lines drive 80% of waste.
- **Deal access vs utilization** — pull `deals` inventory; check spend per deal. Stale deals (no spend 30d) indicate broken deal terms or campaign misalignment.
- **Kokai migration status** — `campaign.PlatformVersion` field. Legacy "Solimar" campaigns won't get new optimization features.
- **Brand-safety provider integration** — pull `tracking_tags` for DV/IAS pixels. Absent = unverified inventory = brand risk.
- **Frequency cap tier (household / device / cookie)** — TTD allows per-household via cross-device graph. Most accounts default to per-cookie which is sub-optimal.
- **First-party data activation** — pull `audience` inventory; check for client's first-party seeds (CRM upload, pixel-built). Absent = relying on expensive third-party data.

### 3.8 OODA loop

```
INPUTS: account_meta + Tier1_results (small set) + Tier2_library (EMPTY for TTD)
BUDGET: 7 hypotheses · 35 API calls · 90s (extended because Tier 2 absent)

1. Classify §3.1-3.5; channel mix detection critical for TTD
2. Pick top 4-5 dimensions; bid line analysis + brand-safety always in scope
3. Probe with /myreports/reportexecution (async — poll for completion)
4. Stop at budget OR 2 consecutive no-finding hypotheses
5. Rank by $ recoverable monthly + brand-risk severity
6. Output: top-N + counterfactual + UC routing

For TTD, "channel might not fit" is a valid Tier 3 outcome below $10k/mo spend.
```

---

## 4. Output format

Same as other playbooks — Lighthouse (partial), Tier 2 (empty disclosure), Tier 3 (full exploration), Estimated Recoverable, Top-N actions.

```
═══ TTD AUDIT — <account> ═══

LIGHTHOUSE (Tier 1, 5/6 passed):
  ❌ L-TTD-Brand-Safety: No DoubleVerify or IAS integration at $45k/mo spend
     → unverified inventory; brand-safety risk + likely 8-15% wasted on fraud

CONTEXT-DEPENDENT (Tier 2): NOT YET IMPLEMENTED for TTD — see [[The Trade Desk]] § 7 roadmap.
Agent compensating with extended Tier 3 exploration.

AGENT EXPLORATION (Tier 3, 6 hypotheses tested in 28s):
  🔴 [Bid line tail aggregation] — $7,400/mo waste
     Pulled bid_lines report. 12% of bid lines (47/391) drive 76% of cost but
     only 18% of conversions. Counterfactual: pause bottom-tail bid lines,
     redistribute budget → est +$7.4k/mo recovered or +30% conversions.

  🔴 [Stale deals] — $3,200/mo
     8 PMP deals registered, only 3 have spend last 30d. 5 dead deals =
     wasted negotiation overhead. Investigate deal terms.

  🟡 [Frequency cap per-cookie not per-household] — reach inflation
     CTV channel using device-level cap; cross-device graph available.
     Counterfactual: switch to per-household → +12% effective reach at same impressions.

ESTIMATED RECOVERABLE: $10,600/mo + brand-safety risk reduction
TOP 3 ACTIONS:
  1. Deploy DV/IAS tags (UC-PH-1 TTD variant)
  2. Bid line tail-cut (UC-TTD-Bid-Lines, TODO build)
  3. Switch to per-household frequency cap on CTV (UC-RH-1)
```

---

## 5. Implementation contract

Same 7 rules as [[Google Ads — Audit Playbook]] § 6, plus TTD-specific:

8. **Tier 2 absence acknowledged** — agent must explicitly disclose "Tier 2 library not implemented for TTD; running expanded Tier 3 instead" in output. Don't pretend to have rules we don't.
9. **Async report polling** — agent must handle TTD's report-execution lifecycle (POST → poll until complete → download). Budget time for this.
10. **Channel-fit recommendation** — for accounts <$10k/mo, agent may recommend TTD is not the right channel. This is valid Tier 3 outcome.

---

## 6. Source files

- Marketing PDF (gated): https://hs.improvado.io/hubfs/resources/trade_desk_campaign_checklist.pdf
- TTD API docs: https://api.thetradedesk.com/v3/doc/
- 2 legacy Cerebro entity rules in Cerebro Library (TTD Campaign - Budget, TTD Campaign - Start Date)
- Notion task to revive: [Prepare TTD Audit for customers](https://www.notion.so/12b9aec6212580e29c31f3858596bc60) (IHT-11530, declined)
- This playbook = scoping document for the dedicated TTD audit build (engine_ttd.py + checks_ttd.py + UC-AU-TTD)
