# LinkedIn Ads — Audit Playbook

**Three tiers — Lighthouse, Library, Agent. Tenant-agnostic — predicate shapes universal, predicate values from `tenant_policy.yaml` loaded at runtime. LinkedIn-specific: B2B vertical bias, lead-form quality matters more than CPC, audience seniority/function pivots are LinkedIn's unique signal.**

> **Live-API audit with two caveats (validated empirically across multiple enterprise tenants 2026-04-30).**
>
> **(1) Discovery proxy yarl bug** — Root-collection finders (`/rest/leadForms`, `/rest/conversions`, `/rest/insightTags`, `/rest/adAnalytics`) AND any sub-resource finder using a `List(urn:li:...)` predicate (e.g. `/adAccounts/{id}/creatives?q=criteria&campaigns=List(urn:li:sponsoredCampaign:N)`) return **400 ILLEGAL_ARGUMENT**. [les#6049](https://github.com/tekliner/les/pull/6049) ships the fix. Until merged: use cold-path Extract Templates **3791 Conversions, 13432 Lead Forms Entity, 13438 Lead Form Responses, 16158 / 16159 demographic pivots, 17406 Ad Statistics**.
>
> **(2) Sub-resource paths that DON'T exist on LinkedIn (so don't propose them).** `/rest/adAccounts/{id}/insightTags`, `/rest/adAccounts/{id}/conversions`, `/rest/adAccounts/{id}/leadForms` all return **404 RESOURCE_NOT_FOUND**. They are NOT account-scoped sub-collections in LinkedIn's REST API. Cold-path is mandatory for those resources. Also: `/rest/adAccounts/{id}` does NOT have an `insightTag` field in v202604 — that field doesn't exist on the resource shape.
>
> **(3) `servingStatuses` is NOT a search parameter.** `?search=(servingStatuses:(values:List(RUNNABLE)))` returns 400 `FIELD_INVALID` directly from LinkedIn (not a proxy bug). Effective-status filtering MUST be done client-side after fetching `status:ACTIVE` campaigns.
>
> **(4) Discovery proxy URL allowlist requires absolute URLs.** Relative paths like `/rest/adAccounts/{id}/adCampaigns` return **"URL not allowed"** through `discoveryRequestTool`. **Use absolute URLs only:** `https://api.linkedin.com/rest/adAccounts/{id}/adCampaigns?...`. Validated empirically 2026-04-30.

---

## 0. Pre-flight + per-tenant policy

**Step A — Connection check** (per [[Discovery API Write-Action Protocol]] § 1):

```python
ctx = mcp.createImpersonationContext(cluster=..., rtbm_agency_id=..., workspace_id=...)
conn = pick_active_connection(mcp.getConnectionsTool(impersonation_context_id=ctx, datasourceName='linkedin_ads'))
# If no active connection — surface https://report.improvado.io/create_data_source_connection/linkedin_ads/?workspace=<id> and stop.
#
# CONNECTOR PICK HEURISTIC (corrected from validation):
# Tenants frequently have multiple LinkedIn connectors all viewing the same MCC.
# DO NOT use max(updated_at) — empirically picked stale connector (created 2025-08, never re-touched)
# over the actually-maintained one. Use:
#   pick = max(connectors, key=lambda c: (c.status == 'active', c.created_at)) — newest active wins;
#   on tie, run a cheap probe (`/rest/adAccountUsers?q=authenticatedUser`) and prefer the connector
#   with no 401/403 across spot-checked accounts.
account_id = pick_account(mcp.discoveryListAccountsTool(impersonation_context_id=ctx, connectionId=conn.id))
```

**Step B — Load tenant policy:**

