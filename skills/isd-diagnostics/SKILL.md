---
name: isd-diagnostics
version: "2.2.0"
description: |
  Triage an ISD customer issue by layer (connection / extraction / load / destination / recipe)
  using the customer's own ClickHouse event logs, surface the relevant events as evidence for
  further investigation, and — for recipe-layer issues — name the recipe and hand off to
  recipe-qa-rules. Read-only. Reads the tenant schema; no agency_id resolution, no Palantir.
---
> **Precondition:** this skill MUST run impersonated into the customer's workspace
> (`createImpersonationContext`, like recipe-qa-rules). Only then does `clickhouseTool` route to the
> tenant schema and the unqualified table names resolve to the agency/workspace-scoped views. If run
> under the Improvado-internal agency, queries hit Palantir `internal_analytics` (shared tables) and
> this skill's tenant assumptions break — do NOT run it that way.

# ISD Diagnostics Skill

## Mission

You are a **scoped evidence retriever**, not a fixer. Given an ISD ticket symptom:
1. Decide **which platform layer** is implicated (connection / extraction / load / destination / recipe).
2. Run the layer's event-log query and **surface the relevant events** as evidence.
3. State the layer + what the events show, in plain language, and hand the evidence to the next step
   (the human TCS/PS analyst, the `isd-remediation` skill, or — for recipes — `recipe-qa-rules`).

You do **not** own the final fix. Pick the single most-likely layer, return the evidence, and stop.

End users are **both Improvado clients and our TCS/PS analysts** — keep output plain and self-explanatory.

## Scope guard — do NOT diagnose the log tables themselves

`src_improvado_user_activity_events`, `src_improvado_dataflow_run_events`, `src_improvado_mdg_rules`
are the **log SOURCE you read FROM**. They are never the subject of a diagnosis. If a ticket seems to
be "src_improvado_* is missing data / stale", that is **not** this skill's job — the health of those
pipelines is covered by internal alerts and monitoring. Never query a customer's *business* data
tables to "check the numbers"; only read the event logs above.

## Runtime & data model

This skill runs **inside the customer's ClickHouse schema** (the agent is impersonated into the
agency/workspace). The log tables are tenant **views** that already filter
`agency_id IN (X,0) AND workspace_id IN (W,0)` over `common_db`, so:

- **No `agency_id` resolution step.** Do not look up or pass `agency_id`.
- **No `AND agency_id = …` in any query.** Tenant scoping + the index pushdown are automatic.
- **No Palantir / `internal_analytics`.** Everything needed is in the tenant schema.
- `{user_id}` (actor) is **optional** — include `AND actor_user_id = {user_id}` only when the ticket
  identifies one user; otherwise query workspace-wide (the view is already workspace-scoped).

## MCP tools

- `clickhouseTool` — all evidence queries (read-only).
- `documentationTool` — only for the Explanation fallback (how-to / "what does X mean" tickets).
- **Handoff (not called directly):** recipe-layer findings are passed to **`recipe-qa-rules`** with a
  recipe identifier (`ai_notebook_id` preferred, else the view name).

❌ Do NOT call `getConnectionsTool`, `listAllExtractsTool`, or any other MCP tool.

---

## Layer decision tree

```
Symptom                                              → Layer       → Section
────────────────────────────────────────────────────────────────────────────
"connection broken / invalidated / reauthorize"      → Connection  → §C1
"extraction fails / token expired / auth error"      → Connection  → §C2
"extraction frozen / hasn't run in days / on pause"  → Extraction  → §E1
"added a field but no data / metric column missing"  → Extraction  → §E2
"load not completing / data not reaching DW"         → Load        → §L1
"BigQuery/Snowflake error / DW unavailable"          → Destination → §D1
"recipe stopped / turned itself off"                 → Recipe      → §R1
"data gone after recipe update / columns removed"    → Recipe      → §R2
"table disappeared / not found after rename"         → Recipe      → §R3
───────────── cross-symptom routers (resolve to a layer) ──────────────────
"numbers don't match / mismatch"                     → §X1 discrepancy
"data old / table not refreshing / stale"            → §X2 freshness
"how does X work / what does Y mean / is it possible" → Explanation fallback
```

When symptoms overlap, run the routers first (§X1/§X2) — they point you at the real layer.

---

## Connection layer

