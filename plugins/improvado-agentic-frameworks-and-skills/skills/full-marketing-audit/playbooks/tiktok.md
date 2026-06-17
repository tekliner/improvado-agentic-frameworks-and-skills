# TikTok Ads — Audit Playbook

**Three tiers — Lighthouse, Library, Agent. Tenant-agnostic — predicate shapes universal, predicate values from `tenant_policy.yaml` loaded at runtime. TikTok-specific: creative format (9:16 + captions) is a Tier 1 issue (not optional), Spark Ads + ACO + LOOKALIKE_VALUE are unique leverage points, vertical industry determines attribution window correctness.**

> **Live-API audit.** TikTok Business API v1.3 works through `discoveryRequestTool` against `https://business-api.tiktok.com/open_api/v1.3/...`. See [[TikTok Ads]] § 2.

> **⚠️ HTTP method gotcha (validated empirically 2026-04-30 across multiple enterprise advertisers).** TikTok Business API v1.3 returns **40004 Permission / 405 Method Not Allowed** on `POST` for the entity-read endpoints below. **All entity reads use `GET`** (not POST as the SDK examples suggest):
> - `GET /campaign/get/`, `GET /adgroup/get/`, `GET /ad/get/`, `GET /pixel/list/`, `GET /pixel/event/stats/`, `GET /report/integrated/get/`, `GET /dmp/custom_audience/list/`, `GET /file/video/ad/info/`.
>
> **Discovery proxy `params` field double-URL-encodes JSON arrays.** For filtering with array values (e.g. `filtering={"primary_status":["STATUS_DELIVERY_OK"]}`), build the query string manually and embed pre-encoded `?` directly in the `url` field instead of using `params`:
> ```python
> # BROKEN — params double-encodes
> request={"method":"get","url":"https://business-api.tiktok.com/open_api/v1.3/ad/get/","params":{"advertiser_id":"X","filtering":json.dumps({"primary_status":["STATUS_DELIVERY_OK"]})}}
> # WORKS — manual encoding
> request={"method":"get","url":f"https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=X&filtering={urllib.parse.quote(json.dumps({...}))}"}
> ```
>
> **Field whitelists (40002 errors return the valid field list — mirror these):**
> - `objective_type` is a **campaign-level** field, NOT valid on `/adgroup/get/`.
> - `status` is NOT a valid field on `/ad/get/` — use `secondary_status` + `operation_status` instead. `secondary_status` enum includes `AD_STATUS_DELIVERY_OK`, `AD_STATUS_REJECT`, etc.; `operation_status` is `ENABLE` / `DISABLE`.

---

## 0. Pre-flight + per-tenant policy

**Step A — Connection check** (per [[Discovery API Write-Action Protocol]] § 1):

```python
ctx = mcp.createImpersonationContext(cluster=..., rtbm_agency_id=..., workspace_id=...)
conn = pick_active_connection(mcp.getConnectionsTool(impersonation_context_id=ctx, datasourceName='tiktok_ads'))
# If no active connection — surface https://report.improvado.io/create_data_source_connection/tiktok_ads/?workspace=<id> and stop.
advertiser_id = pick_account(mcp.discoveryListAccountsTool(impersonation_context_id=ctx, connectionId=conn.id))
```

**Step B — Load tenant policy:**

```yaml
# tenant_policy.yaml — TikTok section
tiktok_ads:
  tracking:
    pixel_min_events_in_7d: 1
    capi_min_event_share: 0.10                # T2: web_events_api share of total
  creative:
    feed_required_aspect_ratios: ["9:16", "1:1"]    # T4
    captions_required_on_video: true                # T5
    fatigue_max_age_days: 7                         # T3
  bidding:
    forbidden_combos:                               # T9
      - {objective: "CONVERSIONS", bid_type: "BID_TYPE_CUSTOM"}
  audience:
    minimum_size_lower_bound: 500_000               # T10
    require_lookalike_value_when_custom_audiences_exist: true  # T7
  budget_structure:
    cbo_required_when_active_adgroups_above: 3      # T8
  smart_features:
    aco_required: true                              # T11
    spc_required_above_monthly_spend: 10_000        # T13
    spark_ads_required_above_monthly_spend: 5_000   # T6
  frequency_capping:
    awareness_objectives_require_cap: true          # T12
    max_frequency_default: 5
  attribution:
    long_cycle_industries_require_window_min: "7d_click"   # T15
  account_status:
    forbidden_statuses: ["STATUS_SELF_SERVICE_UNAUDITED"]  # constrained features below audit threshold
```

