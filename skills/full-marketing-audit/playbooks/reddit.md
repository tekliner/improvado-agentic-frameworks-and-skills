# Reddit Ads — Audit Playbook

**Three tiers — Lighthouse, Library, Agent. Tenant-agnostic — predicate shapes are universal, predicate values come from `tenant_policy.yaml` loaded at runtime. Reddit-specific: subreddit targeting precision and native-feel creative are the two highest-leverage axes; downvote / comment moderation is unique platform risk; vertical fit (B2C tech-savvy / DIY / niche-community) is decisive.**

> **Live-API audit.** Reddit Marketing API v3 supports the full bi-directional surface through `discoveryRequestTool` for any account where the connection has the `adsread` scope. No warehouse extract required. See [[Reddit Ads]] § 2 for the verified endpoint catalog.

---

## 0. Pre-flight + per-tenant policy

**Step A — Connection check** (per [[Discovery API Write-Action Protocol]] § 1):

```python
ctx = mcp.createImpersonationContext(cluster=..., rtbm_agency_id=..., workspace_id=...)
conn = pick_active_connection(mcp.getConnectionsTool(impersonation_context_id=ctx, datasourceName='reddit'))
# Datasource alias gotcha: canonical is 'reddit' on both lisbon AND montana clusters.
# `getConnectionsTool(datasourceName='reddit_ads')` returns 400 "DataSource with this name does not exist" on montana
# (and may differ across clusters). On 400 alias-mismatch error, retry with 'reddit' before declaring no connection.
# Empirically observed: on some clusters `reddit_ads` returns 400, `reddit` 200 with empty results[].
# If no active connection — surface https://report.improvado.io/create_data_source_connection/reddit/?workspace=<id> and stop.
account_id = pick_account(mcp.discoveryListAccountsTool(impersonation_context_id=ctx, connectionId=conn.id))  # t2_<hash>
```

**Step B — Load tenant policy** (per-client config; predicate values, never hardcoded):

```yaml
# tenant_policy.yaml — Reddit section
reddit:
  required_pixel_count_min: 1
  required_capi_event_share_min: 0.20      # >=20% of conversion events should come from server-side
  subreddit_targeting:
    minimum_count: 5
    minimum_combined_audience: 50_000
  bidding:
    conversion_objectives_must_use: ["BIDDING_STRATEGY_AUTOMATIC"]   # oCPM, not manual
    forbidden_combos:
      - {objective: "CONVERSIONS", bid_strategy: "BIDDING_STRATEGY_MANUAL_BIDDING"}
  frequency_capping:
    awareness_objectives_require_cap: true
    max_frequency_default: 5
  custom_audiences:
    required_types_present_at_least_one: ["CUSTOMER_LIST", "PIXEL"]
  spend_tier_thresholds:
    conversation_ads_required_above_monthly: 5000
  conversion_event_alignment:
    if_account_has_events: ["PURCHASE", "LEAD", "ADD_TO_CART"]
    forbidden_objectives_when_present: ["TRAFFIC"]
  naming_convention:
    exclude_patterns: ["DNU", "TEST", "PLACEHOLDER", "TBD"]
```

---

## 1. Tier 1 — Lighthouse (must-run, ~7 checks)

Run sequentially first. Fail-open (continue Tier 2 even on red) but surface a banner artifact.

