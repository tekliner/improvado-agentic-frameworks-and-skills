#!/usr/bin/env node
// normalize.mjs — agent-side helper for weekly-creative-performance § 7a + § 7c.
//
// Two modes:
//
// PASS 1 (default): Takes raw per-platform Discovery API payloads (already
// extracted from the markdown wrapper per PLATFORMS.md § "How discoveryRequestTool
// returns") and outputs a normalized CreativeItem[] sorted
// (mirrorable-first, impressions-DESC), the pre-applied 35-item mirror cap
// stamped per item via `mirror_priority`, the ready-to-dispatch `mirror_queue[]`,
// and per-segment fatigue aggregates.
//
// PASS 2 (--apply-mirrors): Takes the PASS 1 output plus the mirror_results[]
// the agent collected from discoveryFileDownloadTool, injects mirrored
// download_url values into matching creative_items (VERBATIM — hard-fails on
// any URL missing X-Amz-Signature), demotes non-mirrored items to placeholder,
// and emits the final CreativeItem[] ready for render-widgets.mjs.
//
// Invocations (from the skill at § 7a / § 7c):
//   echo "$RAW_PAYLOAD_JSON"  | node scripts/normalize.mjs                  > .context/wcp-norm.json
//   echo "$APPLY_INPUT_JSON"  | node scripts/normalize.mjs --apply-mirrors  > .context/wcp-final.json
//
// PASS 1 input shape (stdin JSON):
//   {
//     "now_iso": "2026-05-28T00:00:00Z",
//     "facebook": {
//       "<connector_id>": {
//         "<account_id>": {
//           "adcreatives": [ ...raw .data[] from /adcreatives, all pages merged... ],
//           "insights":    [ ...raw .data[] from /insights ... ],
//           "ads_fallback":[ ...raw .data[] from /ads?filtering=[{...}] if DPA fired; else [] ]
//         }
//       }
//     },
//     "google_ads": {
//       "<connector_id>": {
//         "<customer_id>": {
//           "main_gaql":       [ ...raw results[] from main GAQL... ],
//           "backfill_gaql":   [ ...raw results[] from STEP 1G... ],
//           "asset_api":       [ ...raw results[] from IMAGE Asset API; [] if no Responsive Display / App ads... ],
//           "video_asset_api": [ ...raw results[] from YOUTUBE_VIDEO Asset API; [] if no VIDEO_RESPONSIVE_AD... ],
//           "app_ad_gaql":     [ ...raw results[] from the isolated APP_AD image backfill; [] if no App ads... ]
//         }
//       }
//     }
//   }
//
// PASS 1 output shape (stdout JSON):
//   {
//     "creative_items": [ ...CreativeItem[] sorted mirrorable-first, impressions-DESC.
//                         Each item carries `mirror_priority: 1..35` (in queue) or `null` (not in queue). ],
//     "mirror_queue": [
//       { "id": "g_123", "dataSource": "google_ads_ql", "connectionId": 42,
//         "url": "<raw CDN URL>", "fileName": "creative_google_ads_abc.jpg" }
//     ],
//     "totals": {
//       "total": int, "fresh": int, "healthy": int, "fatiguing": int, "dead": int, "unknown": int,
//       "health_score": int|null, "health_score_color": "#hex",
//       "spend_at_risk": number, "spend_at_risk_str": "$1.2K"
//     },
//     "platforms_present": [ "facebook", "google_ads", ... ],
//     "types_present":     [ "IMAGE", "RSA", "RESPONSIVE_DISPLAY", "VIDEO", ... ]
//   }
//
// PASS 2 input shape (stdin JSON):
//   {
//     "normalized":     <PASS 1 output verbatim>,
//     "mirror_results": [
//       { "id": "g_123", "download_url": "https://im-ai-agent-bucket.s3.amazonaws.com/...?X-Amz-Signature=..." },
//       { "id": "fb_456", "error": "404 from CDN" }
//     ]
//   }
//
// PASS 2 output: PASS 1 output with creative_items[i].thumbnail_url replaced by
// the verbatim download_url for mirrored items, non-mirrored items demoted to
// `thumbnail_type='placeholder'`, helper fields (`mirror_priority`, `mirror_queue`)
// stripped. Hard-fails (exit 1) on any download_url lacking `X-Amz-Signature=`.
//
// Errors → stderr + exit 1. Missing input keys are tolerated (treated as []).