```yaml
# tenant_policy.yaml — LinkedIn section
linkedin_ads:
  api_version: "202604"   # rolling 6-month versioning; bump quarterly
  tracking:
    insight_tag_required: true
    capi_required_above_monthly_spend: 5000
  audience:
    minimum_size: 5000                          # LI-03
    expansion_should_be_on: true                # LI-04
    audience_network_blocklist_required: true   # LI-05
  bidding:
    min_daily_budget_to_unit_cost_ratio: 2.0    # LI-06: dailyBudget >= 2 × unitCost
    forbidden_combos:                           # LI-07
      - {cost_type: "MAX_DELIVERY", conversions_30d: 0}
  creative:
    minimum_format_diversity: 2                 # LI-08: distinct format count among ACTIVE
    video_completion_rate_min: 0.25             # LI-09
  lead_gen:
    max_form_fields: 5                          # LI-10
    min_form_completion_rate: 0.10              # LI-11
  account_structure:
    require_campaign_groups_when_campaign_count_above: 10  # LI-12
    naming_convention_regex: null                          # LI-14 (per-tenant)
  experimentation:
    require_ab_test_within_days: 30             # LI-13 — Tier 3
  demographics:
    max_share_outside_target_seniority: 0.30    # LI-15
```

---

## 1. Tier 1 — Lighthouse (must-run, ~8 checks)

| ID | Check | Discovery API call | Pass condition | Severity |
|---|---|---|---|---|
| **L-LI-01** | Insight Tag installed | **Try LIVE first** via `/rest/dmpSegments?q=account` filter on `type=WEBSITE_INSIGHTS` (Insight-Tag-fed segments imply tag presence) OR `/rest/adAnalytics?pivot=CONVERSION&fields=...&accounts=urn:li:sponsoredAccount:N` (any conversion fired = tag is live). Cold-path auto-dispatch only if BOTH live variants 4xx. **Customer-facing fix when failed:** "Add the LinkedIn Insight Tag to every page on your website (Campaign Manager → Account assets → Insight Tag → copy snippet → install on site)." | `len(insight_tags) >= 1` OR `conversion_events_30d > 0` | CRITICAL |
| **L-LI-02** | Conversion actions configured | **Try LIVE first** via sub-resource `/rest/adAccounts/{id}/conversions` (some tenants return 200) AND `/rest/adAnalytics?pivot=CONVERSION&accounts=...&fields=externalWebsiteConversions,oneClickLeads`. Cold-path auto-dispatch only if both 4xx. **Customer-facing fix when failed:** "Set up at least one conversion event in Campaign Manager (Plan → Conversion tracking → Create) before optimizing for conversions." | `len(conversions) > 0` OR `conversion_events_30d > 0` | CRITICAL |
| **L-LI-06** | Daily budget covers unit-cost floor | `GET /rest/adAccounts/{id}/adCampaigns?q=search&search=(status:(values:List(ACTIVE)))` → check `dailyBudget.amount` vs `unitCost.amount` | `dailyBudget >= policy.bidding.min_daily_budget_to_unit_cost_ratio × unitCost` | CRITICAL — campaign won't fill auction |
| **L-LI-07** | Autobid with zero conversions | same call + `costType` field; cross-ref with cold-path conversions Extract for 30d count | No active campaign matches a `policy.bidding.forbidden_combos` entry | CRITICAL |
| **L-LI-Acct** | Account billing not on hold | `GET /rest/adAccounts/{id}` → `status, servingStatuses` | `status == 'ACTIVE'` AND `servingStatuses` contains `'RUNNABLE'` | CRITICAL |
| **L-LI-AllPaused** | At least one ACTIVE campaign | `GET /rest/adAccounts/{id}/adCampaigns?q=search&search=(status:(values:List(ACTIVE)))` (filter by `status` only — `servingStatuses` is NOT a search param). Then **client-side** filter by `servingStatuses contains 'RUNNABLE'`. | `len(campaigns where status=ACTIVE AND servingStatuses ∋ RUNNABLE) >= 1` | CRITICAL or expected |
| **L-LI-StatusDrift** | **Headline check on dormant tenants — status=ACTIVE without RUNNABLE serving** | same call + client-side filter on `runSchedule.end`, `servingStatuses` | `share(status=ACTIVE AND 'RUNNABLE' NOT IN servingStatuses) <= 0.10` (≤10% drift acceptable; above = audit-orchestrator should reclassify tenant as DORMANT and route to UC-RP-1 reactivation, not full-perf audit). **Empirical:** observed 100% drift on enterprise accounts where status=ACTIVE campaigns were entirely held by `CAMPAIGN_GROUP_END_DATE_HOLD` / `CAMPAIGN_GROUP_STATUS_HOLD`, with `runSchedule.end` dates 2-4 years in the past. Years of orphan-flagged historical campaigns never archived — any audit ignoring this hallucinates massive activity that doesn't exist. | CRITICAL — defines audit shape |
| **L-LI-CAPI** | CAPI configured at high spend | Cold-path auto-dispatch (`conversionsApiIntegrations` extract) + 30d spend insights. Skip N/A if monthly spend below policy threshold. **Customer-facing fix when failed:** "Set up the LinkedIn Conversions API to send server-side events — recovers ~10% of conversions that get lost to cookie blocking and iOS restrictions." | If `monthly_spend > policy.tracking.capi_required_above_monthly_spend`: at least one CAPI integration | HIGH |
| **L-LI-Disapp** | No disapproved creatives currently active | `GET /rest/adAccounts/{id}/creatives?q=criteria` (open-ended works — 200 OK; **DO NOT** add `&campaigns=List(urn:li:sponsoredCampaign:N)` filter — proxy 400 yarl bug applies to any `List(urn:li:...)` predicate). Filter active+rejected client-side from the open-ended response. | No creative with `intendedStatus=ACTIVE` AND `review.status='REJECTED'` | CRITICAL |

