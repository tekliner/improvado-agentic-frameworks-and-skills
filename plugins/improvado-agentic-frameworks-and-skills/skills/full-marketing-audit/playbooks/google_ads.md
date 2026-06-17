# Google Ads — Audit Playbook

**Three tiers — Lighthouse, Library, Agent — combine deterministic safety, context-aware breadth, and hypothesis-driven depth. Tier 3 is mandatory; an audit that ran only Tier 1+2 is incomplete.**

---

## 1. Tier 1 — Lighthouse (must-run, deterministic, ~15 checks)

**Always run. Same red lights for every account regardless of vertical/spend/maturity. False-positive rate near zero.**

| ID   | Check                                   | GAQL / API                                                                          | Trigger                                                          | Action                                             |
| ---- | --------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| L-C1 | No conversion actions configured        | `SELECT COUNT(*) FROM conversion_action WHERE status='ENABLED'`                     | result = 0                                                       | CRITICAL — Smart Bidding broken; route to UC-CC-1  |
| L-C2 | Conversion tag not firing 7d            | `SELECT conversions FROM conversion_action WHERE date DURING LAST_7_DAYS`           | conversions = 0 AND cost > 0                                     | CRITICAL — fix tag                                 |
| L-B1 | Account billing failed                  | `SELECT customer.status FROM customer`                                              | status = 'SUSPENDED' OR billing_setup.payments_status = 'PAUSED' | CRITICAL — restore billing                         |
| L-B2 | All campaigns paused                    | `SELECT campaign.status FROM campaign`                                              | 0 ENABLED                                                        | CRITICAL or expected (route to UC-RP-1 if dormant) |
| L-S1 | Smart Bidding without conversion data   | `bid_strategy IN (tCPA, tROAS, MaxConv) AND conversions_30d = 0`                    | true                                                             | CRITICAL — switch to Manual CPC or Maximize Clicks |
| L-Q1 | Keywords with QS 1-3                    | `metrics.quality_score <= 3`                                                        | any with cost > $50                                              | HIGH — pay 200-400% CPC premium                    |
| L-A1 | Disapproved active ads                  | `ad_group_ad.policy_summary.approval_status = 'DISAPPROVED' AND status = 'ENABLED'` | any                                                              | CRITICAL — fix or pause                            |
| L-K3 | Search term waste (broad-match leaks)   | `search_term_view WHERE conv = 0 AND cost > 5×avg_cpc`                              | top-10 by cost                                                   | HIGH — route to UC-NK-1                            |
| L-H1 | Auto-tagging disabled                   | `customer.auto_tagging_enabled = false`                                             | true                                                             | HIGH — GA4 attribution broken                      |
| L-R1 | Empty enabled campaigns (no ad groups)  | `campaign WHERE status='ENABLED' AND ad_group_count = 0`                            | any                                                              | CRITICAL — clean up                                |
| L-R2 | Ad groups without ads                   | `ad_group WHERE status='ENABLED' AND ad_count = 0`                                  | any                                                              | CRITICAL — no delivery                             |
| L-R3 | Ad groups without keywords (Search)     | `ad_group WHERE channel=SEARCH AND status='ENABLED' AND keyword_count = 0`          | any                                                              | CRITICAL                                           |
| L-I1 | Brand campaign with low IS              | `metrics.search_impression_share < 0.80 WHERE campaign LIKE '%brand%'`              | true                                                             | CRITICAL — losing branded traffic                  |
| L-G1 | Optimization Score < 50                 | `customer.optimization_score < 0.50`                                                | true                                                             | HIGH — review recommendations                      |
| L-D1 | Recent material change with metric drop | `change_event` last 7 days + insights delta                                         | any change correlated with -20% perf                             | HIGH — investigate                                 |

**Output:** `LIGHTHOUSE (X/15 passed)` block with specific failures.

---

## 2. Tier 2 — Library (context-dependent, ~120 rules)