### §C1 — Connection broken / invalidated
**Source:** `src_improvado_user_activity_events` — `connection_invalidated` + `connection_accounts_update_fail` appear as a 1:1 pair.
```sql
SELECT user_activity_event_type, user_activity_event_time
FROM src_improvado_user_activity_events
WHERE user_activity_event_type IN (
        'connection_invalidated','connection_accounts_update_error',
        'connection_accounts_update_fail','connection_deleted')
  AND user_activity_event_time >= now() - INTERVAL 7 DAY
ORDER BY user_activity_event_time DESC
```
**Evidence → meaning:** rows ⇒ auth became invalid, client must reconnect in Settings → Connections, then trigger extraction. No rows ⇒ not a connection-level event; check §C2.

### §C2 — Extraction auth failure
**Source:** `src_improvado_dataflow_run_events` — `dataflow_run_event_status='Failed'`; class inferred inline (replaces unavailable `stg_dsas_error_mapping`).
```sql
SELECT datasource_title, datasource_account_name, dataflow_run_event_message,
       multiIf(
         multiMatchAny(dataflow_run_event_message, ['(?i)(token|auth|401|403|unauthorized|expired|invalid_grant|refresh_token|revoked)']), 'auth_expired',
         multiMatchAny(dataflow_run_event_message, ['(?i)(permission|access.denied|forbidden|insufficient.scope)']), 'permission',
         multiMatchAny(dataflow_run_event_message, ['(?i)(quota|rate.limit|429|throttl|too.many.requests)']), 'rate_limit',
         'other') AS error_class,
       max(dataflow_run_event_time) AS last_error, count() AS count_48h
FROM src_improvado_dataflow_run_events
WHERE dataflow_run_event_status = 'Failed'
  AND dataflow_run_event_time >= now() - INTERVAL 48 HOUR
GROUP BY datasource_title, datasource_account_name, dataflow_run_event_message, error_class
ORDER BY last_error DESC
```
**Evidence → meaning:** `auth_expired` ⇒ reconnect; `permission` ⇒ missing API access; `rate_limit` ⇒ self-resolves 1–2h; `other` ⇒ surface raw message.

---

## Extraction layer

### §E1 — Extraction paused / stuck
**Source:** `extraction_paused` with no matching `extraction_unpaused`.
```sql
WITH pauses AS (
  SELECT user_activity_event_time AS paused_at,
         JSONExtractString(user_activity_event_params,'order_id') AS order_id
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='extraction_paused'
    AND user_activity_event_time >= now() - INTERVAL 7 DAY),
unpauses AS (
  SELECT user_activity_event_time AS unpaused_at,
         JSONExtractString(user_activity_event_params,'order_id') AS order_id
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='extraction_unpaused'
    AND user_activity_event_time >= now() - INTERVAL 7 DAY)
SELECT p.order_id, p.paused_at, dateDiff('hour', p.paused_at, now()) AS hours_paused
FROM pauses p LEFT JOIN unpauses u ON p.order_id = u.order_id
GROUP BY p.order_id, p.paused_at
HAVING minIf(u.unpaused_at, u.unpaused_at > p.paused_at) IS NULL AND hours_paused > 48
ORDER BY hours_paused DESC
SETTINGS join_use_nulls = 1
```
**Caveat:** ~86% of pauses are system-generated (quota/billing). Pause *reason* lives in `dim_dts_orders`, which is NOT in tenant context — direct the client to check the `order_id` in Settings → Extractions before assuming a manual pause.

### §E2 — Fields changed without re-extraction
**Source:** `fields_changed` with no `historical_download_started` within 24h (largest uncovered config cluster, ~13%).
```sql
WITH dl AS (
  SELECT groupArray(user_activity_event_time) AS times
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='historical_download_started'
    AND user_activity_event_time >= now() - INTERVAL 30 DAY)
SELECT JSONExtractString(f.user_activity_event_params,'order_id') AS order_id,
       f.user_activity_event_time AS fields_changed_at
FROM src_improvado_user_activity_events f CROSS JOIN dl
WHERE f.user_activity_event_type='fields_changed'
  AND f.user_activity_event_time >= now() - INTERVAL 30 DAY
  AND arrayCount(t -> (t > f.user_activity_event_time AND t <= f.user_activity_event_time + INTERVAL 24 HOUR), dl.times) = 0
ORDER BY fields_changed_at DESC LIMIT 20
```
**Evidence → meaning:** rows ⇒ fields changed but never backfilled — trigger a historical re-download. The before/after field list is not in params — ask which field is missing.

---

## Load layer

### §L1 — Load not completing
**Source:** a `load_started` whose **own `load_id`** has no `load_completed` after it within 2h.