import { readFileSync } from 'node:fs';

const PALETTE = {
  facebook:   { color: '#c47d4a', letter: 'FB', full: 'Facebook' },
  google_ads: { color: '#7a9e7e', letter: 'G',  full: 'Google Ads' },
  linkedin:   { color: '#9b7ea4', letter: 'LI', full: 'LinkedIn' },
  tiktok:     { color: '#000000', letter: 'TT', full: 'TikTok' },
  pinterest:  { color: '#c4877a', letter: 'PI', full: 'Pinterest' },
};

function die(msg) {
  process.stderr.write(`normalize: ${msg}\n`);
  process.exit(1);
}

function readStdin() {
  try { return readFileSync(0, 'utf-8'); }
  catch (err) { die(`failed to read stdin: ${err.message}`); }
}

function truncName(s, n = 60) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 3) + '...' : s;
}

function parseHsaAd(urlTags) {
  if (!urlTags) return null;
  const m = String(urlTags).match(/hsa_ad=([^&]+)/);
  return m ? m[1] : null;
}

function isDPAName(name) {
  return typeof name === 'string' && name.includes('{{product.');
}

function num(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return isFinite(n) ? n : null;
}

// CTR bucket → segment + color (per SKILL.md § 7b)
function bucketCtr({ impressions, ctr }) {
  if (impressions == null || impressions < 10 || ctr == null) {
    return { segment: 'unknown', color: '#9ca3af' };
  }
  if (ctr > 2.5)  return { segment: 'fresh',     color: '#7a9e7e' };
  if (ctr >= 1.5) return { segment: 'healthy',   color: '#b8b0a5' };
  if (ctr >= 0.5) return { segment: 'fatiguing', color: '#c47d4a' };
  return                  { segment: 'dead',      color: '#c4877a' };
}

function makeFB({ ad_id, source_connector_id, name, thumbnail_url, stable_id,
                  impressions, clicks, ctr, spend, status, is_dpa, creative_type, ad_format }) {
  const p = PALETTE.facebook;
  return {
    id: `fb_${ad_id}`,
    platform: 'facebook',
    platform_color: p.color, platform_letter: p.letter, platform_full: p.full,
    name: truncName(name),
    full_name: name || ad_id,
    status: status || 'ACTIVE',
    thumbnail_url,
    thumbnail_type: thumbnail_url ? 'image' : 'placeholder',
    video_url: null, video_duration: null, text_preview: null, permalink_url: null,
    source_connector_id: Number(source_connector_id),
    stable_id: String(stable_id || ad_id),
    impressions, clicks, ctr, spend, conversions: null,
    creative_type: creative_type || 'IMAGE',
    ad_format: ad_format || (is_dpa ? 'DPA' : 'SINGLE_IMAGE'),
    ad_strength: null,
    fatigue_segment: null, segment_color: null,
  };
}

