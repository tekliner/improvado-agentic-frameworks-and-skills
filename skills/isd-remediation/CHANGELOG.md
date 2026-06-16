# ISD Remediation Skill — Changelog

## v0.4.0 — 2026-06-04 (align with isd-diagnostics v2)

### Changed
- **Diagnosis references updated to isd-diagnostics v2 layer IDs** (Case 1/2/4/6/7/8/9/10/11 → §R1/§C2/§E1/§C1/§L1/§D1/§R2/§R3/§E2) across the action list, precondition table, and action bodies — the v2 skill is layer-first.
- **Action D (re-activate recipe): recipe is now named via the diagnosis handoff.** isd-diagnostics v2 resolves the recipe identity (`ai_notebook_id` from `src_improvado_mdg_rules` for §R1; `recipe_event_view_name` §R2 / `new_view_name` §R3), so Action D takes it from the handoff instead of always asking the client. Client-ask remains only as a fallback when the handoff carries no identity. (isd-remediation has no `clickhouseTool`, so it relies on the handoff.)

## v0.3.1 — 2026-06-02 (PR #2061 review fixes)

### Fixed
- **Action E datasource mismatch (review issue).** Case 2/6 surface `datasource_title` / `datasource_account_name` (human labels like "Facebook Ads"), but `getConnectionsTool`'s `datasourceName` filter and the `/create_data_source_connection/<datasource>/` URL expect the API name ("facebook"). Step 1 now calls `getConnectionsTool` unfiltered and **matches by label**, reading the real `datasourceName` + `connection_id` from the result instead of passing the title as a filter. The fallback URL maps title → API name via `listDatasourcesTool`.

### Changed
- `listDatasourcesTool` added to read tools (title → API-name mapping for the Action E fallback URL only).
- Precondition table clarifies the Case 2/6 hints are labels for *matching*, not `datasourceName`.
- Dropped the redundant "confirm agency ownership" wording in Action E (`getConnectionsTool` is already workspace-scoped).
- After-care notes the event tables lag a few minutes, so the Case 2 re-check should wait to avoid a false "still failing".

## v0.3.0 — 2026-06-01 (roadmap item C / phase P3)

### Added
- **Action E — Guided reconnect** for expired/invalid connections (diagnostics Case 2 `auth_expired` / Case 6 `connection_invalidated`). The agent **cannot** reconnect (OAuth runs in the client's browser); it locates the connection via `getConnectionsTool` and emits the exact reconnect deep link (`/connection/<id>?workspace=<id>`, or `/create_data_source_connection/<datasource>/` if none), then suggests re-running diagnostics Case 2 + Action A as after-care.
- Safety rule #9: be honest about guided actions — never imply the agent reconnected.

### Changed
- `getConnectionsTool` added to read tools (locate the connection). No new mutating tool — Action E is guidance only.
- Documented that `getManagedConnectionCredentialsTool` does not perform OAuth re-auth (no agent-side auto-reconnect).
- "Reconnect/reauth" removed from Out of scope (now handled as guided Action E); only GBQ IAM / onboarding remain out of scope.
- `CLAUDE.md` trigger phrases extended for reconnect help; version 0.3.0.

## v0.2.0 — 2026-06-01 (roadmap item C / phase P2)

### Added
- **Action B — Re-run or unpause a stuck load**, from diagnostics Case 7. Branches by load state: `unpauseLoadTool` for a **paused** load (mirrors Action A), `runLoadTool` for an **idle/stuck/failed** one. Locate via `getLoadTool` / `getLoadsTool` / `listLoadsTool`, verify not already running, confirm with clickable load link, act, verify. Case 8 (destination-wide failure) is **not** detectable from a single load's status — defer to the Case 8 diagnostic and stop.
- **Action C — Historical backfill** after a field change / schema recovery (Case 11 / Case 9), via `updateExtractTool` setting `syncHistoricalData`. Treated as a costly mutation: validate the date (`YYYY-MM-DD`, not future, sanity-bounded), confirm the exact start date, warn about volume, never widen the window and never silently shrink an existing wider one. `runExtractTool` is explicitly **not** used (intentionally avoided per full-marketing-audit precedent).
- **Action D — Re-activate a recipe**: documented as a **hand-off to the `notebook-editor` skill** (recipe ops are owned by it; platform rule requires explicit approval + recipe link). `activateRecipeTool` is **not** called from this skill.

### Changed
- Safety model generalized to apply to every action (was unpause-only). Added rules: respect designated skills (recipes → notebook-editor) and backfill-cost conservatism. Safety #4 ("exclude systemic causes") split per target — the ~86% stat is extraction-specific; for loads "systemic" means a destination-side failure (Case 8).
- MCP tool list expanded (load read tools + `runLoadTool` + `unpauseLoadTool` + `updateExtractTool`); `runExtractTool` and direct `activateRecipeTool` explicitly disallowed.
- `CLAUDE.md` trigger phrases extended for load re-run and backfill.

## v0.1.0 — 2026-06-01 (MVP, roadmap item C / phase P1)

### Added
- New action companion to `isd-diagnostics`. Read-only diagnosis hands off here to apply the fix.
- **Single P1 action: unpause a stuck extraction** (`unpauseExtractTool`), behind a strict safety model: confirm-before-mutate (plain text, no `AskUserQuestion`), agency scoping, idempotency check via `getExtractStatusTool`, exclusion of systemic (quota/billing) pauses, one-at-a-time, verify-and-report.
- Precondition: `isd-diagnostics` Case 4 must have surfaced the stuck pause first.
- Explicit *Out of scope* list (re-extract, re-activate recipe, re-run load, reconnect, GBQ IAM) deferred to P2/P3.
- Registered in `CLAUDE.md` with trigger phrases scoped to explicit fix/resume requests.