Output: `LIGHTHOUSE (X/8 passed)` block.

---

## 2. Tier 2 — Library (universal predicate checks, 15 rules)

Each rule conditionally fires if the corresponding `policy.linkedin_ads.<key>` is set.

| ID | Check | Discovery API call | Pass condition |
|---|---|---|---|
| **LI-03** | Audience not too narrow | `POST /rest/audienceCounts?q=targetingCriteria` (per ad set's targeting) | `count >= policy.audience.minimum_size` |
| **LI-04** | Audience Expansion matches policy | `GET /rest/adAccounts/{id}/adCampaigns/{cid}` → `audienceExpansionEnabled` | `audienceExpansionEnabled == policy.audience.expansion_should_be_on`. **NOTE:** the prior assumption "default OFF" is wrong — empirically AE is ON for ~80%+ of active campaigns on enterprise tenants. The check is policy-driven; no implicit default — read tenant policy first. |
| **LI-05** | LAN with publisher blocklist | `GET /rest/adAccounts/{id}/adCampaigns/{cid}` → `offsiteDeliveryEnabled`, `offsitePreferences.publisherRestrictionFiles.exclude` | If `offsiteDeliveryEnabled == true`, `offsitePreferences.publisherRestrictionFiles.exclude` non-empty. Empirically observed 100% LAN-ON-with-zero-blocklist patterns on enterprise tenants — critical waste exposure. |
| **LI-08** | Format diversity | sub-resource campaigns list → distinct `format` over ACTIVE | `len(distinct_formats) >= policy.creative.minimum_format_diversity` |
| **LI-09** | Video completion rate | **Cold-path until les#6049 ships.** Empirically tested 2026-05-01: `/rest/adAnalytics?q=analytics&accounts=List(urn:li:sponsoredAccount:N)` returns 400 through Discovery proxy on every variant (yarl re-encoding of `List(urn:...)` predicates). Sub-resource `/rest/adAccounts/{id}/adAnalytics` returns 404 (path doesn't exist). Auto-dispatch the videoAdAnalytics extract until live API is unblocked. Skip N/A when no video creatives in active set. **Customer-facing fix when failed:** "Cut your lowest-completion videos and reshoot a 6-second hook — videos that don't hold attention past 3 seconds are wasted impressions." | per-creative `completionRate >= policy.creative.video_completion_rate_min` |
| **LI-10** | Lead form field count | Cold-path auto-dispatch (Lead Forms Entity extract). Skip with status N/A if account has no lead-gen objective campaigns. **Customer-facing fix when failed:** "Trim Lead Gen forms to ≤ 5 fields — every field above 5 drops form completion ~40%." | `len(content.questions) <= policy.lead_gen.max_form_fields` |
| **LI-11** | Lead form completion rate | Cold-path auto-dispatch (Lead Form Responses extract). Skip N/A if no lead-gen objective. **Customer-facing fix when failed:** "Audit your lowest-completion lead form — pre-fill profile fields (name, company, email, title) from LinkedIn instead of asking the user to type." | `responses / impressions >= policy.lead_gen.min_form_completion_rate` |
| **LI-12** | Campaign groups exist if many campaigns | `GET /rest/adAccounts/{id}/adCampaignGroups?q=search` + count campaigns | If `len(campaigns) > policy.account_structure.require_campaign_groups_when_campaign_count_above`: groups present |
| **LI-13** | A/B tests in last 30d | infer via campaign-name pattern OR `GET /rest/adAccounts/{id}/adCampaignGroups` filtering on test naming | At least one campaign group created within `policy.experimentation.require_ab_test_within_days` |
| **LI-14** | Naming convention drift | **Auto-detect the convention** from the account's own data — don't require a regex to be pre-set. Algorithm: tokenize all active campaign names by separator (typically `__` or `_`), find the modal token-count + per-position character class (alpha/digit/mixed), build the implicit pattern, then flag any name that diverges from the modal pattern by >1 token or has obvious dirt (trailing whitespace, double-separators, mixed casing in a lowercase account). Fallback to `policy.account_structure.naming_convention_regex` only if the user explicitly set one to override the auto-detect. **Customer-facing fix when failed:** "These N campaign names don't match the naming pattern the rest of your account uses (`{objective}__{audience}__{stage}__{geo}__{format}__{theme}` based on what you have today). Rename them so your pivot tables stay clean. Specifically: campaign X has trailing whitespace, campaign Y is missing the geo token." | `≥ 95% of active campaign names match the auto-detected modal pattern` |
| **LI-15** | Demographic leakage | Cold-path auto-dispatch (Demographic Pivot extract). **Auto-derive default**: 30% impressions to off-target seniority/function = waste threshold (industry-standard for B2B targeting). Don't require policy. **Customer-facing fix when failed:** "Tighten your seniority/function targeting on campaign X — over 30% of impressions are going to non-target audiences and burning budget." | `share_outside_target <= 30%` (auto-default unless overridden) |
| **LI-Status** | Configured ↔ effective status drift | `GET /rest/adAccounts/{id}/adCampaigns?q=search` | No drift |
| **LI-AT-Window** | Attribution window appropriate for sales cycle | account.click/view attribution windows. **Auto-derive default by industry/objective signal**: B2B SaaS / Lead Gen / Website Conversions → click ≥ 30d expected; eCom → click 7d + view 1d; Awareness → window irrelevant. Compare to actual setting. **Customer-facing fix when failed:** "Switch click attribution to 30 days — for B2B SaaS with 30-90 day sales cycles, the default 7 days under-credits LinkedIn by ~25-40% of conversions." | account window matches the auto-derived expectation for the dominant campaign objective |
| **LI-Targeting-Excludes** | Required exclusion lists present (incl. self-org) | `GET /rest/adAccounts/{id}/adCampaigns/{cid}` → `targetingCriteria.exclude` | Required URNs present per `policy.audience.required_excluded_urns` AND the tenant's own `urn:li:organization:{org_id}` is in the exclude list (don't waste impressions on own employees). Empirically observed self-org-not-excluded on the majority of active campaigns across enterprise tenants — wasting impressions on own employees at scale. |
| **LI-Notify** | Account notification flags enabled | `GET /rest/adAccounts/{id}` → `notifiedOnCreativeRejection,notifiedOnEndOfCampaign,notifiedOnCampaignOptimization` | All three flags `true`. Empirically observed all three flags `false` across every account on multiple enterprise tenants — team gets zero alerts on rejections, end-of-campaign, optimization changes. |
| **LI-DNU** | No DNU/placeholder tokens in active names | name regex | `policy.naming_convention.exclude_patterns` not in name |

