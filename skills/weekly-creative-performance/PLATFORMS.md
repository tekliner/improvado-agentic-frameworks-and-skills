# PLATFORMS — Discovery API recipes

Read at SKILL.md § 6 entry. Use the skip-guide below to navigate to only the platforms in `PLATFORMS`. Each section follows the same template: **Call 1** (creatives) · **Call 2** (analytics) · **Secondary calls** (mandatory when trigger fires) · **Extract** (field → CreativeItem) · **Don't** (anti-patterns).

Every Discovery call sets `hasLimit: false` (defeats the proxy's 32 KB silent truncation that drops tail rows).

## How `discoveryRequestTool` returns — READ FIRST

`discoveryRequestTool` does NOT return raw JSON. It returns a **markdown document** (`discovery-api-tool.ts:184-207`) with this exact shape:

```
  <Title from URL>

  # Request
  ```
  curl -X get -H "Content-Type: application/json" -d '{}' <url>
  ```

  # Response

  Status Code: 200

  ### Headers
  ```json
  { ...response headers... }
  ```

  ### Response

  ```json
  { ...the platform's actual JSON payload — what you want... }
  ```
```

When the response fits in the conversation context cap (~25K tokens), the agent sees this markdown inline and reads `.data[]` straight from the `### Response` code block via text inspection.

**When the response overflows** (> 25K tokens — common for FB `/adcreatives` page 1, Google GAQL with many RSAs, anything with full `object_story_spec` nested attachments), the MCP transport saves the FULL markdown document to `/root/.claude/projects/.../tool-results/<id>.txt`. **A `jq '.data'` against that file finds nothing — the file is markdown, not JSON.**

To extract the platform payload from an overflow file, use ONE of these:

**Bash one-liner** (extract the JSON code block after `### Response`, pipe to jq):
```bash
sed -n '/^### Response$/,/^```$/p' <file> | sed -n '/^```json$/,/^```$/{/```/d;p;}' | jq '.data | length'
sed -n '/^### Response$/,/^```$/p' <file> | sed -n '/^```json$/,/^```$/{/```/d;p;}' | jq '.data[] | {id, image_url, image_hash, url_tags, name}'
```

**Python** (when jq alone isn't enough, e.g. building a CreativeItem array):
```python
import json, re
with open(file_path) as f:
    md = f.read()
m = re.search(r'### Response\n+```json\n(.*?)\n```', md, re.DOTALL)
if not m:
    raise ValueError(f'no ### Response JSON block in {file_path}')
payload = json.loads(m.group(1))
creatives = payload['data']  # or payload['results'], payload['elements'], etc — platform-specific
```

**Do NOT** try `jq` directly on the file — it's not JSON, it's markdown. **Do NOT** assume the platform payload is at the top level — it's wrapped in `### Response` and only the inner code block is JSON. **Do NOT** look for `### Headers` data; that's response headers, not the body.

Internalize this BEFORE STEP 2 to avoid the ~2-3 minutes of "I parsed a 145K file but found 0 creatives, let me re-check" detective work observed across multiple traces.

## Skip-guide

| Platform | Section | Line range |
|---|---|---|
| `facebook` | § 1 | 23–105 |
| `google_ads` | § 2 | 106–215 |
| `pinterest` | § 3 | 216–253 |
| `tiktok` | § 4 | 254–355 |
| `linkedin` | § 5 | 356–425 |

Always read § 6 (Google Ads Deep Dive — only on user request for RSA / Quality Score / Variants).

---

## 1. Facebook

**dataSource:** `facebook` · **Stable id:** `image_hash` (image) / `video_id` (video)

### Call 1 — Creatives (paginated, 200 cap)

```
discoveryRequestTool({
  dataSource: "facebook",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://graph.facebook.com/v23.0/{AD_ACCOUNT_ID}/adcreatives",
    params: {
      "fields": "id,image_url,image_hash,thumbnail_url,url_tags,name,status,video_id,video_data{video_id,video_length_seconds},permalink_url,object_story_spec{link_data{link,picture,call_to_action,child_attachments{picture,name,description,link,image_hash}}},asset_feed_spec",
      "limit": "25"
    }
  }
})
```

**`limit=25` is load-bearing.** With the full field list above, a `limit=50` response on a single FB account routinely exceeds 175K tokens / 300K chars (observed 2026-05-27 evening trace: page 1 was 175,118 tokens, blew the 25K-token tool-result cap, forced the response onto disk, cost 3-4 extra `Bash jq` calls just to parse it). `limit=25` halves the response and keeps it under the conversation cap so the agent can read fields inline without saving to disk. The doubled page count (8 pages × 25 instead of 4 × 50) is cheaper than the parse overhead it avoids.

**Paginate fully** via `data.paging.cursors.after`; re-issue with `&after={cursor}` (each page also sets `hasLimit: false`). Hard cap: 200 creatives total (8 pages × limit=25). First-page-only is a silent under-fetch for accounts with 30+ creatives.

### Call 2 — Insights (performance per ad)

```
discoveryRequestTool({
  dataSource: "facebook",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://graph.facebook.com/v23.0/{AD_ACCOUNT_ID}/insights",
    params: { "fields": "ad_id,ad_name,impressions,clicks,ctr,spend,actions", "level": "ad", "date_preset": "last_30d", "limit": "50" }
  }
})
```

### Secondary calls

One mandatory fallback (DPA / Advantage+ campaigns) plus two DROPPED calls.

#### MANDATORY — DPA / Advantage+ creative join (when any `/insights.ad_id` is not in `/adcreatives.url_tags.hsa_ad`)

Some Facebook ad types — Dynamic Product Ads (DPA), Advantage+ Shopping, Advantage+ Creative — **do not stamp `hsa_ad=` into their `url_tags`**. Their ad_ids appear in `/insights` but cannot be matched back to any `/adcreatives` row. Without this fallback, all metrics-bearing ads on such accounts go to the gallery as `unknown` fatigue with no thumbnails — even when they're the top performers. (Observed 2026-05-27 morning: 35 insights ads with 120244xxx IDs, ~26K total impressions, ALL DPA, ZERO joinable via `hsa_ad`.)

**Trigger:** after parsing `hsa_ad` from every `/adcreatives.url_tags` value across all pages, compare the set against `/insights[].ad_id`. If any insights ad_id is **not** in the parsed-hsa_ad set, that ad_id needs this fallback.

**Recipe** (batch up to 50 unmatched ad_ids per call). **The `filtering=…` parameter is the only call shape proven to work through the Improvado proxy.** `params.ids=` returns `Invalid token` on the account-scoped endpoint and triggers a URL-encoding bug (`'(120244…'` parenthesis-prefix error) on the root `/v23.0/?ids=…` endpoint. Use `filtering` exclusively:

```
discoveryRequestTool({
  dataSource: "facebook",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://graph.facebook.com/v23.0/{AD_ACCOUNT_ID}/ads",
    params: {
      "filtering": "[{\"field\":\"id\",\"operator\":\"IN\",\"value\":[\"<ad_id_1>\",\"<ad_id_2>\",\"...\"]}]",
      "fields":    "id,name,creative{id,name,thumbnail_url,image_url,object_story_spec{link_data{link,picture,call_to_action,child_attachments{picture,name,description,link,image_hash}}}}",
      "limit":     "50"
    }
  }
})
```

The `filtering` value MUST be a JSON-stringified array with the inner object's keys / string values **double-quoted** (`\"field\"` not `'field'`). Single quotes get URL-encoded oddly and the proxy returns "Invalid filtering format". Pass the raw JSON string verbatim through `discoveryRequestTool.params` — the tool URL-encodes it correctly.

This is **different** from the wrong-path `/ads?fields=creative{id,thumbnail_url}` without a `filtering=` filter — that pattern returns all account ads and tries to join by `creative.id`, which lives in a different object space than `/adcreatives.id` (~0% overlap; see Don't list below). The `filtering=[{...}]` form lets us batch-fetch specific ads by their `id` (which is what `/insights.ad_id` matches).

**Extract** (per `data[]` row):

- `data[].id` → ad_id (matches `/insights.ad_id` directly; use as the CreativeItem's correlator)
- `data[].name` → display name. If contains `{{product.` → mark as DPA (gallery renders at 64px with a "DPA" hover note; no upscale).
- `data[].creative.thumbnail_url` → 64×64 DPA thumbnail. **Primary for DPA / Advantage+ creatives.** Mirror in § 7c.
- `data[].creative.image_url` → full image when present (non-DPA fallback creatives). Prefer over `thumbnail_url` when set.
- `data[].creative.object_story_spec.link_data.picture` → page-post picture for organic-style creatives (used only when neither `thumbnail_url` nor `image_url` is set).
- `stable_id` for these CreativeItems → `data[].creative.id` (fall back to `sha1(thumbnail_url)` if `creative.id` is null).

Insights metrics correlate by `ad_id`; set them on the new CreativeItem directly. Treat each DPA-fallback ad as its own row in the final `CreativeItem[]` (do NOT also try to find a matching `/adcreatives` row).

**On failure — alternate connector retry, then graceful degrade.**

If the call returns `Invalid token` / `Permission denied` / `OAuthException` AND the account appears in `/discoveryListAccountsTool` results from MORE THAN ONE Facebook connector (e.g. account `act_1211478595627548` was listed by both connectors 14082 and 45600 in the 2026-05-27 trace), retry the SAME call with each alternate connector_id in turn before giving up. Token grants are per-connector; one connector's user may have `ads_management` permission on the account while another's user only has `ads_read`.

If every alternate connector also fails, OR no alternates exist:

1. Stamp each unmatched insights ad as a CreativeItem with: `thumbnail_url=null`, `thumbnail_type="placeholder"`, real metrics from `/insights`, name = `ad_name` from insights.
2. Continue to § 7c. The **Visual coverage requirement** in § 7c will then swap some of these placeholders for image-bearing creatives from below the impressions cutoff (older campaigns with real `image_url`s but zero recent delivery) so the gallery still shows real creative imagery.
3. Add a partial-coverage note to `DASHBOARD_NOTE`: `" — facebook: DPA metrics shown without thumbnails (connector lacks ads_read scope)"`.

#### DROPPED — secondary calls that proved broken

| Call | Why dropped |
|---|---|
| `/adimages?hashes=…` | Returns `(#100) Tried accessing nonexisting field (url_256)` on v23. STEP 3c mirrors the signed `image_url` directly within seconds, so the 4-8h source TTL is irrelevant. |
| `/videos/{id}` or `/?ids={video_ids}` | 10/10 permission errors observed (`(#10) Application does not have permission for this action`) on Improvado-managed connectors. Use the creative's 64×64 `thumbnail_url` as the poster instead — mirrored by STEP 3c. |

### Extract (Call 1 → CreativeItem)

- `image_url` → `thumbnail_url` (full-res signed fbcdn URL; mirrored in § 7c within seconds). **Preserve signature verbatim** (`?_nc_…&oh=…&oe=…` — FB CDN rejects re-encoded queries).
- `image_hash` → `stable_id` (dedup key for § 7c).
- `thumbnail_url` (64×64) → **DPA fallback only** (never as primary for standard ads).
- `video_id` / `video_data.video_id` → `stable_id` for video creatives; use the creative's 64×64 `thumbnail_url` as `thumbnail_url` (full-res poster fetch via `/videos/{id}` is permission-denied; see Don't list).
- `permalink_url` → `CreativeItem.permalink_url` (gallery's media-error fallback "Open on Facebook" target).
- `object_story_spec.link_data.child_attachments[]` → carousel cards; pick the first child's `picture` (or its `image_hash`) as the primary `thumbnail_url`, stamp `creative_type="CAROUSEL"`.
- `url_tags` → parse `ad_id = url_tags.split('hsa_ad=')[1].split('&')[0]`. Join `/insights` rows by matching `ad_id`. **No `hsa_ad=` → exclude from gallery** (no reliable join key).

Insights row → CreativeItem: `impressions` / `clicks` / `ctr` (already a percent) / `spend` (string → number).

### DPA (Dynamic Product Ads) detection

`creative.name` contains `{{product.` OR `image_url` absent → fall back to `thumbnail_url` (64×64). Gallery renders DPA cards at 64px with a "DPA" hover note; no upscale.

### Insights fallback chain

1. `/insights?level=ad` → metrics per ad.
2. Empty → `/ads?fields=id,name,insights.date_preset(last_30d){impressions,clicks,ctr,spend}` (inline insights syntax; still join via `url_tags.hsa_ad` from Call 1).
3. Still empty → show creatives without metrics. Note: "No delivery data in selected period."

### Don't

- ❌ **`/ads?fields=creative{id,thumbnail_url}` WITHOUT an `ids=…` filter, joining by `creative.id`.** Returns all account ads' 64×64 thumbnails AND the `creative.id` returned here lives in a different object space than `/adcreatives.id` (~0% overlap on real accounts). The right pattern is `/ads?ids={specific_ad_ids}&fields=…` (matches `/insights.ad_id` directly) — see § Secondary calls § DPA / Advantage+ fallback above. The distinction is the `ids=…` parameter.
- ❌ **`thumbnail_url` from `/ads` or `/insights` as the primary for standard (non-DPA) creatives.** Both return the 64×64 placeholder, not the full-res `image_url` on `/adcreatives`. If a `/adcreatives` row has only `thumbnail_url`, re-issue Call 1 with explicit `image_url,url_tags` fields (truncation defense), not render 64px. (For DPA creatives, 64×64 IS the canonical thumbnail — there is no full-res alternative.)
- ❌ **Strip or re-encode the fbcdn URL signature.** Pass `image_url` through verbatim. FB CDN rejects requests with stripped / re-encoded / reordered query parameters.
- ❌ **Re-paginate `/adcreatives` past 200 creatives searching for missing insights ad_ids.** When `/insights` returns ad_ids that don't appear in pages 1-4, they're DPA / Advantage+ campaigns — use the fallback above. Pagination past page 4 won't find them; the agent in 2026-05-27 burned 3 wasted page fetches before realizing this.
- ❌ **Probe the same account through a different connector** hoping to find creatives that match insights ad_ids. Both connectors hit the same underlying account; the response is identical. (Verified in 2026-05-27 trace: connector 14082 and 45600 returned the exact same `/adcreatives` cursor + rows for `act_1211478595627548`.)
- ❌ **Per-creative fetches.** `/adcreatives` with `limit=50` + pagination is the canonical batch path; per-creative `/{creative_id}?fields=image_url` fans out against the 200/hr ceiling.

---

## 2. Google Ads

**dataSource:** `google_ads_ql` · **Stable id:** `asset.id` (Asset API) / `imageAd.id` (IMAGE_AD direct)

`GOOGLE_BASE_URL = "https://googleads.googleapis.com/v23/customers/{CUSTOMER_ID}/googleAds:search"`. v23 is the production bedrock. Walk `v24 → v22 → v20` ONLY on 404. Never v19, v21, v25+ (sunset / never released / unreleased).

MCC (Manager) accounts: add `headers: { "login-customer-id": "{MCC_CUSTOMER_ID}" }` to every call. Detect via `discoveryListAccountsTool` hierarchy or `customer.manager === true`.

### Call 1 — Main GAQL (creatives + metrics + IMAGE_AD URLs in one shot)

```
discoveryRequestTool({
  dataSource: "google_ads_ql",
  connectorId: CONNECTOR_ID,
  request: {
    method: "post",
    url: GOOGLE_BASE_URL,
    json: {
      "query": "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.image_ad.pixel_width, ad_group_ad.ad.image_ad.pixel_height, ad_group_ad.ad.responsive_display_ad.marketing_images, ad_group_ad.ad.video_responsive_ad.videos, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad_strength, ad_group_ad.status, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0 ORDER BY metrics.impressions DESC LIMIT 30"
    }
  }
})
```

### Call 2 — STEP 1G image-ad backfill (MANDATORY, always)

The main query's `metrics.impressions > 0` filter drops IMAGE_ADs with zero delivery that still have stable thumbnails the user expects. Also a context-pressure defense: agents sometimes simplify the long GAQL and drop `image_ad.*` columns.

```
discoveryRequestTool({
  dataSource: "google_ads_ql",
  connectorId: CONNECTOR_ID,
  request: {
    method: "post",
    url: GOOGLE_BASE_URL,
    json: {
      "query": "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.image_ad.pixel_width, ad_group_ad.ad.image_ad.pixel_height, ad_group_ad.status, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS AND ad_group_ad.ad.image_ad.image_url IS NOT NULL ORDER BY metrics.impressions DESC LIMIT 50"
    }
  }
})
```

**Merge at SKILL.md § 7a:**
1. Build `Set<ad.id>` from Call 1 results.
2. For each backfill row:
   - `ad.id` in set → **patch** CreativeItem (`thumbnail_url`, `thumbnail_type="image"`); do NOT overwrite metrics.
   - else → **upsert** CreativeItem with `creative_type="IMAGE"`, the imageUrl as thumbnail, metrics from backfill (zero impressions allowed; bucketed `unknown` in § 7b).
3. Cap merged total at 50 by impressions DESC.

### Call 3 — IMAGE Asset API (MANDATORY when ≥1 RESPONSIVE_DISPLAY_AD, DISPLAY_UPLOAD_AD, or APP_AD)

Main GAQL returns `marketingImages[].asset` (and App-ad `images[].asset` from Call 3b) as resource names (`customers/{cid}/assets/{asset_id}`), not URLs. This call resolves them. Pass its `results[]` to `normalize.mjs` as `asset_api`; the script matches asset ids and sets `thumbnail_url = asset.imageAsset.fullSize.url` for both Responsive Display AND App ads.

```
discoveryRequestTool({
  dataSource: "google_ads_ql",
  connectorId: CONNECTOR_ID,
  request: {
    method: "post",
    url: GOOGLE_BASE_URL,
    json: {
      "query": "SELECT asset.id, asset.name, asset.type, asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels FROM asset WHERE asset.type = 'IMAGE' LIMIT 50"
    }
  }
})
```

Skip only when Call 1 + Call 2 returned zero RESPONSIVE_DISPLAY_AD / DISPLAY_UPLOAD_AD / APP_AD rows.

### Call 3b — APP_AD image backfill (MANDATORY when ≥1 APP_AD)

App-campaign ads auto-generate from campaign-level assets, so the main GAQL row carries no image. This isolated call fetches their image asset refs. Keep it SEPARATE from Call 1: if `app_ad.images` is unsupported on an account it fails alone, never the main creatives+metrics query. Pass its `results[]` to `normalize.mjs` as `app_ad_gaql`; the script resolves each ref against the Call 3 IMAGE map.

```
discoveryRequestTool({
  dataSource: "google_ads_ql",
  connectorId: CONNECTOR_ID,
  request: {
    method: "post",
    url: GOOGLE_BASE_URL,
    json: {
      "query": "SELECT ad_group_ad.ad.id, ad_group_ad.ad.app_ad.images FROM ad_group_ad WHERE ad_group_ad.ad.type = 'APP_AD'"
    }
  }
})
```

If this call errors (field unsupported on the account), skip it — App ads stay as placeholders and nothing else is affected.

### Extract (Call 1 → CreativeItem)

- `adGroupAd.ad.imageAd.imageUrl` → `thumbnail_url` for IMAGE_AD (direct).
- `adGroupAd.ad.responsiveDisplayAd.marketingImages[].asset` → asset resource name (resolve via Asset API).
- `adGroupAd.ad.responsiveSearchAd.headlines[].text` / `.descriptions[].text` → `text_preview` (RSA text card).
- `metrics.costMicros / 1_000_000` → `spend` (dollars).
- `metrics.ctr * 100` → `ctr` (Google returns a fraction; CreativeItem expects a percent).
- `metrics.impressions` / `metrics.clicks` come back as strings — convert to number.
- `adGroupAd.adStrength` → `ad_strength` (RSA / RD only).
- `adGroupAd.status` `ENABLED`/`PAUSED`/`REMOVED` → ACTIVE / PAUSED / OTHER.

### Call 4 — YouTube Asset API (MANDATORY when ≥1 VIDEO_RESPONSIVE_AD)

The main GAQL returns `ad.video_responsive_ad.videos[].asset` as **resource names** (`customers/{cid}/assets/{video_asset_id}`), not URLs. Run ONE batched call (covers all video assets in the account) and pass its `results[]` to `normalize.mjs` as `video_asset_api`:

```
discoveryRequestTool({
  dataSource: "google_ads_ql",
  connectorId: CONNECTOR_ID,
  request: {
    method: "post",
    url: GOOGLE_BASE_URL,
    json: {
      "query": "SELECT asset.id, asset.youtube_video_asset.youtube_video_id, asset.youtube_video_asset.youtube_video_title FROM asset WHERE asset.type = 'YOUTUBE_VIDEO'"
    }
  }
})
```

`normalize.mjs` handles each VIDEO_RESPONSIVE_AD deterministically — no manual field-setting by the agent:
1. Matches the video asset id → `youtube_video_id`.
2. `video_url = "https://www.youtube.com/embed/{id}"` (iframe target — NEVER mirrored).
3. Derives the poster `https://img.youtube.com/vi/{id}/hqdefault.jpg`, which DOES enter the § 7c mirror queue and becomes the S3 `thumbnail_url`; sets `thumbnail_type = "video"`.
4. If no `youtube_video_id` resolves, falls back to a `"Video Ad: {name}"` text card.

The gallery then renders the mirrored poster + a play overlay that opens the video on YouTube in a new tab. Just run the call and pass `video_asset_api`.

### Ad-type media-source map

| `ad.type` | Thumbnail source | Needs Asset API? |
|---|---|---|
| `IMAGE_AD` | `imageAd.imageUrl` | No |
| `RESPONSIVE_DISPLAY_AD` | Asset API `fullSize.url` | Yes (Call 3) |
| `DISPLAY_UPLOAD_AD` | Asset API `fullSize.url` | Yes (Call 3) |
| `RESPONSIVE_SEARCH_AD` | None (text card via `text_preview`) | No |
| `VIDEO_RESPONSIVE_AD` | YouTube poster `img.youtube.com/vi/{id}/hqdefault.jpg` (mirrored) + `video_url = youtube.com/embed/{id}` | Yes (Call 4) |
| `APP_AD` | Asset API `fullSize.url` via `app_ad.images` | Yes (Call 3 + Call 3b) |

### Don't

- ❌ **Probe v19/v21/v25+** — guaranteed 404.
- ❌ **Pass YouTube embed URLs to the § 7c mirror** — iframe targets, not downloadable files. `normalize.mjs` keeps the embed URL in `video_url` and mirrors only the derived `img.youtube.com` poster.
- ❌ **Skip STEP 1G** even when Call 1 returned image ads — the backfill catches the zero-impressions case and patches simplified-query rows.
- ❌ **Add `app_ad.images` to the Call 1 main GAQL.** Keep it in the isolated Call 3b so an unsupported field can't fail the whole creatives+metrics query.

---

## 3. Pinterest

**dataSource:** `pinterest_ads` · **Stable id:** `pin_id`

### Call 1 — Ads
```
discoveryRequestTool({
  dataSource: "pinterest_ads",
  connectorId: CONNECTOR_ID,
  request: { method: "get", url: "https://api.pinterest.com/v5/ad_accounts/{AD_ACCOUNT_ID}/ads", params: { "page_size": "25" } }
})
```

### Call 2 — Pin details (MANDATORY when ≥1 unique pin_id; cap 10)

For each UNIQUE `pin_id` from Call 1, capped at 10:
```
discoveryRequestTool({
  dataSource: "pinterest_ads",
  connectorId: CONNECTOR_ID,
  request: { method: "get", url: "https://api.pinterest.com/v5/pins/{PIN_ID}" }
})
```

If >10 unique pins, take top-10 by ad order; remaining ads get `thumbnail_type="placeholder"`.

### Call 3 — Analytics
```
discoveryRequestTool({
  dataSource: "pinterest_ads",
  connectorId: CONNECTOR_ID,
  request: {
    method: "get",
    url: "https://api.pinterest.com/v5/ad_accounts/{AD_ACCOUNT_ID}/ads/analytics",
    params: {
      "start_date":  "{30_DAYS_AGO_YYYY-MM-DD}",
      "end_date":    "{TODAY_YYYY-MM-DD}",
      "ad_ids":      "{comma_separated_ad_ids}",
      "columns":     "IMPRESSION,CLICKTHROUGH,SPEND_IN_DOLLAR,CTR",
      "granularity": "TOTAL"
    }
  }
})
```

If analytics returns an error (restrictive permissions) → show creatives without metrics.

### Extract

- Call 1 `items[].id`/`.name`/`.status`/`.pin_id`/`.campaign_id` → CreativeItem fields.
- Call 2 `media.images["1200x"].url` (or `["600x"]` fallback) → `thumbnail_url`.
- Video pins: `media.images["1200x"].url` is the poster (mirror it); `videos["V_HLSV4"]` is the playable file (DO NOT mirror — exceeds 50 MB cap).
- Call 3 analytics array `{ad_id, IMPRESSION, CLICKTHROUGH, SPEND_IN_DOLLAR, CTR}` → metrics fields.

---

## 4. TikTok

**dataSource:** `tiktok_ads` · **Stable id:** `image_id` (image ad) / `video_id` (video)

### Resolving `{ADVERTISER_ID}` (prerequisite for every call)

`discoveryListAccountsTool({ connection_id: "{TIKTOK_CONNECTOR_ID}", is_active: true })` → set `ADVERTISER_ID = data.accounts[0].id` (or merge multiple). If `total_count: 0` and connector `update_time` > 90s → skip TikTok with the SKILL.md § 5 chat note. If `update_time` within 90s, wait 10s and retry once.

### Call 1 — Ads (metadata)
```
discoveryRequestTool({
  dataSource: "tiktok_ads",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://business-api.tiktok.com/open_api/v1.3/ad/get/",
    params: {
      "advertiser_id": "{ADVERTISER_ID}",
      "page_size":     "50",
      "fields":        "[\"ad_id\",\"ad_name\",\"operation_status\",\"ad_format\",\"video_id\",\"image_ids\",\"profile_image_url\",\"campaign_name\",\"adgroup_name\",\"landing_page_url\"]"
    }
  }
})
```

### Call 2 — Reporting (ONE batch call, NEVER per-ad)
```
discoveryRequestTool({
  dataSource: "tiktok_ads",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
    params: {
      "advertiser_id": "{ADVERTISER_ID}",
      "report_type":   "BASIC",
      "data_level":    "AUCTION_AD",
      "dimensions":    "[\"ad_id\"]",
      "metrics":       "[\"impressions\",\"clicks\",\"ctr\",\"spend\"]",
      "start_date":    "{30_DAYS_AGO_YYYY-MM-DD}",
      "end_date":      "{TODAY_YYYY-MM-DD}",
      "page_size":     "50"
    }
  }
})
```

### Call 3 — Video posters (MANDATORY when ≥1 video_id in Call 1)

Without this, every video card shows `profile_image_url` (brand logo). Batch up to 50 video_ids per call:

```
discoveryRequestTool({
  dataSource: "tiktok_ads",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/get/",
    params: { "advertiser_id": "{ADVERTISER_ID}", "video_ids": "[{comma_separated_video_ids}]" }
  }
})
```

Match by `video_id`; set `thumbnail_url = data.list[].poster_url` (fall back to `video_cover_url` if absent). Source TTL ~24h; § 7c mirrors immediately.

### Call 4 — Image-ad thumbnails (MANDATORY when ≥1 image_ids[] in Call 1)

Without this, every image card shows `profile_image_url` (brand logo). For each ad with non-empty `image_ids[]`, pick `image_ids[0]` (canonical for SINGLE_IMAGE; CAROUSEL exposes all). Batch up to 50:

```
discoveryRequestTool({
  dataSource: "tiktok_ads",
  connectorId: CONNECTOR_ID,
  hasLimit: false,
  request: {
    method: "get",
    url: "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/",
    params: { "advertiser_id": "{ADVERTISER_ID}", "image_ids": "[{comma_separated_image_ids}]" }
  }
})
```

Match by `image_id`; set `thumbnail_url = data.list[].image_url`.

### Extract (joins)

- Call 1 ↔ Call 2: join by `ad_id`.
- Call 1 ↔ Call 3: join by `video_id` (multiple ads can share one `video_id` — set the same thumbnail on each).
- Call 1 ↔ Call 4: join by `image_id` (same reuse pattern).

### Thumbnail priority

| Condition | Source |
|---|---|
| video ad + Call 3 success | `poster_url` (real creative) |
| video ad + Call 3 missing | `profile_image_url` (brand logo fallback) |
| image ad + Call 4 success | `image_url` (real creative) |
| image ad + Call 4 missing | `profile_image_url` (brand logo fallback) |
| no `video_id` AND no `image_ids` | `thumbnail_type="placeholder"` |

### Don't

- ❌ **Invent placeholder credentials** (`app_id:"1"`, `secret:"1"`) to probe TikTok directly — proxy returns garbage.
- ❌ **Fan out reporting per-ad.** The 10/min reporting rate limit will throttle you immediately. Call 2 batches all ads.

---

## 5. LinkedIn

**dataSource:** `linkedin_ads` · **Stable id:** `creative_id` · **Use `/v2/` endpoints, NEVER `/rest/`** (404s without `LinkedIn-Version` header).

### Call 1 — Creatives
```
discoveryRequestTool({
  dataSource: "linkedin_ads",
  connectorId: CONNECTOR_ID,
  request: {
    method: "get",
    url: "https://api.linkedin.com/v2/adCreativesV2",
    params: { "q": "search", "search.account.values[0]": "urn:li:sponsoredAccount:{ACCOUNT_ID}", "count": "50" }
  }
})
```

### Call 2 — Analytics (ONE call per account, NEVER per-creative)
```
discoveryRequestTool({
  dataSource: "linkedin_ads",
  connectorId: CONNECTOR_ID,
  request: {
    method: "get",
    url: "https://api.linkedin.com/v2/adAnalyticsV2",
    params: {
      "q": "analytics",
      "pivot": "CREATIVE",
      "dateRange.start.day":   "{START_DAY}",
      "dateRange.start.month": "{START_MONTH}",
      "dateRange.start.year":  "{START_YEAR}",
      "dateRange.end.day":     "{END_DAY}",
      "dateRange.end.month":   "{END_MONTH}",
      "dateRange.end.year":    "{END_YEAR}",
      "timeGranularity": "ALL",
      "accounts[0]": "urn:li:sponsoredAccount:{ACCOUNT_ID}",
      "fields": "impressions,clicks,costInLocalCurrency"
    }
  }
})
```

### Extract — Creatives

- `elements[].id` → `creative_id` / `stable_id`.
- `elements[].type` ∈ `TEXT_AD` / `SPONSORED_STATUS_UPDATE` / `SPOTLIGHT_V2`.
- TEXT_AD: `variables.data["com.linkedin.ads.TextAdCreativeVariables"].title` / `.text` / `.vectorImage` / `.clickUri`.
- SPONSORED_STATUS_UPDATE: `variables.data["com.linkedin.ads.SponsoredUpdateCreativeVariables"].reference` (share URN — resolving image needs 3+ extra calls; render as text_preview "Sponsored post").
- SPOTLIGHT_V2: `variables.data["com.linkedin.ads.SpotlightV2CreativeVariables"].headline` / `.description` / `.ctaLabel` / `.clickUri` / `.logo`.

### Extract — Analytics

- `elements[].pivotValue` = `"urn:li:sponsoredCreative:{ID}"`. Extract `{ID}`, match to creatives.
- `elements[].impressions` / `.clicks` / `.costInLocalCurrency` → metrics fields.

### Image strategy by creative type

| Type | Image source | Notes |
|---|---|---|
| TEXT_AD | `vectorImage` | Usually a tiny icon — render as text_preview card. |
| SPONSORED_STATUS_UPDATE (single image) | Share URN → 3+ resolution calls | Skip individual fetches; render as text_preview. |
| SPONSORED_STATUS_UPDATE (carousel) | Multiple share URNs | Skip; render as text_preview "Carousel Ad — {N} cards". |
| SPOTLIGHT_V2 | `logo` URN | Small logo only; render at thumbnail size. |
| Any (best fallback) | ClickHouse `entity_creatives_*_linkedin_ads_all_data.image_url` | If available, pre-resolved direct `media.licdn.com` URLs — pass to § 7c mirror. |

If ClickHouse isn't available → text-heavy gallery (acceptable; LinkedIn is text-dominant).

### Don't

- ❌ **`/rest/*` endpoints.** Need `LinkedIn-Version` header; frequently 404. Use `/v2/`.
- ❌ **Fan out analytics per-creative.** 100/day cap. Call 2 batches CREATIVE pivot.

---

## 6. Google Ads Deep Dive (OPT-IN — only when user asks for RSA / Quality Score / Variants)

These queries don't feed the dashboard. Run only when the user specifically asks. Same call shape as § 2.

### RSA asset performance
```
SELECT ad_group_ad_asset_view.field_type, ad_group_ad_asset_view.performance_label, asset.text_asset.text, asset.type, metrics.impressions, metrics.clicks FROM ad_group_ad_asset_view WHERE segments.date DURING LAST_30_DAYS AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION') AND metrics.impressions > 0 ORDER BY metrics.impressions DESC LIMIT 30
```

### Quality Score
```
SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, campaign.name, metrics.impressions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0 ORDER BY metrics.impressions DESC LIMIT 20
```

### Ad variant comparison
```
SELECT ad_group.id, ad_group.name, campaign.name, ad_group_ad.ad.id, ad_group_ad.ad_strength, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status = 'ENABLED' AND metrics.impressions > 0 ORDER BY ad_group.id, metrics.impressions DESC LIMIT 50
```