---

## 1. Tier 1 — Lighthouse (must-run, ~8 checks)

| ID | Check | Discovery API call | Pass condition | Severity |
|---|---|---|---|---|
| **L-T1** | Pixel installed and firing | `GET /open_api/v1.3/pixel/list/` + `GET /open_api/v1.3/pixel/event/stats/` | At least 1 pixel with `events_7d >= policy.tracking.pixel_min_events_in_7d` | CRITICAL |
| **L-T4** | Feed-placement creative aspect ratio | `GET /open_api/v1.3/ad/get/` + `GET /open_api/v1.3/file/video/ad/info/` | Each active feed ad has aspect ratio in `policy.creative.feed_required_aspect_ratios` | CRITICAL — auto-degraded delivery |
| **L-T5** | Video has captions / text overlay | same calls + creative metadata `has_captions` field | If `policy.creative.captions_required_on_video`: every active video ad has captions | HIGH — sound-off market |
| **L-T9** | Bid type compatible with objective | `GET /open_api/v1.3/adgroup/get/` → check `(objective_type, bid_type)` against `policy.bidding.forbidden_combos` | No active ad group violates forbidden combos | CRITICAL — bid-objective mismatch |
| **L-T14** | Ad group not stuck in LEARNING >7d | adgroup detail → `delivery_mode.status` + `created_at` | No active ad group with `LEARNING` status > `policy.bidding.learning_phase_max_days` (default 7) | CRITICAL — not converging |
| **L-T-Disapp** | No rejected/under-review active ads | `GET /open_api/v1.3/ad/get/` → `secondary_status` | No active ad with `secondary_status='REJECTED'` OR pending review > 48h | CRITICAL |
| **L-T-Acct** | Account servable | `GET /open_api/v1.3/advertiser/info/?advertiser_ids=[...]` → `status, balance` | `status NOT IN policy.account_status.forbidden_statuses` AND `balance > 0` (or has valid PO) | CRITICAL |
| **L-T-AllPaused** | At least one ACTIVE campaign | `GET /open_api/v1.3/campaign/get/` filter by status | `len(active) >= 1` | CRITICAL or expected |
| **L-T-PixelHygiene** | Pixel inventory cleanliness | `GET /open_api/v1.3/pixel/list/` → cross-ref active ads' tracking pixel + name | NO pixel where `name CONTAINS ('TEST','DNU','OLD','LEGACY','TEMP')` AND `status='ENABLE'`. NO active ad references a pixel with `events_7d == 0` AND `last_fired > 30d ago`. Empirically observed: majority of pixels in enterprise accounts are stale (including literally-named "TEST" pixels still ENABLE) — wrong pixel attached to ads = misattribution risk. | HIGH |
| **L-T-BudgetExceedDrift** | BUDGET_EXCEED + still ENABLE | campaign detail → `(secondary_status, operation_status)` | NO campaign with `secondary_status='CAMPAIGN_STATUS_BUDGET_EXCEED'` AND `operation_status='ENABLE'`. Empirically observed: large-spend campaigns flagged BUDGET_EXCEED yet still operation_status=ENABLE — campaign cannot deliver but reports as live. | HIGH |

---

## 2. Tier 2 — Library (universal predicate checks, 15 rules)