---

## 2.1 Performance comparatives — spend / metric outliers (7 rules)

Per SKILL § 0.1: score per-entity vs account median, every finding has `$ at risk`. **Auto-dispatch the Ad Statistics extract** as the data source — same metrics as the live API, refreshed daily, bypasses the proxy issues that affect Restli tuple syntax in `/rest/adAnalytics?q=analytics`. Render results from warehouse rows.

| ID | Check | Trigger / threshold | $ at risk formula |
|---|---|---|---|
| **LI-Perf-Spend-Outlier** | Campaign spend >2× median across ACTIVE+RUNNABLE | `costInUsd_30d > 2× median` | `costInUsd_30d − 1.5×median` |
| **LI-Perf-CPM-Outlier** | Campaign CPM >2× account median (LinkedIn CPMs naturally high; outlier = within-account spike) | `cpm > 2× median AND impressions ≥ 1000` | `(cpm − median) × impressions / 1000` |
| **LI-Perf-CPC-Outlier** | Campaign CPC >2× median, ≥50 clicks | `cpc > 2× median AND clicks ≥ 50` | `(cpc − median) × clicks` |
| **LI-Perf-CTR-Outlier** | Creative CTR in bottom decile with spend (LinkedIn baseline 0.4-0.6%) | `ctr < 0.25× median AND spend ≥ $200` | `spend × (1 − ctr/median)` |
| **LI-Perf-Conv-Volume-Outlier** | Conversion-objective campaign with 0 conv in 30d | `objectiveType='WEBSITE_CONVERSIONS' AND conv_30d == 0 AND spend_30d > $500` | `full spend_30d` |
| **LI-Perf-Video-Completion-Outlier** | Video creative completion rate <25% with spend ≥ $500 | `videoCompletions / videoStarts < 0.25` | `spend × (1 − completion / 0.25)` |
| **LI-Perf-Geo-Distribution** | Spend skewed by country (LinkedIn allows multi-country adsets, drift detection important for B2B regional targeting) | per-country breakdown via `pivot=GEO_REGION` (cold-path until proxy fix) | `spend_in_unintended_countries` |

