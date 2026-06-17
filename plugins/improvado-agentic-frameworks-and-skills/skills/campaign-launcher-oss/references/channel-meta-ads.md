# Meta Ads Channel — Campaign Creation

Direct Facebook Graph API calls. All IDs from config YAML, auth via META_ACCESS_TOKEN env var.

## Auth
All requests include `access_token` as a query parameter or in the request body.

## Campaign Creation Steps

### Step 1: Create Campaign
```
POST https://graph.facebook.com/v22.0/{ad_account_id}/campaigns
{
  "name": "{campaign_name}",
  "objective": "OUTCOME_LEADS",
  "status": "PAUSED",
  "special_ad_categories": "[]",
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
  "buying_type": "AUCTION",
  "access_token": "{META_ACCESS_TOKEN}"
}
```
Notes:
- ALWAYS create in PAUSED status
- `special_ad_categories: "[]"` — must be a JSON string, not just `[]`

### Step 2: Create Ad Sets
```
POST https://graph.facebook.com/v22.0/{ad_account_id}/adsets
{
  "name": "{adset_name}",
  "campaign_id": "{campaign_id}",
  "status": "PAUSED",
  "daily_budget": {budget_in_cents},
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "OFFSITE_CONVERSIONS",
  "promoted_object": {
    "pixel_id": "{pixel_id}",
    "custom_event_type": "LEAD"
  },
  "targeting": {
    "geo_locations": {"countries": ["US"]},
    "age_min": 18,
    "age_max": 65,
    "locales": [6],
    "publisher_platforms": ["facebook", "instagram"],
    "facebook_positions": ["feed", "video_feeds", "story", "facebook_reels"],
    "instagram_positions": ["stream", "story", "reels"]
  },
  "access_token": "{META_ACCESS_TOKEN}"
}
```
CRITICAL: `daily_budget` is in CENTS — $130/day = 13000

### Step 3: Upload Images
Upload via ad account endpoint:
```
POST https://graph.facebook.com/v22.0/{ad_account_id}/adimages
Content-Type: multipart/form-data
filename=@/path/to/image.png
access_token={META_ACCESS_TOKEN}
```

If direct upload fails, use the temp creative workaround:
1. Host image publicly (imgur, S3, any URL)
2. Create temp creative with `object_story_spec.link_data.picture` pointing to the URL
3. Read back the creative to get `image_hash`
4. Delete the temp creative

### Step 4: Create Creatives (asset_feed_spec pattern)
```
POST https://graph.facebook.com/v22.0/{ad_account_id}/adcreatives
{
  "name": "{creative_name}",
  "object_story_spec": {
    "page_id": "{page_id}",
    "instagram_actor_id": "{instagram_account_id}"
  },
  "asset_feed_spec": {
    "ad_formats": ["SINGLE_IMAGE"],
    "bodies": [{"text": "{primary_text}"}],
    "titles": [{"text": "{headline}"}],
    "descriptions": [{"text": "{description}"}],
    "link_urls": [{"website_url": "{landing_page_url}?utm_medium=paid_social&utm_source=facebook&utm_campaign={campaign_name}&utm_content={ad_name}"}],
    "call_to_action_types": ["LEARN_MORE"],
    "images": [
      {"hash": "{square_hash}", "adlabels": [{"name": "feed_image"}]},
      {"hash": "{story_hash}", "adlabels": [{"name": "story_image"}]}
    ],
    "asset_customization_rules": [
      {
        "customization_spec": {
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["feed", "video_feeds", "marketplace"],
          "instagram_positions": ["stream", "profile_feed"]
        },
        "image_label": {"name": "feed_image"}
      },
      {
        "customization_spec": {
          "publisher_platforms": ["facebook", "instagram"],
          "facebook_positions": ["story", "facebook_reels"],
          "instagram_positions": ["story", "reels"]
        },
        "image_label": {"name": "story_image"}
      }
    ]
  },
  "access_token": "{META_ACCESS_TOKEN}"
}
```

CRITICAL RULES:
1. `object_story_spec` must ONLY contain `page_id` + `instagram_actor_id` — NO link_data, NO message
2. ALL content goes in `asset_feed_spec`
3. `ad_formats: ["SINGLE_IMAGE"]` is REQUIRED
4. CTA must be `LEARN_MORE` for OUTCOME_LEADS campaigns (NOT `BOOK_NOW`)
5. Include `instagram_actor_id` at creation — creatives are immutable
6. Square images (1080x1080) for feed, Vertical (1080x1920) for stories/reels

### Step 5: Create Ads
```
POST https://graph.facebook.com/v22.0/{ad_account_id}/ads
{
  "name": "{ad_name}",
  "adset_id": "{adset_id}",
  "creative": {"creative_id": "{creative_id}"},
  "status": "PAUSED",
  "access_token": "{META_ACCESS_TOKEN}"
}
```

### Step 6: Activate (when user confirms)
Activate in order: campaign → ad sets → ads (does NOT cascade)
```
POST https://graph.facebook.com/v22.0/{entity_id}
{"status": "ACTIVE", "access_token": "{META_ACCESS_TOKEN}"}
```

## Common Errors
- "BOOK_NOW CTA incompatible with OUTCOME_LEADS" → Use LEARN_MORE
- Creative fails with both object_story_spec + asset_feed_spec content → Only page_id in object_story_spec
- "Failed to open/read local data" → Copy image to /tmp/ first
- webp not accepted → Convert to PNG: `sips -s format png input.webp --out output.png`

## Image Specs
| Placement | Dimensions | Ratio |
|-----------|-----------|-------|
| Feed | 1080 x 1080 | 1:1 |
| Stories/Reels | 1080 x 1920 | 9:16 |
File formats: PNG or JPEG only. Max 30MB.
