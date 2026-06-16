# Shared Bugs — full-marketing-audit (v4.0+)

Canvas-open mechanics + failure-mode catalog. As of v4 (2026-05-08), the audit-paper visual is a single `custom-component` widget on a generic `CrossChannelEditableDashboard.tsx` — Nick Snopov's pattern (frozen from v3.2.0). The historic ClickHouse SQL hygiene rules from v3.x § 1 are **deleted** — v4 is Discovery API only, no warehouse fallback in the hot path. If you need warehouse data, that's a different skill.

Per-platform pre-flight gotchas (Reddit alias, LinkedIn connector-pick, Meta `campaign_status` absence, etc.) live in their respective `playbooks/{platform}.md` files now, not here.

---

## §1. Canvas-open mechanics

BIE save returns a `settings_id` but does NOT auto-open the canvas. The only auto-open trigger is a `FRONTEND_COMMAND` marker in **Bash tool stdout** parsed by the React `useFrontendCommands` hook:

```bash
python3 frontend-cli.py open-preview --production "clients/template/dashboards/CrossChannelEditableDashboard.tsx?settings_id=${SETTINGS_ID}"
```

- `--production` is **mandatory** for editable dashboards (without it, the CLI omits `base_url` → hook falls back to E2B port lookup → silent fail).
- The CLI auto-appends `?preview=true` and `&workspace={NEXT_PUBLIC_WORKSPACE_ID}` from env. Don't hand-roll the marker.
- The hook fires `openPreview` once per Bash output (`previewOpenedOnce` guard). Forces same-origin via `window.location.origin + url_path` regardless of `base_url`, but `base_url` must be truthy to take the same-origin branch.
- BIE `skill-cli.ts:295` hardcodes `dashboardUrl = clients/template/dashboards/CrossChannelEditableDashboard.tsx` on every save. The v4 template matches this hardcode — no fight.

---

## §2. Failure-mode catalog

- **Canvas didn't open after BIE save** → §1. Forgot `frontend-cli.py open-preview` OR omitted `--production`.
- **Canvas opens blank / shows the default cross-channel BI dashboard chrome (cards, date pickers)** → either `componentCode` is empty/null, OR the widget's `chromeless` flag isn't `true`, OR `appearance.layout.{hideTitle, hideFilters, hideFooter}` aren't all `true`. Use BIE `get` to dump the saved widget shape and inspect those four fields.
- **Canvas shows JS console error "Unexpected token '<' in JSON" or the page abruptly stops mid-render** → a finding's `subline`/`observed` text contained the literal `</script>` and broke the inline `<script>` tag. Apply `JSON.stringify(payload).replace(/<\/script/gi, '<\\/script')` before injecting (SKILL Phase C step 3).
- **`componentCode` rejected as "exceeds 100KB"** → trim the `findings` array to top 8 by `at_risk_per_mo` and re-stringify. Don't trim `passes`/`blockeds` — they're short bullet text.
- **Canvas shows `__AUDIT_PAYLOAD_JSON__` literal text** → step 4 of Phase C missed the substitution. Grep `componentCode` for that token before saving.
- **BIE `Validation failed` with empty `_errors: []`** → the rest of the config validates strictly. Most likely the widget object is missing one of `type` / `renderMode` / `componentCode`, OR the layout item's `id` doesn't match the widget's `id`.
- **`{{COMPONENT_CODE}}` or `{{AUDIT_DATE_ISO}}` token in saved JSON** → string-replacement missed a slot. Scan `componentCode` AND the dashboard config wrapper before save.
- **Re-run produced different totals** → idempotence broken. Check: `today()`/`now()` after Phase A, missed `$100` quantization, `audited_pct` computed from intent rather than the in-memory tool-call log.
- **Phase A only probed 5 of 6 platforms** → silent multi-tool truncation in Phase A.1. The `connections_cache` MUST have all six keys; missing one means re-issue the call.
- **Discovery 401/403 → emitted BLOCKED** → ✅ correct, but ONLY if the call was actually attempted. v4 Phase A.4 anti-fabrication clause: no BLOCKED without a tool-call ID.

### v3.x → v4.0 architecture migration notes (2026-05-08)

These were the failure modes that motivated v4. Documented here for future agents who read git history and find v3.x branches:

- **MarketingAuditDashboard.tsx → "Audit not available"** — root cause: BIE `skill-cli.ts:295` hardcoded URL, plus pre-prod PR-preview deploys lagging the v3.0/v3.1 ai-dashboards canonical-URL fix. Fixed in v3.2.0 by retiring the bespoke TSX. Carries forward in v4.
- **Read PLAYBOOKS.md retried 4× with offset/limit param-type bug** — fixed in v3.2.0 by mandating `Bash sed` for >25K-token files. **Eliminated entirely in v4** by splitting PLAYBOOKS.md into per-connector files (each ≤350 lines, fits Read window).
- **Fabricated `BLOCKED` finding without an actual API call** — v3.2.0 added the anti-fabrication clause; v4 Phase A.4 carries it forward.
- **ClickHouse run before Discovery on a single-client audit** — v3.2.0 added a Discovery-primary inversion detector; **eliminated entirely in v4** by removing ClickHouse from the audit's hot path.
- **Tier 1 fan-out hit 2 of 7 Facebook accounts** — v3.2.0 mandated all-account fan-out; v4 Phase B.2 carries it forward.
- **Tier 2 library never consulted (75+ Google + 15+ Meta rules silently skipped)** — v3.2.0 added a mandatory grep step; **simplified in v4** because each per-platform playbook is loaded in full at Phase B.1, so Tier 2 tables are inline.
- **`audited_pct` overstated (0.50 reported, true ~0.20)** — v3.2.0 redefined as accounts-weighted; v4 Phase B.6 ties it to the in-memory tool-call log.
