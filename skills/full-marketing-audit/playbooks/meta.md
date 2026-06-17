# Meta Ads — Audit Playbook

**Three tiers — Lighthouse, Library, Agent. Every check is tenant-agnostic — the predicate shape is universal, the predicate value comes from a per-tenant policy config (`tenant_policy.yaml`) loaded at runtime. All field paths verified empirically against live Graph API v23.0 responses through `discoveryRequestTool`.**

> **Why MDG rules belong here.** Improvado clients run their own MDG (Marketing Data Governance) portfolios — checks like "ad set must target country X" or "campaign must use bid strategy Y". Those rules are nominally "governance" but operationally they are **audit checks**. This playbook is the canonical home for Meta audit rules — a tenant-agnostic catalog the agent loads against any Meta ad account once a `tenant_policy.yaml` is provided.

---

## 1. Per-tenant policy config (input)

Before running any audit, load the client's policy from a config map. **NEVER hardcode tenant-specific values into the rule.** Every rule below references `policy.<key>` — the agent merges the policy at runtime.

```yaml
# tenant_policy.yaml — example shape (real values are per-client)
country_targeting:
  required_countries: ["US"]                    # rule M-T-Country
  required_location_types: ["home", "recent"]   # rule M-T-LocType
  forbidden_countries: []
language_targeting:
  required_locale_codes: []                     # array of Meta locale IDs (e.g., 6=en_US, 23=es_LA)
  allow_advantage_audience: true
age_targeting:
  segment_patterns:                             # match adset_name → required age_min
    - {token: "_55Plus_", required_age_min: 55}
    - {token: "_18to54_", required_age_min: 18, required_age_max: 54}
    - {token: "_18Plus_", required_age_min: 18}
audience_suppression:
  required_excluded_audience_names: []          # required exclusion list names
placement_exclusions:
  forbidden_facebook_positions: ["right_column", "marketplace", "messenger_inbox"]
  forbidden_instagram_positions: []
  forbidden_audience_network: true              # if true, audience_network must be empty
optimization:
  approved_optimization_goals:                  # whitelist per-objective
    OUTCOME_SALES: ["OFFSITE_CONVERSIONS"]
    OUTCOME_LEADS: ["LEAD_GENERATION", "QUALITY_CALL", "OFFSITE_CONVERSIONS"]
    OUTCOME_TRAFFIC: ["LANDING_PAGE_VIEWS", "LINK_CLICKS"]
    OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS"]
attribution:
  required_setting: ["7d_click_and_1d_view"]    # array of allowed values
campaign_settings:
  required_buying_type: ["AUCTION"]
  required_bid_strategy: ["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "BID_CAP"]
  forbidden_budget_modes: []                    # ["daily_budget"] or ["lifetime_budget"]
  spend_cap_required: false
  campaign_budget_optimization_required: false  # Advantage CBO
pixel:
  required_pixel_ids: []                        # client's owned pixel IDs
naming_convention:
  exclude_patterns: ["DNU", "Do not", "Archive", "PLACEHOLDER", "TEST", "TBD"]
```

The agent loads this config from the per-client folder (e.g., `client_cases/im_X_Y___ClientName/tenant_policy.yaml`). The audit scorecard then has both a **universal scoring** (rule met/not met) and a **policy-aware annotation** (which clause of the tenant config the rule references).

---

## 2. Tier 1 — Lighthouse (must-run, ~7 checks)

These are deterministic red lights. They run on every Meta audit regardless of tenant policy. If any fail, the audit immediately surfaces them — no other rule can compensate.