function normalizeFacebook(fb) {
  const items = [];
  if (!fb || typeof fb !== 'object') return items;

  for (const [connector_id, accounts] of Object.entries(fb)) {
    for (const [account_id, p] of Object.entries(accounts || {})) {
      const adcreatives = p.adcreatives || [];
      const insights    = p.insights    || [];
      const ads_fb      = p.ads_fallback || [];

      // /adcreatives row by parsed hsa_ad
      const hsaToCreative = new Map();
      for (const c of adcreatives) {
        const hsa = parseHsaAd(c.url_tags);
        if (hsa) hsaToCreative.set(hsa, c);
      }
      // /ads?filtering result by ad_id (for DPA fallback)
      const adsFbById = new Map();
      for (const a of ads_fb) adsFbById.set(a.id, a);

      const seenInInsights = new Set();
      for (const ins of insights) {
        const ad_id = ins.ad_id;
        seenInInsights.add(ad_id);

        const cr = hsaToCreative.get(ad_id);
        const adsRow = adsFbById.get(ad_id);
        let name, thumbnail_url, stable_id, is_dpa = false, ad_format;
        if (cr) {
          name = cr.name || ins.ad_name || ad_id;
          thumbnail_url = cr.image_url || cr.thumbnail_url || null;
          stable_id = cr.image_hash || cr.video_id || cr.id;
          is_dpa = isDPAName(name) || !cr.image_url;
          ad_format = is_dpa ? 'DPA' : (cr.video_id ? 'VIDEO' : 'SINGLE_IMAGE');
        } else if (adsRow) {
          const c = adsRow.creative || {};
          name = adsRow.name || c.name || ins.ad_name || ad_id;
          thumbnail_url = c.thumbnail_url || c.image_url || null;
          stable_id = c.id || adsRow.id;
          is_dpa = isDPAName(name);
          ad_format = 'DPA';
        } else {
          name = ins.ad_name || ad_id;
          thumbnail_url = null;
          stable_id = ad_id;
          is_dpa = isDPAName(name);
          ad_format = 'DPA';
        }

        items.push(makeFB({
          ad_id, source_connector_id: connector_id, name, thumbnail_url, stable_id,
          impressions: num(ins.impressions), clicks: num(ins.clicks),
          ctr: num(ins.ctr), spend: num(ins.spend),
          status: ins.status, is_dpa, ad_format,
        }));
      }

      // Older /adcreatives rows WITHOUT recent insights — include with zero metrics
      // so the gallery shows image-bearing creatives even when impressions are zero.
      for (const c of adcreatives) {
        const hsa = parseHsaAd(c.url_tags);
        if (hsa && seenInInsights.has(hsa)) continue;
        const ad_id = hsa || c.id;
        const name = c.name || ad_id;
        const is_dpa = isDPAName(name) || !c.image_url;
        items.push(makeFB({
          ad_id, source_connector_id: connector_id,
          name,
          thumbnail_url: c.image_url || c.thumbnail_url || null,
          stable_id: c.image_hash || c.video_id || c.id,
          impressions: null, clicks: null, ctr: null, spend: null,
          status: c.status, is_dpa,
          ad_format: is_dpa ? 'DPA' : (c.video_id ? 'VIDEO' : 'SINGLE_IMAGE'),
        }));
      }
    }
  }
  return items;
}

function googleAdType(t) {
  if (!t) return 'OTHER';
  if (t === 'IMAGE_AD' || t === 'DISPLAY_UPLOAD_AD') return 'IMAGE';
  if (t === 'RESPONSIVE_DISPLAY_AD') return 'RESPONSIVE_DISPLAY';
  if (t === 'RESPONSIVE_SEARCH_AD') return 'RSA';
  if (t === 'VIDEO_RESPONSIVE_AD') return 'VIDEO';
  if (t === 'APP_AD') return 'OTHER';
  return 'OTHER';
}

