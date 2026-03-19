# Google Ads Channel — Campaign Creation

Two modes: Direct API or CSV Export. Mode is set in `campaign-launcher.yaml` under `channels.google_ads.mode`.

## Mode A: Direct API

### Auth
- Refresh the access token before each session:
```bash
curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$GOOGLE_ADS_CLIENT_ID" \
  -d "client_secret=$GOOGLE_ADS_CLIENT_SECRET" \
  -d "refresh_token=$GOOGLE_ADS_REFRESH_TOKEN" \
  -d "grant_type=refresh_token"
```
- All API calls need headers: `Authorization: Bearer {access_token}`, `developer-token: {GOOGLE_ADS_DEVELOPER_TOKEN}`
- Base URL: `https://googleads.googleapis.com/v18/customers/{customer_id}`

### Campaign Creation Steps

Step 1: Create budget
```
POST {base}/campaignBudgets:mutate
{
  "operations": [{
    "create": {
      "name": "{campaign_name}-budget",
      "amountMicros": "{daily_budget * 1000000}",
      "deliveryMethod": "STANDARD",
      "explicitlyShared": false
    }
  }]
}
```
GOTCHA: Without `explicitlyShared: false`, budget defaults to shared and is incompatible with MAXIMIZE_CONVERSIONS.

Step 2: Create campaign (validateOnly first, then real)
```
POST {base}/campaigns:mutate
{
  "operations": [{
    "create": {
      "name": "{campaign_name}",
      "status": "PAUSED",
      "advertisingChannelType": "SEARCH",
      "campaignBudget": "customers/{customer_id}/campaignBudgets/{budget_id}",
      "maximizeConversions": {},
      "networkSettings": {
        "targetGoogleSearch": true,
        "targetSearchNetwork": false,
        "targetContentNetwork": false,
        "targetPartnerSearchNetwork": false
      },
      "geoTargetTypeSetting": {
        "positiveGeoTargetType": "PRESENCE"
      },
      "containsEuPoliticalAdvertising": "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      "trackingUrlTemplate": "{lpurl}?utm_medium=cpc&utm_source=google&utm_term={keyword}&utm_campaign={campaign_name}"
    }
  }],
  "validateOnly": true
}
```
GOTCHAS:
- `containsEuPoliticalAdvertising` is REQUIRED in API v18+
- Do NOT include `negativeGeoTargetType` — incompatible with Search
- Include `maximizeConversions: {}` in campaign create, not as separate step
- ALWAYS validate first, then create without validateOnly

Step 3: Create ad groups
```
POST {base}/adGroups:mutate — name, campaign resource, status ENABLED, type SEARCH_STANDARD
```

Step 4: Add keywords
```
POST {base}/adGroupCriteria:mutate — keyword text, matchType EXACT or PHRASE
```

Step 5: Create RSA ads (one per API call to avoid timeouts)
```
POST {base}/adGroupAds:mutate — 15 headlines (max 30 chars each), 4 descriptions (max 90 chars each), finalUrls
```

Step 6: Add negative keywords
```
POST {base}/campaignCriteria:mutate — negative: true, matchType BROAD
```

Step 7: Add geo targeting
```
POST {base}/campaignCriteria:mutate — geoTargetConstants/{geo_code}
```
Common geo codes: US=2840, UK=2826, CA=2124, AU=2036, DE=2276

Step 8: Validate — query campaign, ad groups, keywords, ads to confirm everything was created correctly.

### Safety
- ALWAYS `validateOnly: true` before real mutations
- ALWAYS create campaigns in PAUSED status
- NEVER modify without user confirmation

## Mode B: CSV Export (Google Ads Editor)

Generate a CSV file that can be imported via Google Ads Editor desktop app.

### CSV Format
The file should have these columns:
```
Campaign,Campaign Type,Campaign Status,Campaign Daily Budget,Bidding Strategy,Ad Group,Ad Group Type,Ad Group Status,Keyword,Match Type,Keyword Status,Final URL,Headline 1,Headline 2,Headline 3,...,Headline 15,Description 1,Description 2,Description 3,Description 4,Ad Status
```

Generate separate rows for:
- Campaign row (budget, bidding, network settings)
- Ad group rows
- Keyword rows (one per keyword with match type)
- Ad rows (RSA with headlines and descriptions)
- Negative keyword rows

Save to: `{output_dir}/EXP-{id}/google-ads-import.csv`

Tell the user: "Download and import this CSV file using Google Ads Editor (desktop app). Review all settings before uploading."

### Keyword Best Practices
- Start with Exact + Phrase match only (no broad initially)
- 5-8 keywords per ad group per match type
- Group by single intent/theme
- RSA: 15 headlines (max 30 chars each), 4 descriptions (max 90 chars each)
