#!/usr/bin/env node
// assemble-config.mjs — agent-side helper for weekly-creative-performance STEP 4 D5.
//
// Reads the rendered widget HTML map (output of render-widgets.mjs) + the
// top-level slot values (PLATFORMS_LIST, TODAY_ISO, DASHBOARD_NOTE_OR_EMPTY)
// from stdin (JSON), then loads dashboard-template.json from disk, substitutes
// the slot tokens, and writes the final BIE-ready config JSON to stdout.
//
// Why this exists: STEP 4 D5 documents an object-assembly pattern (parse →
// mutate fields → JSON.stringify once) that the agent has historically gotten
// wrong by writing bespoke Python/Node helpers inline (Teenybites trace,
// 2026-05-21: widget_tokens.py + assemble_config.py + a 60-line inline
// `node -e "..."` Bash arg). Those reinventions produced a non-deterministic
// pipeline and burned 6 tool calls. The canonical script handles the JSON
// escaping (every widget HTML goes through JSON.stringify implicitly via
// JSON.stringify(cfg) at the end — no manual backslashes), the subtitle
// substitution, and the schema-version coercion in one pass.
//
// Invocation (from the skill at STEP 4 D5):
//   echo "$ASSEMBLY_PAYLOAD_JSON" | node scripts/assemble-config.mjs
//
// Input shape (stdin JSON):
//   {
//     "widgets": {
//       "fatigue":  "<style>...</script>",   // output of render-widgets.mjs
//       "insights": "<style>...</script>",
//       "gallery":  "<style>...</script>"
//     },
//     "slots": {
//       "PLATFORMS_LIST":          "Google Ads | Facebook | TikTok",
//       "TODAY_ISO":               "2026-05-27",
//       "DASHBOARD_NOTE_OR_EMPTY": ""            // or " — tiktok: 4/12 thumbnails resolved"
//     }
//   }
//
// Output shape (stdout JSON):
//   { "dashboardTitle": "...", "dashboardUrl": "...", "dashboardTree": "...",
//     "isMenuItem": true, "config": { ... fully-substituted ... } }
//
// On any malformed input (missing widgets, missing slot, surviving {{...}}
// tokens, etc.) exits 1 with a diagnostic on stderr.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(SCRIPT_DIR, '..', 'dashboard-template.json');

const REQUIRED_WIDGET_KEYS = ['fatigue', 'insights', 'gallery'];
const REQUIRED_SLOT_KEYS = ['PLATFORMS_LIST', 'TODAY_ISO', 'DASHBOARD_NOTE_OR_EMPTY'];

// Maps widget key (input) → grid id (template). Order must match the template's
// widgets[] array order (main-grid-4 first, then main-grid-3, then main-grid-1).
const WIDGET_KEY_TO_GRID_ID = {
  fatigue: 'main-grid-4',
  insights: 'main-grid-3',
  gallery: 'main-grid-1',
};

function die(msg) {
  process.stderr.write(`assemble-config: ${msg}\n`);
  process.exit(1);
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch (err) {
    die(`failed to read stdin: ${err.message}`);
  }
}

