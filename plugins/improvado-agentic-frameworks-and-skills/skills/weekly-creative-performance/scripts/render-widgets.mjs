#!/usr/bin/env node
// render-widgets.mjs — agent-side helper for weekly-creative-performance STEP 4 D4.
//
// Reads token dicts for the 3 widgets from stdin (JSON), reads the 3 widget HTML
// files from disk, performs the substitution loop documented in SKILL.md
// § STEP 4 D4 (a → a.5 strip leading <!-- --> doc comment → b substitute frozen
// tokens → c → d assert clean), and writes the 3 ready-to-slot HTML strings to
// stdout as a JSON object.
//
// Invocation (from the skill at STEP 4 D4):
//   echo "$TOKEN_DICTS_JSON" | node scripts/render-widgets.mjs
//
// Input shape (stdin JSON):
//   {
//     "fatigue":  { "SUBTITLE": "...", "KPI_DATA_JSON": {...}, ... },     // 5 tokens
//     "insights": { "INSIGHTS_CARDS_JSON": [...] },                       // 1 token
//     "gallery":  { "CREATIVES_DATA_JSON": [...], "DEFAULT_VIEW_MODE": "table", ... } // 5 tokens
//   }
//
// Output shape (stdout JSON):
//   { "fatigue": "<style>...</script>", "insights": "...", "gallery": "..." }
//
// On any assertion failure (unsubstituted __TOKEN__, surviving <!-- --> after
// strip, missing token in input, etc.) exits 1 with diagnostic on stderr.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WIDGETS_DIR = resolve(SCRIPT_DIR, '..', 'widgets');

// FROZEN token map — kept in lockstep with SKILL.md § STEP 4 D4 table.
// Tokens ending _JSON are JSON.stringify'd; plain string tokens are inserted
// verbatim (JSON.stringify'd into the surrounding componentCode at slot-fill).
const TOKEN_MAP = {
  fatigue: {
    file: 'creative-fatigue.html',
    tokens: [
      { name: 'SUBTITLE',                kind: 'string' },
      { name: 'KPI_DATA_JSON',           kind: 'json'   },
      { name: 'SEGMENTS_AGGREGATE_JSON', kind: 'json'   },
      { name: 'SEGMENTS_CREATIVES_JSON', kind: 'json'   },
      { name: 'DEFAULT_OPEN_SEGMENT',    kind: 'string' },
    ],
  },
  insights: {
    file: 'insights.html',
    tokens: [
      { name: 'INSIGHTS_CARDS_JSON', kind: 'json' },
    ],
  },
  gallery: {
    file: 'creative-gallery.html',
    tokens: [
      { name: 'CREATIVES_DATA_JSON',    kind: 'json'   },
      { name: 'PLATFORMS_PRESENT_JSON', kind: 'json'   },
      { name: 'TYPES_PRESENT_JSON',     kind: 'json'   },
      { name: 'DEFAULT_VIEW_MODE',      kind: 'string' },
      { name: 'DEFAULT_SORT_KEY',       kind: 'string' },
    ],
  },
};

function die(msg) {
  process.stderr.write(`render-widgets: ${msg}\n`);
  process.exit(1);
}

function readStdin() {
  // Synchronous stdin read — input is small (token dicts) and the helper is
  // a one-shot Bash invocation.
  try {
    return readFileSync(0, 'utf-8');
  } catch (err) {
    die(`failed to read stdin: ${err.message}`);
  }
}

function renderWidget(widgetName, spec, providedTokens) {
  const filepath = resolve(WIDGETS_DIR, spec.file);
  let html;
  try {
    html = readFileSync(filepath, 'utf-8');
  } catch (err) {
    die(`failed to read widget file ${filepath}: ${err.message}`);
  }

  // a.5 — strip leading <!-- ... --> doc comment first (matches SKILL.md prose
  // for the agent-side path), then strip any remaining <!-- ... --> comments
  // globally to enforce lint rule #10 ("no HTML comment survives inside any
  // componentCode"). Both are required:
  //   1. Leading comment may list __TOKEN__ markers — substitution would inject
  //      `--` (e.g. Google Ads URL `Fct--3bsnkQpt`) and HTML5 §13.1.6 terminates
  //      the enclosing comment early, corrupting the next <script>.
  //   2. Inline comments inside the body (e.g. tooltip docs in
  //      creative-gallery.html) are developer-only and browser ignores them;
  //      stripping them keeps the produced componentCode lint-clean.
  const styleIdx = html.indexOf('<style');
  if (styleIdx < 0) {
    die(`widget ${widgetName}: cannot find <style — file is malformed`);
  }
  html = html.slice(styleIdx);
  // Global strip of remaining HTML comments. Done BEFORE substitution so token
  // values containing `--` cannot be injected into a still-open comment.
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // b — substitute the frozen token map. Every token in spec.tokens MUST appear
  // in providedTokens; missing tokens are a contract violation.
  for (const { name, kind } of spec.tokens) {
    if (!(name in providedTokens)) {
      die(`widget ${widgetName}: token ${name} not provided in stdin payload`);
    }
    const value = providedTokens[name];
    const replacement = kind === 'json' ? JSON.stringify(value) : String(value);
    const marker = `__${name}__`;
    // Use split/join to do a global replace without regex (handles all chars literally).
    html = html.split(marker).join(replacement);
  }

  // d — assert no surviving __TOKEN__ and no surviving <!-- ... --> comments.
  // The first assertion catches typos in the SKILL.md token table; the second
  // catches the failure mode commit 01aabe10 fixed (HTML5 §13.1.6 comment
  // termination by `--` in data tokens).
  const tokenLeftover = html.match(/__[A-Z][A-Z0-9_]*__/);
  if (tokenLeftover) {
    die(`widget ${widgetName}: unsubstituted token ${tokenLeftover[0]} survives — update TOKEN_MAP or SKILL.md § STEP 4 D4 table`);
  }
  const commentLeftover = html.match(/<!--[\s\S]*?-->/);
  if (commentLeftover) {
    die(`widget ${widgetName}: HTML comment survives substitution (lint rule #10 violation) — a.5 strip failed`);
  }

  return html;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    die('empty stdin — expected JSON object with fatigue/insights/gallery keys');
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    die(`stdin is not valid JSON: ${err.message}`);
  }

  const out = {};
  for (const widgetName of ['fatigue', 'insights', 'gallery']) {
    if (!payload[widgetName] || typeof payload[widgetName] !== 'object') {
      die(`stdin payload missing key '${widgetName}' (must be an object of tokens)`);
    }
    out[widgetName] = renderWidget(widgetName, TOKEN_MAP[widgetName], payload[widgetName]);
  }

  process.stdout.write(JSON.stringify(out));
}

main();