## 3. Tier 3 — Mandatory edge-case exploration

### 3.1 Account state classification (RUN FIRST)

| State | Detection | Audit shape |
|---|---|---|
| **Active** | ≥1 status=ACTIVE campaign with `'RUNNABLE' IN servingStatuses` + spend last 7d | Full audit |
| **Dormant** | **L-LI-StatusDrift fires:** `share(status=ACTIVE AND 'RUNNABLE' NOT IN servingStatuses) >= 0.95` AND ≥1 campaign group has `runSchedule.end < today()` (END_DATE_HOLD evidence). Validated 2026-04-30 across multiple independent enterprise tenants — 100% drift was the recurring pattern, not an outlier. | Skip live-perf, route to UC-RP-1 LinkedIn variant |
| **All-inactive** | 0 status=ACTIVE ever | Generate "channel off" report |
| **New** | First campaign created <30d | Audit setup correctness only |

### 3.2 Per-vertical edge cases (LinkedIn is overwhelmingly B2B)

**Default vertical = B2B SaaS / B2B Services.** LinkedIn has narrow B2C use cases (luxury, executive education).

| Sub-vertical | Edge cases to explore |
|---|---|
| **B2B SaaS** | (a) Account-Based Marketing — uploaded company list size & match rate (b) Sales cycle 30-90d → attribution window must be 30-day post-click minimum (c) MQL → SQL → CW conversion via offline import (d) Demo-request vs gated-content differentiation in lead-form quality |
| **B2B Services / Consulting** | (a) Senior+ targeting (Director, VP, C-suite) — check actual delivery vs configured (b) Industry pivots — leakage to wrong industry (c) Long-form Sponsored Content vs single-image |
| **Recruiting / Talent** | (a) Job-function targeting precision (b) Geo + commute radius (c) Talent Solutions integration |
| **B2C luxury / executive ed** | (a) Income-proxy targeting via seniority (b) Premium creative — no clickbait (c) High AOV → high CPA tolerance |