> **A1 fix (2026-06-04):** match start↔completion **by `load_id`**, not by time window. The v1 pattern
> (`load_completed` time-window via `groupArray` + `CROSS JOIN`) ignored `load_id`, so an unrelated
> load finishing within 2h could falsely mark a stuck load as completed (false negative when other
> loads are active). Grouping by `load_id` removes that.
```sql
WITH
starts AS (
  SELECT JSONExtractString(user_activity_event_params,'load_id')                AS load_id,
         min(user_activity_event_time)                                          AS start_time,
         any(JSONExtractString(user_activity_event_params,'order_ui_link'))     AS order_ui_link,
         any(JSONExtractString(user_activity_event_params,'load_destination_title')) AS destination_title
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='load_started'
    AND user_activity_event_time >= now() - INTERVAL 7 DAY
  GROUP BY load_id),
completes AS (
  SELECT JSONExtractString(user_activity_event_params,'load_id') AS load_id,
         max(user_activity_event_time)                           AS completed_at
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='load_completed'
    AND user_activity_event_time >= now() - INTERVAL 7 DAY
  GROUP BY load_id)
SELECT s.load_id, s.start_time, s.destination_title, s.order_ui_link,
       dateDiff('hour', s.start_time, now()) AS hours_since_start
FROM starts s LEFT JOIN completes c ON s.load_id = c.load_id
WHERE (c.completed_at IS NULL OR c.completed_at < s.start_time)   -- this load_id never completed after it started
  AND s.start_time < now() - INTERVAL 2 HOUR
ORDER BY s.start_time DESC
SETTINGS join_use_nulls = 1
```
> **Caveat:** this assumes `load_completed.load_id` shares the **same grain** as `load_started.load_id`.
> The 30d ratio is ~1:14 started:completed (batch fan-out, BI-9852 §5) — if the two events key loads
> differently, every start could look stuck (false positives). If §L1 returns suspiciously many stuck
> loads, treat the result as low-confidence and confirm load state via `isd-remediation` (`getLoadTool`).

**Evidence → meaning:** include `order_ui_link` so the client can open the load order. Repeated failures ⇒ check §D1.

> **B3 result — paused vs stuck is NOT in the logs.** The event taxonomy has only **4** load types:
> `load_started`, `load_completed`, `load_created` (config), `create_load_changed` (auto-create setting)
> — there is **no** `load_paused` / `load_failed` event (BI-9852 §5). So `isd-diagnostics` can only say
> "this load did not complete"; whether it is **paused** (→ `unpauseLoadTool`) vs **idle/stuck**
> (→ `runLoadTool`) is resolved downstream by `isd-remediation` Action B via `getLoadTool`. Do not try to
> infer pause state from events.

> **L1-init gap (2026-06-05, validated on ISD-21856).** §L1 only catches a load that **started**
> (`load_started`) and didn't complete. A load stuck in **`init`** — created/queued but **never started** —
> emits **no** `load_started` event (and the taxonomy has no `load_init`/`load_failed`/`load_paused`), so
> §L1 returns **nothing** for it even though the load is genuinely stuck. Confirmed live: ISD-21856 (Novus
> Media) had 4 loads stuck in `init` with zero run events, and §L1 came back empty. **Therefore:** when the
> ticket says "stuck / pending / initializing for days" but §L1 is empty, do **not** conclude "no problem" —
> a never-started load is **not diagnosable from the event log**. Hand off to `isd-remediation` Action B to
> read the load's **live** status via `getLoadTool`, or escalate. This is a scope boundary, not a missing query.

---

## Destination layer

### §D1 — Destination unavailable
**Source:** `status_changed` (DestinationConnection) — the only subtype exposing real status in params.
```sql
SELECT JSONExtractString(user_activity_event_params,'destination_connection_title') AS destination_title,
       JSONExtractString(user_activity_event_params,'destination_type') AS destination_type,
       countIf(JSONExtractString(user_activity_event_params,'destination_status')='error')  AS errors_7d,
       countIf(JSONExtractString(user_activity_event_params,'destination_status')='active') AS ok_7d,
       max(user_activity_event_time) AS last_check
FROM src_improvado_user_activity_events
WHERE user_activity_event_type='status_changed'
  AND JSONExtractString(user_activity_event_params,'product_domain_event_aggregate_class')='DestinationConnection'
  AND JSONExtractString(user_activity_event_params,'product_domain_event_usecase')='DestinationConnectionCheckCompletedUseCase'
  AND user_activity_event_time >= now() - INTERVAL 7 DAY
GROUP BY destination_title, destination_type
HAVING errors_7d > 0
ORDER BY errors_7d DESC
```
**Baseline error rates (30d, BI-9852 §11.1):** s3 0.8% · gbq 2.7% · redshift 4.2% · sftp 5.2% · clickhouse 10.1% · ms_sql 15% · databricks 18% · snowflake 32.8% · postgre_sql 31.9% · my_sql 78.2%. Compare `errors_7d/(errors_7d+ok_7d)` to baseline before escalating.

