# Audit Playbooks — Source of Truth

Source: vault `Improvado/05-Product/Marketing OS (Operational System)/data-sources/`
Authors: Internal marketing audit team
When SKILL.md says "follow the audit playbook for the source", read the relevant section here.
Last sync: 2026-05-04

---

---
title: "Google Ads — Audit Playbook (3-Tier: Lighthouse + Library + Agent Edge-Case Exploration)"
summary: "How to audit a Google Ads account properly. Tier 1 lighthouse rules ALWAYS run (15 critical, deterministic). Tier 2 library (~75 rules in checks.py + 9 Cerebro Best Practices + 20 canonical Notion list) is context-dependent inspiration. Tier 3 is MANDATORY agent-driven edge-case exploration with hypothesis-test loop budgeted at 5 hypotheses / 30 API calls / 60s wall clock. Tier 3 dimensions: account state, vertical, campaign type, spend tier, account maturity, cross-DS context, recent changes."
parent: "[[Google Ads]]"
related_to:
  - "[[Google Ads]]"
  - "[[01 Plan and Architecture]]"
  - "[[02 Use Case Categories]]"
  - "[[UC-AU-2 Google Account Audit Orchestrator]]"
agcm_keywords:
  - google ads audit playbook
  - tier 1 lighthouse
  - tier 2 rule library
  - tier 3 edge case exploration
  - hypothesis test loop
  - audit ooda
intent_phrases:
  - "audit Google Ads account properly"
  - "what should I check when auditing Google Ads"
  - "audit playbook Google Ads"
  - "deep audit Google Ads"
tags:
  - marketing-os
  - data-source
  - google-ads
  - audit
  - playbook
  - hybrid-3tier
---