| ID | Check | Discovery API call | Pass condition | Severity |
|---|---|---|---|---|
| **L-R1** | Conversion pixel installed and firing | `GET /api/v3/ad_accounts/{id}/pixels` | `len(data) >= policy.reddit.required_pixel_count_min` AND at least one pixel where `created_by != 'SYSTEM'` AND has recent fire activity. **NOTE:** every Reddit ad account auto-receives a `created_by:SYSTEM` pixel named identically to `account_id` — this is a stub, not a real install. Counting it as a real pixel produces false-PASS. Empirically observed across multiple dormant accounts that the SYSTEM stub was the only pixel present despite the account having historical activity. `/pixels/{id}/events` returns 404 under `adsread` scope — pixel-event-type breakdown is unverifiable from this scope (treat as BLOCKED, not FAIL). | CRITICAL |
| **L-R2** | CAPI server-side events configured | `GET /api/v3/ad_accounts/{id}/pixels` (look at event_source breakdown via reports) | `server_side_event_share >= policy.reddit.required_capi_event_share_min` | CRITICAL when conversions are the goal |
| **L-R4** | Bid strategy aligned with objective | `GET /api/v3/ad_accounts/{id}/ad_groups?effective_status=ACTIVE` → check `(campaign.objective, bid_strategy)` pair | NO active ad group violates `policy.reddit.bidding.forbidden_combos` | CRITICAL |
| **L-R10** | Campaign objective ↔ conversion events | `GET /api/v3/ad_accounts/{id}/campaigns?effective_status=ACTIVE` + `GET /api/v3/ad_accounts/{id}/pixels` | If account has events in `policy.reddit.conversion_event_alignment.if_account_has_events`, no active campaign uses an objective in `forbidden_objectives_when_present` | CRITICAL |
| **L-R-AllPaused** | At least one ACTIVE campaign exists | `GET /api/v3/ad_accounts/{id}/campaigns?effective_status=ACTIVE` | `len(data) >= 1` | CRITICAL or expected |
| **L-R-Disapp** | No ads rejected or stuck in policy review > 48h | `GET /api/v3/ad_accounts/{id}/ads` filter `effective_status IN ('REJECTED','UNDER_REVIEW')` | All `UNDER_REVIEW` < 48h | CRITICAL |
| **L-R-Funding** | Funding instrument is servable | **Two-step:** (1) `GET /api/v3/ad_accounts/{id}/funding_instruments` (account-scope). If returns `[]` despite delivery happening, fall back to (2) `GET /api/v3/businesses/{biz_id}/funding_instruments` (business-scope; biz_id from account.business_id). Empirically observed: account-scope frequently returns `[]` even when the account has historical / current activity — funding usually lives at business level. | At least one `is_servable: true`, no blocking `reasons_not_servable` (e.g. `CREDIT_CARD_NOT_APPROVED`, `CREDIT_LINE_EXHAUSTED`) | CRITICAL — campaigns can't deliver |
| **L-R-FundingRace** | Servable-but-invisible-funding race condition | join `GET /reports?breakdowns=campaign` (last-30d spend) × `GET /funding_instruments.is_servable` | If `spend_30d > 0` AND (`/funding_instruments == []` OR `is_servable=false` on every instrument) → **race condition / reconcile-pending flag**. Empirically observed: an account delivering $X in current month while every funding instrument was flagged unservable (CREDIT_LINE_EXHAUSTED + CREDIT_CARD_NOT_APPROVED) — Reddit grace period or stale cache; will halt at next reconcile. | HIGH |

---

## 2. Tier 2 — Library (universal predicate checks)