Each rule conditionally fires if the corresponding `policy.tiktok_ads.<key>` is set.

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **T2** | CAPI event share | `GET /open_api/v1.3/pixel/event/stats/` → split by source | `event_count[source='web_events_api'] / total >= policy.tracking.capi_min_event_share` over 30d |
| **T3** | Creative fatigue (active ads >age) | `GET /open_api/v1.3/ad/get/` filter active → check `create_time` | `(now - create_time).days <= policy.creative.fatigue_max_age_days` |
| **T6** | Spark Ads adoption at high spend | `GET /open_api/v1.3/ad/get/` filter `ad_format='SPARK_AD'` + `GET /open_api/v1.3/report/integrated/get/` for spend | If `monthly_spend > policy.smart_features.spark_ads_required_above_monthly_spend`: spark count > 0 |
| **T7** | LOOKALIKE_VALUE used when custom audiences exist | `GET /open_api/v1.3/dmp/custom_audience/list/` filter `audience_type` | If any audience has type IN `('CUSTOMER_LIST','PIXEL')`: at least one with `subtype='LOOKALIKE_VALUE'` |
| **T8** | Campaign Budget Optimization on with multiple ad groups | `GET /open_api/v1.3/campaign/get/` → `budget_optimize_on` + count active ad groups | If active ad-group count > `policy.budget_structure.cbo_required_when_active_adgroups_above`: `budget_optimize_on == true` |
| **T10** | Audience size lower bound | `GET /open_api/v1.3/adgroup/get/` → `audience_size_lower` | `audience_size_lower >= policy.audience.minimum_size_lower_bound` |
| **T11** | ACO (Automated Creative Optimization) on | adgroup detail → `creative_material_mode` | `creative_material_mode == 'CUSTOMIZE_CREATIVE'` (ACO ON) if `policy.smart_features.aco_required` |
| **T12** | Frequency cap on awareness/reach | adgroup → `frequency, frequency_schedule` for `objective IN ('REACH','AWARENESS')` | If `policy.frequency_capping.awareness_objectives_require_cap`: cap set AND `<= max_frequency_default` |
| **T13** | Smart Performance Campaign at high spend | campaign detail → `campaign_type='APP_CAMPAIGN'` or SPC indicator | If `monthly_spend > policy.smart_features.spc_required_above_monthly_spend`: SPC present |
| **T15** | Attribution window aligned to industry sales cycle | account → `attribution_window` config | If account industry in `policy.attribution.long_cycle_industries`: window `>= 7d_click` |
| **T-Status** | Operation vs secondary status drift | adgroup → `(operation_status, secondary_status)` | `operation_status='ENABLE'` AND `secondary_status IN ok_set` (no `NOT_DELIVERY_ACCOUNT_AUDIT`, etc.) |
| **T-Naming** | Active campaign naming | name regex | `policy.naming_convention.exclude_patterns` not in name |
| **T-Pixel-Match** | Tracking pixel matches tenant's owned pixel ID | `GET /open_api/v1.3/ad/get/` + pixel inventory | active ad's tracking pixel in `policy.pixel.required_pixel_ids` |
| **T-Targeting-Audience-Suppression** | Required exclusion lists attached to ad groups | adgroup → `excluded_audience_ids` | required URN list ⊆ excluded |
| **T-DNU** | DNU/placeholder tokens absent from active names | name regex | excluded |
| **T-Zombie-RF-Reach** | No prior-FY zombie infinite-budget RF_REACH | campaign detail → `(buying_type='RESERVATION', budget_mode='BUDGET_MODE_INFINITE', operation_status='ENABLE', last_modified < 365d ago)` | NO campaign matches all 4 conditions. Empirically observed across multiple enterprise tenants: large fractions of "active" RF_REACH campaigns turn out to be prior-FY zombies (INFINITE budget, last modified 2-3 years ago, operationally ENABLE, no spend) — pollute reporting and audit surface. |

---

## 2.1 Performance comparatives — current spend / metric outliers (LIVE API, 8 rules)

Score current per-entity performance against the customer's own median across active entities. Every finding has `$ at risk` per SKILL § 0.1 quantitative-comparison rule.

**Live call (TikTok Business API v1.3, GET method):**
```
GET /open_api/v1.3/report/integrated/get/?advertiser_id=X
  &report_type=BASIC&data_level=AUCTION_AD
  &dimensions=["ad_id","campaign_id","adgroup_id","country_code"]
  &metrics=["spend","impressions","clicks","conversions","cpc","cpm","ctr","frequency","video_play_actions","video_watched_2s","video_watched_6s","video_watched_p50","video_watched_p100"]
  &start_date=...&end_date=...&page_size=1000
```

| ID | Check | Trigger / threshold | $ at risk formula |
|---|---|---|---|
| **T-Perf-Spend-Outlier** | Campaign spend >2× median across ACTIVE campaigns | `spend_30d > 2× median` | `spend_30d − 1.5×median` |
| **T-Perf-CPM-Outlier** | Ad-group CPM >2× median, signal ≥ 1000 imp | `cpm > 2× median AND imp ≥ 1000` | `(cpm − median) × imp / 1000` |
| **T-Perf-CPC-Outlier** | Ad-group CPC >2× median, signal ≥ 50 clicks | `cpc > 2× median AND clicks ≥ 50` | `(cpc − median) × clicks` |
| **T-Perf-CTR-Outlier** | Ad CTR in bottom decile with spend | `ctr < 0.25× median AND spend ≥ $200` | `spend × (1 − ctr/median)` |
| **T-Perf-Video-Completion-Outlier** | Video completion rate <25% (TikTok benchmark) AND `spend ≥ $500` | `video_watched_p100 / video_play_actions < 0.25` | `spend × (1 − completion_rate / 0.25)` (under-engagement leaking impressions) |
| **T-Perf-Conv-Volume-Outlier** | CONVERSIONS-objective ad group with 0 conversions in 30d | `objective_type='CONVERSIONS' AND conversions_30d == 0 AND spend_30d > $500` | `full spend_30d` |
| **T-Perf-Country-Concentration** | One country >70% of spend (delivery skew) | per-country spend % from `dimensions=["country_code"]` | `spend_in_unintended_countries` |
| **T-Perf-Country-Mismatch** | Delivery to country not in ad-group `location_ids` | `set(actual_countries) − set(targeted_locations) ≠ ∅ AND share > 5%` | `spend × share_outside_targeted_countries` |