### 3.3 Per-campaign-objective edge cases

| Objective | Edge cases |
|---|---|
| **Lead Generation** | LI-10 form fields (>5 = drop-off cliff); LI-11 form completion rate vs benchmark; pre-filled fields configured? CRM integration via Zapier/HubSpot |
| **Website Conversions** | LI-02 conversion config; CAPI for cookie-blocked traffic; offline conversion import |
| **Brand Awareness** | Reach + Frequency caps; LAN inclusion appropriate? |
| **Engagement** | Comment moderation policy; influencer-content amplification |
| **Video Views** | LI-09 completion rate; vertical 9:16 vs landscape 16:9; sound-off captions |
| **Job Ads** | Targeting precision by industry / function / seniority / experience |

### 3.4 Per-spend-tier

| Tier | Monthly spend | Edge cases |
|---|---|---|
| **Micro** | <$2k | Likely below volume floor; recommend pause + reallocate |
| **Small** | $2k-$10k | Most rules apply; expect Maximum Delivery to be too aggressive |
| **Mid** | $10k-$50k | Audit ABM list quality; matched audiences from CRM |
| **Enterprise** | $50k-$500k | Multi-account structure; portfolio bidding (LinkedIn doesn't have it natively — flag manual allocation) |
| **Mega** | $500k+ | API integration with MAP (Marketo, Eloqua, Pardot); programmatic Sponsored Content via API only |

### 3.5 Per-account-maturity

| Maturity | Audit focus |
|---|---|
| **<30d** | Setup correctness — Insight Tag, conversion actions, account hierarchy |
| **30-90d** | Learning phase — Smart Bidding may still calibrate; don't flag low conv yet |
| **90+ days** | Full optimization — all Tier 2 rules in scope |
| **2+ years** | Legacy artifacts — old conversion actions still firing? Deprecated campaign types? |

### 3.6 Cross-DS context

| Connection present | Edge case |
|---|---|
| HubSpot / SFDC / Marketo | Matched Audiences upload flow + offline conversion import gap |
| Google Analytics 4 | UTM consistency between LinkedIn `tracking_template` and GA4 captured params |
| Bizible / Dreamdata / 6sense | Multi-touch attribution gap — LinkedIn last-click vs B2B attribution platform |
| Meta Ads | Audience overlap if running same ABM on Meta — wasted reach |

### 3.7 LinkedIn-unique signals to probe

- **Demographic targeting drift** — pull `/adAnalytics?pivots=MEMBER_SENIORITY,MEMBER_FUNCTION`. Flag if >30% impressions to non-target combination
- **Audience Network publisher leakage** — for accounts with LAN ON, pull placement breakdown; check publisher-level performance
- **Lead form pre-fill audit** — fields not pre-filled hurt completion; check `Lead Gen Form.questions` schema
- **Sponsored Messaging open + reply rates** — if running InMail/Message, baseline 30%+ open rate; below = subject/sender issue
- **A/B test cadence** — `find_ab_tests(days=30)` should return ≥1 active test for any account >$10k/mo

### 3.8 OODA loop

```
INPUTS: account_meta + Tier1_results + Tier2_library
BUDGET: 5 hypotheses · 25 API calls · 60s

1. Classify §3.1-3.5
2. Pick top 3-5 dimensions where edge cases are highest-impact for THIS account
3. Form hypotheses, probe with /adAnalytics or /audienceCounts queries
4. Stop at budget OR 2 consecutive no-finding hypotheses
5. Rank findings by $ recoverable monthly
6. Output: top-N + counterfactual + UC routing

"No findings" is valid for any clean dimension.
```

---

## 4. Output format

```
═══ LINKEDIN ADS AUDIT — <account> ═══

LIGHTHOUSE (Tier 1, 7/8 passed):
  ❌ L-LI-CAPI: CAPI not configured at $12k/mo spend → estimate 8-15% signal loss
  ✅ Insight Tag, conversions, autobid, billing, etc.

CONTEXT-DEPENDENT (Tier 2, 5 patterns activated):
  ⚠️ LI-05: LAN ON without publisher blocklist (wasted ~$1.4k/mo on low-quality)
  ⚠️ LI-10: Lead form has 7 fields (drop-off ~40% above 5-field benchmark)

AGENT EXPLORATION (Tier 3, 4 hypotheses tested in 6s):
  🔴 [Demographic leakage to non-target seniority] — $3,100/mo recoverable
     Vertical: B2B SaaS targeting Director+. Probe: 38% impressions to Manager-level.
     Counterfactual: tighten seniority filter → +$3.1k/mo savings; CPA likely -25%.
  🟡 [Lead form pre-fill not configured] — drop-off cliff
     11 fields requested, none pre-filled from LinkedIn profile. Counterfactual:
     pre-fill 6 fields from profile → +25-35% form completion.

NO FINDINGS in: video completion (account is video-only objective, LI-09 = 38% vs 25% benchmark — healthy).

ESTIMATED RECOVERABLE: $4,500/mo
TOP 3 ACTIONS:
  1. Configure CAPI (UC-PH-1 LinkedIn variant) — biggest signal-loss win
  2. Tighten seniority targeting (UC-DG-1) — fast cost recovery
  3. Add LAN publisher blocklist + pre-fill form fields
```

---

## 5. Implementation contract

Same as [[Google Ads — Audit Playbook]] § 6 — Tier 1 always, classify before Tier 3, ≥3 hypotheses, may ask vertical clarification once, stop at budget not first finding, "no findings" disclaimers explicit, $ impact for every finding, route to UC.

---

## 6. Source files

- Tier 1+2 rules implemented in `algorithms/revenue_div/projects/marketing experiments/google_ads_audit/checks_linkedin.py`
- LinkedIn Marketing API docs: https://learn.microsoft.com/en-us/linkedin/marketing/
- Tier 3 OODA structure adapted from causal-ooda agent pattern


---

---
title: "TikTok Ads — Audit Playbook (3-Tier)"
summary: "How to audit a TikTok Ads account properly. Tier 1 lighthouse (8 must-run, including pixel, aspect, sound-off captions, bid mismatch, learning stuck), Tier 2 library (15 rules in checks_tiktok.py), Tier 3 mandatory edge-case exploration (creative-format depth, Spark Ads adoption, ACO mode, lookalike-value, vertical industry attribution alignment, frequency caps for awareness)."
parent: "[[TikTok Ads]]"
related_to:
  - "[[TikTok Ads]]"
  - "[[Google Ads — Audit Playbook]]"
  - "[[LinkedIn Ads — Audit Playbook]]"
  - "[[01 Plan and Architecture]]"
agcm_keywords:
  - tiktok audit playbook
  - tiktok tier 1 lighthouse
  - tiktok edge cases
  - vertical creative audit
  - spark ads adoption
intent_phrases:
  - "audit TikTok Ads account properly"
  - "deep audit TikTok"
  - "what to check in TikTok"
tags:
  - marketing-os
  - data-source
  - tiktok-ads
  - audit
  - playbook
  - hybrid-3tier
---