Each rule conditionally fires if `policy.reddit.<key>` is set. Skip silently if no policy applies.

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **R-T-Subreddit-Width** | Subreddit targeting not too narrow | `GET /api/v3/ad_groups/{ag_id}` → `included_subreddits[]` + `GET /api/v3/targeting/communities` for subscriber sums | `len(included_subreddits) >= policy.reddit.subreddit_targeting.minimum_count` AND `sum(subscriber_count) >= policy.reddit.subreddit_targeting.minimum_combined_audience` |
| **R-T-CustomAudiences** | At least one CUSTOMER_LIST or PIXEL custom audience present | `GET /api/v3/ad_accounts/{id}/custom_audiences` | `len([a for a in data if a.type IN policy.reddit.custom_audiences.required_types_present_at_least_one]) > 0` |
| **R-B-Frequency** | Awareness/reach objective has frequency cap | `GET /api/v3/ad_accounts/{id}/ad_groups` filter on awareness objective → check `frequency_cap` | If `policy.reddit.frequency_capping.awareness_objectives_require_cap`: cap set AND `<= max_frequency_default` |
| **R-A-EventMapping** | Active campaign objective compatible with configured conversion events | join campaigns × pixels (see L-R10 detail) | matches policy whitelist |
| **R-F-ConversationAds** | High-spend account uses Conversation Ads format | `GET /api/v3/ad_accounts/{id}/ads` filter `placement='COMMENTS_PAGE'` + `GET /reports` for spend | If 30d spend > `policy.reddit.spend_tier_thresholds.conversation_ads_required_above_monthly`, count of `COMMENTS_PAGE` ads > 0 |
| **R-C-Creative-Native** | Creative authenticity probe (stock-photo vs native) | `GET /api/v3/ad_accounts/{id}/ads` → media_url → vision model classification | Per-tenant `policy.reddit.creative.allow_stock_photos` (default false) |
| **R-S-Status-Drift** | Configured ACTIVE but `effective_status` paused | `GET /api/v3/ad_accounts/{id}/campaigns` (the `effective_status=ACTIVE` query param is **NOT enforced** on `t2_*` legacy accounts — returns full archive — apply filter client-side) | No drift between `configured_status` and `effective_status`. Empirically observed: campaigns `configured=ACTIVE / effective=PAUSED` cascading from funding holds — funding-level pause cascades to campaign delivery. |
| **R-N-Naming** | Active campaign names don't match exclude patterns | name regex | `policy.reddit.naming_convention.exclude_patterns` not in name |
| **R-D-Downvotes** | Promoted post comment-section health | Reddit base API `/r/{sub}/comments/{post_id}` per active promoted post | Top-level downvoted comments count `<= policy.reddit.community.max_downvoted_top_comments` |
| **R-AT-Window** | Attribution windows match policy | `GET /api/v3/ad_accounts/{id}` → `attribution_type, view_attribution_window, click_attribution_window` | Match `policy.reddit.attribution.required_setting` if present |
| **R-BS-Keywords** | Brand-safety keyword/community exclusion list present | `GET /api/v3/ad_accounts/{id}` → `excluded_keywords`, `excluded_communities` | At least one of the two arrays is non-empty (industry-aware; geopolitically sensitive verticals require). Empirically observed: only EMEA accounts of multi-region tenants typically carry geopolitical exclusion lists; US/global brand accounts often have ZERO blocks despite running in sensitive subreddits. |
| **R-AS-CustomList-Stuck** | Custom audience PROCESSING/USER_ERROR stuck | `GET /api/v3/ad_accounts/{id}/custom_audiences` → filter on `status` | NO `CUSTOMER_LIST` audience with `status IN ('USER_ERROR','PENDING')` older than 30 days. Empirically observed: 10+ stuck CUSTOMER_LIST entries with multi-year staleness on legacy accounts — operational debt that hides from PIXEL/LOOKALIKE rules. |
| **R-Scope-Visibility** | Connector scope mapping per account | per-account probe: `GET /api/v3/ad_accounts/{id}` → 401/403 → record + flag in connector picker | Surface 401/403 per-(connector,account) so UX can hide inaccessible accounts. Empirically observed: connectors expose accounts that return 401/403 when probed for campaign-list scope — Improvado UX should hide these from picker, currently exposes confusing options to ops. |

---

## 2.1 Performance comparatives — current spend / metric outliers (LIVE API, 7 rules)

Per SKILL § 0.1: score per-entity vs account median, every finding has `$ at risk`.

**Live call (Reddit Marketing API v3):**
```
GET /api/v3/ad_accounts/{id}/reports?breakdowns=campaign,country
  &fields=impressions,clicks,spend,cpm,cpc,ctr,conversions,frequency
  &since=YYYY-MM-DD&until=YYYY-MM-DD
```

