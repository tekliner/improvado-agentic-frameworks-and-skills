# Ad Copy Generator

Generate structured banner ad copy combinations from landing page content and campaign positioning.

## Input
- Landing page URL (fetched via WebFetch)
- Positioning angle (from campaign plan)
- Target persona (from config YAML)
- Company name and product (from config YAML)

## Output
Markdown file with 20 banner copy combinations at `{output_dir}/EXP-{id}/banner-copy.md`

## Text Field Spec

| Field | Max Length | Role |
|-------|-----------|------|
| **badge** | 2-4 words | Product category label — answers "what is {product}?" |
| **headline** | 2-6 words | Primary message, large bold text |
| **highlight** | 2-5 words | Secondary line, colored/emphasized |
| **subheadline** | 10-15 words | Value expansion, supporting message |
| **cta** | 2-4 words | Button text |
| **stats** | 3 items, pipe-separated | Proof points (numbers + short phrases) |
| **post_text** | 30-50 words | LinkedIn/social ad text above the banner image |

## Copy Rules

### Badge Rules
- Badge = product category label. Answers "what is {product}?"
- Must be a noun phrase describing the product category
- NEVER slogans, actions, or emotional descriptions

### CTA Rules
- Preferred: "Book a Demo", "Get a Demo", "See It Live", "Start Free Trial"
- Adapt to what the landing page offers (demo, trial, sign-up, etc.)
- Keep to 2-4 words

### Brand Mention Rules
- Use the company/product name in ~50% of combinations
- The other half should describe capability directly
- Applies to ALL text fields: badge, headline, highlight, subheadline, post_text

### Headline + Highlight Rules
- Together they form one continuous message
- Don't force "Short Phrase. Short Phrase." pattern everywhere — use rhythm where it fits
- When the pattern doesn't fit, write natural flowing text split across two lines

### Subheadline Rules
- Expands the headline value prop or adds specificity
- Do NOT repeat words from headline/highlight
- Do NOT include generic CTA language

### Stats Rules
- 3 proof points separated by pipes
- Mix numbers (500+, 90%, 3X) and short phrases (Real-time, No Code)
- Each stat under 20 characters
- Use real stats from the landing page when available

### Post Text Rules (Social Media)
- 2-4 sentences, ~30-50 words
- Does NOT repeat banner headline — complements it
- Tone: professional, direct, no hype
- Mention the product/company by name in most post texts

## Combination Categories

### Generic (5)
Core product value props. Platform-level messaging. What the product does and why it matters.

### Creative (5)
Provocative hooks, pain-point angles, attention-grabbing. Designed to stop the scroll.

### Use-Case Specific (10)
Segmented by the target persona's specific pain points and workflows. Each combination describes a specific use case, dashboard, report, or workflow relevant to the persona from the config.

## Process

1. WebFetch the landing page → extract headlines, value props, CTAs, features, stats
2. Read persona pain points from config YAML
3. Generate 20 combinations following the category split (5+5+10)
4. Validate character limits programmatically
5. Save to markdown file

## Example Output Format

```
#### U1 — {Persona}: {Use Case}
- **badge:** {PRODUCT CATEGORY}
- **headline:** Every Campaign.
- **highlight:** Every Metric. Live.
- **subheadline:** Track performance across all ad platforms in one real-time dashboard.
- **cta:** Book a Demo
- **stats:** All Platforms | Real-time | No Code
- **post_text:** Marketing teams juggle dashboards across multiple platforms. {Product} consolidates all of it — pulling data automatically and surfacing a single view your team can act on.
```
