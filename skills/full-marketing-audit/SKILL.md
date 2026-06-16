---
name: full-marketing-audit
description: Triggers on the "Full Marketing Audit" onboarding card OR phrases like "audit my account / agency / Google / Meta / what's wasting spend". Three phases — A connection check + heal (Discovery API only), B parallel per-channel audits (each loads only its own playbook), C synthesis via Nick Snopov's single-custom-component-widget pattern. Idempotent — same `(workspace_id, audit_window_start_utc, '4.0.0')` triple → identical findings.
version: "4.0.0"
---

# Full Marketing Audit — UC-AU-1

Paid-media audit. Read-only. Output: an audit-paper-styled dashboard that persists in the workspace "Dashboards" menu and auto-opens in the canvas. Total wall-clock ≤ 90 s.

## Trigger

- `selectedUseCase === 'full-marketing-audit'`, OR
- "audit my account / agency / [Google/Meta/LinkedIn/TikTok/Reddit/TTD]", "what's wasting spend".

## Onboarding Dispatch — Company Personalization

If the message carries an `alg-prebrief` fenced block, and it contains a `company_research:` line, tailor exactly ONE headline/intro sentence in the chat hand-off to this company — always hedged ("looks like…"), never as a fact. If absent, proceed generically.

## Customer-visibility rules

- Status pills: **FAIL / WARN / PASS / BLOCKED** only.
- Dollars: monthly, formatted `$1,234` / `$12.4K` / `$1.2M`.
- No process narration in chat. No tier vocabulary. No LLM jargon. Rule IDs only inside the dashboard card heading, not in chat.
- Every finding has `$-at-risk_monthly > 0` AND one concrete next step. No-dollar findings are dropped.

## Idempotence rules (MANDATORY)

1. **Pin `audit_window_start_utc`** at Phase A start: `(now_utc − 30 days)` truncated to date `00:00:00 UTC`. Reuse this exact value everywhere downstream. NEVER call `today()` / `now()` again.
2. **Quantize** `account_spend_30d` to the nearest **$100** before computing FAIL/WARN cutoffs.
3. **Cap exactly 12** FAIL+WARN findings. PASS and BLOCKED are not capped.
4. **Sort by 6-key tuple**: `(status_rank ASC, dollars_at_risk_monthly DESC, rule_id ASC, client ASC, source ASC, entity_id ASC)` where `status_rank = 0:FAIL, 1:WARN, 2:PASS, 3:BLOCKED`.
5. **Tier 3 hypotheses are deterministic, no LLM judgment** — H1 spend concentration, H2 zero-conv floor, H3 audience overlap (Meta/LinkedIn only), H4 CPA regression, H5 spend-tier edge. Per-platform formulas live in `playbooks/{platform}.md`. `temperature=0`.
6. **Vertical detection** is informational only — never an input to severity.

## Pre-flight rules for ALL Discovery API calls (CRITICAL — promoted from per-platform playbooks)

These rules apply BEFORE any Phase-A or Phase-B `discoveryRequestTool` invocation. They are the orchestrator-level contract; per-platform playbooks may not override them. Failures observed in 2026-05 production sessions — see Common failures § "v3.x bugs that motivated this section".

### Discovery API `dataSource` slug — exact strings

The `dataSource` parameter must match Improvado's connector slug, NOT the platform's marketing name. Wrong slug → 404 / empty response.

| Platform | `dataSource` value | Common wrong guess |
|---|---|---|
| Google Ads | `google_ads_ql` | `google_ads`, `googleads`, `gads` |
| Meta (Facebook/Instagram) | `facebook` | `meta`, `facebook_ads`, `fb` |
| LinkedIn Ads | `linkedin_ads` | `linkedin` (organic, different connector) |
| TikTok Ads | `tiktok_ads` | `tiktok` (organic) |
| Reddit Ads | `reddit` | `reddit_ads` (returns 400 `DataSource with this name does not exist` on montana — ALWAYS use `reddit`) |
| The Trade Desk | `the_trade_desk_api` | `ttd`, `the_trade_desk` |

### Per-platform API version (verified live 2026-05; iterate on 404)