## 3. Tier 3 — Mandatory edge-case exploration

### 3.1 Account state

Same 5 states as Google playbook (Active / Dormant / All-inactive / Mixed / New).

### 3.2 Per-vertical edge cases

TikTok skews B2C. Vertical determines whether 1d-click attribution makes sense.

| Vertical | Edge cases |
|---|---|
| **DTC eCommerce** | (a) Product-level performance via dynamic catalog (b) LOOKALIKE_VALUE from purchase events not page-views (c) ROAS-target bidding (d) Spark Ads from creator content (e) seasonal cadence — refresh weekly minimum |
| **Mobile App** | (a) MMP integration (AppsFlyer / Adjust) (b) iOS 14.5+ SKAdNetwork setup (c) bid_type=Cost Per Action for installs (d) post-install events (purchase, level_complete) tracked |
| **B2B SaaS** | TikTok rare for B2B, but: (a) attribution window 7d-click minimum (long sales cycle vs TikTok 1d default) (b) lead-gen objective + form completion benchmark (c) creator-content authenticity test |
| **Brand Awareness / FMCG** | (a) frequency cap mandatory (b) reach measurement (c) brand lift study integration |
| **Education / EdTech** | (a) sign-up funnel (b) creator partnerships (c) seasonal back-to-school cadence |

### 3.3 Per-campaign-objective edge cases

| Objective | Edge cases |
|---|---|
| **CONVERSIONS** | T9 bid mismatch; T11 ACO; T7 LOOKALIKE_VALUE; CAPI for cookie-blocked; offline conversion import |
| **APP_INSTALL** | MMP integration health; SKAdNetwork; in-app event optimization |
| **TRAFFIC** | LP load speed (TikTok in-app browser); landing page redirect chain depth |
| **REACH** | T12 frequency cap; brand-safety placement (avoid sensitive content) |
| **VIDEO_VIEWS** | Hook within first 3 seconds; completion rate; sound-off compatibility |
| **PRODUCT_SALES** | Dynamic catalog connection; product feed quality; collection ad format |
| **LEAD_GENERATION** | Form abandonment vs benchmark; pre-fill from TikTok profile data |

### 3.4 Per-spend-tier

| Tier | Monthly spend | Edge cases |
|---|---|---|
| **Micro** | <$2k | Below volume floor for Smart Performance Campaign; manual targeting |
| **Small** | $2k-$10k | Most rules apply; ACO testing |
| **Mid** | $10k-$50k | T13 SPC mandatory; LOOKALIKE_VALUE seeding |
| **Enterprise** | $50k-$500k | Multi-account structure; programmatic creative testing |
| **Mega** | $500k+ | API-driven asset management; brand safety integration |

### 3.5 Per-account-maturity

| Maturity | Audit focus |
|---|---|
| **<30d** | Setup correctness — pixel, CAPI, conversion events, ad-format compliance |
| **30-90d** | Learning convergence (T14); CBO performance |
| **90+ days** | Full optimization + creative refresh velocity |

### 3.6 Cross-DS context

| Connected | Edge case |
|---|---|
| AppsFlyer / Adjust | MMP attribution conflict — TikTok in-platform vs MMP last-click |
| Shopify / Magento | Catalog connection + product feed health |
| GA4 | UTM tracking via TikTok `tracking_url` parameter; cross-platform attribution |
| Meta Ads | Audience overlap on lookalikes; creative repurposing legality |
| Snapchat / Reddit | Cross-platform vertical-format strategy |

### 3.7 TikTok-unique signals to probe

