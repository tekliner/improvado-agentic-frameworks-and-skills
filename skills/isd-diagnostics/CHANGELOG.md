# ISD Diagnostics Skill — Changelog

## v2.0.0 — 2026-06-04 (layer-first redesign, tenant-CH-only)

### Changed (breaking — structure + scoping)
- **Layer-first structure** replaces the flat 11 cases: Connection (§C1/§C2), Extraction (§E1/§E2), Load (§L1), Destination (§D1), Recipe (§R1/§R2/§R3), plus cross-symptom routers Discrepancy (§X1) / Freshness (§X2). Same validated signals, regrouped by where the failure lives. (`isd-remediation` references updated to the new IDs.)
- **Tenant-CH-only.** Removed Step 0 (`agency_id` resolution) and every `AND agency_id = {agency_id}` filter. The skill runs impersonated into the customer workspace, where the log tables are agency+workspace-scoped views (`agency_id IN (X,0) AND workspace_id IN (W,0)` over `common_db`) — scoping and the index pushdown are automatic, no Palantir. **Supersedes the v1.3.0 / BI-9855 explicit-`agency_id` fix** (which only mattered when querying the shared Palantir table). Added a **Precondition** requiring workspace impersonation.
- **Contract narrowed to a "scoped evidence retriever":** surface the relevant events + the layer + (recipe) the handoff key — not a single terminal fix.

### Added
- **Recipe naming closed for all 3 cases:** §R2 `recipe_event_view_name`, §R3 **`new_view_name`** (fixes a v1 bug — Case 10 read the always-empty `recipe_event_view_name`), §R1 via tenant dimension **`src_improvado_mdg_rules`** (`ai_notebook_id` ↔ `mdg_view_name` ↔ `mdg_rule_latest_status`). Recipe layer hands off to `recipe-qa-rules` (QA) and `isd-remediation` Action D (re-activate).
- **Scope guard:** `src_improvado_*` are the log SOURCE, never the subject of diagnosis (their health = internal alerts/monitoring) — fixes agents over-attending to `src_improvado_*`.
- **§L1 load matching by `load_id`** (not a time window) — an unrelated load completing within 2h no longer falsely clears a stuck load.
- **Handoff contract (`isd_handoff` block)** + **signal-age (latency) stamp** with `needs_live_recheck` below the ~30-min ingest floor, so `isd-remediation` re-reads live state before mutating.

> **Pending live validation (pre-prod):** (a) the ISD flow impersonates the customer workspace (not the internal agency); (b) every agency has the tenant views; (c) `src_improvado_mdg_rules` join key + `mdg_rule_latest_status` freshness, and the §L1 `load_id` grain (load_started↔load_completed). Blocked locally by db-access/auth; validate on the PR pre-prod deploy.

## v1.3.0 — 2026-06-03

### Changed
- **All user-scoped cases (1, 4, 5, 6, 7, 8, 9, 10, 11): added `AND agency_id = {agency_id}` alongside `actor_user_id = {user_id}`.** `agency_id` is the primary-key prefix of `src_improvado_user_activity_events`; filtering only by `actor_user_id` could not use the index and scanned the full time window. Adding `agency_id` makes the queries index-efficient: ~175× fewer rows read (30.2M → 172K for a 30-day user-scoped query in the BI-9855 benchmark, 2026-06-03). Every real user maps to exactly one agency (0 multi-agency users / 0 `agency_id=0` rows across 139 users in 30d), so the filter never drops rows. Cases 2/3 already filtered `agency_id`.
- **Step 0** note updated: `agency_id` is now used in every case query, not just Cases 2–3.
- Resolves BI-9855 (cost/perf of agent event queries) via a query-pattern fix — no hot/cold table split needed.

## v1.2.0 — 2026-06-01