function normalizeGoogle(g) {
  const items = [];
  if (!g || typeof g !== 'object') return items;

  for (const [connector_id, customers] of Object.entries(g)) {
    for (const [customer_id, p] of Object.entries(customers || {})) {
      const main = p.main_gaql || [];
      const backfill = p.backfill_gaql || [];
      const assets = p.asset_api || [];

      // Asset.id -> URL map for Responsive Display + App-ad image resolution
      const assetUrl = new Map();
      for (const a of assets) {
        const id = a.asset?.id;
        const url = a.asset?.imageAsset?.fullSize?.url;
        if (id && url) assetUrl.set(String(id), url);
      }
      // Asset.id -> YouTube video id (YOUTUBE_VIDEO Asset API pass).
      const ytById = new Map();
      for (const a of (p.video_asset_api || [])) {
        const id = a.asset?.id;
        const yt = a.asset?.youtubeVideoAsset?.youtubeVideoId;
        if (id && yt) ytById.set(String(id), String(yt));
      }
      // ad.id -> app_ad.images[] (isolated APP_AD image backfill — kept out of
      // the main GAQL so an unsupported field can't fail the whole query).
      const appAdImagesByAdId = new Map();
      for (const r of (p.app_ad_gaql || [])) {
        const a = r.adGroupAd?.ad || {};
        const aid = a.id || r.adGroupAd?.id;
        const imgs = a.appAd?.images;
        if (aid && Array.isArray(imgs) && imgs.length) appAdImagesByAdId.set(String(aid), imgs);
      }
      // First resolvable URL from an AdImageAsset[] (Responsive Display
      // marketingImages OR App-ad images) via the IMAGE asset map.
      const firstAssetUrl = (imgs) => {
        for (const mi of (imgs || [])) {
          const u = assetUrl.get(String(mi.asset || '').split('/').pop());
          if (u) return u;
        }
        return null;
      };

      const byAdId = new Map();
      const intoItem = (row, sourceTag) => {
        const ad = row.adGroupAd?.ad || {};
        const ad_id = ad.id || row.adGroupAd?.id;
        if (!ad_id) return;
        const type = googleAdType(ad.type);
        const m = row.metrics || {};
        const impressions = num(m.impressions);
        const clicks = num(m.clicks);
        const ctrFraction = num(m.ctr);
        const ctr = ctrFraction != null ? ctrFraction * 100 : null;
        const spend = num(m.costMicros) != null ? num(m.costMicros) / 1_000_000 : null;
        let thumbnail_url = ad.imageAd?.imageUrl || null;
        if (!thumbnail_url && ad.responsiveDisplayAd?.marketingImages?.length && assetUrl.size) {
          thumbnail_url = firstAssetUrl(ad.responsiveDisplayAd.marketingImages);
        }
        // App-campaign ads carry their creative images as asset refs. The main
        // GAQL doesn't select them (the isolated APP_AD backfill does — see
        // PLATFORMS § Google Ads); resolve against the same IMAGE asset map.
        if (!thumbnail_url && ad.type === 'APP_AD' && assetUrl.size) {
          thumbnail_url = firstAssetUrl(ad.appAd?.images || appAdImagesByAdId.get(String(ad_id)));
        }
        let text_preview = null;
        if (type === 'RSA') {
          const h = ad.responsiveSearchAd?.headlines?.[0]?.text;
          if (h) text_preview = h;
        }
        // VIDEO_RESPONSIVE_AD: resolve the YouTube id (YOUTUBE_VIDEO Asset API),
        // then derive the embed URL (iframe target — NEVER mirrored) and the
        // poster (img.youtube.com — raw here, mirrored to S3 in § 7c). No id
        // resolvable → Path-A "Video Ad" text card.
        let video_url = null;
        let video_stable = null;
        if (type === 'VIDEO') {
          const vAsset = ad.videoResponsiveAd?.videos?.[0]?.asset;
          const vAssetId = vAsset ? String(vAsset).split('/').pop() : null;
          const ytId = vAssetId ? ytById.get(vAssetId) : null;
          if (ytId) {
            video_url = 'https://www.youtube.com/embed/' + ytId;
            thumbnail_url = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
            video_stable = ytId;
          } else {
            text_preview = 'Video Ad: ' + (ad.name || ad_id);
            video_stable = vAssetId;
          }
        }
        const p = PALETTE.google_ads;
        const item = {
          id: `g_${ad_id}`,
          platform: 'google_ads',
          platform_color: p.color, platform_letter: p.letter, platform_full: p.full,
          name: truncName(ad.name || ad_id),
          full_name: ad.name || ad_id,
          status: row.adGroupAd?.status === 'PAUSED' ? 'PAUSED' :
                  row.adGroupAd?.status === 'REMOVED' ? 'OTHER' : 'ACTIVE',
          thumbnail_url,
          thumbnail_type:
            type === 'VIDEO'
              ? (thumbnail_url ? 'video' : (text_preview ? 'text_preview' : 'placeholder'))
              : (thumbnail_url ? 'image'
                 : (type === 'RSA' && text_preview) ? 'text_preview' : 'placeholder'),
          video_url,
          video_duration: null,
          text_preview,
          permalink_url: ad.finalUrls?.[0] || null,
          source_connector_id: Number(connector_id),
          stable_id: ad.imageAd?.imageUrl ? String(ad_id) :
                     video_stable ? String(video_stable) :
                     (assetUrl.size && ad.responsiveDisplayAd?.marketingImages?.[0]?.asset) ?
                       String(ad.responsiveDisplayAd.marketingImages[0].asset).split('/').pop() :
                       String(ad_id),
          impressions, clicks, ctr, spend, conversions: num(m.conversions),
          creative_type: type,
          ad_format: type === 'IMAGE' ? 'IMAGE_AD' :
                     type === 'RESPONSIVE_DISPLAY' ? 'RESPONSIVE_DISPLAY' :
                     type === 'RSA' ? 'RSA' :
                     type === 'VIDEO' ? 'VIDEO_RESPONSIVE' : null,
          ad_strength: row.adGroupAd?.adStrength || null,
          fatigue_segment: null, segment_color: null,
        };
        byAdId.set(String(ad_id), item);
      };

      for (const r of main) intoItem(r, 'main');
      // Merge STEP 1G backfill: patch missing thumbnail, OR upsert
      for (const r of backfill) {
        const ad = r.adGroupAd?.ad || {};
        const ad_id = String(ad.id || r.adGroupAd?.id || '');
        if (!ad_id) continue;
        const existing = byAdId.get(ad_id);
        const url = ad.imageAd?.imageUrl;
        if (existing) {
          if (!existing.thumbnail_url && url) {
            existing.thumbnail_url = url;
            existing.thumbnail_type = 'image';
          }
        } else if (url) {
          intoItem(r, 'backfill');
        }
      }
      for (const item of byAdId.values()) items.push(item);
    }
  }
  return items;
}