function loadTemplate() {
  let raw;
  try {
    raw = readFileSync(TEMPLATE_PATH, 'utf-8');
  } catch (err) {
    die(`failed to read template at ${TEMPLATE_PATH}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`template at ${TEMPLATE_PATH} is not valid JSON: ${err.message}`);
  }
}

// Substitute the subtitle slots. The subtitle is the only string field in
// `config` that carries {{...}} tokens; all other tokens go into widget
// componentCode (handled by direct assignment below, not string substitution).
function substituteSubtitle(subtitle, slots) {
  let out = subtitle;
  for (const key of REQUIRED_SLOT_KEYS) {
    const marker = `{{${key}}}`;
    // Use split/join for literal replacement (no regex escaping concerns).
    out = out.split(marker).join(slots[key]);
  }
  return out;
}

export function assembleConfig(input, template) {
  // Validate input shape.
  if (!input || typeof input !== 'object') {
    die('stdin payload is not an object');
  }
  if (!input.widgets || typeof input.widgets !== 'object') {
    die('stdin payload missing `widgets` (must be {fatigue,insights,gallery: string})');
  }
  if (!input.slots || typeof input.slots !== 'object') {
    die('stdin payload missing `slots` (must be {PLATFORMS_LIST,TODAY_ISO,DASHBOARD_NOTE_OR_EMPTY: string})');
  }
  for (const k of REQUIRED_WIDGET_KEYS) {
    if (typeof input.widgets[k] !== 'string' || input.widgets[k].length === 0) {
      die(`widgets.${k} missing or not a non-empty string — pipe through render-widgets.mjs first`);
    }
  }
  for (const k of REQUIRED_SLOT_KEYS) {
    if (typeof input.slots[k] !== 'string') {
      die(`slots.${k} missing or not a string — STEP 4 D5 must provide PLATFORMS_LIST, TODAY_ISO, DASHBOARD_NOTE_OR_EMPTY`);
    }
  }

  // Deep clone the template via JSON round-trip so we don't mutate the cache.
  // Strip the doc-only fields (_template_doc, _slots_overview, _lint_before_save,
  // _componentCode_size_cap, _no_fake_byte_limits) — they're for the agent, not
  // for BIE's save payload (BIE's DashboardSettingsPayloadSchema uses
  // .passthrough() so they'd survive but they bloat the wire payload).
  const cfg = JSON.parse(JSON.stringify(template));
  for (const k of Object.keys(cfg)) {
    if (k.startsWith('_')) delete cfg[k];
  }

  // Subtitle slot substitution (the only string template field).
  if (cfg.config && typeof cfg.config.dashboardSubtitle === 'string') {
    cfg.config.dashboardSubtitle = substituteSubtitle(cfg.config.dashboardSubtitle, input.slots);
  } else {
    die('template missing config.dashboardSubtitle — template is malformed');
  }

  // Widget componentCode assignment by grid id (does NOT string-substitute the
  // raw template text — widget HTML contains `"`, newlines, and inline JS that
  // would break JSON if substituted as raw text; we assign by object reference
  // and let JSON.stringify(cfg) handle escaping in one pass at the end).
  const widgets = cfg?.config?.editState?.widgets;
  if (!Array.isArray(widgets) || widgets.length !== 3) {
    die(`template config.editState.widgets is not a 3-element array (got ${widgets?.length}) — template is malformed`);
  }
  // Build a lookup by grid id for safety against template reordering.
  const widgetById = {};
  widgets.forEach((w) => {
    if (w?.id) widgetById[w.id] = w;
  });
  for (const [widgetKey, gridId] of Object.entries(WIDGET_KEY_TO_GRID_ID)) {
    const w = widgetById[gridId];
    if (!w) {
      die(`template missing widget with id '${gridId}' (expected for '${widgetKey}')`);
    }
    if (!w.props || typeof w.props !== 'object') {
      die(`template widget '${gridId}' missing props object`);
    }
    w.props.componentCode = input.widgets[widgetKey];
  }

  // Assertion: no {{...}} slot tokens survive anywhere in the assembled config.
  // (lint-config.mjs L1 catches this too, but assembling cleanly is cheap and
  // gives a tighter error message.)
  const serialized = JSON.stringify(cfg);
  const surviving = serialized.match(/\{\{[A-Z_]+\}\}/);
  if (surviving) {
    die(`unsubstituted slot token ${surviving[0]} survives in assembled config — add it to REQUIRED_SLOT_KEYS or remove from template`);
  }

  return cfg;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    die('empty stdin — expected JSON object with widgets + slots keys');
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    die(`stdin is not valid JSON: ${err.message}`);
  }
  const template = loadTemplate();
  const cfg = assembleConfig(input, template);
  process.stdout.write(JSON.stringify(cfg));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