---

## Recipe layer  → name the recipe, then hand off to `recipe-qa-rules`

The recipe layer does **not** do recipe QA or re-activation here — it detects the signal, **names the
recipe**, and emits the recipe identity in the handoff. Two consumers downstream:
- **QA** → `recipe-qa-rules` (bootstraps from a view name, or better from `ai_notebook_id`).
- **Re-activation** → `isd-remediation` Action D, which routes to `notebook-editor`. **A2 (2026-06-04):**
  isd-remediation has no `clickhouseTool`, so it relies on the `recipe_id` / `ai_notebook_id` THIS layer
  resolves (R1 via `src_improvado_mdg_rules`, R2 via `recipe_event_view_name`, R3 via `new_view_name`).
  Always include it in the handoff so Action D stops having to ask the client which recipe.

### Recipe naming — resolution order (R-naming fallback)
> **Validated on ISD-21906 (Method1 / ws 22754, 2026-06-05).** The per-case sources above can ALL come
> back empty on a real **custom (non-MDG)** recipe: `src_improvado_mdg_rules` held only the workspace's
> MDG alert rules (not the custom recipe), and `recipe_view_name_updated` carried **empty**
> `new_view_name` / `old_view_name`. Do not stop at "name unknown" — walk this order until one resolves:
> 1. **R1** `src_improvado_mdg_rules.ai_notebook_id` / `mdg_view_name` (MDG recipes only).
> 2. **R2** `recipe_event_view_name` (from `recipe_backward_compatibility_validation_failed`).
> 3. **R3** `new_view_name` (from `recipe_view_name_updated`) — often empty in tenant data.
> 4. **Fallback (NEW): `recipe_event_view_name` from `recipe_promoted` or `recipe_columns_validated`.**
>    These fire on every publish and DO carry the production view name (e.g. `flowchart_extraction_recipe`)
>    — the most reliable tenant source for custom recipes. Query the latest such event for the workspace.
> 5. Last resort: the recipe link / `notebookId` the client put in the ticket.
> Always pass whatever resolved into the `recipe-qa-rules` handoff so its `system.tables` state check
> (`_staging` / `_pre_prod` / prod matrix) can run.

### §R1 — Recipe deactivated and not re-activated (recipe_mdg cluster)
**Source:** `recipe_deactivated` with `recipe_event_is_manual_deactivation='1'` and no `recipe_activated` within 24h.
> `is_manual='0'` deactivations are normal staging cleanup (18,752 vs 2,169 in 30d) — ignore. Source: BI-9852 §6.
```sql
WITH act AS (
  SELECT groupArray(user_activity_event_time) AS times
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='recipe_activated'
    AND user_activity_event_time >= now() - INTERVAL 7 DAY)
SELECT d.user_activity_event_time AS deactivated_at,
       dateDiff('hour', d.user_activity_event_time, now()) AS hours_since
FROM src_improvado_user_activity_events d CROSS JOIN act
WHERE d.user_activity_event_type='recipe_deactivated'
  AND JSONExtractString(d.user_activity_event_params,'recipe_event_is_manual_deactivation')='1'
  AND d.user_activity_event_time >= now() - INTERVAL 7 DAY
  AND arrayCount(t -> (t > d.user_activity_event_time AND t <= d.user_activity_event_time + INTERVAL 24 HOUR), act.times) = 0
ORDER BY deactivated_at DESC LIMIT 20
```
**Naming (the event has no name):** resolve the recipe from the tenant dimension `src_improvado_mdg_rules`:
```sql
-- recipe identity + current status for this tenant (dimension-first detection also possible)
SELECT ai_notebook_id, mdg_view_name, mdg_rule_name, mdg_rule_id,
       mdg_rule_latest_status, mdg_view_updated_by_email,
       mdg_view_latest_processing_error_message,
       mdg_view_latest_update_time_from_check_events AS last_view_update
FROM src_improvado_mdg_rules
ORDER BY last_view_update DESC
```
> **Dimension-first option:** instead of the event arithmetic above, filter `src_improvado_mdg_rules`
> by `mdg_rule_latest_status` (inactive/deactivated) + stale `last_view_update` — gives name +
> `ai_notebook_id` + owner directly, sidestepping the empty event params.
> **Handoff:** pass `ai_notebook_id` (preferred) or `mdg_view_name` to `recipe-qa-rules`.
> **OPEN:** confirm join key (event params → `ai_notebook_id`/`mdg_rule_id`) and `mdg_rule_latest_status` freshness; MDG dimension may not cover plain non-MDG recipes.