// § 7c mirror-priority predicate. Matches lint L19/L22 and § 7c Step 2's
// mirror-eligibility exactly so the (mirrorable-first, impressions-DESC) sort
// is cap-aware: no slot in the 35-cap is "wasted" on a URL the agent will
// later reject at mirror dispatch.
function isMirrorable(u) {
  if (!u || typeof u !== 'string') return false;
  // Only iframe targets are excluded. img.youtube.com/vi/<id>/hqdefault.jpg
  // (the YouTube poster) IS mirrorable and must enter the queue.
  if (/youtube\.com\/(embed|watch)|youtu\.be\//i.test(u)) return false;          // iframe targets
  if (u.startsWith('/experimental/agent/api/files/serve?path=')) return false;   // already mirrored (serve URL)
  if (/amazonaws\.com/i.test(u)) return false;                                    // already on S3 from a prior run
  return true;
}

const MIRROR_CAP = 35;
const PLATFORM_TO_DATASOURCE = {
  facebook:   'facebook',
  google_ads: 'google_ads_ql',
  linkedin:   'linkedin_ads',
  tiktok:     'tiktok_ads',
  pinterest:  'pinterest_ads',
};

// Hard contract for --apply-mirrors. discoveryFileDownloadTool.response.download_url
// is a presigned S3 URL ~1,920 chars. Bare path (without ?X-Amz-Signature=) →
// 403 in the BIE sandboxed iframe (bucket is private). Catches the Bug 1
// failure mode loudly at script time instead of silently at view time.
const PRESIGNED_RE = /amazonaws\.com\/.+[?&](X-Amz-Signature|Signature)=/i;

function runNormalize(input) {
  const items = [];
  items.push(...normalizeFacebook(input.facebook));
  items.push(...normalizeGoogle(input.google_ads));
  // LinkedIn / TikTok / Pinterest — agent normalizes inline per PLATFORMS.md
  // (no helper yet; their CreativeItems can be appended to `items` by the agent
  // before sort + aggregate if those platforms are in PLATFORMS[]).
  if (Array.isArray(input.other_platforms_items)) items.push(...input.other_platforms_items);

  // Compute fatigue per item
  for (const it of items) {
    const { segment, color } = bucketCtr({ impressions: it.impressions, ctr: it.ctr });
    it.fatigue_segment = segment;
    it.segment_color = color;
  }

  // Sort: mirrorable-first, then impressions DESC. Items with a fetchable URL
  // outrank items without — so zero-impression IMAGE_ADs with image_url land
  // INSIDE the 35-cap instead of being demoted to placeholder at positions 65+.
  items.sort((a, b) => {
    const am = isMirrorable(a.thumbnail_url) ? 1 : 0;
    const bm = isMirrorable(b.thumbnail_url) ? 1 : 0;
    if (am !== bm) return bm - am;
    return (b.impressions ?? -1) - (a.impressions ?? -1);
  });

  // Apply the 35-cap and emit the ready-to-dispatch mirror queue. Agent walks
  // mirror_queue and fires discoveryFileDownloadTool for each entry.
  const seen = new Set();
  const mirror_queue = [];
  let rank = 0;
  for (const it of items) {
    if (!isMirrorable(it.thumbnail_url)) { it.mirror_priority = null; continue; }
    const key = `${it.thumbnail_url}|${it.stable_id}`;
    if (seen.has(key) || rank >= MIRROR_CAP) { it.mirror_priority = null; continue; }
    seen.add(key);
    rank++;
    it.mirror_priority = rank;
    const dataSource = PLATFORM_TO_DATASOURCE[it.platform];
    if (!dataSource) die(`item ${it.id}: unknown platform '${it.platform}' (no dataSource alias)`);
    mirror_queue.push({
      id: it.id,
      dataSource,
      connectionId: it.source_connector_id,
      url: it.thumbnail_url,
      fileName: `creative_${it.platform}_${it.stable_id}.jpg`,
    });
  }

  // Totals (non-unknown)
  const totals = { total: 0, fresh: 0, healthy: 0, fatiguing: 0, dead: 0, unknown: 0,
                   health_score: null, health_score_color: '#9ca3af',
                   spend_at_risk: 0, spend_at_risk_str: '$0' };
  for (const it of items) {
    totals[it.fatigue_segment]++;
    if (it.fatigue_segment !== 'unknown') totals.total++;
    if (it.fatigue_segment === 'dead' || it.fatigue_segment === 'fatiguing') {
      totals.spend_at_risk += (it.spend || 0);
    }
  }
  if (totals.total > 0) {
    totals.health_score = Math.round((totals.fresh + totals.healthy * 0.7) / totals.total * 100);
    totals.health_score_color = totals.health_score >= 80 ? '#7a9e7e' :
                                totals.health_score >= 50 ? '#c47d4a' : '#c4877a';
  }
  const sar = totals.spend_at_risk;
  totals.spend_at_risk_str =
    sar >= 1000 ? `$${(sar / 1000).toFixed(1).replace(/\.0$/, '')}K` : `$${Math.round(sar)}`;

  const platforms_present = [...new Set(items.map(i => i.platform))];
  const types_present     = [...new Set(items.map(i => i.creative_type))];

  return {
    creative_items: items,
    mirror_queue,
    totals,
    platforms_present,
    types_present,
  };
}

function runApplyMirrors(input) {
  const normalized = input?.normalized;
  const mirror_results = input?.mirror_results;
  if (!normalized || !Array.isArray(normalized.creative_items)) {
    die(`--apply-mirrors: stdin.normalized.creative_items is missing or not an array`);
  }
  if (!Array.isArray(mirror_results)) {
    die(`--apply-mirrors: stdin.mirror_results is missing or not an array`);
  }

  const byId = new Map();
  for (const r of mirror_results) {
    if (!r || typeof r !== 'object' || !r.id) continue;
    byId.set(r.id, r);
  }

  for (const it of normalized.creative_items) {
    // Items NOT in the mirror queue (mirror_priority null): drop the raw CDN URL.
    //   image → placeholder (L22 rejects `image` + null URL).
    //   video → keep `video` with a null poster — L22 allows video+null, and the
    //           gallery still renders the play overlay + deep-link. A raw
    //           img.youtube.com poster left on a `video` item WOULD fail L22.
    if (it.mirror_priority == null) {
      if (it.thumbnail_type === 'image') {
        it.thumbnail_url = null;
        it.thumbnail_type = 'placeholder';
      } else if (it.thumbnail_type === 'video') {
        it.thumbnail_url = null;
      }
      continue;
    }
    const r = byId.get(it.id);
    if (!r || r.error || !r.download_url) {
      // Mirror failed: a video keeps its type (play + deep-link, no poster);
      // everything else becomes a placeholder.
      it.thumbnail_url = null;
      if (it.thumbnail_type !== 'video') it.thumbnail_type = 'placeholder';
      continue;
    }
    if (typeof r.download_url !== 'string' || !PRESIGNED_RE.test(r.download_url)) {
      die(
        `item ${it.id}: download_url is missing X-Amz-Signature query param — ` +
        `agent must pass discoveryFileDownloadTool.response.download_url VERBATIM ` +
        `(do NOT trim, split on '?', URL-decode, or "clean up" the query string). ` +
        `Got: ${String(r.download_url).slice(0, 200)}`
      );
    }
    it.thumbnail_url = r.download_url; // verbatim
  }

  // Strip PASS 1 helper fields before emitting the final shape.
  for (const it of normalized.creative_items) delete it.mirror_priority;
  delete normalized.mirror_queue;

  return normalized;
}

// --- main ---

const APPLY_MODE = process.argv.includes('--apply-mirrors');

const raw = readStdin();
let input;
try { input = JSON.parse(raw); }
catch (err) { die(`stdin is not valid JSON: ${err.message}`); }

const output = APPLY_MODE ? runApplyMirrors(input) : runNormalize(input);

process.stdout.write(JSON.stringify(output) + '\n');
