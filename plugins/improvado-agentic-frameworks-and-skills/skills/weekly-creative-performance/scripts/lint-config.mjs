#!/usr/bin/env node
// lint-config.mjs — deterministic check of all 22 _lint_before_save rules in
// dashboard-template.json. Inputs the assembled BIE config JSON via stdin;
// returns exit 0 (pass) or exit 1 (fail with structured diagnostics).
//
// Invocation (from the skill at STEP 4 D5, before invoking BIE):
//   cat assembled-config.json | node scripts/lint-config.mjs
//
// On pass: exit 0, no stderr.
// On fail: exit 1, stderr lines of form "<rule_id>: <message> at <json_path>"
// (one line per failure; all rules are checked, agent gets full picture).
//
// The rule set is the 21-rule _lint_before_save array in dashboard-template.json
// (which is the canonical source of truth). This script encodes each rule as a
// structured check; if a rule is added/removed/changed in dashboard-template.json,
// update RULES below to match.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(SCRIPT_DIR, '..', 'dashboard-template.json');

function die(msg) {
  process.stderr.write(`lint-config: ${msg}\n`);
  process.exit(2); // exit 2 = lint setup error (not a rule failure)
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch (err) {
    die(`failed to read stdin: ${err.message}`);
  }
}

// Each rule receives the parsed config + a `fail(msg, path)` reporter.
const RULES = [
  {
    id: 'L1', name: 'no surviving {{...}} slot tokens',
    check(cfg, fail) {
      const visit = (obj, path) => {
        if (typeof obj === 'string') {
          const m = obj.match(/\{\{[A-Z_]+\}\}/);
          if (m) fail(`unsubstituted slot token ${m[0]}`, path);
        } else if (Array.isArray(obj)) {
          obj.forEach((v, i) => visit(v, `${path}[${i}]`));
        } else if (obj && typeof obj === 'object') {
          for (const k of Object.keys(obj)) {
            // Allow {{...}} in documentation meta fields per template
            if (path === '' && (k === '_template_doc' || k === '_slots_overview' || k === '_lint_before_save')) continue;
            visit(obj[k], path ? `${path}.${k}` : k);
          }
        }
      };
      visit(cfg, '');
    },
  },
  {
    id: 'L2', name: 'widgets[] has exactly 3 entries: main-grid-4, main-grid-3, main-grid-1 in order',
    check(cfg, fail) {
      const w = cfg?.config?.editState?.widgets;
      if (!Array.isArray(w) || w.length !== 3) {
        fail(`expected 3 widgets, got ${w?.length}`, 'config.editState.widgets');
        return;
      }
      const expected = ['main-grid-4', 'main-grid-3', 'main-grid-1'];
      w.forEach((widget, i) => {
        if (widget?.id !== expected[i]) {
          fail(`widget[${i}].id expected '${expected[i]}', got '${widget?.id}'`, `config.editState.widgets[${i}].id`);
        }
      });
    },
  },
  {
    id: 'L3', name: 'layout.items has matching IDs + y=0/18/26',
    check(cfg, fail) {
      const items = cfg?.config?.editState?.layout?.items;
      if (!Array.isArray(items) || items.length !== 3) {
        fail(`expected 3 layout items, got ${items?.length}`, 'config.editState.layout.items');
        return;
      }
      const expected = [
        { id: 'main-grid-4', y: 0 },
        { id: 'main-grid-3', y: 18 },
        { id: 'main-grid-1', y: 26 },
      ];
      items.forEach((it, i) => {
        if (it?.id !== expected[i].id) fail(`items[${i}].id expected '${expected[i].id}', got '${it?.id}'`, `config.editState.layout.items[${i}].id`);
        if (it?.y !== expected[i].y) fail(`items[${i}].y expected ${expected[i].y}, got ${it?.y}`, `config.editState.layout.items[${i}].y`);
      });
    },
  },
  {
    id: 'L4', name: 'widgets[i].props.gridWidth == layout.items[i].w == 12',
    check(cfg, fail) {
      const widgets = cfg?.config?.editState?.widgets || [];
      const items = cfg?.config?.editState?.layout?.items || [];
      for (let i = 0; i < widgets.length; i++) {
        const gw = widgets[i]?.props?.gridWidth;
        const w = items[i]?.w;
        if (gw !== 12) fail(`widget[${i}].props.gridWidth expected 12, got ${gw}`, `config.editState.widgets[${i}].props.gridWidth`);
        if (w !== 12) fail(`layout.items[${i}].w expected 12, got ${w}`, `config.editState.layout.items[${i}].w`);
        if (gw !== w) fail(`mismatch: widget[${i}].props.gridWidth (${gw}) != layout.items[${i}].w (${w})`, `config.editState.widgets[${i}]`);
      }
    },
  },
  {
    id: 'L5', name: 'config.appearance at TOP LEVEL (not editState); colorMode + layout fields (chrome-hide nested under layout, not at top of appearance)',
    check(cfg, fail) {
      const appearance = cfg?.config?.appearance;
      if (!appearance) {
        fail('config.appearance missing (TOP LEVEL of config, not inside editState)', 'config.appearance');
        return;
      }
      // FORBIDDEN at top level of `appearance` — these aliases are stripped by AppearanceSchema.
      // The CONSUMING form per BIE APPEARANCE.md is the nested `appearance.layout.hide*` (checked below).
      const forbiddenTopLevel = ['hideTitle','showTitle','hideHeader','hideTopbar','hideFilters','hideFilterBar','showFilters','hidePeriodPicker','hideDateRange','hideTabSelector','hideFooter','hideBranding','hideSubtitle','showSubtitle'];
      for (const f of forbiddenTopLevel) {
        if (f in appearance) fail(`alias field '${f}' is at top level of appearance — must be nested under appearance.layout.${f} (or use the consuming name per BIE APPEARANCE.md). Top-level form is stripped by AppearanceSchema`, `config.appearance.${f}`);
      }
      // Wrong-nesting case (appearance under editState)
      if (cfg?.config?.editState?.appearance) {
        fail('appearance is nested under editState (will be stripped by EditStateSchema.strip()); move to config.appearance', 'config.editState.appearance');
      }
      // colorMode required
      if (appearance.colorMode !== 'light') {
        fail(`expected colorMode='light', got '${appearance.colorMode}'`, 'config.appearance.colorMode');
      }
      // Chrome-hide fields nested under appearance.layout (per BIE APPEARANCE.md and template).
      // Not strictly required by BIE, but the weekly-creative-performance dashboard expects
      // chrome hidden — emit a soft note if absent so the agent notices on review.
      const layout = appearance.layout || {};
      const expectedHides = ['hideTitle', 'hideFilters', 'hideFooter'];
      for (const h of expectedHides) {
        if (layout[h] !== true) {
          fail(`appearance.layout.${h} should be true (per template + BIE APPEARANCE.md chrome-hide pattern). Missing/false leaves dashboard chrome visible.`, `config.appearance.layout.${h}`);
        }
      }
    },
  },
  {
    id: 'L6', name: "config.appearance.layout.background == '#faf9f7'",
    check(cfg, fail) {
      const bg = cfg?.config?.appearance?.layout?.background;
      if (bg !== '#faf9f7') fail(`expected '#faf9f7', got '${bg}'`, 'config.appearance.layout.background');
    },
  },
  {
    id: 'L7', name: 'config.editState.schemaVersion === 2 (integer, not string)',
    check(cfg, fail) {
      const sv = cfg?.config?.editState?.schemaVersion;
      if (sv !== 2) fail(`expected integer 2, got ${JSON.stringify(sv)} (type ${typeof sv})`, 'config.editState.schemaVersion');
    },
  },
  {
    id: 'L8', name: 'every widget has props.componentCode (non-empty string)',
    check(cfg, fail) {
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code !== 'string' || code.length === 0) {
          fail(`widget[${i}] (${w?.id}) has missing/empty componentCode`, `config.editState.widgets[${i}].props.componentCode`);
        }
      });
    },
  },
  {
    id: 'L9', name: 'no hand-rolled escape artifacts (e.g. <\\/script>) inside any componentCode',
    check(cfg, fail) {
      // Rule intent: the agent must pass raw HTML to JSON.stringify; never
      // hand-roll backslash-escaping. The artifact of hand-rolling is `<\/`
      // (backslash-slash) appearing literally in the string. Each widget's
      // body legitimately contains </script> as its inline-script close tag —
      // that's fine because JSON.stringify embeds it as a JSON string value,
      // not as live HTML. We flag the escape-artifact instead.
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code !== 'string') return;
        if (code.includes('<\\/script>') || code.includes('<\\/')) {
          fail(`widget[${i}] (${w?.id}) componentCode has hand-rolled escape artifact (<\\/...) — pass raw HTML to JSON.stringify, do not pre-escape backslashes`, `config.editState.widgets[${i}].props.componentCode`);
        }
        // Sanity check: each widget should have exactly ONE </script> close tag
        // (matching its single inline <script>). Zero = truncation lost the
        // close (see L21); more than one = accidental concatenation.
        const closeCount = (code.match(/<\/script>/g) || []).length;
        if (closeCount !== 1) {
          fail(`widget[${i}] (${w?.id}) componentCode has ${closeCount} </script> close tags (expected exactly 1) — ${closeCount === 0 ? 'truncation (see L21)' : 'accidental concatenation'}?`, `config.editState.widgets[${i}].props.componentCode`);
        }
      });
    },
  },
  {
    id: 'L10', name: 'no <!-- ... --> HTML comment survives inside any componentCode (per 01aabe10 / HTML5 §13.1.6 fix)',
    check(cfg, fail) {
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code === 'string' && /<!--[\s\S]*?-->/.test(code)) {
          fail(`widget[${i}] (${w?.id}) componentCode has surviving HTML comment — a.5 strip failed (data tokens with '--' would corrupt next <script>)`, `config.editState.widgets[${i}].props.componentCode`);
        }
      });
    },
  },
  {
    id: 'L11', name: 'every <img> has inline onerror OR widget has document-level capture-phase error listener',
    check(cfg, fail) {
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code !== 'string') return;
        const imgs = code.match(/<img\b[^>]*>/gi) || [];
        if (imgs.length === 0) return; // no imgs to check (insights.html)
        // Pattern: `addEventListener('error', <fn>, true)` — capture flag is the
        // third arg. The function body can span lines/contain ')', so we don't
        // require the listener call to fit in a single regex match — checking
        // for the substrings `addEventListener('error'` AND `, true)` somewhere
        // after it is enough for the lint signal.
        const addIdx = code.indexOf("addEventListener('error'");
        const addIdxAlt = code.indexOf('addEventListener("error"');
        const hasCaptureHandler = (addIdx >= 0 && code.indexOf(', true)', addIdx) > addIdx)
                              || (addIdxAlt >= 0 && code.indexOf(', true)', addIdxAlt) > addIdxAlt);
        if (hasCaptureHandler) return; // widget-level handler covers all imgs
        for (const tag of imgs) {
          if (!/\bonerror\s*=/.test(tag)) {
            fail(`widget[${i}] (${w?.id}) has <img> without inline onerror AND no document-level capture handler`, `config.editState.widgets[${i}].props.componentCode`);
            return; // one report per widget is enough
          }
        }
      });
    },
  },
  {
    id: 'L12', name: 'dashboardSubtitle starts with platforms list, no raw {{ }}',
    check(cfg, fail) {
      const sub = cfg?.config?.dashboardSubtitle;
      if (typeof sub !== 'string' || !sub.length) {
        fail(`missing or empty dashboardSubtitle`, 'config.dashboardSubtitle');
        return;
      }
      if (/\{\{[A-Z_]+\}\}/.test(sub)) {
        fail(`dashboardSubtitle contains unsubstituted {{...}} braces`, 'config.dashboardSubtitle');
      }
    },
  },
  {
    id: 'L13', name: "top-level dashboardUrl === 'clients/template/dashboards/CrossChannelEditableDashboard.tsx' (canonical host-TSX path; removes dependency on BIE skill-cli's client-side slug→path override that gets bypassed by direct API POSTs)",
    check(cfg, fail) {
      const CANONICAL = 'clients/template/dashboards/CrossChannelEditableDashboard.tsx';
      if (cfg?.dashboardUrl !== CANONICAL) {
        fail(`expected '${CANONICAL}', got '${cfg?.dashboardUrl}'. v7.4.1 pinned this to the canonical TSX path so any save (skill-cli OR direct API) lands a value the Miras viewer can resolve via /experimental/agent/api/repo/file?repo_id=dashboard&path=<dashboardUrl>. The old slug 'creative-performance' only worked because skill-cli rewrote it; direct curl/fetch saves wrote the slug verbatim and the viewer 404'd.`, 'dashboardUrl');
      }
    },
  },
  {
    id: 'L14', name: 'top-level isMenuItem === true (boolean, not string)',
    check(cfg, fail) {
      if (cfg?.isMenuItem !== true) {
        fail(`expected boolean true, got ${JSON.stringify(cfg?.isMenuItem)} (type ${typeof cfg?.isMenuItem})`, 'isMenuItem');
      }
    },
  },
  {
    id: 'L15', name: "config.defaultTimePeriod present + non-empty (REQUIRED by BIE save validation)",
    check(cfg, fail) {
      const dtp = cfg?.config?.defaultTimePeriod;
      if (typeof dtp !== 'string' || dtp.length === 0) {
        fail(`missing or empty config.defaultTimePeriod (template ships 'all'; do not strip)`, 'config.defaultTimePeriod');
      }
    },
  },
  {
    id: 'L16', name: 'top-level dashboardTitle/dashboardUrl/isMenuItem mirrored alongside config',
    check(cfg, fail) {
      if (typeof cfg?.dashboardTitle !== 'string' || !cfg.dashboardTitle.length) {
        fail(`top-level dashboardTitle missing or empty`, 'dashboardTitle');
      }
      // dashboardUrl + isMenuItem also checked individually by L13/L14
    },
  },
  {
    id: 'L17', name: 'top-level dashboardTree present + non-empty (REQUIRED by BIE skill-cli.ts DashboardSettingsPayloadSchema)',
    check(cfg, fail) {
      if (typeof cfg?.dashboardTree !== 'string' || !cfg.dashboardTree.length) {
        fail(`missing or empty top-level dashboardTree — BIE CLI save will fail with 'Validation failed (payload): dashboardTree — Invalid input: expected string'. Convention: 'dashboards/<Title>.tsx' (virtual path)`, 'dashboardTree');
      }
    },
  },
  {
    id: 'L18', name: 'every custom-component widget has the BIE-doc-conformant prop set (title, showTitle, renderMode, customSqlEnabled, customSqlQuery, inheritFiltersFromDashboard, chromeless, cardStyle)',
    check(cfg, fail) {
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        if (w?.type !== 'custom-component') return; // only validates custom-component widgets
        const p = w.props || {};
        const required = {
          title:                       (v) => typeof v === 'string' && v.length > 0,
          showTitle:                   (v) => v === false,                              // we hide widget title (widgets own their headers)
          renderMode:                  (v) => v === 'html' || v === 'react',
          chromeless:                  (v) => v === true,                               // we want chromeless (no card border around widget)
          cardStyle:                   (v) => typeof v === 'string',
          inheritFiltersFromDashboard: (v) => v === false,                              // static baked-in data; dashboard filters do not apply
          customSqlEnabled:            (v) => v === false,                              // we never use custom SQL; ship static componentCode
          customSqlQuery:              (v) => v === '',                                 // empty when customSqlEnabled is false
          preloadLibraries:            (v) => Array.isArray(v),
        };
        for (const [field, predicate] of Object.entries(required)) {
          if (!(field in p)) {
            fail(`widget[${i}] (${w?.id}) custom-component is missing prop '${field}' (BIE CUSTOM_COMPONENT_WIDGET.md convention; production peer 'full-marketing-audit' ships it explicitly)`, `config.editState.widgets[${i}].props.${field}`);
          } else if (!predicate(p[field])) {
            fail(`widget[${i}] (${w?.id}) prop '${field}' has wrong value: ${JSON.stringify(p[field])}`, `config.editState.widgets[${i}].props.${field}`);
          }
        }
      });
    },
  },
  {
    id: 'L19', name: 'no raw platform CDN host AND no serve-URL pattern in src=/poster=/data-src=/data-vsrc= attribute values',
    check(cfg, fail) {
      // Contract: every URL embedded in a saved dashboard's componentCode MUST be either
      //   (a) a presigned S3 URL on an `amazonaws.com` host (or `supabase.co` — same
      //       contract; both are allowed by the BIE iframe's img-src CSP), OR
      //   (b) a YouTube embed/watch URL (iframe target — the gallery deep-links to it from a
      //       play overlay; it is never placed in a <video> src), OR
      //   (c) a data:/blob:/#fragment URL, OR
      //   (d) empty.
      //
      // FORBIDDEN:
      //   - Raw platform CDN hosts (the mirror was skipped) — every BIE iframe blocks these via CSP:
      //       fbcdn.net, akamaihd.net, cdninstagram.com   (Facebook / Instagram)
      //       tiktokcdn.com, tiktokcdn-us.com             (TikTok)
      //       pinimg.com                                  (Pinterest)
      //       licdn.com, media.licdn.com                  (LinkedIn)
      //       googleusercontent.com, ggpht.com, gstatic.com (Google Ads display CDN)
      //   - The serve URL pattern `/experimental/agent/api/files/serve?path=…` — this is the
      //     v7.5.0 "re-sign at view time" pattern that DOES NOT WORK inside the BIE custom-component
      //     widget. The widget renders inside a sandboxed `srcdoc` iframe with no access to session
      //     cookies; <img src="/experimental/agent/…"> requests are sent unauthenticated, the route's
      //     auth check returns 401/302-to-login, and the image silently fails. Use the raw S3
      //     presigned URL (response.download_url from discoveryFileDownloadTool) verbatim instead.
      //
      // ALLOWED:
      //   - amazonaws.com (the canonical mirror destination — img-src allowlist in BIE CSP)
      //   - supabase.co (alternate storage backend)
      //   - youtube.com/embed, youtube.com/watch, youtu.be (iframe targets for VIDEO_RESPONSIVE_AD)
      //   - Other relative paths (`/foo.png`, `./bar.png`), data:/blob:/#fragment URIs
      //
      // The regex is anchored to attribute values (the captured group inside `src="..."`, `poster="..."`,
      // `data-src="..."`, `data-vsrc="..."`) so hostnames appearing in JavaScript comments,
      // documentation strings, or code-fence examples inside componentCode do NOT trigger the rule.
      //
      // Fix path:
      //   - CDN host: re-run STEP 3d (SKILL.md § STEP 3d) to mirror via discoveryFileDownloadTool,
      //     or fall through to thumbnail_url=null + thumbnail_type='placeholder' on mirror failure.
      //   - Serve URL: STOP rewriting presigned URLs. Use response.download_url from
      //     discoveryFileDownloadTool verbatim. The v7.5.0 rewrite-mirror-urls.mjs helper was removed
      //     for this reason — its output silently breaks inside the iframe sandbox.
      const ATTR_RE = /\b(src|poster|data-src|data-vsrc)\s*=\s*"([^"]*)"/g;
      const SERVE_PREFIX = '/experimental/agent/api/files/serve?path=';
      const FORBIDDEN_HOSTS = [
        'fbcdn.net',
        'akamaihd.net',
        'cdninstagram.com',
        'tiktokcdn.com',
        'tiktokcdn-us.com',
        'pinimg.com',
        'licdn.com',
        'media.licdn.com',
        'googleusercontent.com',
        'ggpht.com',
        'gstatic.com',
      ];
      const FORBIDDEN_RE = new RegExp(
        '\\b(' + FORBIDDEN_HOSTS.map(h => h.replace(/\./g, '\\.')).join('|') + ')\\b',
        'i',
      );
      // Bare amazonaws.com URL (without ?X-Amz-Signature=) → 403 in iframe (bucket is private).
      // Catches the historical Bug 1 where the agent stripped the query string from
      // discoveryFileDownloadTool.response.download_url before stamping the gallery.
      const S3_HOST_RE   = /\bamazonaws\.com\b/i;
      const S3_SIGNED_RE = /[?&](X-Amz-Signature|Signature)=/;
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code !== 'string') return;
        const seen = new Set();
        let m;
        ATTR_RE.lastIndex = 0;
        while ((m = ATTR_RE.exec(code)) !== null) {
          const attrName = m[1];
          const value = m[2];
          if (!value) continue;                            // empty value — ok
          // Forbid the serve URL pattern BEFORE the generic "relative path is ok" early-return.
          if (value.startsWith(SERVE_PREFIX)) {
            const key = `${attrName}:serve`;
            if (seen.has(key)) continue;                   // dedup per widget
            seen.add(key);
            fail(
              `widget[${i}] (${w?.id}) ${attrName}= attribute value '${value.slice(0, 120)}${value.length > 120 ? '…' : ''}' is a serve URL — these silently 401 inside the BIE sandboxed srcdoc iframe (no session cookies). Use the raw S3 presigned URL (response.download_url from discoveryFileDownloadTool) verbatim; the v7.5.0 scripts/rewrite-mirror-urls.mjs helper was removed for this reason.`,
              `config.editState.widgets[${i}].props.componentCode`,
            );
            continue;
          }
          if (/^(\/|\.\/|#|data:|blob:)/.test(value)) continue; // other relative / data / blob — ok
          // Bare S3 URL (amazonaws.com host with no X-Amz-Signature query param) →
          // 403 in iframe. The bucket is private. Reject before the forbidden-CDN
          // check so the error message correctly diagnoses the actual problem.
          if (S3_HOST_RE.test(value) && !S3_SIGNED_RE.test(value)) {
            const key = `${attrName}:s3-unsigned`;
            if (seen.has(key)) continue;
            seen.add(key);
            fail(
              `widget[${i}] (${w?.id}) ${attrName}= attribute value '${value.slice(0, 160)}${value.length > 160 ? '…' : ''}' is an amazonaws.com URL with NO presigned signature (X-Amz-Signature / Signature query param missing). The bucket is private — bare URLs return 403 inside the iframe. Do NOT strip the query string from discoveryFileDownloadTool.response.download_url; store it VERBATIM (~1,920 chars including X-Amz-Algorithm, X-Amz-Credential, X-Amz-Date, X-Amz-Expires, X-Amz-Security-Token, X-Amz-Signature, X-Amz-SignedHeaders). Re-mirror this creative and copy the full download_url unchanged.`,
              `config.editState.widgets[${i}].props.componentCode`,
            );
            continue;
          }
          const hit = value.match(FORBIDDEN_RE);
          if (hit) {
            const key = `${attrName}:${hit[1].toLowerCase()}`;
            if (seen.has(key)) continue;                    // dedup per widget+host
            seen.add(key);
            fail(
              `widget[${i}] (${w?.id}) has forbidden CDN host '${hit[1]}' in ${attrName}= attribute value '${value.slice(0, 120)}${value.length > 120 ? '…' : ''}' — STEP 3d (SKILL.md § STEP 3d) was skipped for this URL. Re-run discoveryFileDownloadTool → use response.download_url verbatim, or fall through to thumbnail_url=null + thumbnail_type='placeholder' on mirror failure.`,
              `config.editState.widgets[${i}].props.componentCode`,
            );
          }
        }
      });
    },
  },
  {
    id: 'L20', name: 'componentCode size guard — fail before downstream silent truncation at ~100,000 chars',
    check(cfg, fail) {
      // Observed (v7.4.0 incident): some layer between agent and BIE silently
      // truncates componentCode at ~100,000 chars. The agent-side payload
      // (103,679 chars in the reported case) lost the IIFE tail (rerender();
      // })();</script>) and the widget failed to render. We don't know which
      // layer holds the cap — could be MCP transport, BIE skill-cli, or the
      // backend route — but the truncation is deterministic at the same byte
      // count, so a local lint that fails before save converts silent
      // corruption into a loud actionable error.
      //
      // Threshold is 99,500 (500-char headroom below 100,000) — the actual
      // cap may be 99,990 or 100,200; 99,500 is safely below either.
      const LIMIT = 99500;
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code !== 'string') return;
        if (code.length > LIMIT) {
          fail(
            `widget[${i}] (${w?.id}) componentCode is ${code.length} chars; downstream transport silently truncates at ~100,000. Reduce by (1) capping the gallery to top N by impressions (35 → 25 → 15, see SKILL.md § Data quality), (2) stripping unused fields from CreativeItem before embedding (see SKILL.md § Minimum embed field set). Each S3 presigned URL runs ~1,920 chars (STS temp creds + X-Amz-Security-Token), so the default 35 cap is already tight.`,
            `config.editState.widgets[${i}].props.componentCode`,
          );
        }
      });
    },
  },
  {
    id: 'L21', name: 'componentCode structural completeness — catches truncation regardless of cause',
    check(cfg, fail) {
      // Defense-in-depth for L20: even if the size cap moves or the base
      // widget grows past the cap silently, a truncated componentCode is
      // structurally invalid and we can detect that directly.
      //
      // Every widget in this skill ends with the IIFE pattern `})();</script>`.
      // Verified against creative-gallery.html:1086-1088, creative-fatigue.html
      // tail, insights.html tail. If a widget ends anywhere else, something
      // chopped the file.
      const TAIL_RE = /\)\s*\(\s*\)\s*;\s*<\/script>\s*$/;
      const widgets = cfg?.config?.editState?.widgets || [];
      widgets.forEach((w, i) => {
        const code = w?.props?.componentCode;
        if (typeof code !== 'string') return;
        const trimmed = code.replace(/\s+$/, '');
        if (!trimmed.endsWith('</script>')) {
          fail(
            `widget[${i}] (${w?.id}) componentCode does not end with </script> — likely truncated mid-string (last 80 chars: '${trimmed.slice(-80)}')`,
            `config.editState.widgets[${i}].props.componentCode`,
          );
          return;
        }
        if (!TAIL_RE.test(code)) {
          fail(
            `widget[${i}] (${w?.id}) componentCode ends with </script> but is missing the IIFE closure pattern })();</script> in the last 256 chars — JS body was truncated mid-statement (last 80 chars: '${code.slice(-80)}')`,
            `config.editState.widgets[${i}].props.componentCode`,
          );
        }
      });
    },
  },
  {
    id: 'L22', name: 'gallery CreativeItems with thumbnail_type=image have an amazonaws.com S3 thumbnail_url; thumbnail_type=video may use S3 URL OR YouTube embed OR null (catches the case where STEP 3d mirror was skipped silently OR where the agent rewrote presigned URLs into iframe-broken serve URLs)',
    check(cfg, fail) {
      // L19 catches forbidden URLs in src=/poster= HTML attributes AFTER widget render.
      // L22 catches the same bugs one layer earlier — at the data level, inside the
      // gallery widget's embedded `var D` CreativeItem array.
      //
      // Two failure modes this catches:
      //   1. STEP 3d (mirror) was skipped or only partially run — CreativeItem.thumbnail_url
      //      stays as the raw platform CDN URL, and the BIE iframe blocks it at view time.
      //   2. The agent ran STEP 3d correctly, then "improved" the URLs by rewriting them
      //      into serve URLs (`/experimental/agent/api/files/serve?path=…`). Serve URLs
      //      require session-cookie auth, which the sandboxed srcdoc iframe cannot provide,
      //      so every <img src="/serve?…"> silently 401s. The agent fix in the 2026-05-27
      //      incident hit exactly this — the dashboard saved with serve URLs and every
      //      gallery card rendered as a broken-image placeholder.
      //
      // ALLOWED forms (per CreativeItem):
      //   thumbnail_type='image' AND thumbnail_url contains an amazonaws.com or supabase.co host
      //     (the presigned S3 URL from discoveryFileDownloadTool.response.download_url)
      //   thumbnail_type='video' AND thumbnail_url:
      //     - contains an amazonaws.com / supabase.co host (mirrored poster — the normal case:
      //       normalize derives an img.youtube.com poster and § 7c mirrors it to S3), OR
      //     - is a YouTube embed/watch/short URL (iframe target — defensive allowance), OR
      //     - is null (no poster; gallery shows a play overlay that deep-links to video_url)
      //   thumbnail_type='text_preview' OR 'placeholder' — thumbnail_url is irrelevant (no check)
      //
      // FORBIDDEN:
      //   - thumbnail_type='image' AND thumbnail_url is null/empty
      //     (stamp thumbnail_type='placeholder' instead so the gallery renders the icon card)
      //   - thumbnail_type='image' AND thumbnail_url is a serve URL (silently 401s in iframe)
      //   - thumbnail_type='image' AND thumbnail_url is a raw platform CDN URL (CSP-blocked)
      //   - thumbnail_type='video' AND thumbnail_url is a non-S3, non-YouTube URL
      //
      // Fix path: re-run STEP 3d (SKILL.md § STEP 3d) for the listed creative IDs and
      // use response.download_url verbatim — do NOT post-process the URL. If the mirror
      // legitimately failed for a creative, stamp thumbnail_type='placeholder' before
      // re-linting.
      const widgets = cfg?.config?.editState?.widgets || [];
      const gallery = widgets.find(w => w?.id === 'main-grid-1');
      if (!gallery) return; // L2 will already complain about widget structure
      const code = gallery?.props?.componentCode;
      if (typeof code !== 'string' || code.length === 0) return;

      // Extract `var D = [...]` from the gallery's script body. The render-widgets.mjs
      // script substitutes __CREATIVES_DATA_JSON__ with a JSON.stringify'd array; the
      // gallery HTML wraps that in `var D = <ARRAY>;` (creative-gallery.html ~line 1083).
      // Match across newlines (the array spans many lines) and stop at the first `];`
      // by using a non-greedy capture followed by `\s*;`.
      const m = code.match(/var\s+D\s*=\s*(\[[\s\S]*?\])\s*;/);
      if (!m) {
        fail(
          `gallery componentCode (main-grid-1) is missing the 'var D = [...]' creative-array assignment — render-widgets.mjs may have failed to substitute __CREATIVES_DATA_JSON__, or the gallery widget HTML was rewritten without updating L22`,
          `config.editState.widgets[2].props.componentCode`,
        );
        return;
      }
      let creatives;
      try {
        creatives = JSON.parse(m[1]);
      } catch (err) {
        fail(
          `gallery componentCode (main-grid-1) 'var D' is not valid JSON: ${err.message}`,
          `config.editState.widgets[2].props.componentCode`,
        );
        return;
      }
      if (!Array.isArray(creatives)) {
        fail(
          `gallery componentCode (main-grid-1) 'var D' is not an array (got ${typeof creatives})`,
          `config.editState.widgets[2].props.componentCode`,
        );
        return;
      }

      const S3_HOST_RE = /\b(amazonaws\.com|supabase\.co)\b/i;
      // amazonaws.com URLs MUST carry an X-Amz-Signature (SigV4) or Signature
      // (SigV2) query param; the bucket is private and bare URLs return 403
      // inside the iframe. supabase.co URLs use a different signing model
      // (signed token in the path) so we don't apply the signature check there.
      const S3_AWS_HOST_RE   = /\bamazonaws\.com\b/i;
      const S3_AWS_SIGNED_RE = /[?&](X-Amz-Signature|Signature)=/;
      const YOUTUBE_RE = /(?:youtube\.com\/(?:embed|watch)|youtu\.be\/)/i;
      const SERVE_PREFIX = '/experimental/agent/api/files/serve?path=';
      // Cap how many failures we emit per widget so an entirely-broken gallery
      // produces a short, scannable error list rather than 50 near-identical lines.
      const FAIL_CAP = 5;
      let failureCount = 0;
      const failure = (msg) => {
        if (failureCount >= FAIL_CAP) return;
        failureCount++;
        fail(msg, `config.editState.widgets[2].props.componentCode`);
        if (failureCount === FAIL_CAP) {
          fail(
            `... (additional L22 failures suppressed; fix the listed ones first then re-lint)`,
            `config.editState.widgets[2].props.componentCode`,
          );
        }
      };

      // Per-URL diagnosis: classify whatever the agent set and produce the right fix hint.
      const diagnoseUrl = (tu) => {
        if (typeof tu !== 'string') return `is not a string (got ${typeof tu})`;
        if (tu.startsWith(SERVE_PREFIX)) {
          return `is a serve URL — these silently 401 inside the sandboxed iframe. Use response.download_url from discoveryFileDownloadTool verbatim; do NOT rewrite it`;
        }
        if (S3_AWS_HOST_RE.test(tu)) {
          if (!S3_AWS_SIGNED_RE.test(tu)) {
            return `'${tu.slice(0, 160)}${tu.length > 160 ? '…' : ''}' is an amazonaws.com URL with NO presigned signature query param (X-Amz-Signature missing). The bucket is private; bare URLs return 403 in the iframe. Do NOT strip the query string from discoveryFileDownloadTool.response.download_url — store it VERBATIM (~1,920 chars; do NOT trim, URL-decode, or split on '?')`;
          }
          return null;
        }
        if (S3_HOST_RE.test(tu)) return null; // supabase.co — different signing model; allow
        return `'${tu.slice(0, 100)}${tu.length > 100 ? '…' : ''}' is not an amazonaws.com / supabase.co presigned URL — STEP 3d mirror was skipped or returned an unexpected URL form`;
      };

      creatives.forEach((c, idx) => {
        const tt = c?.thumbnail_type;
        const tu = c?.thumbnail_url;
        const id = c?.id ?? '<no id>';

        if (tt === 'image') {
          if (tu === null || tu === undefined || tu === '') {
            failure(
              `gallery creative[${idx}] (id=${id}) thumbnail_type='image' but thumbnail_url is null/empty — if the mirror failed, stamp thumbnail_type='placeholder' instead of leaving 'image' with no URL`,
            );
            return;
          }
          const diag = diagnoseUrl(tu);
          if (diag) {
            failure(
              `gallery creative[${idx}] (id=${id}) thumbnail_type='image' thumbnail_url ${diag} — re-run SKILL.md § STEP 3d`,
            );
          }
        } else if (tt === 'video') {
          if (tu === null || tu === undefined || tu === '') {
            // null poster is acceptable — gallery shows a play overlay that deep-links to video_url
            return;
          }
          if (typeof tu !== 'string') {
            failure(
              `gallery creative[${idx}] (id=${id}) thumbnail_type='video' but thumbnail_url is not a string (got ${typeof tu})`,
            );
            return;
          }
          if (S3_AWS_HOST_RE.test(tu)) {
            if (!S3_AWS_SIGNED_RE.test(tu)) {
              failure(
                `gallery creative[${idx}] (id=${id}) thumbnail_type='video' thumbnail_url '${tu.slice(0, 160)}${tu.length > 160 ? '…' : ''}' is an amazonaws.com URL with NO presigned signature query param (X-Amz-Signature missing). The bucket is private; bare URLs return 403 in the iframe. Do NOT strip the query string from discoveryFileDownloadTool.response.download_url — store it VERBATIM (~1,920 chars)`,
              );
              return;
            }
            return;                               // signed S3 poster — OK
          }
          if (S3_HOST_RE.test(tu)) return;        // supabase.co — different signing model; OK
          if (YOUTUBE_RE.test(tu)) return;        // iframe target — OK (gallery handles)
          if (tu.startsWith(SERVE_PREFIX)) {
            failure(
              `gallery creative[${idx}] (id=${id}) thumbnail_type='video' thumbnail_url is a serve URL — these silently 401 inside the sandboxed iframe. Use response.download_url from discoveryFileDownloadTool verbatim; do NOT rewrite it`,
            );
            return;
          }
          failure(
            `gallery creative[${idx}] (id=${id}) thumbnail_type='video' thumbnail_url '${tu.slice(0, 100)}${tu.length > 100 ? '…' : ''}' is not an amazonaws.com presigned URL, YouTube embed, or null — STEP 3d mirror was skipped; re-run SKILL.md § STEP 3d`,
          );
        }
        // thumbnail_type='text_preview' or 'placeholder' → thumbnail_url is irrelevant; no check
      });
    },
  },
];

