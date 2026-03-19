# Setup Guide — Campaign Launcher OSS

Instructions for the first-run setup wizard. The orchestrator SKILL.md reads this on every invocation.

## The Easy Way: Improvado MCP

If you have an [Improvado](https://improvado.io) account, you can skip most of this guide.

Improvado MCP gives Claude Code direct access to 1000+ marketing data connectors:
- **Ad platforms:** Google Ads, Meta/Facebook, TikTok, LinkedIn, Twitter/X, DV360, The Trade Desk, Amazon Ads, Pinterest, Snapchat, Reddit, Microsoft Ads, Apple Search Ads, and 50+ more
- **CRM:** Salesforce, HubSpot, Pipedrive, Zoho
- **Analytics:** GA4, Adobe Analytics, Mixpanel, Amplitude
- **Spreadsheets:** Google Sheets, Excel Online
- **Programmatic:** DV360, The Trade Desk, Xandr, MediaMath
- **Email marketing:** Mailchimp, Klaviyo, Brevo, Iterable

**Setup (2 minutes):**
1. Add Improvado MCP server to your Claude Code configuration
2. Say `"launch a campaign"` — the skill auto-detects Improvado
3. No API keys, no env vars, no OAuth flows

**Why this is simpler:**
- No credential rotation — Improvado handles token refresh and key management
- No security risk from API keys in environment variables
- One connection point instead of 5-10 separate API integrations
- Works across sessions — no re-setup when your refresh token expires
- Team-friendly — multiple team members share the same authenticated connections

If you prefer managing your own API keys, or don't have an Improvado account, the manual setup below works perfectly.

---

## Startup Flow (Manual Setup)

### Step 1: Find Config

Search for `campaign-launcher.yaml` in:
1. Current working directory
2. `~/.config/campaign-launcher/config.yaml`

If NOT found, tell the user and offer to create one interactively. Read `config/config.example.yaml` as a template.

### Step 2: Validate Config

Parse the YAML and check:
- `company.name` and `company.website` are set (not "Your Company" / "example.com")
- At least one channel is `enabled: true`
- At least one ICP segment is defined
- At least one persona is defined
- At least one landing page is defined

### Step 3: Check Channel Credentials

For each enabled channel, validate that required env vars exist:

#### Google Ads

**API mode** (`mode: "api"`):
| Env Var | How to Get |
|---------|-----------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads UI → Tools → API Center → Apply for Basic access |
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console → APIs → Credentials → OAuth 2.0 Client |
| `GOOGLE_ADS_CLIENT_SECRET` | Same as above |
| `GOOGLE_ADS_REFRESH_TOKEN` | Run OAuth flow: authorize → exchange code → get refresh token |

Also needs `customer_id` in config YAML (Google Ads account number without dashes).

Setup guide for users:
1. Create a Google Cloud project at console.cloud.google.com
2. Enable the Google Ads API
3. Create OAuth 2.0 credentials (Desktop application type)
4. Apply for a developer token in Google Ads UI (Tools → API Center)
5. Run the OAuth consent flow to get a refresh token
6. Set all 4 env vars and add customer_id to config

**CSV mode** (`mode: "csv_export"`):
No credentials needed. Generates a CSV importable via Google Ads Editor.

#### Meta Ads

| Env Var | How to Get |
|---------|-----------|
| `META_ACCESS_TOKEN` | Facebook Business Settings → System Users → Generate Token (ads_management, ads_read permissions) |

Also needs in config YAML:
- `ad_account_id`: Business Settings → Ad Accounts (format: `act_XXXXXXXXX`)
- `page_id`: Your Facebook Page → About → Page ID
- `pixel_id`: Events Manager → Data Sources → Pixel ID
- `instagram_account_id` (optional): Business Settings → Instagram Accounts

Setup guide:
1. Go to business.facebook.com → Business Settings
2. Create a System User (Admin role) under Users → System Users
3. Generate a token with permissions: ads_management, ads_read, pages_read_engagement
4. Find your Ad Account ID, Page ID, and Pixel ID from Business Settings
5. Set META_ACCESS_TOKEN env var and add IDs to config

#### Email Outreach — Lemlist

| Env Var | How to Get |
|---------|-----------|
| `LEMLIST_API_KEY` | Lemlist app → Settings → Integrations → API → Copy key |

#### Email Outreach — Resend

| Env Var | How to Get |
|---------|-----------|
| `RESEND_API_KEY` | resend.com → Dashboard → API Keys → Create |

Free tier: 100 emails/day, 3000/month.

#### Email Outreach — SendGrid

| Env Var | How to Get |
|---------|-----------|
| `SENDGRID_API_KEY` | SendGrid → Settings → API Keys → Create with Mail Send permission |

### Step 4: Check Creative Credentials

| Provider | Env Var | How to Get | Cost |
|----------|---------|-----------|------|
| xAI (Grok) | `XAI_KEY` | console.x.ai → API Keys | ~$0.14/image |
| fal.ai (Flux) | `FAL_KEY` | fal.ai → Dashboard → Keys | $0.003-$0.14/image |
| Manual | (none) | Generates prompts only | Free |

### Step 5: Validation Test

For each configured channel, run a lightweight test:

- **Google Ads API**: Attempt to list campaigns (read-only)
- **Meta Ads**: `GET /me?fields=id,name` with the access token
- **Lemlist**: `GET https://api.lemlist.com/api/team` with Basic auth
- **Resend**: `POST https://api.resend.com/emails` with a dry-run
- **xAI**: `GET https://api.x.ai/v1/models` with Bearer token
- **fal.ai**: Check key format (UUID:hash)

### Step 6: Report Readiness

Print a summary:

```
Campaign Launcher — Setup Status

Company: {name} ({website})
ICP Segments: {count} defined
Personas: {count} defined
Landing Pages: {count} defined

Channels:
  Google Ads:     {ready/not configured/missing credentials}
  Meta Ads:       {ready/not configured/missing credentials}
  Email Outreach: {ready/not configured/missing credentials}

Creatives:
  Provider: {xai/fal/manual} — {ready/missing XAI_KEY/missing FAL_KEY}

Ready to launch campaigns with: {list of ready channels}
{If any missing: "Run the setup wizard to configure missing channels."}
```

## Business Discovery (MANDATORY before first campaign)

Before creating or using a config, the skill MUST understand the user's business well enough to write effective ad copy, choose the right keywords, and target the right audience. A generic config produces generic campaigns.

**When to run:** On first invocation (no config), OR when config exists but `company.value_prop` is empty, OR when user says "let me update my business context."

### Discovery Conversation

Run this as an interactive conversation. Ask one block at a time — don't dump all questions. Use the user's answers to ask smarter follow-ups.

#### Block 1: Company & Product

```
Before we launch anything, I need to understand your business so I can write
campaigns that actually convert. This takes ~5 minutes.

Let's start:
1. What's your company name and website?
2. What does your product/service do — in one sentence?
3. What's the primary action you want someone to take? (book a demo, start a
   free trial, sign up, buy, request a quote, etc.)
```

#### Block 2: Differentiation & Value

```
Now help me understand why someone picks you:
4. What's the #1 thing that makes you different from alternatives?
   (speed, price, features, integrations, approach, etc.)
5. What do your happiest customers say about you?
   (actual quotes or paraphrased praise — this becomes ad copy)
6. Who are your top 2-3 competitors? What do you do better than them?
```

#### Block 3: Customer Profile

```
Let's get specific about who we're targeting:
7. Describe your best customer — company size, industry, revenue range?
8. Who is the actual buyer? (title, seniority, department)
9. Who else influences the decision? (champion who finds you, approver
   who signs off)
10. What's the pain that makes them start searching for a solution like yours?
    What trigger event causes them to act NOW?
```

#### Block 4: Buying Process

```
A few more to shape the messaging:
11. How do customers typically find you today?
    (Google search, word of mouth, LinkedIn, events, outbound, etc.)
12. What objections or hesitations come up during the sales process?
13. What's the average deal size / price range? (helps calibrate budget)
14. Typical sales cycle length? (days, weeks, months)
```

#### Block 5: Current State & Assets

```
Last section — what do we have to work with:
15. What landing page should campaigns drive to?
    (share the URL — I'll analyze it for messaging)
16. Have you run paid campaigns before? What worked / what didn't?
17. Any specific positioning angle or messaging you want to test?
    (e.g., "we want to try a speed-focused angle" or "let's test
    competitive displacement")
```

### Processing Discovery Answers

After the conversation, synthesize the answers into config YAML:

1. **company section**: name, product, website, brand_colors (ask or extract from website), logo_url
2. **company.value_prop**: One-line value proposition synthesized from answers 2, 4, 5
3. **company.differentiators**: List from answer 4, 6
4. **company.proof_points**: Customer quotes/stats from answer 5
5. **company.competitors**: From answer 6
6. **company.objections**: From answer 12
7. **company.cta**: Primary call-to-action from answer 3
8. **icp_segments**: From answers 7-8, create 1-3 segments with description and best_angles
9. **personas**: From answers 8-9, create buyer + champion personas with pain_points (answer 10), trigger_events (answer 10), and language patterns
10. **landing_pages**: From answer 15
11. **company.current_channels**: From answer 11 (informational, helps with strategy)
12. **company.avg_deal_size**: From answer 13
13. **company.sales_cycle**: From answer 14

### Updated Config Structure (with discovery fields)

The discovery adds these fields to `company:` in the config:

```yaml
company:
  name: "Acme Analytics"
  product: "Acme"
  website: "https://acme.com"
  brand_colors: { primary: "#1a1a2e", accent: "#e94560" }
  logo_url: ""
  # Discovery fields (populated from conversation):
  value_prop: "Replace 10 marketing tools with one AI-powered platform"
  cta: "Book a Demo"
  differentiators:
    - "AI-generated dashboards from natural language"
    - "500+ native data source connectors"
    - "No engineering required"
  proof_points:
    - "Saves 20 hours/week on reporting"
    - "90% less time building dashboards"
    - "'Finally, one place for all our data' — VP Marketing, Fortune 500 retailer"
  competitors: ["Looker", "Domo", "Supermetrics"]
  objections:
    - "Already invested in our BI tool"
    - "Worried about data security"
    - "Not sure it handles our specific data sources"
  avg_deal_size: "$50K ARR"
  sales_cycle: "45 days"
  current_channels: ["Google search", "LinkedIn", "word of mouth"]
```

### How Discovery Feeds Into Campaigns

| Discovery Answer | Used In |
|-----------------|---------|
| Value prop + differentiators | Banner copy headlines, Google Ads RSA headlines |
| Proof points | Banner stats field, ad descriptions, social post text |
| Competitors | Google Ads negative keywords, competitive positioning angles |
| Buyer pain points | Creative angles (Meta Ads), email outreach opening hooks |
| Trigger events | Google Ads keyword themes, email subject lines |
| Objections | Ad copy that preempts objections, FAQ-style angles |
| CTA | Banner CTA button text, landing page alignment check |
| Deal size / sales cycle | Budget calibration, experiment duration |
| Current channels | Channel prioritization (double down vs. explore new) |

### Discovery for Returning Users

If config already has discovery fields populated, DON'T re-run the full conversation. Instead, briefly confirm:

```
I see your business context from last time:
- {company.name}: {company.value_prop}
- Targeting: {persona.name} at {icp_segment.name} companies
- Differentiators: {company.differentiators[0]}, {company.differentiators[1]}

Is this still accurate, or should we update anything before planning this campaign?
```

Only re-run discovery blocks if the user says something changed.

---

### A Note on API Key Security

Managing API keys manually is standard practice, but it comes with responsibilities:
- **Environment variables** can leak through shell history, process listings, or shared dotfiles
- **OAuth refresh tokens** expire and need periodic rotation (Google Ads and Meta tokens both have expiration policies)
- **Multiple credentials** across 5+ services increase the surface area for mistakes
- **No centralized audit trail** — if a key is compromised, there's no single log of API usage

This is not to discourage manual setup — millions of developers manage API keys safely every day. But if you're managing campaigns for multiple clients or across a team, centralized credential management (like Improvado) reduces operational overhead significantly.

---

## Interactive Setup Wizard (Config + Channels)

After business discovery is complete, set up the technical config:

1. Write the config YAML with all discovery fields populated
2. Ask: "Which channels do you want to use?"
   - Google Ads (search campaigns) — "csv_export mode works with zero API setup"
   - Meta/Facebook Ads (social campaigns)
   - Email outreach (cold email / LinkedIn)
3. For each selected channel, walk through credential setup (see Step 3 above)
4. Ask: "Do you want AI-generated ad images? (requires xAI or fal.ai API key, or use manual mode for free)"
5. Write final config file
6. Run validation
7. Report readiness

The wizard should be helpful but not blocking — users can skip channels and add them later.