| ID | Check | Discovery API call | Pass condition | Severity |
|---|---|---|---|---|
| **L-M1** | Pixel installed and firing | `GET /act_{X}/customconversions?fields=name,custom_event_type,active_status` + `GET /act_{X}/adspixels?fields=id,name,last_fired_time,is_unavailable` | At least 1 active pixel with `last_fired_time` within 7 days | **CRITICAL** |
| **L-M2** | CAPI configured (server-side events) | `GET /{pixel_id}/stats?aggregation=event_source` (look for `'server'` source) | Server-side events present alongside browser pixel. **NOTE:** `match_rate_approx=-1` is the standard return for `standard_access` tier — treat as BLOCKED, not FAIL. If pixel is referenced by ads but NOT in `/act_X/adspixels` (cross-account pixel — see L-M5), this check must traverse to `owner_business` account context to resolve. | **CRITICAL** when conversions are the goal; BLOCKED-when-pixel-cross-account |
| **L-M3** | Campaign objective set + matches `policy.optimization.approved_optimization_goals` | `GET /act_{X}/campaigns?fields=id,name,objective,effective_status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","SCHEDULED"]}]` | Each ACTIVE/SCHEDULED campaign has objective in the policy whitelist | **CRITICAL** — wrong objective wastes budget |
| **L-M4** | Daily budget covers `unit_cost × 2` for the bid strategy | `GET /act_{X}/adsets?fields=daily_budget,bid_amount,bid_strategy&filtering=[...active...]` | `daily_budget >= bid_amount × 2` (Meta's minimum auction-fill threshold) | **CRITICAL** — campaign won't deliver |
| **L-M5** | Pixel attached to ads matches `policy.pixel.required_pixel_ids` | `GET /act_{X}/ads?fields=tracking_specs&filtering=[...active...]` + `GET /act_{X}/adspixels?fields=id,name,owner_business`. If `tracking_specs.fb_pixel` is NOT in the account's `/adspixels` list, query `/{pixel_id}?fields=owner_business{id,name}` to traverse and resolve. **Multi-BM pattern:** if `distinct(owner_business.id)` over all account pixels > 1, the tenant operates a multi-brand portfolio with sub-brand BMs. Require explicit acknowledgment via `policy.pixel.allowed_business_manager_ids` array — if missing or `len([bm for bm in distinct_bms if bm not in policy.allowed_bms]) > 0`, flag governance ambiguity. | Every active ad's `tracking_specs.fb_pixel` is either (a) in the tenant's owned pixel ID list, OR (b) owned by a sibling account in the same BM, OR (c) owned by a BM listed in `policy.pixel.allowed_business_manager_ids` (multi-brand portfolio acknowledgment). | **CRITICAL** when pixel ID matches no owned/sibling/allowed-BM; **WARN** when cross-account-within-allowed-BM; **GOVERNANCE-FLAG** when multi-BM without policy acknowledgment |
| **L-M6** | All campaigns paused | `GET /act_{X}/campaigns?fields=effective_status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","SCHEDULED"]}]` | At least one ACTIVE or SCHEDULED campaign exists | **CRITICAL** or expected |
| **L-M7** | Ad rejected or in policy review > 48h | `GET /act_{X}/ads?fields=effective_status,issues_info{error_code,error_message,error_summary,error_type,level}&filtering=[{"field":"effective_status","operator":"IN","value":["DISAPPROVED","WITH_ISSUES","PENDING_REVIEW"]}]` | No ads in `DISAPPROVED` or `PENDING_REVIEW > 48h`. **Issue-code severity map (extend `policy.ads.issue_severity_map`):** `2490424` "Paused on High Invalidation Rate" = HIGH (account-wide signal — fix attribution); `3033001` "CampaignHasNoValidPrimaryAdgroup" = MEDIUM (taxonomy/structure issue, fast fix); `2490468` "Ad Review Rejected" = CRITICAL (policy violation, manual fix). Empirically observed across multiple enterprise tenants. | **CRITICAL** for `2490468`; **HIGH** for `2490424`; **MEDIUM** for `3033001`; severity per `policy.ads.issue_severity_map[error_code]` |

Lighthouse runs sequentially first; fail-open (continue to Tier 2 even if Lighthouse trips) but surface a banner artifact noting the red lights.

---

## 3. Tier 2 — Library (24 universal predicate checks)

These run **conditionally on `policy.<key>` being set**. If the tenant config has no policy for a check, the rule is skipped (not flagged as broken). Each rule maps to an empirically verified Graph API field.

### 3.1 Targeting policy checks (8 rules)

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **M-T-Country** | Country targeting matches policy | `GET /{adset_id}?fields=targeting{geo_locations{countries}}` | `targeting.geo_locations.countries == policy.country_targeting.required_countries` |
| **M-T-LocType** | Location type set | same call, `geo_locations{location_types}` | `targeting.geo_locations.location_types ⊇ policy.country_targeting.required_location_types` |
| **M-T-Forbidden-Geo** | No forbidden geos | same call | `targeting.geo_locations.countries ∩ policy.country_targeting.forbidden_countries == ∅` |
| **M-T-Locale** | Language locale matches | `GET /{adset_id}?fields=targeting{locales}` | `targeting.locales == policy.language_targeting.required_locale_codes` OR `policy.language_targeting.allow_advantage_audience` is true and Advantage+ Audience flag set |
| **M-T-Age** | Age range matches segment policy | `GET /{adset_id}?fields=targeting{age_min,age_max}` | If `adset_name` matches a `policy.age_targeting.segment_patterns[].token`, then `age_min == required_age_min` (and `age_max` if specified) |
| **M-T-Suppression** | Required exclusion audiences attached | `GET /{adset_id}?fields=targeting{excluded_custom_audiences{name}}` | `targeting.excluded_custom_audiences[].name ⊇ policy.audience_suppression.required_excluded_audience_names` |
| **M-T-Audience-Size** | Audience not too narrow | `GET /act_{X}/reachestimate?targeting_spec={...}` | `users >= 50_000` (Meta's minimum recommended; below this delivery is throttled) |
| **M-T-Detailed-Targeting-Stack** | Detailed-targeting layer count | `GET /{adset_id}?fields=targeting{flexible_spec,exclusions}` | `len(flexible_spec) <= 3` (more than 3 AND-stacked detailed-targeting layers shrinks reach exponentially) |

### 3.2 Placement policy checks (4 rules)

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **M-P-FB** | No forbidden Facebook positions | `GET /{adset_id}?fields=targeting{publisher_platforms,facebook_positions}` | `targeting.facebook_positions ∩ policy.placement_exclusions.forbidden_facebook_positions == ∅` |
| **M-P-IG** | No forbidden Instagram positions | same call, `instagram_positions` | `targeting.instagram_positions ∩ policy.placement_exclusions.forbidden_instagram_positions == ∅` |
| **M-P-AN** | Audience Network policy | same call, `audience_network_positions` | If `policy.placement_exclusions.forbidden_audience_network == true`, `audience_network_positions == []` |
| **M-P-Auto** | Advantage+ Placements ON when policy permits diverse delivery | `GET /{adset_id}?fields=targeting{publisher_platforms},targeting_automation` — **DO NOT** use `targeting{advantage_placements}` (returns 400 ILLEGAL_ARGUMENT — `(#100) Tried accessing nonexisting field`). Use `targeting_automation` object for the Advantage+ signal. | If policy doesn't restrict placements, `targeting_automation.advantage_audience == 1` OR no `publisher_platforms` restriction set (= default Advantage+ placements). |

### 3.3 Bidding & optimization (4 rules)

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **M-B-Goal** | Optimization goal in approved set per objective | `GET /{adset_id}?fields=optimization_goal,campaign_id` + `GET /{campaign_id}?fields=objective` | `optimization_goal IN policy.optimization.approved_optimization_goals[campaign.objective]` |
| **M-B-Strategy** | Bid strategy in approved set | `GET /{campaign_id}?fields=bid_strategy` | `bid_strategy IN policy.campaign_settings.required_bid_strategy` |
| **M-B-Buying** | Buying type matches policy | `GET /{campaign_id}?fields=buying_type` | `buying_type IN policy.campaign_settings.required_buying_type` |
| **M-B-Autobid-NoConv** | Autobid without conversions warning | `GET /act_{X}/insights?fields=spend,actions,frequency&date_preset=last_30d&level=adset&limit=200` — **DO NOT** add `filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]` (returns 400 `(#100) Filtering field effective_status is invalid`). Filter active ad sets client-side after fetch by joining with `/adsets?filtering=[ACTIVE]`. | If `bid_strategy == 'LOWEST_COST_WITHOUT_CAP'` AND `actions[type='offsite_conversion']` summed across 30d == 0 AND spend > $500 → broken (autobid has no signal). High frequency (>10/30d) on 0-conv adset is also a hard signal. |

### 3.4 Conversion attribution & tracking (3 rules)

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **M-A-Window** | Attribution setting in approved set | `GET /{adset_id}?fields=attribution_setting` | `attribution_setting IN policy.attribution.required_setting` |
| **M-A-Destination** | Destination type matches campaign objective | `GET /{adset_id}?fields=destination_type,campaign_id` + `GET /{campaign_id}?fields=objective` | For OUTCOME_SALES → `destination_type IN ('WEBSITE','UNDEFINED')`; for OUTCOME_APP_PROMOTION → `destination_type == 'APP'`; for OUTCOME_LEADS → `'ON_AD'` (Lead form) or `'WEBSITE'` |
| **M-A-Pixel-Match** | Tracking spec pixel matches `policy.pixel.required_pixel_ids` | `GET /{ad_id}?fields=tracking_specs` | `tracking_specs.fb_pixel ⊆ policy.pixel.required_pixel_ids` |

### 3.5 Campaign settings (5 rules)

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **M-C-Budget-Mode** | Budget mode (daily vs lifetime) consistency | `GET /{campaign_id}?fields=daily_budget,lifetime_budget` | Exactly one of `daily_budget` / `lifetime_budget` is set, and the chosen mode is NOT in `policy.campaign_settings.forbidden_budget_modes` |
| **M-C-Spend-Cap** | Spend cap configured if required | `GET /{campaign_id}?fields=spend_cap` | If `policy.campaign_settings.spend_cap_required == true`, `spend_cap > 0` |
| **M-C-CBO** | Advantage Campaign Budget (CBO) on/off | `GET /{campaign_id}?fields=is_budget_optimization` | `is_budget_optimization == policy.campaign_settings.campaign_budget_optimization_required` |
| **M-C-Dates** | Start and end times set + valid | `GET /{campaign_id}?fields=start_time,stop_time` | `start_time IS NOT NULL` AND (`stop_time IS NULL` OR `stop_time >= today()`) |
| **M-C-Status** | Effective status matches configured | `GET /{campaign_id}?fields=configured_status,effective_status` | `configured_status == 'ACTIVE'` AND `effective_status IN ('ACTIVE','SCHEDULED')` (no drift) |
| **M-C-StopDrift** | Stop time in past while still ACTIVE | `GET /{campaign_id}?fields=stop_time,effective_status,configured_status` | If `stop_time IS NOT NULL` AND `stop_time < now()`: `effective_status` should be `INACTIVE` or `COMPLETED`, NOT `ACTIVE`. Meta's status-sync delay leaves campaigns flagged ACTIVE for hours-to-days after `stop_time` fires — flag as zombie when drift > 24h. Empirically observed across multiple enterprise tenants (drift up to 100+ days on enterprise-scale accounts) — confirms this is a platform-wide pattern, not tenant-specific. |

### 3.7 Performance comparatives — current spend / metric outliers (LIVE Graph API, 8 rules)

These rules score the **current performance** of each entity against the customer's own median across active entities. Every finding has `$ at risk` (real money affected) per SKILL § 0.1 quantitative-comparison rule. Single live call covers all 8.

**Live call (covers everything below):**
```
GET /act_{X}/insights?level=adset&date_preset=last_30d&limit=500
  &fields=campaign_id,campaign_name,adset_id,adset_name,spend,impressions,
          clicks,reach,frequency,cpm,cpc,ctr,actions,cost_per_action_type,
          quality_ranking,engagement_rate_ranking,conversion_rate_ranking
  &breakdowns=country         (run twice: once with, once without breakdowns for joint analysis)
```

| ID | Check | Trigger / threshold | $ at risk formula |
|---|---|---|---|
| **M-Perf-Spend-Outlier** | Per-campaign spend deviates from the account median | `spend_30d > 2× median(spend_30d across ACTIVE campaigns)` | `spend_30d − 1.5×median` (excess spend over reasonable headroom) |
| **M-Perf-CPM-Outlier** | Adset CPM deviates from account average | `cpm > 2× median(cpm)` AND `impressions ≥ 1000` (signal) | `(cpm − median) × impressions / 1000` |
| **M-Perf-CPC-Outlier** | Adset CPC deviates from account average | `cpc > 2× median(cpc)` AND `clicks ≥ 50` | `(cpc − median) × clicks` |
| **M-Perf-CTR-Outlier** | Ad CTR in bottom decile + has spend | `ctr < 0.25× median(ctr)` AND `spend ≥ $200` | `spend × (1 − ctr/median)` (under-engagement waste) |
| **M-Perf-Conv-Volume-Outlier** | Conversion-objective campaign with 0 conversions in 30d | `objective IN ('OUTCOME_SALES','OUTCOME_LEADS') AND conversions_30d == 0 AND spend_30d > $500` | `full spend_30d` (you're flying blind on this one) |
| **M-Perf-Frequency-Outlier** | Awareness/Reach/Engagement campaign with high freq | `frequency > 2× median(frequency)` AND `objective IN awareness_set` | `spend × (frequency/target − 1)` where target = median or `policy.frequency_capping.max_frequency_default` |
| **M-Perf-Country-Concentration** | One country >70% of spend, suggesting accidental geo-bleed or mis-target | per-country spend % from `breakdowns=country` | `spend_in_unintended_countries` (review with customer; auto-derive intended set from `targeting.geo_locations.countries` per adset, then compare to delivery breakdown) |
| **M-Perf-Country-Mismatch** | Delivery to country NOT in adset's `targeting.geo_locations.countries` | for each adset: `set(actual_countries) − set(targeted_countries) ≠ ∅` AND `share > 5%` | `spend × share_outside_targeted_countries` (literal geo waste — Meta delivered outside your config) |

Customer-facing rendering example:
> **🔴 Campaign "BAW Q2 2026" spends $48,000/mo at 2.3× the median of your active campaigns.** $ at risk: $28,000/mo. Daily-budget-to-bid ratio is 1.85× (other 7 active campaigns sit at 3.5-4.2×). Raise daily budget to $215+ OR lower the bid to recover ~$28K/mo wasted on underfilled auctions.

> **🟠 Adset "Demo-LAL US 25-54" delivers 18% of impressions to UK/AU/CA despite targeting=US-only.** $ at risk: $1,650/mo. Tighten geo to US, OR add the adjacent markets to `targeting.geo_locations.countries` if the spillover is intentional.

### 3.6 Naming convention & taxonomy (2 rules — drop-in for any tenant)

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **M-N-Exclude** | No DNU / placeholder tokens in name | `GET /act_{X}/campaigns?fields=name,effective_status&filtering=[...active...]` | None of `policy.naming_convention.exclude_patterns` appears in `name` |
| **M-N-Schema** | Naming schema match (if tenant defined a regex) | name regex match | `re.match(policy.naming_convention.schema_regex, name)` returns a match |

---

## 4. Tier 3 — Agent edge-case exploration (mandatory)

After Tier 1+2 deterministic checks, the agent runs an **OODA loop** on context-dependent risks. Each edge case is mandatory unless explicitly opted out.

| Risk | What to look for | Sources |
|---|---|---|
| **Creative fatigue** | CTR decay > 25% over 7 days vs previous 7 days. **NOTE:** `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` return `UNKNOWN` for ads with <1000 impressions in eval window — treat UNKNOWN as "insufficient signal", NOT a fail. | `GET /act_{X}/insights?level=ad&breakdowns=&time_increment=1&date_preset=last_14d&fields=spend,impressions,clicks,ctr,quality_ranking,frequency` |
| **Audience overlap** | Significant overlap between active custom audiences (>20% means cannibalization) | `GET /act_{X}/audience_overlaps?audiences=[id_1,id_2,...]` |
| **ASC/AAC sunset** | Advantage Shopping Campaigns / Advantage Audience are deprecated path — flag if used | check `is_max_conversion_value`, `targeting_optimization` fields |
| **Cross-platform attribution drift** | Compare Meta-reported conversions vs server-side ground truth (tenant CRM) | `GET /act_{X}/insights?fields=actions` vs CRM `closed_won_count` |
| **Vertical fit** | Industry / placement / objective combinations that historically underperform (e.g., B2B SaaS on Stories without LP optimized for Stories — known soft signal) | account-name + industry context |
| **Naming drift** | New campaigns ignoring established naming convention from past 30d | inferred from `entity_campaigns` history |

These are not deterministic predicates — the agent reasons over the data and surfaces candidate findings.

---

## 5. How to run the full audit (one recipe, parallel calls)

```python
import asyncio

# Step 1 — load tenant policy
policy = load_yaml("client_cases/im_X_Y___Client/tenant_policy.yaml")

# Step 2 — auto-discover connection + account
ctx = mcp.createImpersonationContext(cluster=..., rtbm_agency_id=..., workspace_id=...)
conn = pick_active_connection(mcp.getConnectionsTool(impersonation_context_id=ctx, datasourceName='facebook'))
account_id = pick_account(mcp.discoveryListAccountsTool(impersonation_context_id=ctx, connectionId=conn.id))  # act_X

# Step 3 — pull entities in parallel
async def fetch(url): return mcp.discoveryRequestTool(dataSource='facebook', connectorId=str(conn.id),
    impersonation_context_id=ctx, request={"method":"get","url":url})

campaigns, adsets, ads, pixels, custom_conversions = await asyncio.gather(
    fetch(f"https://graph.facebook.com/v23.0/{account_id}/campaigns?fields=id,name,objective,buying_type,bid_strategy,daily_budget,lifetime_budget,spend_cap,start_time,stop_time,configured_status,effective_status,is_budget_optimization&limit=500&filtering=[{{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"SCHEDULED\"]}}]"),
    fetch(f"https://graph.facebook.com/v23.0/{account_id}/adsets?fields=id,name,campaign_id,effective_status,end_time,start_time,optimization_goal,attribution_setting,destination_type,bid_strategy,billing_event,daily_budget,lifetime_budget,bid_amount,targeting{{age_min,age_max,locales,geo_locations,publisher_platforms,facebook_positions,instagram_positions,messenger_positions,audience_network_positions,excluded_custom_audiences,advantage_placements,flexible_spec,exclusions}}&limit=500&filtering=[{{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\"]}}]"),
    fetch(f"https://graph.facebook.com/v23.0/{account_id}/ads?fields=id,name,adset_id,tracking_specs,effective_status,issues_info&limit=500&filtering=[{{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"DISAPPROVED\",\"PENDING_REVIEW\"]}}]"),
    fetch(f"https://graph.facebook.com/v23.0/{account_id}/adspixels?fields=id,name,last_fired_time,is_unavailable"),
    fetch(f"https://graph.facebook.com/v23.0/{account_id}/customconversions?fields=name,custom_event_type,active_status"),
)

# Step 4 — apply Tier 1, 2, 3 predicates client-side
findings = []
findings += run_tier_1_lighthouse(policy, campaigns, adsets, ads, pixels, custom_conversions)
findings += run_tier_2_library(policy, campaigns, adsets, ads)
findings += run_tier_3_agent_edge_cases(policy, account_id)

# Step 5 — render UC-DASH-1 artifact (severity-ranked scorecard)
render_artifact(findings)
```

---

## 6. Verified field availability (live probe 2026-04-29)

Live request against a sample ad-set endpoint — all fields below **returned 200 OK**:

```
GET /v23.0/act_<account_id>/adsets?fields=id,name,campaign_id,effective_status,end_time,start_time,
    optimization_goal,attribution_setting,destination_type,bid_strategy,billing_event,
    daily_budget,lifetime_budget,
    targeting{age_min,age_max,locales,geo_locations,publisher_platforms,facebook_positions,
              instagram_positions,messenger_positions,audience_network_positions,
              excluded_custom_audiences,targeting_automation}&limit=1
→ 200 OK, sample shape:
{
  "id": "EXAMPLE_AD_SET_ID",
  "campaign_id": "EXAMPLE_CAMPAIGN_ID",
  "effective_status": "CAMPAIGN_PAUSED",
  "end_time": "2024-06-16T21:00:00-0700",
  "start_time": "2024-06-07T07:00:00-0700",
  "optimization_goal": "OFFSITE_CONVERSIONS",
  "destination_type": "UNDEFINED",
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
  "billing_event": "IMPRESSIONS",
  "daily_budget": "21600",
  "lifetime_budget": "0",
  "targeting": {
    "age_min": 25, "age_max": 65,
    "geo_locations": {
      "countries": ["US"],
      "location_types": ["home", "recent"]
    },
    "excluded_custom_audiences": [{"id": "...", "name": "Gift Sub Purchase 30 Days"}]
  }
}
```

**Datasource alias gotcha (cluster-dependent):** `getConnectionsTool(datasourceName='meta')` returns **400 "DataSource with this name does not exist"** on some clusters — canonical slug is `facebook` on all clusters. On 400 alias-mismatch, retry with `facebook` before declaring no connection.

**Field caveats discovered during empirical validation (2026-04-30 against multiple enterprise ad accounts):**
- `targeting{advantage_audience}` → 400 ILLEGAL_ARGUMENT (not a valid Graph API sub-field name; use `targeting_automation` instead).
- `targeting{advantage_placements}` → 400 ILLEGAL_ARGUMENT `(#100) Tried accessing nonexisting field (advantage_placements)`. Use `targeting_automation` object only.
- `/insights?filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]` → 400 `(#100) Filtering field effective_status is invalid`. **Workaround:** drop the filter, fetch all campaigns/adsets, join client-side against `/campaigns?filtering=[ACTIVE]` result.
- `quality_ranking` / `engagement_rate_ranking` / `conversion_rate_ranking` return `UNKNOWN` until ad accumulates 1000+ impressions in the eval window. Not a fail signal under threshold.
- `match_rate_approx=-1` is the standard return on `/customconversions` for the `standard_access` tier — cannot be used as L-M2 CAPI parity check. Treat as BLOCKED. To verify CAPI server-side events, use `/{pixel_id}/stats?aggregation=event_source` from the **pixel-owner account context** (see L-M5 cross-account note).
- Cross-account pixel pattern: `/act_X/ads.tracking_specs.fb_pixel` may reference a pixel NOT in `/act_X/adspixels`. The pixel lives in another sibling business-manager ad account. To audit, traverse to `owner_business` via `/{pixel_id}?fields=owner_business{id,name}`.
- `attribution_setting` returns null on ad sets where the setting wasn't explicitly configured (uses account default).
- `locales` field is returned only when locale targeting is set; absent otherwise (treat absent == "no locale targeting").
- `publisher_platforms` is returned only when the user explicitly restricted; absent == default Advantage+ Placements (all surfaces).

---

## 7. Promotion path: from playbook to scheduled audit

A one-shot agent audit runs as a UC-DASH-1 artifact. Promote to recurring monitoring (cold path) only if the user explicitly says **"weekly audit"** / **"monitor"** / **"alert me"** / **"share with team"**:

1. Persist the per-tenant policy to `tenant_policy.yaml` in the client folder.
2. Materialize each Tier 1+2 predicate as a Cerebro / MDG rule (one rule = one predicate, one ClickHouse view in `im_X_Y_Z`).
3. Schedule daily run via Improvado MDG infrastructure (`internal_analytics.dim_mdg_rules` + `int_mdg_check_events_*`).
4. Wire notifications via `int_mdg_notification_events_detailed_prod`.

The empirical observation that Improvado tenants already encode this exact pattern in their MDG portfolios (492 rules across 15 platforms in one tenant alone) validates the architecture — the playbook is the spec; MDG is the operationalization.

---

## 8. Mapping to existing UC catalog

| Audit area | UC | Status |
|---|---|---|
| Pixel + CAPI parity | [[UC-PH-1 Pixel Health Audit]] | ✅ existing — Tier 1 L-M1, L-M2, L-M5 absorbed |
| Attribution window | [[UC-AT-1 Attribution Window Comparison]] | ✅ existing — Tier 2 M-A-Window absorbed |
| Status drift | [[UC-AS-1 Effective vs Configured Status Drift]] | ✅ existing — Tier 2 M-C-Status absorbed |
| Campaign launch validation | [[UC-CL-1 Campaign Launch E2E]] | ✅ existing — runs entire Tier 1 as Pre-step gate |
| Account audit orchestrator | [[UC-AU-1 Meta Account Audit Orchestrator]] | ✅ existing — runs all 3 tiers in parallel and aggregates |
| Naming convention | (NEW) `UC-NC-1 Naming Convention Audit` | ⚠️ propose new UC — consumes Tier 2 M-N-* rules |
| Audience overlap | [[UC-AO-1 Meta Audience Overlap]] | ✅ existing — Tier 3 audience overlap absorbed |
| ASC/AAC sunset | [[UC-AS-2 ASC AAC Sunset Audit]] | ✅ existing — Tier 3 ASC/AAC absorbed |
| Creative fatigue | [[UC-CF-1 Creative Fatigue Detection]] | ✅ existing — Tier 3 absorbed |

---

## 9. Provenance

- Audit-rule predicate inventory derived from real-world MDG portfolio patterns observed across multiple Improvado tenants (validated against `internal_analytics.dim_mdg_rules` on Montana cluster). All tenant-specific values (pixel IDs, suppression list names, locale codes, audience-segment tokens, attribution window values, optimization-goal whitelists) externalized to `policy.<key>` references — predicates are universal.
- Discovery API field availability empirically verified by live Graph API v23.0 probes through `discoveryRequestTool`.
- Cross-references: [[Reddit Ads — Audit Playbook]] for the same 3-tier structure pattern; [[Discovery API Write-Action Protocol]] for Step-1 connection presence checks; [[01 Plan and Architecture]] § 3.7 for reusable audit primitives.


---

---
title: "LinkedIn Ads — Audit Playbook (3-Tier)"
summary: "How to audit a LinkedIn Ads account properly. Tier 1 lighthouse (8 must-run deterministic checks), Tier 2 library (15 rules in checks_linkedin.py), Tier 3 mandatory edge-case exploration (B2B-vertical depth, ABM patterns, lead-form quality, audience seniority/function leakage, LAN publisher blocklist, campaign group structure, attribution window vs sales cycle)."
parent: "[[LinkedIn Ads]]"
related_to:
  - "[[LinkedIn Ads]]"
  - "[[Google Ads — Audit Playbook]]"
  - "[[01 Plan and Architecture]]"
agcm_keywords:
  - linkedin audit playbook
  - linkedin tier 1 lighthouse
  - linkedin edge cases
  - b2b audit
  - lead gen form audit
intent_phrases:
  - "audit LinkedIn Ads account properly"
  - "deep audit LinkedIn"
  - "what to check in LinkedIn"
tags:
  - marketing-os
  - data-source
  - linkedin-ads
  - audit
  - playbook
  - hybrid-3tier
---
