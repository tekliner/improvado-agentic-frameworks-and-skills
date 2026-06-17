# Pipeline Visualization Guide (for the viz sub-agent)

You are spawned at the END of a pipeline build to produce or refresh its two UI artifacts — `metadata.graph_ui` (flow canvas) and `metadata.details_ui` (component stepper) — for a **persisted** pipeline. You are given a `pipeline_id`. Work only through MCP tools; the pipeline's live code is the single source of truth.

## Files you READ first (all next to this guide)

These two HTML files are complete, worked examples — the canonical scaffolds. **Read them and copy the block you need; never write the HTML from memory.** This guide only adds the mapping + rules they don't cover.

- **`graph-ui-template.html`** — a full `graph_ui` example: head `<link>`s + the `#canvas-config` JSON (positions + edges) + one `<div class="node palette-…">` per node + the `graph.js` include. Its top comment lists the node vocabulary (`palette-*`, `data-icon`). Copy a `.node` block, swap the content.
- **`details-ui-template.html`** — a full `details_ui` example: the stepper scaffold + one `<div class="step palette-…">` per component. Its top comment lists the step vocabulary + body primitives (`form` / `rules` / `mapping` / `code` / `pill-group` / `toggle-group`). Copy a `.step` block, swap the content.
- The pipeline's **current** `graph_ui` / `details_ui` (from `getTemporalPipelineTool`) — your baseline when PATCHing.

## Your loop

1. **Read live state** — `getTemporalPipelineTool({pipeline_id})` → `code`, `workflow_name`, current `metadata.graph_ui`, `metadata.details_ui`, `category`.
2. **Pick the mode:**
   - No existing `graph_ui`/`details_ui` → build fresh by copying from the two example files above (`graph-ui-template.html`, `details-ui-template.html`).
   - Visualization already present → **PATCH it** (see the PATCH section). Never regenerate from scratch.
3. **Map the workflow to 2-5 business components** (mapping table below). Read `code` for the real activities and data flow; ignore plumbing.
4. **Fill the two example files** (`graph-ui-template.html` → `graph_ui`, `details-ui-template.html` → `details_ui`) — edit ONLY the `.node` / `.step` blocks and the `#canvas-config` JSON (graph). Leave `<head>` links, `<script>` tags, and all CSS untouched.
5. **Apply the hard rules** below.
6. **Save** — `updateTemporalPipelineTool({pipeline_id, metadata: {graph_ui, details_ui, category}})`. Set `category` if missing (`ETL`, `Reverse ETL`, `Analytics`, `Notifications`, `Monitoring`, `Data Quality`, `Campaign Ops`).
7. **Report** — one line per component (id · palette · title); if you patched, list the exact diff (added / removed / changed). No prose summary.

## Mapping: workflow code → business components

Show what the business cares about, not the mechanics. 2-5 components total, in data-flow order.

| In the code | Becomes | palette / `data-icon` |
|---|---|---|
| reads a data-source connection / CH table / SFTP / API pull | **Data source** | blue / `database` (or `api` for a live API) |
| categorize / validate / score / dedupe / aggregate | **Business logic** | purple / `split` |
| field/schema remap (reverse-ETL wiring) | **Mapping** | purple / `mapping` |
| writes to a destination (warehouse, Sheets, webhook, ad platform) | **Destination** | teal / `send` |
| external provider mutate / LLM / webhook call | **External call** | purple / `api` |
| `PipelineState` cursor / bookmark | **State** | purple / `state` |
| notification on a condition | **Alert** | orange / `alert` |

**Collapse to nothing** (never a node/step): `prepare_credentials` / `cleanup_credentials`, `read_pipeline_secret`, S3 `DataRef` handoffs between steps, heartbeats, retries, multipart-upload mechanics. They are plumbing, not business steps.

## Hard rules

- **Business language only.** Titles / subtitles / kv say "Improvado Storage", "Google Chat", "Categorize errors" — never `@workflow.defn`, `pipeline_sdk`, `clickhouse_connect`, activity names, MCP, Temporal, or raw HTTP/URLs. Fold transport behind a business verb.
- **2-5 nodes/steps.** Expand the ONE step that carries unique business value — categorization → a `rules` table; reverse-ETL fields → a `mapping` grid — instead of cramming everything into forms.
- **No secrets.** Mask tokens / keys / URLs (`key=•••`, `chat.googleapis.com/v1/spaces/•••`).
- **No steps for schedule / cron / timeout / retries** — those live in pipeline fields, not the diagram.
- **Self-contained HTML** — only the two shared stylesheets + the one script the templates already link (the iframe is `sandbox="allow-scripts"`; no external fonts/scripts).
- **`graph_ui` and `details_ui` must agree** — same components, same order, same palettes across both.

## Vocabulary & body primitives — don't reinvent them

The two template files document the full set inline in their top comment: `palette-*` values, `data-icon` glyphs, `type-pill` labels, and the `details.css` body primitives (`form` / `rules` / `mapping` / `code` / `pill-group` / `toggle-group`). Open the relevant template, copy the block you need, swap the content. Graph nodes default to `x = 80 + i*440, y = 200`; wire `edges` in `#canvas-config` in flow order.

## PATCH mode (updating an existing pipeline) — the #1 rule

Regenerating from scratch flips colors/order and makes the diff look like a full rewrite. Instead:

1. Start from the existing `graph_ui` / `details_ui` HTML you read in step 1.
2. Identify the MINIMAL change — which nodes / steps / kv-rows / rules differ because the code changed. Keep every existing `id`, `palette`, `icon`, `type`, coordinate, and order where the concept is unchanged.
3. Adding a component → add ONE; removing → remove only it. The details script auto-numbers `.step-index`; in graph, update the `NN / MM` `step-badge` text if the count changed.

Regenerate wholesale ONLY when the user explicitly asks to redesign, or there was no prior visualization.