| Platform | URL pattern | Current version | Iteration on 404 |
|---|---|---|---|
| Google Ads | `https://googleads.googleapis.com/{V}/customers/{cid}/googleAds:searchStream` (POST + GAQL body) | **v20** | v20 → v19 → v18, stop at first 200. Versions sunset every ~6 months; never hardcode. |
| Meta | `https://graph.facebook.com/{V}/{node}/...` | **v23.0** | v23.0 → v22.0 → v21.0; check Meta changelog quarterly. |
| LinkedIn | `https://api.linkedin.com/rest/...` + header `LinkedIn-Version: {V}` | **202604** | Bump month-by-month; rolling 6-month window. |
| TikTok | `https://business-api.tiktok.com/open_api/{V}/...` | **v1.3** | Stable; v1.3 has been live for 18 months. |
| The Trade Desk | `https://api.thetradedesk.com/{V}/...` | **v3** | Stable. |

### `listDatasourcesTool` pagination contract

ALWAYS issue the first call with `pageSize=50, page=1` (NOT the default `pageSize=10`). Mixing page sizes across calls creates a gap — a 2026-05 session bug surfaced when the agent did `pageSize=10` first, then `page=2, pageSize=50` (interpreted as items 51-100), missing `linkedin_ads` at position 20 in items 11-50. Result: agent told the user "LinkedIn Ads doesn't exist in your catalog" when it did. Use a single consistent `pageSize=50` from page 1 onward.

### N≥3 variation rule before BLOCKED (extends Phase A.4 anti-fabrication)

A single 4xx / 5xx is NOT proof a tool or endpoint is unavailable. Before declaring `BLOCKED` for any platform or check, attempt at least **three** variations along distinct axes:

1. **Slug** — try the canonical slug AND any common alias (e.g. `google_ads_ql` → `google_ads`).
2. **Version** — iterate down 2 versions (Google Ads especially; see table above).
3. **HTTP shape** — try GET vs POST, query params vs JSON body, single-account vs account-list endpoint.

Document the three attempts in the audit log (tool-call IDs). Only after three distinct failures does `BLOCKED` ship.

### `discoveryWebSearchTool` 128K-token limitation

