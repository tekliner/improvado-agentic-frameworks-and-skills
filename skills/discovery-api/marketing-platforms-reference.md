# Marketing Platforms — Discovery API Reference

Verified request shapes, working API versions, and ClickHouse fallback tables for the 5 ad platforms used by `/weekly-creative-performance` and `/daily-performance-report`.

This file is loaded by both skills as a shared reference, so per-platform shapes don't drift between them.

> **Snapshot date:** May 2026. API versions drift — when a request 404s on the version listed here, invoke `/discovery` skill's API Version Discovery Protocol to redetermine the current version. Don't hand-craft versions outside the documented probe chains.

---

## Per-platform endpoint matrix

| Platform | Slug | API version | Endpoint pattern | Status (May 2026) |
|---|---|---|---|---|
| Facebook / Meta | `facebook` | `v23.0` | `GET https://graph.facebook.com/v23.0/me/adaccounts` then `GET /{ad_account_id}/adcreatives?fields=…` | ✅ Live, returned real Improvado creatives with `image_url`, `thumbnail_url` |
| Google Ads | `google_ads_ql` | `v24` | `POST /v24/customers/{cid}/googleAds:search` (or `:searchStream`) with raw JSON body `{"query":"..."}` | ✅ Live (after correcting from sunset version + raw JSON body fix) |
| LinkedIn Ads | `linkedin_ads` | `v2` (legacy) | `GET /v2/adAccountsV2?q=search`, `GET /v2/adCreativesV2?q=search&search.account.values[0]=urn:li:sponsoredAccount:{id}` | ✅ Live on legacy `v2`. The `/rest/*` requires exact `LinkedIn-Version` header — `202501` returned `NONEXISTENT_VERSION`. Stick to v2. |
| TikTok Ads | `tiktok_ads` | `v1.3` | `GET https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id={aid}` | ✅ Live with valid advertiser_id |
| Pinterest Ads | `pinterest_ads` | `v5` | `GET https://api.pinterest.com/v5/ad_accounts`, `GET /v5/ad_accounts/{id}/ads`, `GET /v5/pins/{pin_id}` | ✅ Live for live connectors. Many agencies have no live Pinterest connector and only ClickHouse imports |

---

## Google Ads — version probe chain

Always probe in this order (latest verified first):

```
v24 → v23 → v25 → v22 → v20
```

If all fail, invoke `/discovery` skill's API Version Discovery Protocol.

### Working request body for searchStream (most fragile)

```http
POST https://googleads.googleapis.com/v24/customers/9521562011/googleAds:searchStream
Authorization: Bearer <handled by /discovery>
login-customer-id: 9521562011         ← required header
Content-Type: application/json
```

```json
{"query":"SELECT customer.id, customer.descriptive_name, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.responsive_display_ad.headlines, metrics.impressions, metrics.clicks, metrics.cost_micros FROM ad_group_ad LIMIT 10"}
```

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid JSON payload received. Unknown name "": Root element must be a message.` | Body sent as quoted JSON string | Send raw JSON object, not stringified |
| 404 | Sunset version (anything before v24 in May 2026) | Try next version in probe chain |
| 400 | Missing `login-customer-id` header | Add header (top-level customer ID for MCC accounts) |
| `PERMISSION_DENIED` | Token scope issue | Re-authorize Google Ads connector |

---

## Facebook (Meta) — endpoint shape

```http
GET https://graph.facebook.com/v23.0/{AD_ACCOUNT_ID}/adcreatives
  ?fields=id,name,status,thumbnail_url,image_url,object_story_spec{link_data{link,picture,call_to_action}},asset_feed_spec
  &limit=50
```

```http
GET https://graph.facebook.com/v23.0/{AD_ACCOUNT_ID}/insights
  ?fields=ad_id,ad_name,impressions,clicks,ctr,spend,actions
  &level=ad
  &date_preset=last_7d
  &limit=50
```

**Image URL warning:** `thumbnail_url` and `image_url` are signed `fbcdn.net` URLs that **expire after ~4–8 hours**. For dashboard longevity, refresh these via auto-refresh (`scheduleChatTool`) or fall back to a placeholder via `<img onerror>`.

---

## LinkedIn Ads — v2 legacy endpoints (NOT /rest/*)

```http
GET https://api.linkedin.com/v2/adCreativesV2
  ?q=search
  &search.account.values[0]=urn:li:sponsoredAccount:{ACCOUNT_ID}
  &count=50
```

```http
GET https://api.linkedin.com/v2/adAnalyticsV2
  ?q=analytics
  &pivot=CREATIVE
  &dateRange.start.day={D}&dateRange.start.month={M}&dateRange.start.year={Y}
  &dateRange.end.day={D}&dateRange.end.month={M}&dateRange.end.year={Y}
  &timeGranularity=ALL
  &accounts[0]=urn:li:sponsoredAccount:{ACCOUNT_ID}
  &fields=impressions,clicks,costInLocalCurrency
```

**Image strategy:** LinkedIn creatives use URNs, not direct URLs. For images, fall back to ClickHouse `entity_creatives_*_linkedin_ads_all_data` (has direct `media.licdn.com` URLs).

---

## TikTok Ads — v1.3 endpoints

```http
GET https://business-api.tiktok.com/open_api/v1.3/ad/get/
  ?advertiser_id={ADVERTISER_ID}
  &page_size=50
  &fields=["ad_id","ad_name","operation_status","ad_format","video_id","image_ids","profile_image_url","campaign_name","adgroup_name","landing_page_url"]