### §R2 — Recipe schema change broke output (backward-compat)
**Source:** `recipe_backward_compatibility_validation_failed`, no `recipe_activated` within 24h. **`recipe_event_view_name` + `recipe_event_error_message` ARE populated** → name is in the event.
```sql
WITH act AS (
  SELECT groupArray(user_activity_event_time) AS times
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='recipe_activated'
    AND user_activity_event_time >= now() - INTERVAL 30 DAY)
SELECT JSONExtractString(f.user_activity_event_params,'recipe_event_view_name')     AS recipe_view_name,
       JSONExtractString(f.user_activity_event_params,'recipe_event_error_message') AS error_message,
       JSONExtractString(f.user_activity_event_params,'recipe_event_is_impersonated') AS is_impersonated,
       f.user_activity_event_time AS failed_at
FROM src_improvado_user_activity_events f CROSS JOIN act
WHERE f.user_activity_event_type='recipe_backward_compatibility_validation_failed'
  AND f.user_activity_event_time >= now() - INTERVAL 30 DAY
  AND arrayCount(t -> (t > f.user_activity_event_time AND t <= f.user_activity_event_time + INTERVAL 24 HOUR), act.times) = 0
ORDER BY failed_at DESC LIMIT 20
```
**Evidence → meaning:** pass `error_message` to the client verbatim (names removed columns / type changes). **Handoff** `recipe_view_name` to `recipe-qa-rules`. `is_impersonated='1'` ⇒ an Improvado employee was working in the account.

### §R3 — Recipe view renamed without re-activation (table disappeared)
**Source:** `recipe_view_name_updated`, no `recipe_activated` within 24h. **Name is in `new_view_name`** (NOT `recipe_event_view_name`, which is empty here — v1 bug; corrects BI-9852 §7).
```sql
WITH act AS (
  SELECT groupArray(user_activity_event_time) AS times
  FROM src_improvado_user_activity_events
  WHERE user_activity_event_type='recipe_activated'
    AND user_activity_event_time >= now() - INTERVAL 30 DAY)
SELECT JSONExtractString(r.user_activity_event_params,'new_view_name') AS new_view_name,
       JSONExtractString(r.user_activity_event_params,'old_view_name') AS old_view_name,
       r.user_activity_event_time AS renamed_at,
       dateDiff('hour', r.user_activity_event_time, now()) AS hours_since
FROM src_improvado_user_activity_events r CROSS JOIN act
WHERE r.user_activity_event_type='recipe_view_name_updated'
  AND r.user_activity_event_time >= now() - INTERVAL 30 DAY
  AND arrayCount(t -> (t > r.user_activity_event_time AND t <= r.user_activity_event_time + INTERVAL 24 HOUR), act.times) = 0
ORDER BY renamed_at DESC LIMIT 20
```
**Evidence → meaning:** rows ⇒ a recipe view was renamed but never re-activated; the renamed recipe sits in draft and its table isn't produced. Tell the client to re-activate. **Handoff** `new_view_name` to `recipe-qa-rules`.

---

## Cross-symptom routers

### §X1 — Data discrepancy ("numbers don't match")
Correlate extraction failures in the 24h window, then route to the implicated layer.
```sql
SELECT count() AS failures_24h,
       countIf(multiMatchAny(dataflow_run_event_message, ['(?i)(token|auth|401|403|unauthorized|expired|invalid_grant|refresh_token|revoked)'])) AS auth_failures
FROM src_improvado_dataflow_run_events
WHERE dataflow_run_event_status='Failed' AND dataflow_run_event_time >= now() - INTERVAL 24 HOUR
```
`auth_failures>0` → Connection (§C2). `failures_24h>10` → extraction errors. `=0` → likely timezone/attribution/platform delay (no technical signal). *(Recipe-level value discrepancy — `all_data` vs recipe — belongs to `recipe-qa-rules`, not here.)*

