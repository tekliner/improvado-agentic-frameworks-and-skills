# Experiment Plan Template

Use this template when creating the plan file in Phase 1. Replace all `{placeholders}` with actual values.

---

```markdown
---
entity_type: experiment
experiment_id: EXP-{YYYY}-{NNN}
status: planning
hypothesis: "If {positioning_angle} resonates with {persona}, then {lp_url} will generate {target} conversions/month with CPA < ${target_cpa}"
positioning_angle: "{Positioning Angle}"
icp_segment: "{ICP Segment}"
target_personas:
  - "{Persona 1}"
  - "{Persona 2}"
channels:
  - google_ads
  - meta_ads
  - email_outreach
budget_usd: {total_budget}
budget_split:
  google_ads: {google_budget}
  meta_ads: {meta_budget}
  email_outreach: {email_budget}
start_date: {YYYY-MM-DD}
end_date: null
duration_days: {duration}
primary_kpi: conversions
secondary_kpis:
  - cpa
  - ctr
  - bounce_rate
landing_page: "{lp_url}"
result: pending
created: {DATE}
tags:
  - experiment
  - campaign-launcher
---

# Campaign Plan: {Experiment Name}

## Status: PLANNING
_Last updated: {timestamp}_

---

## 1. Experiment Setup

| Field | Value |
|-------|-------|
| **Positioning Angle** | {Positioning Angle} |
| **ICP Segment** | {ICP Segment} |
| **Target Persona** | {Persona} |
| **Hypothesis** | If {angle} then {outcome}, measured by {metric} |
| **Total Budget** | ${total} (Google: ${g}, Meta: ${m}, Email: ${e}) |
| **Duration** | {N} days |
| **Primary KPI** | Conversions (form submissions / sign-ups / demo requests) |
| **Target CPA** | <${target_cpa} |

### Positioning Context
{Brief summary of positioning — key messaging hooks, differentiation, pain points addressed}

### Persona Context
{Brief summary of target persona — who they are, what they care about, language they use}

---

## 2. Landing Page

| Field | Value |
|-------|-------|
| **URL** | {lp_url} |
| **Key Value Prop** | {extracted from LP} |
| **CTA** | {extracted from LP} |
| **Key Messaging** | {bullet points extracted from LP} |

---

## 3. Google Ads Plan

**Status:** [ ] Planned  [ ] Created (PAUSED)  [ ] Activated

### Campaign Settings

| Setting | Value |
|---------|-------|
| Campaign name | {campaign_name} |
| Daily budget | ${daily} |
| Bidding strategy | MAXIMIZE_CONVERSIONS |
| Networks | Search only |
| Geo targeting | {geo} |
| Language | English |

### Ad Groups & Keywords

| Ad Group | Theme | Keywords (exact) | Keywords (phrase) |
|----------|-------|-------------------|-------------------|
| {group_1} | {theme} | [{kw1}], [{kw2}], ... | "{kw1}", "{kw2}", ... |
| {group_2} | {theme} | [{kw1}], [{kw2}], ... | "{kw1}", "{kw2}", ... |
| {group_3} | {theme} | [{kw1}], [{kw2}], ... | "{kw1}", "{kw2}", ... |

### RSA Ads

| Ad Group | Top Headlines (5 of 15) | Top Descriptions (2 of 4) |
|----------|------------------------|---------------------------|
| {group_1} | H1, H2, H3, H4, H5 | D1, D2 |
| {group_2} | H1, H2, H3, H4, H5 | D1, D2 |

### Negative Keywords
- {list of negative keywords}

---

## 4. Meta Ads Plan

**Status:** [ ] Planned  [ ] Creatives Ready  [ ] Ads Created (PAUSED)  [ ] Activated

### Campaign Settings

| Setting | Value |
|---------|-------|
| Campaign name | {campaign_name} |
| Objective | OUTCOME_LEADS |
| Daily budget (broad) | ${broad} |
| Daily budget (retarget) | ${retarget} |
| Placements | Facebook Feed, Instagram Feed, Stories |

### Creative Angles

| # | Angle | Headline | Primary Text | Image Concept |
|---|-------|----------|--------------|---------------|
| 1 | {pain_point_angle} | {headline} | {primary_text} | {image_description} |
| 2 | {speed_angle} | {headline} | {primary_text} | {image_description} |
| 3 | {paradigm_angle} | {headline} | {primary_text} | {image_description} |

### Ad Sets

| Ad Set | Targeting | Budget |
|--------|-----------|--------|
| broad-{segment} | Interest-based: {interests} | ${daily} |
| retarget-visitors | Website visitors 30d | ${daily} |

---

## 5. Email Outreach Plan

**Status:** [ ] Planned  [ ] Campaign Created  [ ] Leads Loaded  [ ] Launched

### Sequence Design

| Step | Type | Delay | Content Summary |
|------|------|-------|-----------------|
| 1 | {email/linkedinInvite} | Day 0 | {first touch message} |
| 2 | {email/linkedinSend} | Day 2 | {follow-up summary} |
| 3 | {email} | Day 5 | {final follow-up summary} |

### Lead Source & Filters

| Field | Value |
|-------|-------|
| Source | CSV file |
| Lead count | ~{N} |
| Persona filter | {persona} |

### Message Templates

**Step 1 — {Type}:**
```
{message text}
```

**Step 2 — {Type}:**
Subject: {subject}
```
{message body}
```

---

## 6. A/B Test Design

| Dimension | Control | Variant |
|-----------|---------|---------|
| {what's being tested} | {control description} | {variant description} |

**Success metric:** {metric} improvement of >{threshold}% with statistical significance

---

## 7. Monitoring Schedule

| Day | Date | Action | Expected Metrics |
|-----|------|--------|-----------------|
| 1 | {date} | Check delivery, spend pacing, errors | Impressions > 0, no disapprovals |
| 3 | {date} | First metrics review | CTR, CPC, impression share |
| 7 | {date} | Full review + lead quality | CPA, # leads, conversion rate |
| 14 | {date} | Scale / pivot / kill decision | Statistical significance, ROI |

---

## 8. Execution Log

| Timestamp | Phase | Action | Result |
|-----------|-------|--------|--------|
| {ts} | Phase 0 | Prerequisites checked | OK |
| {ts} | Phase 1 | Plan created | OK |
| | Phase 2 | Banner copy generated | — |
| | Phase 2 | Creatives generated | — |
| | Phase 3 | Google Ads campaign created | — |
| | Phase 3 | Meta Ads campaign created | — |
| | Phase 3 | Email campaign created | — |
| | Phase 4 | All channels activated | — |

---

## 9. Live Agent Status

<!-- Agents: update YOUR row after EVERY significant step. -->

| Agent | Status | Current Step | Last Update |
|-------|--------|-------------|-------------|
| Banner Copy | idle | — | — |
| Creatives | idle | — | — |
| Google Ads | idle | — | — |
| Meta Ads | idle | — | — |
| Email Outreach | idle | — | — |
```