| ID | Check | Trigger / threshold | $ at risk formula |
|---|---|---|---|
| **R-Perf-Spend-Outlier** | Campaign spend >2× median across ACTIVE | `spend_30d > 2× median` | `spend_30d − 1.5×median` |
| **R-Perf-CPM-Outlier** | Ad-group CPM >2× median, ≥1000 imp signal | `cpm > 2× median AND imp ≥ 1000` | `(cpm − median) × imp / 1000` |
| **R-Perf-CPC-Outlier** | Ad-group CPC >2× median, ≥50 clicks | `cpc > 2× median AND clicks ≥ 50` | `(cpc − median) × clicks` |
| **R-Perf-CTR-Outlier** | Ad CTR bottom decile with spend (Reddit baseline ~0.7%) | `ctr < 0.25× median AND spend ≥ $200` | `spend × (1 − ctr/median)` (often a signal of off-fit subreddit + creative) |
| **R-Perf-Conv-Volume-Outlier** | CONVERSIONS-objective campaign with 0 conv in 30d | `objective='CONVERSIONS' AND conv_30d == 0 AND spend_30d > $500` | `full spend_30d` |
| **R-Perf-Subreddit-Outlier** | Bottom-quartile subreddit by CVR getting >10% of spend | per `included_subreddit` × CVR breakdown | `spend_in_low_CVR_subs × (1 − low_cvr/median_cvr)` (waste from off-fit subreddits — Reddit's biggest leak vector) |
| **R-Perf-Country-Concentration** | Delivery skewed to non-target country | per-country share via `breakdowns=country` | `spend_in_unintended_countries` |

## 3. Tier 3 — Mandatory edge-case exploration

### 3.1 Account state

Same 5 states as Google playbook.

### 3.2 Per-vertical edge cases

Reddit has unique vertical fit. Some industries thrive (gaming, tech, DIY, finance, education). Others struggle (luxury fashion, traditional retail).

| Vertical | Edge cases |
|---|---|
| **Tech / SaaS** | (a) Sub targeting on r/programming, r/sysadmin, r/devops by buyer persona (b) Conversation Ads in tech subs perform 2-3× better than feed (c) Authentic founder-tone creative beats polished marketing copy |
| **Gaming** | (a) Subreddit precision per game/genre (b) Native creative style — meme-aware (c) Influencer / mod cooperation for pinned posts |
| **DIY / Home** | (a) r/homeimprovement, r/woodworking, r/DIY targeting (b) Tutorial-style creative (c) Product-in-use imagery beats studio shots |
| **Finance / Crypto** | (a) Compliance-heavy creative review (b) r/personalfinance, r/investing precision (c) Disclaimer requirements |
| **Education / EdTech** | (a) r/learnprogramming, vertical-specific subs (b) Authentic student testimonials (c) Long-form content beats short |
| **B2B SaaS** | Mostly poor fit; if running, focus narrow tech-decision-maker subs only |
| **Luxury / Fashion** | Poor fit. If running, premium creative, narrow Reddit Premium / r/malefashionadvice etc. |
| **Healthcare / Pharma** | Heavy compliance review; creative restrictions; consider ad disapproval risk |

### 3.3 Per-campaign-objective edge cases

| Objective | Edge cases |
|---|---|
| **CONVERSIONS** | R4 bid alignment; R8 lookalike from PIXEL audience; R2 CAPI for cookie-blocked |
| **APP_INSTALL** | MMP integration; oCPM vs CPI |
| **TRAFFIC** | R10 mismatch with conversion events; LP load speed |
| **AWARENESS / REACH** | R5 frequency cap; R7 Conversation Ads adoption |
| **VIDEO_VIEWS** | Completion rate vs benchmark; sub fit |
| **CATALOG_SALES** | Dynamic product catalog setup |

### 3.4 Per-spend-tier

| Tier | Monthly spend | Edge cases |
|---|---|---|
| **Micro** | <$2k | Below volume floor for oCPM convergence; manual targeting necessary |
| **Small** | $2k-$10k | Most rules apply; Conversation Ads testing reasonable |
| **Mid** | $10k-$50k | R7 Conversation Ads should be ≥20% of spend; R8 lookalike adoption |
| **Enterprise** | $50k+ | Multi-account structure; cross-subreddit testing matrix |

### 3.5 Per-account-maturity

| Maturity | Audit focus |
|---|---|
| **<30d** | Setup correctness — pixel, CAPI, conversion events, brand safety |
| **30-90d** | oCPM convergence; subreddit list refinement |
| **90+ days** | Full optimization; Conversation Ads diversification; comment moderation discipline |

### 3.6 Cross-DS context

| Connected | Edge case |
|---|---|
| Meta / TikTok | Cross-platform creative repurposing — Reddit-native style differs significantly |
| GA4 / GTM | UTM consistency for Reddit traffic |
| HubSpot / SFDC | Customer Match upload + offline conversion import |
| Shopify / Magento | Product feed for Catalog Sales; pixel events |

### 3.7 Reddit-unique signals to probe

- **Subreddit performance breakdown** — for each adgroup, pull conversion rate per `included_subreddit`. Drop bottom 30% by CVR.
- **Conversation Ads adoption ratio** — `placement='COMMENTS_PAGE'` ads as % of total. Below 15% at $5k/mo+ = leaving CTR on the table (Conversation Ads typically 2-4× CTR of feed).
- **Native-feel creative authenticity** — pull creative URLs, run vision model classifier (requires R6 implementation): "Does this look like a Reddit native post or a stock-photo ad?". Stock-photo creatives get downvoted.
- **Downvote / comment-moderation health** — for each promoted post >7d old, pull top-level comments. Flag posts with ≥3 downvoted comments not hidden — these tank delivery.
- **Subreddit fit score** — qualitative: are we advertising in subreddits where the audience would actually want this product? Mismatch = community backlash + low CVR.

### 3.8 OODA loop

```
INPUTS: account_meta + Tier1_results + Tier2_library
BUDGET: 5 hypotheses · 25 API calls · 60s

1. Classify §3.1-3.5; vertical fit assessment is critical for Reddit (some verticals shouldn't be there)
2. Pick top 3-5 dimensions; subreddit + Conversation Ads always in scope above $5k/mo
3. Probe with /reports + /ad_groups (subreddit lists) + base Reddit API for comments
4. Stop at budget OR 2 consecutive no-finding hypotheses
5. Rank by $ recoverable monthly OR community-risk severity (downvote spirals)
6. Output: top-N + counterfactual + UC routing

"Consider pausing channel" is a valid Tier 3 outcome for poor-fit verticals.
```

---

## 4. Output format

```
═══ REDDIT ADS AUDIT — <account> ═══

LIGHTHOUSE (Tier 1, 4/5 passed):
  ❌ L-R10: 3 campaigns optimizing for TRAFFIC while PURCHASE event configured
     → switching to CONVERSIONS objective should improve CVR by 30-50%
  ✅ Pixel firing, oCPM aligned, no rejection

CONTEXT-DEPENDENT (Tier 2, 4 patterns activated):
  ⚠️ R3: 2 ad groups with only 2 subreddits + audience <50K → too narrow
  ⚠️ R7: $8k/mo spend, 0 Conversation Ads → ~40% missed CTR opportunity

AGENT EXPLORATION (Tier 3, 4 hypotheses tested):
  🔴 [Subreddit fit mismatch] — $1,800/mo waste
     Vertical: B2B SaaS. Targeting r/marketing + r/business — generic.
     Probe: per-sub CVR — r/marketing 0.4%, r/business 0.6%; benchmarks for narrow tech-decision subs ~2-3%.
     Counterfactual: switch to r/sysadmin / r/devops / r/SaaS → CVR +3-5×.

  🟡 [Conversation Ads absent] — $1,200/mo missed CTR
     R7. Top performers in tech subs are conversation ads (engagement multiplier).
     Counterfactual: pilot 1 Conversation Ad campaign → expected CTR 2-3× over feed.

  ✅ NO FINDINGS in: pixel health, frequency cap, creative authenticity (account healthy here).

ESTIMATED RECOVERABLE: $3,000/mo + CVR uplift (uncalibrated)
TOP 3 ACTIONS:
  1. Switch TRAFFIC campaigns to CONVERSIONS objective (UC-CL-1 Reddit variant)
  2. Refine subreddit list — narrow tech-decision-maker subs (UC-Reddit-Subreddit-Discovery)
  3. Pilot Conversation Ads in top-converting subreddit (UC-Reddit-Conversation)
```

---

## 5. Implementation contract

Same 7 rules as [[Google Ads — Audit Playbook]] § 6, plus a Reddit-specific addition:

8. The agent **may** recommend "pause this channel" if vertical fit assessment (§3.2) returns mismatch — Reddit isn't right for every business, and saying so explicitly is more valuable than fabricating optimization findings.

---

## 6. Source files

- Engine + 10 rules: `algorithms/revenue_div/projects/marketing experiments/google_ads_audit/checks_reddit.py`
- Reddit Ads API: https://ads-api.reddit.com/
- Tier 3 OODA structure: causal-ooda agent pattern


---

---
title: "The Trade Desk — Audit Playbook (3-Tier, SKELETON pending checks_ttd.py)"
summary: "Skeleton TTD audit playbook. Tier 1 lighthouse derived from marketing-facing PDF checklist + 2 legacy Cerebro entity rules. Tier 2 library is empty pending checks_ttd.py implementation. Tier 3 mandatory edge-case exploration is fully specified — bid line discipline, deal access, viewability/brand-safety, Kokai migration, vertical fit (CTV / display / video / audio mix). Use this playbook as scoping document for the full TTD audit build."
parent: "[[The Trade Desk]]"
related_to:
  - "[[The Trade Desk]]"
  - "[[Google Ads — Audit Playbook]]"
  - "[[01 Plan and Architecture]]"
agcm_keywords:
  - ttd audit playbook
  - trade desk audit
  - bid line audit
  - dsp audit programmatic
  - ttd kokai migration
intent_phrases:
  - "audit Trade Desk account properly"
  - "deep audit TTD"
  - "what to check in TTD"
tags:
  - marketing-os
  - data-source
  - the-trade-desk
  - audit
  - playbook
  - hybrid-3tier
  - skeleton
---