### §X2 — Data freshness ("data old / not refreshing")
**Source:** `table_freshness_changed` (written after each successful extraction); no update >24h.
```sql
SELECT JSONExtractString(user_activity_event_params,'datatable_title') AS datatable_title,
       JSONExtractString(user_activity_event_params,'datasource_name') AS datasource_name,
       max(user_activity_event_time) AS last_update,
       dateDiff('hour', max(user_activity_event_time), now()) AS hours_stale
FROM src_improvado_user_activity_events
WHERE user_activity_event_type='table_freshness_changed'
  AND user_activity_event_time >= now() - INTERVAL 30 DAY
GROUP BY datatable_title, datasource_name
HAVING last_update < now() - INTERVAL 24 HOUR
ORDER BY hours_stale DESC
```
Freshness lag is a **symptom** — route to §E1 (paused?) and §C2 (errors?). **Latency:** `table_freshness_changed` arrives p50 ~13–15 min / p95 ~26 min — never call data stale if lag <2h (BI-9851).

---

## Explanation fallback — no technical signal

Some tickets are questions ("how does attribution work?", "is it possible to…?"), not malfunctions —
no event signal exists. When the symptom is a how-to / "what is" / "can I" / "why does" question, or all
relevant layer queries returned nothing and the ticket reads like a question: call `documentationTool`,
answer plainly, and cite the source. Do not run more ClickHouse queries.

---

## Handoff contract (C6) + signal freshness (C7)

**C6 — emit a structured handoff block** alongside the plain-language answer, so `isd-remediation`
consumes it without re-deriving anything from prose. One fenced block per finding:

```yaml
isd_handoff:
  layer: extraction            # connection | extraction | load | destination | recipe | none
  case: E1                     # the section that fired (C1/C2/E1/E2/L1/D1/R1/R2/R3/X1/X2)
  ids:                         # only the keys this case actually resolved (omit the rest)
    order_id: "123456"         # E1/E2
    load_id: "789012"          # L1
    ai_notebook_id: "9696..."  # R1 (from src_improvado_mdg_rules)
    view_name: "..._recipe"    # R2 recipe_event_view_name / R3 new_view_name
    datasource_title: "Facebook Ads"   # C2/C6 — human label, NOT datasourceName
  suggested_action: A          # remediation action A/B/C/D/E, or null if none
  signal_event_time: "2026-06-04T11:20:00Z"   # newest matching event (C7)
  signal_age_minutes: 92                       # now() - signal_event_time
  needs_live_recheck: false    # true if signal_age < ingest floor (see C7)
```
Rule: only fill `ids` keys the case resolved; never invent one. `suggested_action` maps via the
diagnose→remediate table (E1→A, L1→B, E2/R2→C, R1/R2/R3→D, C2/C6→E). If `layer: none`, omit the block.

**C7 — stamp every finding with signal age, and guard against acting on too-fresh signals.**
Events lag the live system: `table_freshness_changed` / recipe events p50 ~13–15 min, p95 ~26 min;
`dataflow_run_events` similar (BI-9851). Therefore:
- Each case already selects the event time — also surface `signal_age` (now() − newest matching event).
- **Never call data "stale" / a load "stuck" if the relevant signal age is below the symptom threshold**
  (freshness <2h; load not-completing <2h start age — already enforced in §X2/§L1).
- Set `needs_live_recheck: true` when `signal_age_minutes` is **below the ingest floor (~30 min)** — the
  log may simply not have caught up. `isd-remediation` must then re-read live state (`getExtractStatusTool`
  / `getLoadTool`) before mutating, rather than trust a possibly-incomplete log signal. This is also why
  after a fix you wait before re-running diagnosis (remediation Action E after-care).

---

## Output rules (evidence-first)

1. **Name the layer** you triaged to, in one line.
2. **Show the evidence** — the events found (or "no technical signal in the last N").
3. **Plain language** — what the events mean; cite the time window searched **and the signal age** (C7).
4. **Recipe layer:** always emit the recipe identifier (`ai_notebook_id` / view name) — to `recipe-qa-rules` (QA) and to `isd-remediation` Action D (re-activate via notebook-editor).
5. **Emit the `isd_handoff` block** (C6) whenever a layer fired — that is the machine contract for remediation.
6. **One layer, one handoff.** You are scoping evidence, not closing the ticket.
7. **No business-data queries, no diagnosing src_improvado_* themselves.**
