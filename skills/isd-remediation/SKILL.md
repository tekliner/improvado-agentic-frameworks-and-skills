---
name: isd-remediation
description: Safely apply the fix after isd-diagnostics finds a problem. Covers unpausing a stuck extraction, re-running a stuck load, triggering a historical backfill after a field change, and guided reconnect for expired/invalid connections — each behind a strict confirm-before-mutate guard. Recipe re-activation is handed off to notebook-editor. Does not diagnose; pairs with isd-diagnostics.
version: "0.5.0"
---

# ISD Remediation Skill (P1 + P2 + P3)

The action companion to `isd-diagnostics`. Diagnosis is read-only; **this skill performs (or guides) the fix**. It is invoked **after** `isd-diagnostics` has identified a problem and the client explicitly asks to resolve it ("yes, unpause it", "re-run the load", "backfill it", "how do I reconnect", "go ahead and fix it").

Actions implemented:
- **A — Unpause a stuck extraction** (P1) — from diagnostics §E1.
- **B — Re-run or unpause a stuck load** (P2) — from §L1.
- **C — Historical backfill after a field change / schema recovery** (P2) — from §E2 / §R2.
- **D — Re-activate a recipe** (P2) — **handed off to the `notebook-editor` skill**, not performed here.
- **E — Guided reconnect** (P3) — from §C2 / §C1. The agent **cannot** reconnect (OAuth happens in the client's browser); it locates the connection and gives exact reconnect steps + deep link.

**Source:** BI-9850 self-healing analysis (BI-9853). Roadmap item C, phases P1–P3.

## MCP Tools

Read (locate / verify the target):
- Extracts: `listAllExtractsTool`, `getExtractByIdTool`, `getExtractStatusTool`
- Loads: `getLoadsTool`, `listLoadsTool`, `getLoadTool`
- Connections: `getConnectionsTool` — list workspace connections to locate the one to reconnect (Action E)
- Datasources: `listDatasourcesTool` — map a datasource **title** ("Facebook Ads") to its API **name** ("facebook") for the Action E fallback URL when no live connection remains

Mutation (the only mutating tools allowed):
- `unpauseExtractTool` — resume a paused extract (Action A)
- `runLoadTool` — manually trigger a stuck/idle load to run (Action B)
- `unpauseLoadTool` — resume a **paused** load (Action B; mirrors `unpauseExtractTool`)
- `updateExtractTool` — **only** to set `syncHistoricalData` for a confirmed backfill (Action C)

Hand-off (NOT called here):
- Recipe re-activation → use the **`notebook-editor`** skill (recipe operations are owned by it; see Action D).

**❌ Do NOT call:**
- ❌ `runExtractTool` — intentionally avoided (cost/blast radius; backfill is done via `updateExtractTool` `syncHistoricalData`, see Action C).
- ❌ `activateRecipeTool` directly — route recipes through `notebook-editor`.
- ❌ `pauseExtractTool`, `createExtractTool`, `createLoadTool`, `pauseLoadTool`, `deleteLoadTool`, or any other mutating tool.
- ❌ Any tool not listed above.

---

## Safety model (MANDATORY — applies to EVERY action below)

1. **Confirm before mutate.** NEVER call a mutating tool without an explicit, in-message client confirmation for that specific target. Do not use `AskUserQuestion` — state the planned action in plain text and wait for a "yes" in the next message.
2. **Scope to the agency.** Act only on extracts/loads belonging to the current session's agency/workspace. Verify ownership before mutating — never touch another agency's data.
3. **Idempotency.** Read current state first (`getExtractStatusTool` / `getLoadTool`). If the target is already in the desired state (running / syncing), do nothing and report.
4. **Exclude systemic causes.** Do not unpause / re-run if the cause looks systemic — it will not stick and may re-trigger the underlying limit. Explain and route to billing/limits. The meaning of "systemic" differs by target:
   - **Extractions (Action A):** ~86% of *extraction* pauses are system-generated (quota / billing) per BI-9853. Tenant context cannot read `dim_dts_orders.order_pause_reason` — if the cause is unknown, ask the client to confirm it was manual/accidental first.
   - **Loads (Action B):** "systemic" means a destination-side failure (destination outage, credentials, or quota — diagnostics §D1), not a single-load hiccup. Re-running/unpausing won't fix a failing destination.
5. **One target at a time.** No bulk operations.
6. **Respect designated skills.** Recipe operations go through `notebook-editor` (Action D) — never call `activateRecipeTool` from here.
7. **Backfill is costly — be conservative.** A historical backfill (Action C) re-pulls data and changes the extract's config. Confirm the exact start date with the client, warn about volume/cost, and never widen the window beyond what the client asked.
8. **Verify and report.** After any mutation, re-read state and report the outcome in plain business language.
9. **Be honest about guided actions.** Some fixes the agent **cannot** perform (Action E reconnect needs the client's browser/OAuth). Never imply the agent reconnected — give exact steps + link and say the client must complete it.

---

## Precondition — diagnosis first

Only act after the matching `isd-diagnostics` case has surfaced the problem for this client, or the client explicitly names the target. If diagnosis has not run, run the relevant case first — do not act blind.

| Action | Diagnosis case | Hint it provides |
|---|---|---|
| A — unpause extraction | §E1 (extraction paused/stuck) | `order_id`, `hours_paused` |
| B — re-run load | §L1 (load not completing) | `load_id`, `order_ui_link` |
| C — historical backfill | §E2 (fields changed, no re-download) / §R2 | `order_id`, `agency_title` |
| D — re-activate recipe | §R1 / §R2 / §R3 | **`ai_notebook_id`** (§R1 via `src_improvado_mdg_rules`) · `recipe_event_view_name` (§R2) · `new_view_name` (§R3) — recipe IS named |
| E — guided reconnect | §C2 (auth_expired) / §C1 (connection_invalidated) | `datasource_title`, `datasource_account_name` (human **labels** — used to *match* a connection, not as `datasourceName`) |

---

## Action A — Unpause a stuck extraction

1. **Locate** — use `order_id` from §E1 as a hint; resolve the extract with `getExtractByIdTool` (or `listAllExtractsTool` filtered). Confirm agency ownership. If ambiguous, list candidates and ask.
2. **Verify** — `getExtractStatusTool`: confirm it is actually paused (else no-op). Assess systemic vs manual (safety #4).
3. **Confirm (plain text)** — e.g. *"Your extraction **<name>** (order <order_id>) has been paused <hours_paused>h and looks like a manual pause. I can resume it now — shall I go ahead?"*
4. **Unpause** — only after explicit yes: `unpauseExtractTool` (single extract).
5. **Verify & report** — `getExtractStatusTool` → confirm resuming; report in business language.

---

## Action B — Re-run or unpause a stuck load

1. **Locate** — use `load_id` / `order_ui_link` from §L1. Resolve with `getLoadTool` (or `getLoadsTool` for the extract / `listLoadsTool`). Confirm agency ownership. Action B is **also** the correct entry point when §L1 returned **empty** but the ticket reports a load "stuck in init / pending for days" (see §L1's *L1-init gap* note): a never-started load is invisible to the event log, so `getLoadTool`'s live status is the source of truth here.
2. **Verify state — and pick the right tool.** `getLoadTool` returns the load's **own** status (not destination-wide health):
   - already **running / in progress** → no-op, report.
   - **paused** → the fix is `unpauseLoadTool` (mirrors Action A for extractions), **not** `runLoadTool`.
   - **idle / stuck / failed** (not paused) → the fix is `runLoadTool`.
   - **init / queued (never started)** → the load was created but the orchestrator never fired it (no `load_started` was ever emitted, so §L1 could not see it). The fix is `runLoadTool` (same as idle/stuck); `getLoadTool` is what confirms this state live.
   - A **destination-wide failure (§D1)** is **not** visible from a single load's status — it needs the §D1 diagnostic (multiple loads failing to the same destination). If §D1 flagged the destination, re-running/unpausing won't help — say so and stop.
3. **Confirm (plain text)** — name the load, its state, and the action, with the clickable load link, e.g. *"Load **#<id>** for extraction **<name>** is currently <paused / stuck> — I'll <resume / re-run> it. Confirm?"* Link: `[Load #<id>](https://report.improvado.io/load_order/<load_id>/<destination_connection_id>?workspace=<workspace_id>)`.
4. **Act** — only after explicit yes: `unpauseLoadTool` if the load was **paused**, otherwise `runLoadTool` (single load either way).
5. **Verify & report** — `getLoadTool` → confirm it started / resumed; report with the load link.

---

## Action C — Historical backfill after a field change / schema recovery

> Use when §E2 found `fields_changed` with no `historical_download_started` (new field empty for past dates), or after a §R2 schema fix. A backfill re-pulls history — treat as a **costly** mutation (safety #7).

1. **Locate** — resolve the extract from the §E2 `order_id` hint via `getExtractByIdTool`. Confirm agency ownership.
2. **Verify** — `getExtractStatusTool`: not currently running (else wait / no-op). Read the current `syncHistoricalData`: if the client's requested start is **later** than an existing wider window, it would shrink the backfill — do **not** silently narrow it. Point out the existing wider start and keep it unless the client explicitly wants less (safety #7: never widen beyond the ask, and don't silently shrink either).
3. **Confirm the exact date (plain text)** — ask the client how far back to backfill (e.g. *"I'll re-pull history from **2026-01-01** for extraction **<name>** so the new field is populated for past dates. This re-runs the extraction and may take a while / consume quota. Confirm the start date?"*). Never pick a date the client didn't give. **Validate before mutating**: the date must be `YYYY-MM-DD`, not in the future, and not absurdly far back (sanity-bound to the platform's retention). On a malformed / out-of-range date, reject and re-ask — never pass an unvalidated date to `updateExtractTool`.
4. **Backfill** — only after explicit yes and a validated date: `updateExtractTool` setting `syncHistoricalData` to the confirmed date. Do **not** use `runExtractTool`.
5. **Verify & report** — confirm the historical download was triggered (a `historical_download_started` will follow); report expected timing.

---

## Action D — Re-activate a recipe (hand-off)

Recipe operations are owned by the **`notebook-editor`** skill, and platform rules require explicit user approval plus sharing the recipe link before activation. **Do not call `activateRecipeTool` here.**

When diagnostics §R1 / §R2 / §R3 indicates a recipe needs re-activation:
1. **Take the recipe identity from the isd-diagnostics handoff** — `ai_notebook_id` (§R1, resolved from `src_improvado_mdg_rules`) or the view name (§R2 `recipe_event_view_name` / §R3 `new_view_name`). Only if the handoff carried **no** identity (diagnosis not run, or dimension lookup empty) fall back to asking the client which recipe (or its link).
2. Use `recipe_id` = `ai_notebook_id` when present; share `https://report.improvado.io/my-recipes/<recipe_id>/` for review.
3. Hand off to `notebook-editor` to perform the activation with its own confirm flow.

---

## Action E — Guided reconnect (the agent cannot do this; it guides)

> Use when §C2 found `auth_expired` or §C1 found `connection_invalidated`. Reconnect happens via OAuth in the **client's** browser — the agent cannot perform it. This action produces the exact reconnect path, not a mutation.

1. **Identify the connection** — the §C2 / §C1 hints (`datasource_title`, `datasource_account_name`) are human **labels** (e.g. "Facebook Ads"), **not** the API `datasourceName` ("facebook"). Do **not** pass the title as `datasourceName`. Call `getConnectionsTool` (results are already workspace-scoped — no agency cross-check needed) and **match** the connection whose title / account matches the §C2 / §C1 labels; read its real `datasourceName` (API key) and `connection_id` from the result. If several match, list them and ask.
2. **Emit the reconnect link (one message)** — give the client the exact step + deep link:
   - Existing connection (matched above): `https://report.improvado.io/connection/<connection_id>?workspace=<workspace_id>` — "Open this connection and click Reconnect / re-authorize."
   - No connection remains (§C1 can fully remove it): map the `datasource_title` → API name via `listDatasourcesTool`, then `https://report.improvado.io/create_data_source_connection/<datasourceName>/?workspace=<workspace_id>` — "Create a fresh connection." Never put the human title in this URL.
3. **Be explicit it's the client's step** (safety #9) — never imply the agent reconnected.
4. **After-care** — once the client confirms they reconnected, suggest re-running `isd-diagnostics` §C2 to verify the auth errors stopped — but note the event tables **lag a few minutes**, so wait before re-checking, otherwise it may falsely still show the old failures. If the extraction was paused by the failures, follow up with Action A to resume it.

> `getManagedConnectionCredentialsTool` only fetches credentials for managed SFTP/S3 connections — it does **not** perform OAuth re-auth. There is no agent-side auto-reconnect.

---

## Out of scope

- **GBQ IAM / new-integration onboarding** — outside Improvado / manual. Out of scope entirely.

## Output Rules

1. **Talk business, not tech** — "extraction", "load", "resuming", "backfilling"; never table/tool names.
2. **Never mutate without explicit confirmation** for the specific target.
3. **Always include the clickable load link** (Action B) and verify results after acting.
4. **If anything is ambiguous, systemic, or recipe-related** — stop, explain, and hand off / ask rather than act.