function main() {
  // Confirm template-side _lint_before_save is in sync with this script.
  // We don't parse the rules from the template directly (they're prose strings,
  // not structured checks) but we cross-check the count so a template-side
  // change is caught at lint-script invocation.
  let templateRuleCount;
  try {
    const tmpl = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf-8'));
    templateRuleCount = (tmpl._lint_before_save || []).length;
  } catch (err) {
    die(`failed to read template at ${TEMPLATE_PATH}: ${err.message}`);
  }
  const expectedTemplateRules = 22; // template ships 22 prose rules; script encodes 22 checks (L1-L22). L19 (rewritten in v8.1.0) forbids raw platform CDN hosts AND the v7.5.0 serve URL pattern in src=/poster= attributes — the latter silently 401s inside the BIE sandboxed srcdoc iframe (no session cookies). L20/L21 are the componentCode size guard + structural-completeness check. L22 (v8.1.0) inspects the gallery widget's embedded `var D` CreativeItem array — fails the save loudly when any image-typed CreativeItem carries a non-S3 thumbnail_url. ALLOWED forms in v8.1.0: amazonaws.com / supabase.co presigned URLs (the canonical mirror destination), YouTube embed URLs for video creatives, and `thumbnail_type='placeholder'` for graceful degradation.
  if (templateRuleCount !== expectedTemplateRules) {
    process.stderr.write(`lint-config: WARNING — dashboard-template.json _lint_before_save has ${templateRuleCount} rules; script encodes ${RULES.length}. Update RULES in this script to match the template, then bump expectedTemplateRules above.\n`);
  }

  const raw = readStdin();
  if (!raw.trim()) {
    die('empty stdin — expected assembled BIE config JSON');
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    die(`stdin is not valid JSON: ${err.message}`);
  }

  const failures = [];
  for (const rule of RULES) {
    rule.check(cfg, (msg, path) => {
      failures.push({ rule: rule.id, name: rule.name, msg, path });
    });
  }

  // Single-line JSON on stdout, deterministic shape. Exit 0 on pass, 1 on fail.
  // Callers can pipe stdout to `jq` or parse directly without juggling stderr.
  const result = {
    pass: failures.length === 0,
    checks: RULES.length,
    errors: failures.map(f => ({
      rule: f.rule,
      name: f.name,
      message: f.msg,
      path: f.path,
    })),
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