```

```http
GET https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/
  ?advertiser_id={ADVERTISER_ID}
  &report_type=BASIC
  &data_level=AUCTION_AD
  &dimensions=["ad_id"]
  &metrics=["impressions","clicks","ctr","spend"]
  &start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}
  &page_size=50
```

**Video thumbnails (optional Call 3):**
```http
GET https://business-api.tiktok.com/open_api/v1.3/file/video/ad/get/
  ?advertiser_id={ADVERTISER_ID}
  &video_ids=[{comma_separated}]
```

`poster_url` from this call is the proper video thumbnail (~24h expiry).

---

## Pinterest Ads — v5 endpoints

```http
GET https://api.pinterest.com/v5/ad_accounts/{AD_ACCOUNT_ID}/ads?page_size=25
GET https://api.pinterest.com/v5/pins/{PIN_ID}                          (per unique pin, max 10)
GET https://api.pinterest.com/v5/ad_accounts/{AD_ACCOUNT_ID}/ads/analytics
  ?start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}
  &ad_ids={comma_separated}
  &columns=IMPRESSION,CLICKTHROUGH,SPEND_IN_DOLLAR,CTR
  &granularity=TOTAL
```

**Image source:** `media.images["1200x"].url` from `/pins/{id}` — stable `pinimg.com` CDN URLs (permanent).

**Optimization:** Deduplicate pin_ids before fetching pin details. Cap at 10 to avoid rate limits.

---

## ClickHouse fallback tables

When `/discovery` returns auth_error / no connector / version mismatch, fall through to ClickHouse. Per CLAUDE.md "Quick Reference": prefer `mrt_*` and `recipe_*` tables; limit 250 rows; alias tables (`AS t`); always include `__account_id`.

| Platform | Main table for creatives | Useful columns |
|---|---|---|
| Facebook | (Discovery preferred — fbcdn URLs need refresh) | — |
| Google Ads | `im_{agency}_{hash}.ads_{agency}_google_ads_ql_all_data` | `ad_id`, `ad_name`, `ad_type`, `ad_status`, `image_ad_image_url`, `headlines_concatenated`, `descriptions_concatenated`, `impressions`, `clicks`, `cost` |
| LinkedIn | `im_{agency}_{hash}.entity_creatives_{agency}_linkedin_ads_all_data` | `creative_id`, `image_url`, `video_url`, `textad_landingpage`, `textad_headline`, `post_urn`, `post_article_title` |
| Pinterest | `im_{agency}_{hash}.promoted_pins_*_pinterest_ads_all_data` | `pin_id`, `pin_promotion_id`, `pin_promotion_name`, `pin_link`, `creative_type`, `destination_url`, `impressions`, `spend` (no media URLs in import) |
| TikTok | (no CH fallback — must rely on Discovery) | — |

For aggregated (daily KPI) tables, look for `mrt_*` variants in the agency schema:
```sql
SELECT database, name FROM system.tables
WHERE database = 'im_{agency}_{hash}'
  AND lower(name) LIKE 'mrt_%'
ORDER BY name;
```

---

## QA test fixtures (May 2026 verified)

These paths from the May 2026 discovery report can be replayed by engineers to validate the skills end-to-end without onboarding new accounts.

```
Cluster: lisbon
Workspace: 121 / Main Group (agency 3756) — Improvado dogfood

Facebook
  agency_id: 3756, connector_id: 14082, ad_account_id: act_1211478595627548
  Sample creative: 4124405944370070 ("creative-C-empowerment 2026-03-27-…")
  Expected: 10+ creatives, image_url + thumbnail_url present

Google Ads
  agency_id: 3756, connector_id: 1985, customer_id: 9521562011 (Improvado)
  Sample ad: 596371013272 (RESPONSIVE_DISPLAY_AD, "No-Code Revenue Data Platform")

LinkedIn Ads (active connector)
  agency_id: 3059, connector_id: 3567 (Daniel Mironov), account 507446188
  Expected: 733 total creatives; sample IDs 51007346, 60919306, 68770876

LinkedIn Ads (revoked — for auth_error → CH-fallback test)
  agency_id: 3756, connector_id: 19935 — REVOKED_ACCESS_TOKEN

TikTok Ads
  agency_id: 1, workspace 26, connector_id: 6447, advertiser_id: 6804972988073508869
  Expected: 235 ads; sample IDs 1679282120411138, 1679282120409090

Pinterest Ads
  agency_id: 1, workspace 26, connector_id: 6619, ad_account_id: 549756488767 (Improvado.io)
  Expected: Improvado.io ads with image URLs (i.pinimg.com)
```

These agency IDs are for **QA only** — never embed them as defaults in either skill's flow.

---

## Discovery delegation principle

Both `/weekly-creative-performance` and `/daily-performance-report` call `discoveryRequestTool` / `discoveryListConnectorsTool` / `discoveryListAccountsTool` directly with the shapes documented above.

**Don't** re-run `/discovery`'s API Version Discovery Protocol on every call — that's only needed when a documented version 404s and the probe chain is exhausted.

**Do** invoke `/discovery` skill explicitly when:
- Multiple version 404s in the Google Ads probe chain
- Unfamiliar API errors not in the per-platform error tables
- A connector returns errors that suggest a different API version is in use

This keeps the use-case skills agentic without duplicating discovery's version-detection work.