`discoveryWebSearchTool` fails with HTTP 400 when the conversation context exceeds ~128K tokens (the tool's backing model cap). For long audit sessions, do NOT rely on it for API documentation — use the version table above. If the table is stale, the user should ping the connector team rather than the agent guessing live.

## Tools

- **Phase A**: `getConnectionsTool` (×6, parallel), `discoveryRequestTool` (liveness probes + healer retry), `createImpersonationContext`.
- **Phase B**: `discoveryRequestTool` only. ClickHouse is **NOT** a fallback in v4 — Discovery is authoritative.
- **Phase C**: `Skill('business-intelligence-editor')` `save` (BIE hardcodes `dashboardUrl=clients/template/dashboards/CrossChannelEditableDashboard.tsx`; v4 honors that), then Bash `python3 frontend-cli.py open-preview --production "clients/template/dashboards/CrossChannelEditableDashboard.tsx?settings_id=${SETTINGS_ID}"`.

**Never call**: `onboardClientTool`, `updateOnboardingDatasourceFilterTool`, ad-platform mutations, background `Task` subagents, `clickhousePalantirTool`.

## Phase A — connection check + heal (≤25s)

**A.1** ONE multi-tool round: `listDatasourcesTool` + `getConnectionsTool` for each of the 6 paid platforms (`google_ads_ql`, `facebook`, `linkedin_ads`, `tiktok_ads`, `reddit`, `the_trade_desk_api`). `createImpersonationContext` once per (cluster, agency).

**A.2** Build `connections_cache` — exactly six keys, no exceptions:

```json
{ "<platform>": { "status": "live|auth_error|dead|none", "accounts": [...] } }
```

Missing key from a silent-skipped multi-tool message ⇒ STOP and re-issue the missing call. The 2026-05-07 prod incident root cause was an agent skipping `getConnectionsTool('facebook')` and treating Meta as not-a-platform.

**A.3** For each platform, ONE liveness probe via `discoveryRequestTool` against a cheap endpoint (e.g. Meta `GET /me`, Google Ads `customers:listAccessibleCustomers`, LinkedIn `/me`). Run all six probes in ONE multi-tool round, parallel. Outcomes:

- **200** → `live`, advance to Phase B for this platform.
- **401 / 403** → `auth_error`. Read `healers/auth_expired.md` — emit one inline reconnect-link message, retry the probe once with a 10 s budget. 200 → `healed` (proceeds). Still error → `blocked_auth_pending`.
- **200 with `data: []`** → `dead`. Read `healers/dead_extract.md` — emit BLOCKED finding `T0-PIPE-EMPTY`, do NOT call `runExtractTool`.
- **5xx / timeout** → `blocked_upstream`. Emit `T0-DISCOVERY-TIMEOUT` BLOCKED.

**A.4 — ANTI-FABRICATION + N≥3 variations (hard rule).** No `BLOCKED` finding without (a) an actual `discoveryRequestTool` invocation AND (b) at least three variation attempts per the pre-flight N≥3 rule above (slug × version × HTTP shape). The 2026-05-08 self-review caught a fabricated `L-C1…L-D1 BLOCKED — GAQL endpoint returns 404 via proxy` emitted with zero tool calls. A 2026-05-09 follow-up session shipped a real BLOCKED for Google Ads after a single v18 404 — the right fix would have been to iterate to v20 (which works). Every BLOCKED row must reference 3+ call IDs in the audit log.

**A.5** Output:

```
live_channels = [{ platform, account_ids: [...] }, ...]
blocked       = [{ platform, reason, healing_attempted: bool }, ...]
```

If `live_channels` is empty: STOP, surface "No paid platforms reachable — connect Google Ads or Meta to begin." DO NOT call BIE. Emit `T0-AUDIT-ABORTED` to the audit log.

## Phase B — per-channel audits (≤45s, parallel within each channel)

For each `platform` in `live_channels`, EXECUTE THE BLOCK BELOW. Channels are independent — no cross-channel data sharing in Phase B.

**B.1 — Read playbook.** `Read playbooks/{platform}.md` (single file, ≤350 lines, fits the Read window). The playbook contains: Tier 1 lighthouse table, Tier 2 library rules, Tier 3 hypotheses + per-rule `$-at-risk` formulas, per-platform pre-flight gotchas (e.g. Reddit `reddit` vs `reddit_ads` alias).

**B.2 — Tier 1 lighthouse, ALL accounts, ONE multi-tool round.** From the Tier 1 table, fan out probes across ALL `account_ids` for this platform in a single multi-tool message. Single-client mode is mandatory: probe every account, not a top-N. The 2026-05-08 audit hit 2 of 7 Meta accounts and silently dropped 5 — v4 hard-bans that pattern.

Outcomes per probe:
- **200** → cache the result keyed `(audit_window_start_utc, platform, account_id, '4.0.0')`.
- **401 / 403** → emit account-level `BLOCKED`, continue. Do NOT halt the platform.
- **`data: []` with 200** → emit `T3-NO-LIVE-DATA` BLOCKED for that account.

**B.3 — Tier 2 library, evaluated against in-memory data.** For every rule in the playbook's Tier 2 table, evaluate the predicate using the Tier 1 cache. NO additional API calls needed (Tier 2 is data-derived). Self-check before leaving B.3: name 3 evaluated rule IDs for this platform. If you can't, you skipped Tier 2 — go back.

**B.4 — Tier 3 H1-H5.** Apply the per-platform formulas from the playbook (deterministic, no LLM judgment). Drop findings with `$-at-risk = 0`.

**B.5 — Per-platform classification:**
- **FAIL** — Tier-1 lighthouse fail, OR `$-at-risk ≥ max($500, 5% × account_spend)`, OR brand-safety / compliance / fraud.
- **WARN** — `$-at-risk ≥ max($100, 1% × account_spend)` and below FAIL.
- **PASS** — checked, healthy. Surface in `passes`, no `$-at-risk`.
- **BLOCKED** — auth or upstream failure that prevented the check. Surface in `blockeds`, not in `$-at-risk` total.

**B.6 — `tier_1_attempted` accounting.** Track the count of `discoveryRequestTool` invocations actually made for this platform vs. `len(account_ids)`. The ratio populates `audited_pct[platform] = attempted / total`. The 2026-05-08 self-review caught v3.1.0 reporting `audited_pct=0.50` when the true value was `~0.20` — v4 ties it to the in-memory tool-call log, not intent.

## Phase B/C boundary — pre-render gate (≤2s, replaces v3.x Phase 2.9)

After all live channels finish Phase B, compute `audited_pct = mean(tier_1_attempted / accounts_total)` across `live_channels`. Branch:

- **`audited_pct ≥ 0.80`** — confident headline.
- **`0.40 ≤ audited_pct < 0.80`** — partial audit. Set `audit_payload.coverage_warning` to a per-channel breakdown (✅ / ❌ + reason). The audit-paper renders a yellow callout above the hero.
- **`audited_pct < 0.40`** — STOP, do NOT call BIE. Surface the gap + per-channel BLOCKED reasons + retry CTA. Emit `T0-AUDIT-ABORTED` to the audit log.

## Phase C — render (≤10s)

The audit-paper visual is **frozen** from v3.2.0 — `audit-paper.html` and `dashboard-template.json` carry over unchanged. Phase C is mechanical:

1. **Cross-channel rank.** Combine all per-channel `findings[]`, sort by the 6-key tuple, cap at 12 FAIL+WARN combined. Cross-channel `passes[]` and `blockeds[]` are uncapped.
2. **Compute scalar slots.** `health_score = 100 − clamp(round(8 × fail_count + 3 × warn_count), 0, 100)`. `recoverable_per_mo = sum(at_risk for f in findings if f.status in ('FAIL','WARN'))`. `total_monthly_spend = sum(per-channel spend totals)`. Counts and `n_paid_platforms` from the live-channel set.
3. **Stringify payload safely.** `payload_json = JSON.stringify(audit_payload).replace(/<\/script/gi, '<\\/script')`.
4. **Substitute** `__AUDIT_PAYLOAD_JSON__` in `audit-paper.html` (single occurrence) → result is `componentCode`.
5. **Substitute** `{{COMPONENT_CODE}}`, `{{AUDIT_DATE_ISO}}`, `{{CLIENT_OR_AGENCY_NAME}}` in `dashboard-template.json`.
6. **Save** via `Skill('business-intelligence-editor')` `save`. Returns `settings_id`.
7. **Open canvas:**
   ```bash
   python3 frontend-cli.py open-preview --production "clients/template/dashboards/CrossChannelEditableDashboard.tsx?settings_id=${SETTINGS_ID}"
   ```
8. **Chat hand-off:** one paragraph + clickable link, headline matches the audited_pct branch above.

### Pre-save check

- [ ] No `__AUDIT_PAYLOAD_JSON__` in `componentCode`; no `{{...}}` in saved JSON
- [ ] `componentCode.length ≤ 100KB` (Nick K3); trim to top-8 findings if over
- [ ] `editState.widgets[0]`: `type='custom-component'`, `renderMode='html'`, `chromeless=true`
- [ ] `editState.layout.items[0]`: `id` matches the widget
- [ ] `appearance.layout.{hideTitle, hideFilters, hideFooter} = true`

## File layout

```
full-marketing-audit/
├── SKILL.md                       (this file — orchestrator only, ≤250 lines)
├── audit-paper.html               (frozen from v3.2.0 — visual template)
├── dashboard-template.json        (frozen from v3.2.0 — BIE config wrapper)
├── SHARED_BUGS.md                 (canvas-open + failure-mode catalog only; v4 dropped CH SQL hygiene)
├── playbooks/
│   ├── google_ads.md              (Tier 1 + Tier 2 + Tier 3 + per-platform gotchas)
│   ├── meta.md
│   ├── linkedin.md
│   ├── tiktok.md
│   ├── reddit.md
│   └── the_trade_desk.md
└── healers/
    ├── auth_expired.md            (re-auth nudge templates per platform)
    └── dead_extract.md            (when/how the BLOCKED branch fires)
```

## Done condition

- Phase A ✅ `connections_cache` populated for all 6 platforms; healer attempted for each `auth_error`; `live_channels` and `blocked` arrays produced.
- Phase B ✅ For each platform in `live_channels`: playbook loaded, Tier 1 ALL accounts attempted, Tier 2 library evaluated, Tier 3 H1-H5 applied. Cache keyed `(audit_window_start_utc, platform, account_id, '4.0.0')`.
- Phase C ✅ `audit_payload` built; `audit-paper.html` substituted; `componentCode` ≤ 100KB; BIE save returned `settings_id`; `frontend-cli.py open-preview --production` echoed against `CrossChannelEditableDashboard.tsx`; clickable link in chat.
- Idempotence ✅ re-run with same `(workspace_id, audit_window_start_utc, '4.0.0')` → identical findings array.

## Latency budget

The bottleneck is sequential LLM rounds, NOT tool calls. v4 collapses the round count vs v3.x:

- **Round 1** — Phase A.1 (datasources + 6× connections in ONE multi-tool message)
- **Round 2** — Phase A.3 (6× liveness probes in ONE multi-tool message; healer messages emitted inline)
- **Rounds 3..N** — Phase B.1 + B.2 fused per platform (Read playbook + all-account Tier 1 probes in ONE multi-tool message). Channels can be interleaved across rounds when the orchestrator can hold state for multiple in flight.
- **Round N+1** — Phase C save + canvas-open.

Target: 5-7 LLM rounds total for a 4-channel audit, vs ~12 in v3.1.0.

## Common failures

- **Re-run produced different totals** → idempotence broken. Check: `today()`/`now()` after Phase A, missed `$100` quantization, `audited_pct` computed from intent rather than tool-call log.
- **`audit_payload` missing from saved config** → BIE preserves it via `.passthrough()`; if missing, the slot substitution dropped it. Re-fetch with BIE `get` to confirm `componentCode` survived save.
- **Canvas opens blank / shows default cross-channel BI dashboard** → `chromeless` not `true`, OR `appearance.layout.hide{Title,Filters,Footer}` not all `true`.
- **Canvas shows JS console error "Unexpected token '<'"** → the `</script>` escape in step 3 wasn't applied. Apply and re-save.
- **`{{COMPONENT_CODE}}` literal in saved JSON** → string-replacement missed a slot. Grep the saved config before save.
- **Discovery 401 / 403 → fabricated BLOCKED** → see Phase A.4 anti-fabrication clause. No BLOCKED without 3+ tool-call IDs (slug × version × HTTP-shape variations).

### v3.x bugs that motivated the Pre-flight rules section

These three real-session failures (2026-05-09) motivated promoting per-connector rules to SKILL.md so they apply BEFORE any per-platform playbook is loaded:

1. **Google Ads v18 404 → premature BLOCKED.** Agent hit `googleads.googleapis.com/v18/...`, got 404, declared "Google Ads Discovery API isn't routed through this proxy" and fell back to ClickHouse. v20 was live the whole time. Fixed by the per-platform API version table + N≥3 variation rule above.
2. **Wrong dataSource slug.** Agent passed `dataSource: "google_ads"` to `discoveryRequestTool` instead of `google_ads_ql`. Empty response. Fixed by the dataSource slug table.
3. **`listDatasourcesTool` pagination gap.** First call `pageSize=10`, second call `page=2, pageSize=50` — agent skipped items 11-50 and concluded "LinkedIn Ads doesn't exist in your catalog." It did, at position 20. Fixed by the pagination contract (always `pageSize=50, page=1` first).

If a phase is genuinely incomplete (auth outage, total connector failure), say so explicitly: "Got through Phase A for {N} of {M} platforms — pick up the rest, or build the dashboard with what we have?" Never ship a silently-truncated audit.

## Changelog

- **4.0.0** (2026-05-08) — Architecture pivot to per-connector playbooks + Phase A connection-heal + Discovery-API-only. Per Sasha + Roman 2026-05-08 call:
  1. **PLAYBOOKS.md split** into `playbooks/{platform}.md` (≤350 lines each, each fits the Read window — no more `Bash sed` workarounds for oversized files).
  2. **Phase A connection check + heal** replaces v3.x's three-step Phase 0 / 1 / 1c. Discovery probes happen in Phase A; healers (`healers/auth_expired.md`, `healers/dead_extract.md`) attempt fast in-line recovery before declaring BLOCKED.
  3. **Discovery API ONLY.** ClickHouse fallback retired from the audit's hot path. The historic CH SQL hygiene rules are dropped from `SHARED_BUGS.md § 1`. The "ClickHouse-before-Discovery inversion" failure mode is impossible in v4.
  4. **Per-channel parallel audits** in Phase B — each platform loads only its own playbook. Tier 1 + Tier 2 + Tier 3 collapse into one logical round per channel. Cross-channel synthesis happens once, in Phase B/C boundary.
  5. **`audit-paper.html` + `dashboard-template.json` frozen from v3.2.0** — Nick Snopov's single-custom-component-widget pattern carries forward; visual unchanged.
  6. **Hardened invariants from v3.2.0** kept: anti-fabrication clause (A.4), ALL-account fan-out (B.2), Tier 2 mandatory evaluation (B.3), accounts-weighted `audited_pct` (B.6), `</script>` escape (C.3).
  7. **SKILL.md size**: 489 lines (v3.2.0) → ~245 lines (v4). Depth lives in per-platform playbooks; orchestrator stays terse.
  Origin sessions: `0c1c2fa9-08ab-419f-8d6b-f3ca21362094` (v3.1.0 prod incident), `0af49e17-2782-419c-88ce-db35782afc2c` (2026-05-08 single-client self-review), `7688c013-f5b1-4f03-b967-3da099a4c60a` (v4 design with Sasha + Roman).
- **3.2.0** (2026-05-08) — Pivoted Phase 3 to Nick Snopov's single-custom-component-widget pattern; six self-review fixes. See git history for full notes.
- **3.1.0** (2026-05-07) — Phase 0 mandatory PLAYBOOKS read; 1b connections-cache hard assertion; 1c-FAST.6 Tier 1 lighthouse enforcement; Phase 2.9 pre-render self-audit gate.
