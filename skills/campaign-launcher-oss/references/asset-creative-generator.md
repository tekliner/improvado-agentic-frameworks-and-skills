# Creative Generator

Generate AI ad creatives (images) for campaign banners. Three modes based on config.

## Modes

### Mode: xAI (Grok Imagine Pro)
- Env var: `XAI_KEY`
- Endpoint: `https://api.x.ai/v1/images/generations`
- Cost: ~$0.14/image
- Best for: Final quality, 2K resolution, realistic renders

### Mode: fal.ai (Flux)
- Env var: `FAL_KEY`
- Endpoint: `https://queue.fal.run/fal-ai/flux-pro/v1.1`
- Cost: $0.003 (Schnell) to $0.14 (Pro) per image
- Best for: Fast iteration, stylized outputs

### Mode: Manual (Prompt Only)
- No API keys needed
- Generates detailed prompts the user can paste into Midjourney, DALL-E, or Canva AI
- Output: markdown file with prompts and specifications

## Creative Formats

| Platform | Format | Dimensions | Ratio |
|----------|--------|-----------|-------|
| Feed (FB/IG/LinkedIn) | Square | 1080 x 1080 | 1:1 |
| Stories/Reels | Vertical | 1080 x 1920 | 9:16 |

## Process

### Step 1: Derive Visual World
From the campaign plan's creative angles, derive:
- Color palette (based on brand_colors from config + mood)
- Visual style (photography, illustration, abstract, 3D render)
- Composition approach (centered, asymmetric, layered)
- Typography treatment (overlay style, position)

### Step 2: Write Prompts (Director Language)
For each creative angle, write a generation prompt:
```
[Scene description]. [Lighting]. [Materials/textures]. [Mood/atmosphere].
[Camera angle]. [Color palette]. [Key visual element].
Photorealistic, commercial quality, 4K resolution.
```

Director Language principles:
- Lead with the SCENE, not the style
- Describe LIGHTING explicitly (golden hour, studio, neon, etc.)
- Specify MATERIALS (glass, metal, fabric, organic)
- Set MOOD through environment, not adjectives
- Include NEGATIVE space for text overlay areas
- End with technical quality markers

### Step 3: Generate Images

**xAI:**
```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Authorization: Bearer $XAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-2-image",
    "prompt": "{prompt}",
    "n": 1,
    "response_format": "url"
  }'
```

**fal.ai:**
```bash
curl -X POST https://queue.fal.run/fal-ai/flux-pro/v1.1 \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "{prompt}",
    "image_size": {"width": 1080, "height": 1080},
    "num_images": 1
  }'
```

### Step 4: Compose Final Creative
After generating the background image, compose the final ad:

Option A — HTML Composition (recommended):
- Create an HTML file with the background image, text overlay, logo, and CTA button
- Render to PNG via Playwright (`npx playwright screenshot`)
- This gives pixel-perfect control over typography and layout

Option B — Image + Text Overlay:
- Use the generated image as-is
- Add text overlay in the ad platform (Google Ads, Meta Ads)

### Step 5: Quality Check
For each creative, verify:
- [ ] Text is legible against the background
- [ ] Brand colors are represented
- [ ] CTA is clearly visible
- [ ] No AI artifacts (extra fingers, distorted text, etc.)
- [ ] Correct dimensions for target platform

## Output
For each creative angle, save:
- Background image: `{output_dir}/EXP-{id}/creatives/{angle}-bg-{format}.png`
- Final composed PNG (if HTML path): `{output_dir}/EXP-{id}/creatives/{angle}-final-{format}.png`
- HTML source (if HTML path): `{output_dir}/EXP-{id}/creatives/{angle}-{format}.html`
- Prompts (if manual mode): `{output_dir}/EXP-{id}/creatives/prompts.md`

## Brand Integration
Read from config YAML:
- `company.brand_colors.primary` → main background or accent
- `company.brand_colors.accent` → CTA button, highlights
- `company.logo_url` → logo placement in creatives
- `company.name` → text references in copy