**Reference catalog. Agent reads, picks relevant.**

Sources:
- **`algorithms/revenue_div/projects/marketing experiments/google_ads_audit/checks.py`** — 75 rule implementations across 11 series (C/B/S/Q/A/K/E/H/R/I/G/T/L/P/D)
- **[[Cerebro] Google Ads Audit Rules](https://www.notion.so/d343ff84eb3742dc98b2b8947d59f455)** — 9-rule Best Practices + linked Google Sheet (validated by internal QA)
- **[Filter out audit rules from other library charts](https://www.notion.so/1239aec6212580d98d41d6c123c5beb9)** — canonical 20-rule Cerebro guideline list
- **[Google Ads Data Audit Enablement](https://www.notion.so/10a9aec621258015b15affc48aa49ced)** — 3 audit DSL functions (#30/32/33: Naming Convention / UTM / Best Practices)

**Agent rule:** do NOT run all 120. Semantic-search Tier 2 against the account context derived in §3 below — pick the 5-15 patterns that actually apply.

Each Tier 2 rule has structure: `(trigger_condition, hypothesis, diagnostic_query, decision_rule, $ impact estimator, action)`. Use `trigger_condition` to filter which rules apply to THIS account.

---

## 2.1 Performance comparatives — current spend / metric outliers (LIVE GAQL, 8 rules)

Per SKILL § 0.1: score per-entity vs account median, every finding has `$ at risk`.

**Live call (Google Ads API v23 via `googleAds:searchStream`):**
```sql
SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
       segments.country_criterion_id, segments.geo_target_country,
       metrics.cost_micros, metrics.impressions, metrics.clicks,
       metrics.conversions, metrics.average_cpm, metrics.average_cpc,
       metrics.ctr, metrics.search_impression_share,
       metrics.search_budget_lost_impression_share
FROM ad_group
WHERE segments.date DURING LAST_30_DAYS
  AND campaign.status = 'ENABLED'
```

| ID | Check | Trigger / threshold | $ at risk formula |
|---|---|---|---|
| **G-Perf-Spend-Outlier** | Campaign spend >2× median across ENABLED | `cost_30d > 2× median` | `cost_30d − 1.5×median` |
| **G-Perf-CPC-Outlier** | Ad-group CPC >2× median, ≥50 clicks | `avg_cpc > 2× median AND clicks ≥ 50` | `(cpc − median) × clicks` |
| **G-Perf-CTR-Outlier** | Ad-group CTR bottom decile with spend (Google Search baseline ~3-6%) | `ctr < 0.25× median AND spend ≥ $200` | `spend × (1 − ctr/median)` |
| **G-Perf-Conv-Volume-Outlier** | Campaign optimizing for conversions with 0 conv in 30d | `bidding_strategy_type IN ('TARGET_CPA','MAXIMIZE_CONVERSIONS') AND conv_30d == 0 AND cost_30d > $500` | `full cost_30d` |
| **G-Perf-Impression-Share-Lost-Budget** | Campaign losing impression share to budget >25% | `search_budget_lost_impression_share > 0.25` | `cost_30d × impression_share_lost_to_budget` (literal lost auctions) |
| **G-Perf-Quality-Score-Drag** | Keyword QS <5 holding back ad rank with significant spend | `quality_score < 5 AND keyword_cost_30d > $200` | `cost × (1 − qs/10)` (paying premium for low-relevance traffic) |
| **G-Perf-Country-Concentration** | One country >70% of spend (geo-bleed or mis-target) | per-country breakdown via `segments.geo_target_country` | `spend_in_unintended_countries` |
| **G-Perf-Country-Mismatch** | Delivery to country not in campaign's `geo_target_constants` | `set(actual_geo) − set(targeted_geo) ≠ ∅ AND share > 5%` | `cost × share_outside_targeted` |

---

## 3. Tier 3 — Mandatory edge-case exploration (agent OODA loop)

**This tier is non-negotiable. Tier 1+2 alone produce a generic audit. Tier 3 makes it specific.**

The agent receives: Tier 1 results + Tier 2 library (semantic-search-able) + the dimensions below + a budget. It must explore each dimension, form 5 hypotheses, run targeted diagnostic queries, and stop on findings stabilization or budget exhaustion.

**Budget defaults:** 5 hypotheses · 30 API calls · 60 seconds wall clock. Adjustable per request.

### 3.1 Account state classification (RUN FIRST)

Before any other Tier 3 work, classify:

| State | Detection (GAQL) | Audit shape |
|---|---|---|
| **Active** | ≥1 ENABLED campaign with spend > 0 last 7d | Full audit applies |
| **Dormant** | All recent campaigns PAUSED, last spend > 30 days ago, lifetime > $1k | Skip live-perf checks; route to [[UC-RP-1 Reactivation Prioritization]] |
| **All-inactive** | Zero ENABLED campaigns ever, OR all DELETED | Generate "channel turned off" report; Tier 3 not applicable |
| **Mixed** | Some ENABLED + spending, some PAUSED with prior spend | Run full audit on Active subset + reactivation hypothesis on Paused subset |
| **New** | First campaign created < 30 days ago | Audit setup correctness only, NOT performance |

### 3.2 Per-vertical edge cases (pick the matching column)

Vertical detection: `customer.descriptive_name` + first-party signals (LP URL → industry classifier) + ad copy keywords.

| Vertical                 | MUST-explore additional checks beyond Tier 1+2                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B2B SaaS**             | (a) attribution window — likely too short, sales cycle 30-90 days; check `conversion_action.click_through_lookback_window_days >= 30` (b) offline import — without CRM close-loop, Smart Bidding optimizes form fills not revenue (c) brand vs non-brand split — if non-brand = 0 conversions, check whether ICP queries even searched (d) lookalike from CRM closed-won — likely missing |
| **DTC eCommerce**        | (a) Shopping feed health — `merchant_center_link` + disapproved products (b) PMax cannibalization of Search brand (c) Custom labels for product hierarchy in PMax (d) Value-based bidding — `target_roas` not `target_cpa` (e) Dynamic remarketing audiences — pixel coverage (f) Seasonality dayparting — Black Friday / holiday dayparting rules                                        |
| **Healthcare / Pharma**  | (a) HIPAA-safe URLs — no PII in landing page parameters; check `tracking_url_template` doesn't pass user data (b) Restricted ad categories — verify `customer.policy_summary` no violations (c) Geo restrictions — some pharma terms restricted by state                                                                                                                                  |
| **Financial Services**   | (a) FINRA/SEC compliance — disclosures in ad copy (b) Restricted ad categories same as above (c) Geo restrictions — state-by-state lender licensing                                                                                                                                                                                                                                       |
| **Travel / Hospitality** | (a) Seasonality bias — audit must use seasonal-adjusted baseline, not flat 30d (b) Dayparting — booking patterns vary by destination time zone (c) Attribution model — multi-day consideration; data-driven attribution required                                                                                                                                                          |
| **Local services**       | (a) Geo radius — check `location_target` granularity matches service area (b) Call extensions + tracking — most conversions are calls, not form fills (c) Local Service Ads vs traditional Search interaction                                                                                                                                                                             |

### 3.3 Per-campaign-type edge cases

Detect via `campaign.advertising_channel_type` distribution.

| Channel type | Edge-case checks |
|---|---|
| **SEARCH** | Negative keyword conflicts blocking positives · Match-type discipline (broad without Smart Bidding = waste) · Brand bidding policy (defending or absent?) · Ad strength on RSAs |
| **PERFORMANCE_MAX** | Asset group has all 5 required asset types (≥3 headlines, long headline, description, image, video, logo) · Brand exclusion list configured · Search-term insights pulled (separate report) — what queries PMax is actually serving on · URL expansion enabled? Custom labels for product hierarchy |
| **SHOPPING** | Merchant Center link active + zero disapprovals · Custom labels for tier/margin/seasonality · Negative product groups · Feed freshness (`feed_attribute.lastUploadDate` < 24h) · Bidding strategy (target_roas) appropriate for product LTV |
| **DISPLAY** | Placement exclusions (no mobile apps, no sensitive content unless intended) · Frequency cap configured · Audience signal quality · Banner blindness — creative refresh needed |
| **VIDEO** | Skip rate · View-through conversion · Audience signals · CPM ceiling for view-through-only |
| **DEMAND_GEN** | Audience signal quality · Creative diversity · LP optimization for in-feed traffic |
| **HOTEL / TRAVEL** | Hotel feed integration · Date range targeting · Geo-targeting accuracy |
| **APP** | Tracking link integration (AppsFlyer/Adjust) · iOS 14.5+ SKAdNetwork setup · Bid strategy = Target CPA (Maximize Conversions doesn't work for app installs) |
| **LOCAL** | LSA integration · Service area targeting |

### 3.4 Per-spend-tier

| Tier | Monthly spend | Key edge cases |
|---|---|---|
| **Micro** | < $1k | Smart Bidding can't learn (need 30+ conversions/mo). Recommend Manual CPC. Skip "low IS" alerts (expected). |
| **Small** | $1k–$10k | Most Tier 2 rules apply. Optimization Score useful. |
| **Mid** | $10k–$100k | Portfolio bid strategies viable. Cross-campaign cannibalization check. |
| **Enterprise** | $100k–$1M | Aggressive automation works. Audit MCC structure. Multi-account budget allocation. |
| **Mega** | $1M+ | Custom bidding scripts. API rate limits matter. Server-side conversions mandatory. |

### 3.5 Per-account-maturity

| Maturity | Audit shape |
|---|---|
| **<30 days old** | Audit SETUP, NOT performance. Tracking setup, conversion actions, campaign structure. Don't flag low conversions. |
| **30–90 days** | Learning phase issues. Smart Bidding may still be calibrating. Don't flag CPA spikes — too early. |
| **90+ days** | Full optimization audit. All Tier 2 rules in scope. |
| **2+ years** | Add: legacy artifacts cleanup. Old conversion actions still firing? Deprecated campaign types still serving? |

### 3.6 Cross-DS context

Check connection inventory in this workspace. For each connected DS:

| Cross-DS context | Edge case |
|---|---|
| GA4 connected | Cross-platform attribution drift; check GA4 conversion count vs Google Ads conversion count discrepancy |
| HubSpot / SFDC connected | Offline conversion import gap — Smart Bidding optimizes form fills, not closed-won revenue |
| Shopify / Magento | Merchant Center feed source; product attribute completeness |
| Meta Ads also active | Cross-channel attribution conflict; both claim same purchase via last-click |
| TTD / DV360 also active | Audience targeting overlap — same user retargeted across DSPs |

### 3.7 Recent-changes signal

```sql
SELECT change_event.change_date_time, change_event.client_type, change_event.user_email,
       change_event.change_resource_type, change_event.changed_fields, change_event.resource_change_operation
FROM change_event
WHERE change_event.change_date_time DURING LAST_30_DAYS
ORDER BY change_event.change_date_time DESC
LIMIT 100
```

For each significant change, check correlation with metric movement. Auto-applied recommendations? Bid strategy switch? Budget reduction? Geographic expansion? Match a metric drop to its cause.

### 3.8 The agent's working loop (Tier 3 OODA)

```
INPUTS: account_meta + Tier1_results + Tier2_library
BUDGET: 5 hypotheses · 30 API calls · 60s

1. CLASSIFY — run §3.1, §3.2 (vertical), §3.4 (spend), §3.5 (maturity), §3.6 (cross-DS)
2. PRIORITIZE — pick the 3-5 dimensions where edge cases are highest-impact for THIS account
3. For each dimension, FORM HYPOTHESIS — "I think X is wrong here because Y"
4. PROBE — design targeted GAQL or API query specific to this hypothesis
5. EVALUATE — accept / refine / reject hypothesis based on evidence
6. ITERATE — if budget left and hypothesis refined, requery; otherwise next hypothesis
7. STOP — when budget out OR last 2 hypotheses returned no findings (saturation)
8. RANK FINDINGS — by estimated $ monthly impact (recoverable spend × likelihood)
9. EMIT — top-N findings with evidence, counterfactual, action

CRITICAL RULE: "no findings" is a valid Tier 3 outcome. If account is healthy in this
dimension, say so explicitly. Do NOT manufacture findings to fill quota.
```

---

## 4. Output format

```
═══ GOOGLE ADS AUDIT — <account_name> ═══

LIGHTHOUSE (Tier 1, 13/15 passed):
  ✅ Conversion actions configured
  ✅ Tag firing
  ❌ L-Q1: 47 keywords at QS 1-3 driving $2,140/mo of waste
  ❌ L-K3: 12 search terms at $50+ spend, 0 conversions = $890/mo waste

CONTEXT-DEPENDENT (Tier 2, library applied where relevant — 8 patterns activated):
  ⚠️ K7: No shared negative lists (matched: account >$10k/mo, spreads negatives across campaigns)
  ⚠️ S5: Portfolio strategy with 4× CPA variance (matched: portfolio_bid_strategy active)

AGENT EXPLORATION (Tier 3, 5 hypotheses tested in 8s, 17 API calls):
  🔴 [PMax cannibalizing brand search] — $4,200/mo recoverable
     Vertical: DTC eCom. Hypothesis: PMax campaign 'pmax_us_q2' competing with Search brand
     campaign for branded queries. Probe: ran search-term insights for PMax, found 73% of
     brand-term spend is in PMax not Search. Counterfactual: add brand list to PMax exclusion
     → +$4.2k/mo to Search brand at 8x ROAS = ~$33k incremental revenue/mo.
     Action: route to UC-PM-1 with brand_exclusion mutation chain.

  🟡 [Attribution window too short] — $1,800/mo unattributed
     Vertical: B2B SaaS. Hypothesis: 7-day click window misses lift from longer sales cycle.
     Probe: GA4 lookback shows 31% of signups happen day 8-30. Counterfactual: switch to
     30-day click window → +$1.8k/mo properly attributed; Smart Bidding learns from real
     conversion volume.
     Action: route to UC-AT-1 to test 30d window via experiment.

  ✅ NO FINDINGS in: dayparting, geo, demo, device — account healthy in these dimensions.

EXPLORED BUT NOT INVESTIGATED (out of budget):
  – Quality Score sub-component analysis (CTR vs LP vs Relevance breakdown)
  – Auction Insights competitor pressure
  Run dedicated UC-IS-1 / UC-QS-1 if you want these depths.

ESTIMATED RECOVERABLE: $9,030/mo (~$108k/year)
TOP 3 ACTIONS to ship this week:
  1. PMax brand exclusion (UC-PM-1) — biggest win, 1-day implementation
  2. Pause QS 1-3 keywords (UC-QS-1 manual gate) — fastest signal, 30-min implementation
  3. Search-term negative push (UC-NK-1) — recurring savings, schedule weekly
```

---

## 5. Why this beats hardcoded-rules-only

| Dimension | Pure 200-rule scanner | Hybrid 3-tier |
|---|---|---|
| Catches operational red lights | ✅ (rules built for this) | ✅ (Tier 1) |
| Catches client-specific issues | ❌ (no context) | ✅ (Tier 3 §3.1–3.8) |
| Output noise | high (100+ findings, most low-impact) | low (3-7 findings, ranked by $) |
| Adapts to vertical | ❌ | ✅ |
| Adapts to maturity / spend tier | ❌ | ✅ |
| Repeatable for scheduling | ✅ | ✅ Tier 1 (Tier 3 stochastic with seed) |
| Surfaces novel issues | ❌ | ✅ |
| Maintenance cost | high (each new rule = code + QA) | low (Tier 2 library is YAML; Tier 3 self-improves with new data) |
| QA-able | ✅ unit tests per rule | ✅ Tier 1 unit, Tier 3 trace-replay |

---

## 6. Implementation contract for Tier 3 agent

When this playbook is loaded as part of an audit run:

1. The agent **must** run all 15 Tier 1 checks first (deterministic, parallel)
2. The agent **must** classify account state, vertical, spend tier, maturity (§3.1–3.5)
3. The agent **must** form ≥3 hypotheses based on classification + Tier 2 semantic search
4. The agent **may** ask user for clarification ONCE if vertical or business model is ambiguous
5. The agent **must** stop at budget exhaustion, not at first finding
6. The agent **must** emit "no findings" disclaimers explicitly for dimensions explored but clean
7. The agent **must** estimate $ monthly impact for every finding (with confidence interval if possible)
8. The agent **must** route each finding to a Marketing OS UC for the actual fix

---

## 7. Source files

- Tier 1 lighthouse selected from `algorithms/revenue_div/projects/marketing experiments/google_ads_audit/checks.py` (rules C1, C2, B1, S1, Q1, A1, K3, H1, R1, R2, I1, G1, D1) — empirically the most universal red lights across AdPulse audit history
- Tier 2 library: existing 75 rules in `checks.py` + 9 Cerebro Best Practices ([[Google Ads Data Audit Enablement | Tech Docs]]) + 20 canonical Cerebro guideline rules ([Filter out audit rules from other library charts](https://www.notion.so/1239aec6212580d98d41d6c123c5beb9))
- Tier 3 OODA loop structure adapted from causal-ooda agent pattern (Improvado internal)
- Replicate this template for Meta, LinkedIn, TikTok, Reddit, TTD as parallel `<DS> — Audit Playbook.md` files


---

---
title: "Meta Ads — Audit Playbook (3-Tier)"
summary: "How to audit a Meta (Facebook/Instagram) ad account properly. Tier 1 lighthouse (must-run pixel/CAPI/objective/budget red lights), Tier 2 library (24 universal predicate checks across targeting / placement / bidding / attribution / pixel), Tier 3 mandatory edge-case exploration (creative fatigue, audience overlap, ASC/AAC sunset, cross-platform attribution, vertical fit). Every rule is tenant-agnostic — predicate shape is universal, predicate values come from a per-tenant policy config loaded at runtime. All checks runnable today via discoveryRequestTool against Graph API v23.0 — empirically verified against a live ad set via Graph API v23.0."
parent: "[[Meta Ads]]"
related_to:
  - "[[Meta Ads]]"
  - "[[Reddit Ads — Audit Playbook]]"
  - "[[LinkedIn Ads — Audit Playbook]]"
  - "[[TikTok Ads — Audit Playbook]]"
  - "[[Google Ads — Audit Playbook]]"
  - "[[01 Plan and Architecture]]"
  - "[[Discovery API Write-Action Protocol]]"
agcm_keywords:
  - meta audit playbook
  - facebook audit
  - meta tier 1 lighthouse
  - meta governance rules
  - tenant policy audit
  - meta targeting audit
  - meta pixel audit
intent_phrases:
  - "audit Meta Ads account properly"
  - "deep audit Facebook"
  - "what to check in Meta"
  - "Meta governance audit"
  - "Meta compliance check"
tags:
  - marketing-os
  - data-source
  - meta-ads
  - audit
  - playbook
  - hybrid-3tier
---