- **Spark Ads creator content** — pull `ad_format='SPARK_AD'` ratio. Below 30% in DTC = leaving native-feel CTR on the table
- **ACO (Automated Creative Optimization)** — `creative_material_mode`. Off + multi-asset campaign = manual A/B at slower speed
- **LOOKALIKE_VALUE adoption** — pull `audience.audience_subtype='LOOKALIKE_VALUE'`. Absent + custom audiences uploaded = missing value-based optimization
- **Creative refresh cadence** — `ad.create_time` distribution. >50% ads >14d old = refresh stalled
- **Sound-off compatibility** — pull video metadata, check for text overlay / caption track
- **Industry-attribution alignment** (T15) — for B2B/long-cycle industries, default 1d-click drops 30-60% of conversions; recommend 7-day click

### 3.8 OODA loop

```
INPUTS: account_meta + Tier1_results + Tier2_library
BUDGET: 5 hypotheses · 25 API calls · 60s

1. Classify §3.1-3.5; vertical detection critical for TikTok
2. Pick top 3-5 dimensions; creative-format always in scope (Tier 1)
3. Form hypotheses, probe with /report/integrated/get/ + creative metadata
4. Stop at budget OR saturation
5. Rank by $ recoverable monthly OR creative-format risk (auto-degraded delivery)
6. Output: top-N + counterfactual + UC routing

"No findings" valid for clean dimensions.
```

---

## 4. Output format

```
═══ TIKTOK ADS AUDIT — <account> ═══

LIGHTHOUSE (Tier 1, 5/8 passed):
  ❌ L-T4: 12 ads at 16:9 horizontal on feed placement → auto-letterboxed, 30-40% CTR drop
  ❌ L-T5: 8 video ads without captions → sound-off audience lost
  ❌ L-T9: 4 CONVERSIONS-objective ad groups using BID_TYPE_CUSTOM → bid-objective mismatch
  ✅ Pixel firing, billing, no all-paused, no rejection

CONTEXT-DEPENDENT (Tier 2, 6 patterns activated):
  ⚠️ T6: $14k/mo spend, 0 Spark Ads → ~$3-4k/mo CTR uplift left on table
  ⚠️ T11: ACO off across all campaigns → manual A/B 4× slower than ACO

AGENT EXPLORATION (Tier 3, 4 hypotheses tested):
  🔴 [Sound-off completion gap] — $2,800/mo
     Vertical: DTC eCom. Vid completion 18% (benchmark 35%). 8 ads no captions.
     Counterfactual: add captions → +60-80% completion → est +$2.8k/mo recovered impressions.

  🟡 [LOOKALIKE_VALUE absent despite uploaded purchase audience] — $1,500/mo
     Custom audience seeded with 10K purchasers. No LOOKALIKE_VALUE built. Recommend
     value-based lookalike from same seed.

ESTIMATED RECOVERABLE: $5,300/mo + format-fix delivery uplift (uncalibrated)
TOP 3 ACTIONS:
  1. Re-export creatives at 9:16 + add captions (UC-CL-1 TikTok variant)
  2. Switch CONVERSIONS bid_type to BID_TYPE_NO_BID (Lowest Cost) or MAX_CONVERSION
  3. Build LOOKALIKE_VALUE from purchase audience
```

---

## 5. Implementation contract

Same 7 rules as [[Google Ads — Audit Playbook]] § 6.

---

## 6. Source files

- Engine + 15 rules: `algorithms/revenue_div/projects/marketing experiments/google_ads_audit/checks_tiktok.py`
- TikTok API docs: https://business-api.tiktok.com/portal/docs
- Tier 3 OODA structure: causal-ooda agent pattern


---

---
title: "Reddit Ads — Audit Playbook (3-Tier)"
summary: "How to audit a Reddit Ads account properly. Tier 1 lighthouse (5 must-run, including pixel, bid mismatch, conversion mapping), Tier 2 library (10 rules in checks_reddit.py), Tier 3 mandatory edge-case exploration (subreddit targeting precision, native-feel creative authenticity, Conversation Ads adoption, comment-moderation discipline, downvote risk management, vertical fit for Reddit's community-first auction)."
parent: "[[Reddit Ads]]"
related_to:
  - "[[Reddit Ads]]"
  - "[[Google Ads — Audit Playbook]]"
  - "[[01 Plan and Architecture]]"
agcm_keywords:
  - reddit audit playbook
  - reddit tier 1 lighthouse
  - reddit edge cases
  - subreddit targeting audit
  - conversation ads audit
intent_phrases:
  - "audit Reddit Ads account properly"
  - "deep audit Reddit"
  - "what to check in Reddit"
tags:
  - marketing-os
  - data-source
  - reddit-ads
  - audit
  - playbook
  - hybrid-3tier
---
