---
name: weekly-creative-performance
description: |
  Build a Creative Performance Dashboard with creative thumbnails, per-creative
  performance metrics, fatigue segments, and Discovery API data. Use for weekly
  creative performance reports, creative galleries, and creative fatigue analysis
  across Google Ads, Facebook, LinkedIn, TikTok, and Pinterest.
version: "8.9.0"
---

# weekly-creative-performance

## 1. Invariants (read first; non-negotiable)

1. **Mirror gate.** Every `thumbnail_url` on a gallery `CreativeItem` with `thumbnail_type ∈ {"image","video"}` MUST be the `response.download_url` from `discoveryFileDownloadTool` (host: `amazonaws.com`). Do NOT rewrite it into a serve URL (`/experimental/agent/api/files/serve?path=…`) — BIE renders the widget inside a sandboxed `srcdoc` iframe with no session cookies, so serve URLs silently 401 at view time. Lint rules L19 + L22 enforce. On mirror failure → `thumbnail_url=null`; an `image` becomes `thumbnail_type="placeholder"`, a `video` keeps `thumbnail_type="video"` (poster-less play overlay + deep-link). NO retry; NEVER re-embed the raw CDN URL. (`normalize.mjs --apply-mirrors` does this automatically — the agent doesn't.)
2. **Mode B durability.** Mode B always produces a dashboard. The only mid-flow stops are: (a) zero platforms connected, (b) all platforms failed. Mirror failures, partial coverage, large accounts → still ship a dashboard (placeholders fill gaps).
3. **No mid-flow questions.** Auto-resolve every ambiguity. Multiple accounts → merge silently. Revoked connector → skip platform with the chat-note format below. Refinements ("re-scope to account X") go in post-dashboard next-actions, never as pre-run prompts.
4. **D6 watchdog.** Once lint returns `{pass:true}`, the very next action is the BIE save Skill call. Do not narrate, re-read, or plan in between. On accidental detour, emit `Save aborted before BIE dispatch — internal contract violation. Please retry the skill.` and stop.
5. **Dashboard TTL = ~12h.** S3 presigned URLs (the only URL form the iframe accepts) expire after 12 hours. The dashboard's thumbnails go dead after that. Mention this in the closing summary; there is no skill-side workaround.

## 2. Trigger

User typed any of:
- "creative performance" / "creative report" / "creative dashboard" / "creative gallery"
- "show me my creatives" / "ad creatives" / "best ads" / "worst ads"
- "weekly creative report" / "ad performance report"
- "which creatives are dying" / "creative fatigue" / "RSA / quality score"
- Anything combining creative visuals + performance metrics.

OR the ALG `onboarding_summary` names this skill (see § 4).

## 3. Mode selection

| Signal (check in this order; first match wins) | Mode |
|---|---|
| ALG dispatch — `onboarding_summary` contains `Weekly Creatives Analysis` / `startingSkillId: "weekly-creatives-analysis"` | B (mandatory) |
| User's typed message contains literal `document` / `markdown` / `deck` / `report me` / `as a report` (case-insensitive, in their OWN message, not in Q&A recap) | A |
| User's typed message contains `chart` or `visualize` | C |
| `/business-intelligence-editor` skill unavailable at runtime | A (with explicit note `Saved as a document — dashboard skill not available right now.`) |
| Default | B |

Before any tool call, emit ONE log line:
```
Selected Mode {X} ({reason}).
```
Examples: `Selected Mode B (Dashboard) — Path A dispatch.` / `Selected Mode A (Document) — explicit keyword "report me" in user message.`

| Mode | Action | Skip steps |
|---|---|---|
| B | Run §§ 5–8 end-to-end | none |
| A | Build markdown report via `createDocument` | skip § 7c–7f and § 8 (see § 12 Mode A skeleton) |
| C | Single chart via `visualizationTool` | skip §§ 6–8 |

## 4. ALG dispatch (Path A)

Source the run config from whichever is present:

| Source | Where | What to extract |
|---|---|---|
| ```` ```alg-prebrief ``` ```` fenced block | dispatch message | `live_platforms` (probe only these in § 5, not all 5), `bias_signals` (apply table below), `template_path` (skip the template Read in § 5) |
| `company_research` field (inside the `alg-prebrief` block) | dispatch message | Optional one-line company context from the onboarding prefetch. If present, tailor exactly ONE headline/intro line to this company, always hedged ("looks like…"), never as a fact; if absent, proceed generically. |
| `onboarding_summary` message | conversation history | `Starting point chosen: …`, `Interview answers:` block (parse for the same bias signals) |

**Bias signal → tuning default:**

| Signal | Default override |
|---|---|
| `role` = `marketer` / `performance-marketer` | `DEFAULT_OPEN_SEGMENT="fatiguing"`, `DEFAULT_VIEW_MODE="grid"` |
| `role` = `analyst-bi` | `DEFAULT_VIEW_MODE="table"` |
| `role` = `cmo-director` | lead the closing summary with `health_score` + `spend_at_risk` |
| `ai_wish` contains `fatigue` / `dying` / `refresh` / `worn out` | `DEFAULT_OPEN_SEGMENT="dead"` |
| `reconciled_metrics` includes `ROAS` or `CPA` | surface those columns in the Gallery table view |

## 5. STEP 1 — Find platforms and accounts

**Before firing anything in STEP 1, run the § 13a resume check** — if `.context/wcp-state.json` exists, is fresh (≤30 min), and parses, you may be able to skip STEP 1 and/or STEP 2 entirely. Decision tree:

| `wcp-state.json` state | Skip to |
|---|---|
| MISSING / stale / wrong-scope (§ 13d) / parse error | continue with STEP 1 below |
| Fresh + `step:"ready_for_fetch"` | restore connectors + accounts; jump to § 6 STEP 2 |
| Fresh + `step:"ready_for_mirror"` + `creative_items[]` non-empty | restore everything; jump to § 7c (mirror) |

If you can skip, also **skip the user-facing progress messages** the prior run already emitted ("Checking…" / "Pulling…"). Otherwise:

Single parallel batch (one tool-call block):

1. `ToolSearch({ query: "select:Read,Bash,Skill,mcp__improvado__discoveryListConnectorsTool,mcp__improvado__discoveryListAccountsTool,mcp__improvado__discoveryRequestTool,mcp__improvado__discoveryFileDownloadTool", max_results: 8 })`
2. Emit chat text: `Checking your connected platforms…`
3. `discoveryListConnectorsTool({ dataSource: "<alias>" })` × N — N = `len(live_platforms)` if prebrief present, else 5 (all platforms below).

### dataSource aliases (EXACT — never guess)

| Platform | `dataSource` | Wrong names (do NOT use) |
|---|---|---|
| Facebook | `facebook` | `facebook_ads`, `meta` |
| Google Ads | `google_ads_ql` | `google_ads`, `adwords` |
| LinkedIn | `linkedin_ads` | `linkedin` |
| TikTok | `tiktok_ads` | `tiktok` |
| Pinterest | `pinterest_ads` | `pinterest` |

### Per-platform: pick a working connector, resolve accounts

For each platform in `PLATFORMS`:

1. **Connector retry.** Iterate `discoveryListConnectorsTool` results in order. Skip any with `status ∈ {auth_error, expired, revoked}`. Use the first one that responds 2xx to a probe (the platform's Call 1 in PLATFORMS.md serves as the probe). If all connectors fail for a platform, skip the platform and emit:
   ```
   {Platform} — couldn't fetch ads ({short reason}). Running with {remaining} only. You may want to re-authorize the connector in Improvado settings.
   ```
2. **List accounts.** `discoveryListAccountsTool({ connection_id: <CONNECTOR_ID>, is_active: true })`.
3. **Pre-filter.** Drop accounts where `orders_count === 0` OR `orders_count_by_status.data_synced === 0` — these will return `{"data": []}` from the platform API and waste a fetch call.
4. **Merge remaining accounts silently.** Stamp every CreativeItem at § 7a with `account_name` + `source_connector_id` (drives § 7c's per-URL `connectionId`).

### Fresh-connector sync lag

If `total_count === 0` AND the connector's `update_time` is within the last 90s → wait 10s, retry `discoveryListAccountsTool` ONCE with the same `is_active: true`. If still 0, skip the platform.

### Anti-patterns (do NOT)

- Retry `discoveryListAccountsTool` without the `is_active` filter — same backend result, wasted call.
- Loop with backoff beyond the one sanctioned retry — sync lag doesn't resolve at sub-minute scale.
- Invent placeholder credentials (`app_id:"1"`, `secret:"1"`) to probe a platform directly — the proxy returns garbage and burns calls.

### Google Ads version

Default base URL: `https://googleads.googleapis.com/v23/customers/{CUSTOMER_ID}/googleAds:search`. v23 is the production bedrock. Only on a 404 walk `v24 → v22 → v20`. **FORBIDDEN versions:** v19 and below (sunset), v21 (never released), v25+ (unreleased) — guaranteed 404, wasted call.

MCC (Manager) accounts: add header `login-customer-id: {MCC_CUSTOMER_ID}` to every Google call. Detect via `discoveryListAccountsTool` returning a hierarchy or `customer.manager === true`.

### Stop condition

`PLATFORMS` is empty after retry / pre-filter → emit `Weekly Creatives needs an ad platform connected — connect Google Ads or Facebook and I'll run it.` and stop.

### Checkpoint after STEP 1

After STEP 1 settles, write a state-stash file so the run can resume after a context compaction (see § 13). One Bash:

```bash
cat > .context/wcp-state.json <<'EOF'
{
  "version": "8.3.0",
  "ts": "<ISO-8601 now>",
  "step": "ready_for_fetch",
  "platforms": ["facebook","google_ads"],
  "connectors_by_platform": {
    "facebook":   { "connector_id": 14082, "accounts": [{"account_id":"act_1211478595627548","name":"Improvado.io"}] },
    "google_ads": { "connector_id": 1985,  "customer_id": "9521562011" }
  },
  "google_api_version": "v23"
}
EOF
```

If `.context/` doesn't exist yet, `mkdir -p .context` first. Cheap (~0.1 KB write); preempts ~10-15 wasted calls on resume.

## 6. STEP 2 — Fetch creatives + performance

Emit chat text: `Pulling creatives from {platforms}…`

**Read `PLATFORMS.md`** — the skip-guide at its top routes you to the per-platform sections for `PLATFORMS` plus § "How `discoveryRequestTool` returns — READ FIRST" (Discovery responses are markdown-wrapped, not raw JSON; § documents the exact extraction patterns).

Fire all platforms' Call 1 (metadata) in ONE parallel batch. Fire all platforms' Call 2 (analytics) + secondary calls in a SECOND parallel batch.

### Mandatory call attributes (every Discovery call)

- `hasLimit: false` — defeats the proxy's 32 KB silent truncation that drops tail rows + their `image_url` values.
- Facebook `/adcreatives`: paginate fully via `data.paging.cursors.after`, hard-capped at 200 creatives total (4 pages × limit=50). Each page also sets `hasLimit: false`.
- Google GAQL: every query includes `ad_group_ad.ad.image_ad.image_url` so IMAGE_AD thumbnails come back in the main result.
- TikTok analytics: ONE batch `/report/integrated/get/` per advertiser, NEVER per-ad (10/min reporting rate limit).
- LinkedIn analytics: ONE `/v2/adAnalyticsV2` for the whole account, NEVER per-creative (100/day cap).

### Secondary calls — MANDATORY when trigger fires

| Platform | Trigger | Call | Why mandatory |
|---|---|---|---|
| Google Ads | Always | STEP 1G image-ad backfill (PLATFORMS § Google Ads § STEP 1G) | Patches image ads excluded by `metrics.impressions > 0` filter on main query. |
| Google Ads | Any RESPONSIVE_DISPLAY_AD, DISPLAY_UPLOAD_AD, or APP_AD | IMAGE Asset API (PLATFORMS § Google Ads § Call 3) → pass as `asset_api` | Main GAQL returns asset resource names only; the script needs the Asset API URLs to resolve them. |
| Google Ads | Any APP_AD | Isolated APP_AD image backfill (PLATFORMS § Google Ads § Call 3b) → pass as `app_ad_gaql` | App ads carry no image on the main row; this fetches their image asset refs (kept isolated so an unsupported field can't fail the main query). |
| Google Ads | Any VIDEO_RESPONSIVE_AD | YouTube Asset API (PLATFORMS § Google Ads § Call 4) → pass as `video_asset_api` | `normalize.mjs` derives the `youtube.com/embed/…` URL + the mirrored `img.youtube.com` poster from the YouTube id. |
| **Facebook** | **Any `/insights[].ad_id` is NOT in the set of `hsa_ad` values parsed from `/adcreatives.url_tags`** | **`/ads?filtering=[{"field":"id","operator":"IN","value":[ad_ids]}]&fields=id,name,creative{...}` (PLATFORMS § Facebook § DPA fallback). The `filtering=…` shape is the ONLY one that works through the Improvado proxy — `params.ids=` returns `Invalid token` on the account-scoped endpoint and triggers a URL-encoding bug on the root endpoint. On `Invalid token`, retry with each alternate connector that listed the same account. If all connectors fail, stamp ads as placeholders and let § 7c Visual coverage swap in image-bearing creatives.** | **DPA / Advantage+ Shopping / Advantage+ Creative campaigns don't carry `hsa_ad=` in `url_tags`. Without this fallback, ALL metrics-bearing ads on such accounts go to the gallery as `unknown` fatigue with no thumbnails — even when they're the top performers (observed 2026-05-27 morning: 35 DPA ads with ~26K impressions ZERO joinable via hsa_ad; 2026-05-27 evening: broken `ids=` recipe in v8.3.0 left the gallery with zero images).** |
| Pinterest | Any `pin_id` in Call 1 | `/v5/pins/{id}` per unique pin, capped 10 | Main `/ads` returns pin IDs; needs `/pins/{id}` to discover the image URL. |
| TikTok | Any `video_id` in Call 1 | `/file/video/ad/get/` (batch up to 50) | Without it, every video ad renders the brand logo (`profile_image_url`) — useless. |
| TikTok | Any `image_ids[]` in Call 1 | `/file/image/ad/info/` (batch up to 50) | Same brand-logo fallback applies; this returns the real creative `image_url`. |

### Secondary calls — DROPPED (do NOT make)

| Call | Why dropped |
|---|---|
| Facebook `/adimages?hashes=…` | Broken on v23 (`(#100) Tried accessing nonexisting field (url_256)`). STEP 3d mirrors the signed `image_url` directly within seconds, so the 4-8h source TTL is irrelevant. |
| Facebook `/videos/{id}` (and batch `/?ids=…`) | 10/10 permission errors observed (`(#10) Application does not have permission for this action`). Facebook video creatives fall back to the 64×64 `thumbnail_url` from `/adcreatives` — small but real per-creative posters, mirrored to S3. |

### Per-platform failure

Empty `data: []` for all of a platform's accounts, or 5xx after one retry → skip the platform with the chat note from § 5. **Never** fail the whole run because one platform is down.

YouTube embed URLs (`youtube.com/embed/…`, `youtu.be/…`, `youtube.com/watch?v=…`) for Google `VIDEO_RESPONSIVE_AD` are produced by `normalize.mjs` from the Call 4 YouTube Asset API results: it stores the embed URL in `CreativeItem.video_url` (**never mirrored** — iframe target) and mirrors the derived `img.youtube.com/vi/{id}/hqdefault.jpg` poster into `thumbnail_url`. The gallery shows the poster + a play overlay that opens the video on YouTube.

### Stop condition

All platforms failed → emit `Couldn't reach any of your ad platforms — check connector auth in Improvado settings and ping me to retry.` and stop.

## 7. STEP 3 — Build, mirror, lint

### 7a. Normalize via `scripts/normalize.mjs` (do NOT write your own Python/JS for this)

**Do not write custom normalization code.** The skill ships `scripts/normalize.mjs` — pipe ALL the raw per-platform Discovery API payloads (already extracted from the markdown wrapper per PLATFORMS § "How discoveryRequestTool returns") into the script. It returns the normalized `CreativeItem[]` sorted by impressions DESC + the fatigue aggregates. One Bash invocation; no thinking required.

```bash
cat <<'EOF' | node main/context/skills/weekly-creative-performance/scripts/normalize.mjs > /tmp/wcp-norm.json
{
  "now_iso": "2026-05-28T00:00:00Z",
  "facebook": {
    "<connector_id>": {
      "<account_id>": {
        "adcreatives": [ /* extracted .data[] from /adcreatives, ALL pages merged */ ],
        "insights":    [ /* extracted .data[] from /insights */ ],
        "ads_fallback":[ /* extracted .data[] from /ads?filtering=[...] when DPA fallback fired; [] otherwise */ ]
      }
    }
  },
  "google_ads": {
    "<connector_id>": {
      "<customer_id>": {
        "main_gaql":       [ /* extracted results[] from main GAQL */ ],
        "backfill_gaql":   [ /* extracted results[] from STEP 1G */ ],
        "asset_api":       [ /* extracted results[] from Call 3 IMAGE Asset API; [] if no RESPONSIVE_DISPLAY / APP_AD */ ],
        "video_asset_api": [ /* extracted results[] from Call 4 YouTube Asset API; [] if no VIDEO_RESPONSIVE_AD */ ],
        "app_ad_gaql":     [ /* extracted results[] from Call 3b APP_AD backfill; [] if no APP_AD */ ]
      }
    }
  }
}
EOF
```

Output (stdout JSON, also written to `/tmp/wcp-norm.json` above):

```json
{
  "creative_items": [ ...full normalized CreativeItem[] sorted (is_mirrorable DESC, impressions DESC),
                      fatigue computed, each item carries `mirror_priority: 1..35` (in queue) or `null` (out)... ],
  "mirror_queue":   [ { "id": "g_123",
                        "dataSource": "google_ads_ql",
                        "connectionId": 1985,
                        "url": "<raw CDN URL — verbatim from the platform>",
                        "fileName": "creative_google_ads_<stable_id>.jpg" },
                      /* ...up to 35 entries, in mirror priority order... */ ],
  "totals": { "total": 47, "fresh": 8, "healthy": 12, "fatiguing": 15, "dead": 12, "unknown": 18,
              "health_score": 53, "health_score_color": "#c47d4a",
              "spend_at_risk": 1247.23, "spend_at_risk_str": "$1.2K" },
  "platforms_present": [ "facebook", "google_ads" ],
  "types_present":     [ "IMAGE", "RSA", "RESPONSIVE_DISPLAY", "VIDEO" ]
}
```

The script handles ALL of: hsa_ad parsing + join, DPA / Advantage+ fallback merge via `/ads?filtering`, STEP 1G backfill merge, Asset API URL resolution (Responsive Display + App ads), YouTube `video_url` + mirrored-poster derivation for VIDEO_RESPONSIVE_AD, RSA `text_preview` extraction, fatigue bucketing (CTR thresholds), aggregate totals (health_score, spend_at_risk_str), per-platform palette / letter / full-name lookup, **AND** the § 7c mirror-priority sort + 35-cap + queue emission. **The agent does NOT compute any of this.** Read the output JSON; it's the input to § 7b's (now mechanical) lookup + § 7c's (now mechanical) mirror dispatch.

LinkedIn / TikTok / Pinterest are not yet handled by the script. For those platforms, the agent normalizes inline per PLATFORMS.md and passes the resulting CreativeItems as `input.other_platforms_items` (an array — the script appends them to the FB+Google output before sorting + computing aggregates). Most ALG-dispatched runs are FB+Google only and don't hit this path.

**CreativeItem output schema (for reference only — the script produces this; you don't construct it):**

```
CreativeItem {
  id              string                              // platform-prefixed: "fb_123", "g_456", "tt_789"
  platform        "facebook"|"google_ads"|"linkedin"|"tiktok"|"pinterest"
  platform_color  "#hex"                              // see palette table below
  platform_full   string                              // "Facebook"
  platform_letter string                              // "FB"
  name            string                              // truncate-friendly display name
  full_name       string                              // hover title; falls back to name (NEVER null)
  status          "ACTIVE"|"PAUSED"|"OTHER"

  // Media — Gallery renders by thumbnail_type:
  //   "image"        → <img src=thumbnail_url>                (must be amazonaws.com after STEP 3c)
  //   "video"        → poster <img src=thumbnail_url> + play overlay; a YouTube
  //                    video_url opens in a new tab, a direct-file video_url plays
  //                    on hover. thumbnail_url = mirrored S3 poster OR null.
  //   "text_preview" → text card with headline + CTA
  //   "placeholder"  → icon + ad type
  thumbnail_url    string|null                        // S3 presigned URL after STEP 3c; null = placeholder (or posterless video)
  thumbnail_type   "image"|"video"|"text_preview"|"placeholder"
  video_url        string|null                        // platform URL (e.g. youtube.com/embed/…) — NOT mirrored. Set for thumbnail_type==="video"
  video_duration   string|null                        // "M:SS"
  text_preview     string|null                        // headline text for RSAs / TEXT_AD
  permalink_url    string|null                        // platform deep link; gallery uses it as the video fallback link

  // Routing for STEP 3c
  source_connector_id  number                         // stamped at § 5; drives discoveryFileDownloadTool.connectionId
  stable_id            string                         // dedup key — see table below

  // Performance (null if not delivered in period)
  impressions      number|null
  clicks           number|null
  ctr              number|null                        // PERCENTAGE (1.5, not 0.015)
  spend            number|null
  conversions      number|null

  // Classification + Google-specific
  creative_type    "IMAGE"|"VIDEO"|"CAROUSEL"|"TEXT"|"RSA"|"RESPONSIVE_DISPLAY"|"OTHER"
  ad_format        string|null
  ad_strength      "EXCELLENT"|"GOOD"|"AVERAGE"|"POOR"|null  // Google RSA / RD only

  // Fatigue (computed in § 7b)
  fatigue_segment  "fresh"|"healthy"|"fatiguing"|"dead"|"unknown"
  segment_color    "#hex"
}
```

**Platform palette + stable_id key:**

| Platform | `platform_color` | `platform_letter` | `stable_id` source |
|---|---|---|---|
| Facebook | `#c47d4a` (copper) | `FB` | `image_hash` (image) / `video_id` (video) |
| Google Ads | `#7a9e7e` (sage) | `G` | `asset.id` (Asset API) / `imageAd.id` (IMAGE_AD direct) |
| LinkedIn | `#9b7ea4` (plum) | `LI` | `creative_id` |
| TikTok | `#000000` (black) | `TT` | `image_id` (image ad) / `video_id` (video) |
| Pinterest | `#c4877a` (coral) | `PI` | `pin_id` |

Fallback: `sha1(thumbnail_url)` if no platform stable id is available.

**`creative_type` collapse:**

| Source | → `creative_type` |
|---|---|
| FB image, Google IMAGE_AD, Google DISPLAY_UPLOAD_AD, Pinterest standard, TikTok SINGLE_IMAGE, LinkedIn SPONSORED_STATUS_UPDATE-image, LinkedIn SPOTLIGHT_V2 | `IMAGE` |
| FB video, Google VIDEO_RESPONSIVE_AD, Pinterest video, TikTok SINGLE_VIDEO, LinkedIn SPONSORED_STATUS_UPDATE-video | `VIDEO` |
| FB carousel (`asset_feed_spec` or `child_attachments` present), Pinterest carousel, TikTok CAROUSEL, LinkedIn carousel | `CAROUSEL` |
| Google RESPONSIVE_DISPLAY_AD | `RESPONSIVE_DISPLAY` |
| Google RESPONSIVE_SEARCH_AD | `RSA` |
| LinkedIn TEXT_AD | `TEXT` |
| anything else | `OTHER` |

**`status` collapse:** `ENABLED` / `ENABLE` / `ACTIVE` → `ACTIVE`. `DISABLE` / `PAUSED` → `PAUSED`. Else → `OTHER`.

The above schema + tables are FYI for understanding the output. The script applies all the per-platform extraction nuances (FB url_tags.hsa_ad join + DPA fallback merge + zero-impression backfill, Google STEP 1G merge + Asset API URL resolution + RSA text_preview, status collapse, creative_type collapse, palette lookup, fatigue bucketing, aggregates). PLATFORMS.md has the per-platform recipe details if you ever need to debug a specific edge case — but on a normal run, you don't read those during normalization.

### Checkpoint after § 7a

Write the normalized `CreativeItem[]` to `.context/wcp-state.json` (overwrites the § 5 checkpoint with richer state). One Bash:

```bash
cat > .context/wcp-state.json <<'EOF'
{
  "version": "8.3.0",
  "ts": "<ISO-8601 now>",
  "step": "ready_for_mirror",
  "platforms": ["facebook","google_ads"],
  "connectors_by_platform": { /* same shape as § 5 checkpoint */ },
  "google_api_version": "v23",
  "creative_items": [ /* full normalized CreativeItem[] */ ]
}
EOF
```

A typical 65-creative payload is ~30-80 KB — well within Bash heredoc and `.context/` file-size limits. Enables § 13 resume directly to § 7c without re-running STEP 1, STEP 2, or normalization.

### 7b. Fatigue is already computed (script output)

`scripts/normalize.mjs` (§ 7a) already wrote `fatigue_segment` and `segment_color` onto every CreativeItem AND computed the aggregate `totals` block. **Do not recompute.** Read the output's `totals` field for the fatigue-widget tokens:

- `KPI_DATA_JSON` ← `{ total_count: totals.total, health_score: totals.health_score, health_score_color: totals.health_score_color, spend_at_risk_str: totals.spend_at_risk_str }`
- `SEGMENTS_AGGREGATE_JSON` ← build 4 entries from `totals.{fresh, healthy, fatiguing, dead}` + per-segment averaged CTR/spend (compute inline from `creative_items` filtered by `fatigue_segment` if you need it for the table view — that's a single `reduce` per segment, not a normalization script).
- `SEGMENTS_CREATIVES_JSON` ← group `creative_items` by `fatigue_segment` and take the top-N per segment by impressions (single `groupBy` + `slice`).

The bucketing rules (for FYI; the script enforces them):
```
impressions == null OR impressions < 10 OR ctr == null  →  fatigue_segment="unknown",    segment_color="#9ca3af"
ctr > 2.5                                                →  fatigue_segment="fresh",      segment_color="#7a9e7e"
ctr >= 1.5                                               →  fatigue_segment="healthy",    segment_color="#b8b0a5"
ctr >= 0.5                                               →  fatigue_segment="fatiguing",  segment_color="#c47d4a"
else                                                     →  fatigue_segment="dead",       segment_color="#c4877a"
```

Aggregate over full `CreativeItem[]` (excluding `unknown`):
```
total          = count(non-unknown)
fresh_count, healthy_count, fatiguing_count, dead_count
health_score   = round((fresh_count + healthy_count * 0.7) / total * 100)   // null if total == 0
                 color: >=80 → #7a9e7e, 50-79 → #c47d4a, <50 → #c4877a
spend_at_risk  = sum(c.spend or 0 for c in CreativeItem[] if c.fatigue_segment in {dead, fatiguing})
                 format: "$1.2K" pill string
```

Per-segment insight line (used by Fatigue accordion):
- Fresh: `"{N} creatives at peak — scale winners now."`
- Healthy: `"{N} creatives drifting — review before next week."`
- Fatiguing: `"{N} losing steam — refresh copy or rotate now."`
- Dead: `"{N} burning budget with near-zero engagement — pause."`

### 7c. Mirror images, include EVERY creative in the gallery

Emit chat text: `Saving your dashboard…`

**Do not sort. Do not count. Do not curate.** normalize.mjs's output already has `creative_items` sorted `(is_mirrorable DESC, impressions DESC)` and a ready-to-dispatch `mirror_queue[]` (the top 35 mirrorable items, dedup'd by `(thumbnail_url, stable_id)`, with per-item `mirror_priority` 1..35). Items beyond the cap or without a mirrorable URL carry `mirror_priority=null` — those become placeholders in Step 3 (a `video` keeps its type with a null poster). § 7c is mechanical: dispatch the queue, pass results back to the script.

**Step 1 — Read `mirror_queue` from `/tmp/wcp-norm.json`** (the § 7a output). Each entry is exactly the args for discoveryFileDownloadTool:

```json
{ "id": "g_123",
  "dataSource": "google_ads_ql",
  "connectionId": 1985,
  "url": "<raw CDN URL>",
  "fileName": "creative_google_ads_<stable_id>.jpg" }
```

**Step 2 — Dispatch the mirror in parallel batches of 10.** For each entry:

```
discoveryFileDownloadTool({
  dataSource:   entry.dataSource,
  connectionId: entry.connectionId,
  request:      { method: "get", url: entry.url },
  fileName:     entry.fileName
})
```

Collect results as `[{ id, download_url }]` on success or `[{ id, error }]` on failure. **Pass `response.download_url` VERBATIM** — full query string included. Example (your run will produce different signature values; the structure is the same):

```
https://im-ai-agent-bucket.s3.amazonaws.com/creative_facebook_abc123.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIA…%2F20260528%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260528T000000Z&X-Amz-Expires=43200&X-Amz-Security-Token=IQoJ…&X-Amz-SignedHeaders=host&X-Amz-Signature=4f3e2a…
```

Do NOT trim, URL-decode, split on `?`, or "clean up" the query string. The bucket is private — bare URLs (host + key, no query) return 403 inside the iframe. The `--apply-mirrors` pass hard-fails with `download_url is missing X-Amz-Signature query param` on any non-presigned URL; lint L19 + L22 also reject bare amazonaws.com URLs.

**Step 3 — Inject + demote via `--apply-mirrors`.** Pipe `{ normalized, mirror_results }` to the script. It writes mirrored URLs into `creative_items[i].thumbnail_url` (verbatim), demotes non-mirrored / failed items to `thumbnail_type='placeholder'` (a `video` instead keeps `'video'` with a null poster), strips helper fields, and emits the final shape:

```bash
jq -n --slurpfile n /tmp/wcp-norm.json --argjson r "$MIRROR_RESULTS_JSON" \
  '{normalized: $n[0], mirror_results: $r}' \
  | node main/context/skills/weekly-creative-performance/scripts/normalize.mjs --apply-mirrors \
  > .context/wcp-final.json
```

§ 7d reads `creative_items` and `totals` from `.context/wcp-final.json`. If a later `render-widgets.mjs` output overflows L20 (rare; only when `len(creative_items) > ~150` placeholders push the JSON body past 99,500), drop from the END of `creative_items` (mechanically — lowest impressions, all are already placeholders by construction) and re-render. Add `" — showing N of {total} creatives (size cap)"` to `DASHBOARD_NOTE` when items are dropped.

### 7d. Render widgets

Pipe a JSON dict of per-widget tokens through `scripts/render-widgets.mjs`:

```bash
cat <<'EOF' | node main/context/skills/weekly-creative-performance/scripts/render-widgets.mjs
{
  "fatigue":  { "SUBTITLE": "…", "KPI_DATA_JSON": {…}, "SEGMENTS_AGGREGATE_JSON": […], "SEGMENTS_CREATIVES_JSON": {…}, "DEFAULT_OPEN_SEGMENT": "fatiguing" },
  "insights": { "INSIGHTS_CARDS_JSON": […] },
  "gallery":  { "CREATIVES_DATA_JSON": […], "PLATFORMS_PRESENT_JSON": […], "TYPES_PRESENT_JSON": […], "DEFAULT_VIEW_MODE": "table", "DEFAULT_SORT_KEY": "impressions_desc" }
}
EOF
```

The script reads the 3 widget HTMLs, strips comments, substitutes `__TOKEN__` markers (JSON.stringify for `*_JSON` tokens, plain string otherwise), asserts no token survived, and writes the 3 ready-to-slot HTML strings to stdout as `{"fatigue":"…","insights":"…","gallery":"…"}`.

**Token shape is load-bearing.** `_JSON` tokens documented as ARRAY must serialize to bare `[…]`; OBJECT tokens to bare `{…}`. Wrapping an array in a metadata envelope (`{health_score, segments: […]}`) breaks the widget at view time with `TypeError: SEGS.forEach is not a function`. The widgets iterate array tokens directly (`SEGS.forEach`, `CARDS.map`).

#### Fatigue widget tokens

| Token | Shape | Contents |
|---|---|---|
| `SUBTITLE` | string | `"Last 30 days · Google Ads, Facebook · 47 creatives"` |
| `KPI_DATA_JSON` | OBJECT | `{ total_count, health_score, health_score_color, spend_at_risk_str }` |
| `SEGMENTS_AGGREGATE_JSON` | ARRAY (exactly 4 in order Fresh, Healthy, Fatiguing, Dead) | each: `{ key, label, count, count_pct, spend_str, avg_ctr_str, trend_arrow ∈ {▲,▼,→}, trend_delta_str, insight_line, color }` |
| `SEGMENTS_CREATIVES_JSON` | OBJECT (keyed by segment) | `{ fresh: [Row], healthy: [Row], fatiguing: [Row], dead: [Row] }` where Row = `{ name, full_name, platform, platform_color, platform_letter, thumbnail_url, thumbnail_type, text_preview, impressions_str, spend_str, ctr_str, sparkline_path }` |
| `DEFAULT_OPEN_SEGMENT` | string | `"fresh"|"healthy"|"fatiguing"|"dead"` — default: Dead if `dead_count>0`, else Fatiguing if `>0`, else Healthy. Override per § 4 bias signals. |

#### Insights widget token

| Token | Shape | Contents |
|---|---|---|
| `INSIGHTS_CARDS_JSON` | ARRAY (4–6 cards) | each: `{ color: "#hex", label: "UPPERCASE", text: "<HTML with <strong> tags>" }` |

**Pick top 5 insight cards** by severity from the condition→card table below. Wrap creative/platform names in `<strong>` after HTML-escaping the dynamic parts. The renderer trusts the `text` HTML verbatim.

| Condition | Card label | Text template | Color |
|---|---|---|---|
| Any creative CTR > 3% | `HIGH PERFORMER` | `"<strong>{name}</strong> on {platform} has {ctr}% CTR — scale this creative."` | `#7a9e7e` |
| Any creative CTR < 0.5% with spend > $100 | `BUDGET DRAIN` | `"<strong>{name}</strong> spent ${spend} with {ctr}% CTR — pause it."` | `#c4877a` |
| Platform with 0 active creatives | `WATCH` | `"No active creatives on <strong>{platform}</strong> — all paused."` | `#c47d4a` |
| >50% creatives have 0 impressions | `LOW DELIVERY` | `"Most creatives aren't getting impressions — check delivery."` | `#c47d4a` |
| One platform > 80% spend | `CONCENTRATION` | `"<strong>{platform}</strong> accounts for {pct}% of spend."` | `#c47d4a` |
| Any Google RSA with POOR strength | `AD QUALITY` | `"<strong>{count}</strong> RSAs rated POOR — refresh ad copy."` | `#c4877a` |
| VIDEO creatives outperform IMAGE | `VIDEO WINS` | `"Video {v_ctr}% CTR vs <strong>{i_ctr}%</strong> for image."` | `#7a9e7e` |
| Carousel ads in top 3 by impressions | `TOP CREATIVE` | `"<strong>{N}</strong> carousels in the top 3 by impressions."` | `#7a9e7e` |
| Healthy fatigue mix (mostly fresh/healthy) | `STEADY` | `"All creatives performing within expected range across the 30-day window."` | `#7a9e7e` |
| Platform mix (always-on context card) | `MIX` | `"<strong>{N}</strong> platforms · {plat_breakdown_short}"` | `#9b7ea4` |

Color → label semantic when synthesizing custom labels: sage `#7a9e7e` → wins/steady/top, copper `#c47d4a` → watch/concentration/low delivery, coral `#c4877a` → drain/waste/quality, plum `#9b7ea4` → mix/platform.

#### Gallery widget tokens

| Token | Shape | Contents |
|---|---|---|
| `CREATIVES_DATA_JSON` | ARRAY (ALL CreativeItems, sorted by impressions DESC) | Every fetched CreativeItem — the top ≤35 carry mirrored `amazonaws.com` URLs from § 7c, the rest are stamped `thumbnail_type="placeholder"`. Embed using the minimum-field set below. If the rendered widget exceeds the 99,500-char L20 cap, drop from the lowest-impressions END of the sorted list, mechanically — see § 7c Step 5. |
| `PLATFORMS_PRESENT_JSON` | ARRAY (strings) | distinct `platform` values present, e.g. `["facebook","google_ads"]` — drives Platform chip options |
| `TYPES_PRESENT_JSON` | ARRAY (strings) | distinct `creative_type` values present — drives Type chip options |
| `DEFAULT_VIEW_MODE` | string | `"table"` (default) or `"grid"` |
| `DEFAULT_SORT_KEY` | string | `"impressions_desc"` (default) / `"impressions_asc"` / `"ctr_desc"` / `"ctr_asc"` / `"spend_desc"` / `"spend_asc"` / `"clicks_desc"` / `"cpc_asc"` |

**Minimum embed field set** (gallery `var D` rows — strip everything else):

`id`, `platform`, `platform_color`, `platform_full`, `platform_letter`, `name`, `full_name`, `creative_type`, `ad_format`, `ad_strength`, `thumbnail_url`, `thumbnail_type`, `video_url`, `video_duration`, `permalink_url`, `text_preview`, `impressions`, `clicks`, `ctr`, `spend`, `segment_color`.

Stripped (other widgets read these from their own payloads): `status`, `conversions`, `fatigue_segment`.

### 7e. Assemble + lint

Assemble the final BIE config via `scripts/assemble-config.mjs`:

```bash
cat <<'EOF' | node main/context/skills/weekly-creative-performance/scripts/assemble-config.mjs
{
  "widgets": {
    "fatigue":  "<…output from render-widgets.mjs…>",
    "insights": "<…>",
    "gallery":  "<…>"
  },
  "slots": {
    "PLATFORMS_LIST":          "Google Ads | Facebook",
    "TODAY_ISO":               "2026-05-27",
    "DASHBOARD_NOTE_OR_EMPTY": ""
  }
}
EOF
```

`DASHBOARD_NOTE_OR_EMPTY` = `""` on a clean run, or `" — facebook: 18/22 thumbnails mirrored"` when >20% of mirrors failed for a platform.

Then lint the assembled config:

```bash
echo '<assembled JSON>' | node main/context/skills/weekly-creative-performance/scripts/lint-config.mjs
```

Single-line JSON on stdout; exit 0 on pass, 1 on fail:
```
{"pass":true,"checks":22,"errors":[]}
{"pass":false,"checks":22,"errors":[{"rule":"L22","name":"…","message":"…","path":"…"}]}
```

**Common failures and fixes:**

| Rule | Meaning | Fix |
|---|---|---|
| `L19` raw CDN host (`fbcdn.net`, etc.) | Mirror was skipped or returned the CDN URL | Re-run § 7c for that URL. |
| `L19` on `/experimental/agent/api/files/serve` | A serve URL was embedded — silently 401s in iframe (Invariant 1) | Use `response.download_url` from `discoveryFileDownloadTool` verbatim. Do NOT rewrite URLs. |
| `L20` `componentCode > 99,500 chars` | Gallery payload too big | Step gallery down: 35 → 25 → 15. Re-render + re-lint. Cap at 3 retries; else surface error. |
| `L21` IIFE closure missing | Body truncated mid-statement | Re-render. |
| `L22` CreativeItem with `thumbnail_type ∈ {image, video}` has a non-S3 thumbnail_url (an `image` null without `placeholder`) | Mirror skipped for that creative, OR the agent rewrote the URL | Re-run § 7c using `response.download_url` verbatim. `--apply-mirrors` auto-handles true failures (`image`→`placeholder`, `video`→null poster). |

L22 is the data-layer gate that catches both (a) mirror skipped silently and (b) URL rewrite — the two failure modes the iframe sandbox + iframe CSP make worse. Lint output names the specific CreativeItem IDs to fix.

## 8. STEP 4 — Save and preview

D6 watchdog (Invariant 4): once lint returns `{pass:true}`, the next action is the BIE save Skill call. Do not emit text in between.

```
Skill('business-intelligence-editor', { command: 'save', config: <assembled-config JSON> })
```

**Verify response:**

| Response shape | Action |
|---|---|
| JSON with `success:true` AND `settings_id:<number>` | Proceed to preview with `NEW_ID = response.settings_id`. |
| JSON with `success:false` | Emit `Save failed — {response.error}. Please retry, or contact support.` Stop. Do NOT retry. |
| Non-JSON / echo string / missing `settings_id` | Emit `Save failed — the dashboard editor didn't return a settings_id. Please retry, or contact support if it persists.` Stop. Do NOT fall through to a `curl`-based save (leaks the DTS session cookie into JSONL transcripts and Bash history). |

**Open preview** (always `--production`):

```bash
python3 frontend-cli.py open-preview --production "clients/template/dashboards/CrossChannelEditableDashboard.tsx?settings_id={NEW_ID}"
```

**Clean up the resume stash** (the dashboard is saved; the stash is no longer needed and could otherwise mislead a fresh re-run started <30 min later):

```bash
rm -f .context/wcp-state.json
```

**Present the closing summary:**

1. Headline KPIs: `health_score`, `spend_at_risk`, top performer's `{name}` + CTR.
2. The 12h TTL note (Invariant 5): *"Thumbnails are valid for ~12h — re-run this skill if you need them fresh later."*
3. 2–3 next actions tied to the diagnosis:
   - *"Pause the **Dead segment** creatives I flagged — they're burning budget with near-zero engagement."*
   - *"Show me the **Fatiguing** segment in detail — find creatives that just need refreshed copy."*
   - (only if multiple accounts/connectors were merged) *"Re-scope to just **{specific account}** and rerun."*

## 9. BIE save shape (required fields — template ships them; never strip at runtime)

```
Top-level:
  dashboardTitle   string   "Creative Performance Dashboard"
  dashboardUrl     string   "clients/template/dashboards/CrossChannelEditableDashboard.tsx"
                              (canonical host-TSX path — the legacy slug "creative-performance" 404s
                               unless BIE skill-cli's client-side rewrite fires; emit the path directly)
  dashboardTree    string   "dashboards/Creative Performance Dashboard.tsx"  (virtual nav-tree path)
  isMenuItem       boolean  true

config:
  dashboardTitle   string                  same as top-level
  dashboardSubtitle string                 "{PLATFORMS_LIST} | Last 30 Days | Generated {TODAY_ISO}{DASHBOARD_NOTE_OR_EMPTY}"
  defaultTimePeriod string                 "all" (non-empty REQUIRED; rejects null/missing)
  appearance       object                  AT config.appearance — NOT inside editState (EditStateSchema.strip()
                                            silently drops the whole block). Contains:
                                            { colorMode:"light",
                                              layout:{ background:"#faf9f7", hideTitle:true, hideFilters:true, hideFooter:true } }
                                            (hide* fields nested under layout — top-level aliases are stripped
                                             by AppearanceSchema)
  editState:
    schemaVersion  integer 2 (NOT string "2")
    widgets        array  3 entries in order: main-grid-4, main-grid-3, main-grid-1.
                          Each widget: { id, type:"custom-component", props:{ type:"custom-component", … } }
                          — BIE editor reads props.type; outer type is layout-grid wiring; both required.
    layout         object { items:[ {id, x:0, y:{0|18|26}, w:12, h:{18|8|20}, static:false} × 3 ] }
```

**Per-widget required props** (every custom-component widget — BIE rejects missing/wrong):

`title:string` · `showTitle:false` · `gridWidth:12` · `gridHeight:"xxlarge"|"small"|"max"` · `renderMode:"html"` · `chromeless:true` · `cardStyle:"default"` · `inheritFiltersFromDashboard:false` · `preloadLibraries:[]` · `customSqlEnabled:false` · `customSqlQuery:""` · `componentCode:<rendered HTML>`.

## 10. Error appendix

### Per-endpoint errors

| Platform | Endpoint | Error | Action |
|---|---|---|---|
| Facebook | `/adcreatives` | `data: []` all accounts | Skip platform (chat note) |
| Facebook | `/insights` | `data: []` | Show creatives without metrics |
| Facebook | any | `OAuthException` | Try next connector |
| Google | GAQL | 404 | Walk version probe v24→v22→v20 |
| Google | GAQL | `PERMISSION_DENIED` | Try next connector |
| Google | GAQL | `INVALID_ARGUMENT` | Strip problematic field, retry |
| Pinterest | `/ads` | 401 | Try next connector |
| Pinterest | `/pins/{id}` | 404 | Stamp `thumbnail_type="placeholder"` for that pin |
| TikTok | `/ad/get/` | `code != 0` | Read `message` field; auth → try next connector |
| TikTok | `/report/integrated/get/` | `code != 0` | Show ads without metrics |
| LinkedIn | `/adCreativesV2` | 401/403 / `REVOKED_ACCESS_TOKEN` | Try next connector |
| LinkedIn | `/rest/*` | 404 | Use `/v2/`, not `/rest/` |
| any | 429 | rate limit | Wait 60s, retry once; if still 429 skip platform |

### Rate limits

- Facebook ~200/hr — unlikely to hit.
- Google Ads ~15,000/day — no concern.
- Pinterest ~1,000/min — no concern (pin lookups capped at 10).
- **TikTok ~10/min on reporting** — batch analytics, never per-ad.
- **LinkedIn ~100/day on analytics** — ONE call per account, never per-creative.

### Data quality

- Creative with 0 impressions → include in gallery; gray the metrics; show "No delivery".
- CTR with < 10 impressions → skip CTR (assign `fatigue_segment="unknown"`).
- > 35 creatives total → gallery shows top 35; subtitle gains `"Showing top 35 of {total}"`.
- L20 fires → step gallery 35 → 25 → 15, re-render + re-lint. 3-retry cap.
- Only 1 platform returned data → build the full dashboard with just that one; subtitle notes which platforms were skipped.

## 11. Mode A — markdown report (when Mode A is locked)

Skip §§ 7c–8. Call:

```
createDocument({
  title: "Creative Performance Report — {date_range}",
  content: "<markdown>",
  tags: ["creative-performance", "weekly-report"]
})
```

Structure: Summary (top KPIs) → Creative Fatigue table → Creative Type Breakdown → Top Performers → Underperformers → Platform Breakdown → Recommendations.

Embed source URLs directly (signed `image_url` for FB, `imageAd.imageUrl` for Google, etc.) — Mode A is a point-in-time snapshot. Facebook URLs expire in 4-8h, TikTok in ~24h, others permanent at source.

## 12. Files

```
SKILL.md                     ← this file
PLATFORMS.md                 ← per-platform Discovery API recipes (read at § 6 entry)
dashboard-template.json      ← BIE config skeleton + _lint_before_save rule list (22 entries)
widgets/{creative-fatigue,insights,creative-gallery}.html
scripts/normalize.mjs        ← § 7a — turns raw Discovery payloads into CreativeItem[] + fatigue totals (NEW v8.7.0)
scripts/render-widgets.mjs   ← § 7d
scripts/assemble-config.mjs  ← § 7e
scripts/lint-config.mjs      ← § 7e (22 checks)
.context/wcp-state.json      ← workspace-local resume stash; written at § 5 + § 7a, deleted at § 8 (see § 13)
```

Reused infrastructure (do not rebuild):

- `discoveryFileDownloadTool` — `main/utils/ai/tools/discovery/discovery-file-download-tool.ts` (12h TTL, 50 MB cap).
- `/business-intelligence-editor` skill — sole save path.

---

## 13. Resume after context compaction

Multi-platform / large-account runs commonly exceed the conversation's context window and trigger a summarization pass. The summary preserves intent but loses raw data — connector IDs, ad_ids, thumbnail URLs, normalized CreativeItems. Without explicit resume, the agent re-fetches everything and burns 10-20 wasted calls reconstructing state (observed 2026-05-27).

The skill writes a stash at two points: after § 5 (`step: "ready_for_fetch"` — connectors + accounts known) and after § 7a (`step: "ready_for_mirror"` — full CreativeItem[] normalized). On resume the agent reads `.context/wcp-state.json` and skips to the latest valid checkpoint.

### 13a. Resume check (run BEFORE STEP 1, every invocation)

```bash
test -f .context/wcp-state.json && cat .context/wcp-state.json || echo MISSING
```

If MISSING, parse error, or `version` field doesn't start with `8.` → ignore the file; continue with normal STEP 1.

If present and parses, check freshness: compute age = `<now> - ts`. If age > 30 minutes → ignore the file; continue normally (stale state is more dangerous than re-fetching).

If fresh (≤ 30 min), branch on `step`:

| `step` | Branch |
|---|---|
| `ready_for_mirror` AND `creative_items[]` non-empty | Restore state; jump directly to § 7c (mirror). Skip §§ 5–7b. Do NOT re-emit STEP 1 / STEP 2 progress messages (user already saw them). |
| `ready_for_fetch` AND `connectors_by_platform` non-empty | Restore connectors + accounts; jump directly to § 6 (fetch). Skip § 5. Do NOT re-emit the "Checking your connected platforms…" message. |
| anything else | Ignore the file; continue normally. |

### 13b. Stash file shape

```json
{
  "version": "8.3.0",
  "ts": "2026-05-27T18:00:00Z",
  "step": "ready_for_mirror",
  "platforms": ["facebook", "google_ads"],
  "connectors_by_platform": {
    "facebook":   { "connector_id": 14082, "accounts": [{"account_id":"act_1211478595627548","name":"Improvado.io"}] },
    "google_ads": { "connector_id": 1985,  "customer_id": "9521562011" }
  },
  "google_api_version": "v23",
  "creative_items": [
    /* full normalized CreativeItem[] (§ 7a shape) — present only when step === "ready_for_mirror" */
  ]
}
```

### 13c. Writes and the lifecycle

- After STEP 1 (§ 5 "Checkpoint after STEP 1") → write `step: "ready_for_fetch"`.
- After § 7a (§ "Checkpoint after § 7a") → overwrite with `step: "ready_for_mirror"` + full `creative_items[]`.
- After § 8 BIE save succeeds → `rm -f .context/wcp-state.json` so a fresh re-run within 30 min doesn't replay stale data.

### 13d. When NOT to resume

- The user's prompt explicitly says "redo from scratch", "start over", or similar → ignore the stash even if fresh.
- The active platforms in this invocation's ALG prebrief differ from `platforms` in the stash → ignore (different scope).
- `google_api_version` in the stash returns 404 on a current probe → ignore (API rotated).
- After any restored-state failure (BIE save rejection, lint failure that names a CreativeItem the stash describes) → `rm -f .context/wcp-state.json` and continue fresh from STEP 1.

### 13e. What this saves

Pre-fix on a typical run that hits compaction between § 7a and § 7c: ~10-15 wasted calls (re-fetching connectors, accounts, Google Ads RSAs, Facebook DPA `/ads` lookups), ~30 lines of "where did my state go?" deliberation, occasional dead-end probes (e.g. wrong account, different connector). Post-fix: one `Bash test -f` + one `Bash cat`, then jump to § 7c.