### Added
- **Case 9 — Recipe schema change broke output** (`recipe_backward_compatibility_validation_failed`). Surfaces the populated `recipe_event_error_message` (exact removed columns / changed types) and flags failures with no `recipe_activated` within 24h as stuck. Source: BI-9852 §4 R2.
- **Case 10 — Recipe view renamed without re-activation** (`recipe_view_name_updated` with no `recipe_activated` within 24h). Detects "table disappeared after rename". Source: BI-9852 §7 R5.
- **Case 11 — Fields changed without re-extraction** (`fields_changed` with no `historical_download_started` within 24h). Largest previously-uncovered config-only cluster (~147 tickets, 13.2%). Source: BI-9853 §10.2.
- Decision-tree entries and `CLAUDE.md` trigger phrases for the three new cases.
- **Explanation fallback.** When the ticket is a how-to / "what does X mean" / "is it possible" question (or Cases 1–11 find no signal), route to `documentationTool` and answer with a cited source instead of dead-ending. `documentationTool` added to the allowed MCP tools for this path only (reuses the platform-wide documentation-lookup behavior; does not duplicate it). Closes the explanation / api_behavior clusters (~150–170 tickets) without a separate skill.

### Fixed
- **Case 1 logic corrected.** v1.1.0 filtered `recipe_event_is_manual_deactivation = '0'`, but BI-9852 §6 established that `is_manual = '0'` is the normal staging-cleanup lifecycle (18,752 vs 2,169 activations in 30d) — flagging it produced false positives. Case 1 now detects the real anomaly: a **manual** deactivation (`is_manual = '1'`) **not** followed by a `recipe_activated` within 24h. Title/trigger narrowed to "recipe deactivated and not re-activated"; the "data disappeared after recipe update" symptom now routes to Case 9.

## v1.1.0 — 2026-06-01

### Fixed
- **Step 0:** Removed broken `internal_analytics.dim_dts_orders` query. `{agency_id}` is now taken directly from session context — no query needed.
- **Cases 1, 2, 3:** Replaced non-existent `src_improvado_order_run_events` (not accessible in tenant context) with available alternatives.
- **Cases 1, 2, 3:** Removed dependency on `internal_analytics.stg_dsas_error_mapping` (not accessible in tenant context).
- **All cases:** Removed `improvado_models.` schema prefix from all queries (caused `UNKNOWN_DATABASE` errors in tenant context).
- **Case 4:** Removed broken `dim_dts_orders.order_pause_reason` lookup (not accessible in tenant context). Replaced with guidance to check the order status in Settings → Extractions by `order_id`.

### Changed
- **Case 1 source signal:** switched from `src_improvado_order_run_events` (MCDM dbt errors) to `src_improvado_user_activity_events` `recipe_deactivated` events filtered by `recipe_event_is_manual_deactivation = '0'`. Captures system-triggered deactivations as the available proxy signal.
- **Case 2 source signal:** switched from `src_improvado_order_run_events` to `src_improvado_dataflow_run_events` with `dataflow_run_event_status = 'Failed'`. Error classification replaced with inline `multiMatchAny()` patterns for `auth_expired` / `permission` / `rate_limit` / `other`.
- **Case 3 source signal:** same switch as Case 2 — `src_improvado_dataflow_run_events` + inline `multiMatchAny()` for auth failure detection.

### Known limitations
- **Case 1:** `recipe_event_view_name` and `recipe_event_error_message` fields are empty in current event logs (suspected platform-side logging bug). Auto-deactivation count is still actionable as a signal — if non-zero, cross-check with Case 2.
- **Cases 1–3** previously relied on `src_improvado_order_run_events` which contained full dbt error messages and `stg_dsas_error_mapping` classifications. These are internal platform tables not exposed to tenant context. Coverage may be lower until a tenant-accessible equivalent is available.

## v1.0.0 — initial release

- Eight diagnostic cases covering ~36% of config-only ISD tickets (BI-9851 / BI-9852 / BI-9853).
- Source tables: `improvado_models.src_improvado_user_activity_events`, `improvado_models.src_improvado_order_run_events`, `internal_analytics.stg_dsas_error_mapping`, `internal_analytics.dim_dts_orders`.
- Note: v1.0.0 queries were broken in tenant context due to inaccessible schema prefixes and tables. Fixed in v1.1.0.
