# Task File Templates

Pre-built task templates for common Multi-Agent Orchestrator scenarios. Use these templates as starting points for creating standardized task specifications.

## Template Selection Guide

**Choose template based on task type:**
- **Customer Data Analysis** - Queries, metrics validation, dashboard creation
- **Algorithm Implementation** - Performance-critical code, optimization tasks
- **Research & Analysis** - Competitive analysis, market research, technical investigation
- **API Integration** - External system integration, connector development
- **Data Processing Pipeline** - ETL, transformation, data quality tasks

## Template 1: Customer Data Analysis

**Use case:** Analyzing customer data from ClickHouse, validating metrics, creating reports.

```markdown
## Task: [Customer Name] [Analysis Type] for [Time Period]

**Context:**
- Customer: [Client name with agency_id]
- Database: im_[agency_id]_[hash]
- Time period: [Date range]
- Goal: [Business objective]

**Success Criteria:**
- [✅] Query ClickHouse for [specific data] from [database].[table]
- [✅] Identify [specific patterns/issues] in last [N] days
- [✅] Cross-reference with [external source] for accuracy
- [✅] Generate [format] report with [specific contents]
- [✅] Complete in <[N] minutes
- [✅] NEVER MOCK DATA - use real customer data only

**Data Requirements:**
- Tables: [table1], [table2], [table3]
- Key columns: [col1, col2, col3]
- Filters: [date range, status, etc.]

**Expected Deliverables:**
- CSV report in agent workspace folder
- SQL queries used for analysis
- Summary of findings with evidence

## Agents Artifact Requirement

Each agent MUST create:
- `01_plan_[agent].md` - Planning document with approach and progress updates
- `90_results_[agent].md` - Final results with self-evaluation against criteria
- All output files in respective workspace folder (claude_code/, codex_cli/, gemini/)

**Self-Evaluation Format:**
```markdown
# 90_results_[agent].md
## Self-Evaluation ([agent])
### Criterion 1: [from task file]
**Status:** ✅/❌/⚠️ | **Evidence:** [data] | **Details:** [how tested]

### Criterion 2: [from task file]
**Status:** ✅/❌/⚠️ | **Evidence:** [data] | **Details:** [how tested]

## Overall: X/Y criteria met | Grade: ✅/❌/⚠️
```
```

**Example filled template:**
```markdown
## Task: Example Client Campaign Metrics Validation for Q4 2024

**Context:**
- Customer: Example Client (agency_id: XXXX)
- Database: im_XXXX_XXX
- Time period: Oct 1 - Dec 31, 2024
- Goal: Validate dashboard metrics against source APIs

**Success Criteria:**
- [✅] Query ClickHouse for Facebook and Google Ads data from im_XXXX_XXX.mrt_*_ads
- [✅] Identify campaigns with zero metrics (ROAS=0, Clicks=0) in last 30 days
- [✅] Cross-reference with Google Ads API for accuracy
- [✅] Generate CSV report with discrepancies
- [✅] Complete in <30 minutes
- [✅] NEVER MOCK DATA - use real Example Client data only

**Data Requirements:**
- Tables: mrt_facebook_ads, mrt_google_ads, mrt_campaigns
- Key columns: campaign_name, spend, clicks, conversions, roas, date
- Filters: date >= '2024-10-01', status = 'active'

**Expected Deliverables:**
- CSV report with zero-metric campaigns
- SQL queries used for validation
- Summary comparing ClickHouse vs API metrics
```

## Template 2: Algorithm Implementation

**Use case:** Implementing performance-critical algorithms, optimization tasks.

```markdown
## Task: Implement [Algorithm Name] for [Use Case]

**Context:**
- Problem: [What needs to be solved]
- Constraints: [Performance, memory, accuracy requirements]
- Input: [Data format and size]
- Output: [Expected result format]

**Success Criteria:**
- [✅] Process [N] rows in <[X] seconds
- [✅] Handle edge cases ([nulls, duplicates, bad data, etc.])
- [✅] Memory usage <[N]MB
- [✅] Accuracy >[N]% (if applicable)
- [✅] Unit tests with >[N]% coverage
- [✅] Unique optimization approach (no copying existing code)
- [✅] NEVER MOCK DATA - test with real dataset

**Technical Requirements:**
- Language: [Python/SQL/etc.]
- Libraries allowed: [list]
- Input size: [typical and max]
- Platform: [ClickHouse/local/cloud]

**Expected Deliverables:**
- Implementation code in agent workspace
- Performance benchmarks with evidence
- Test cases with results
- Documentation of optimization strategy

## Agents Artifact Requirement
[Same as Template 1]
```

**Example filled template:**
```markdown
## Task: Implement Efficient Data Deduplication for Campaign Metrics

**Context:**
- Problem: Duplicate campaign records from multiple data sources
- Constraints: Process 1M+ rows, <5s execution, <500MB memory
- Input: CSV with campaign_id, date, spend, clicks (duplicates present)
- Output: Deduplicated CSV with aggregated metrics

**Success Criteria:**
- [✅] Process 1M rows in <5 seconds
- [✅] Handle edge cases (nulls, negative values, string IDs)
- [✅] Memory usage <500MB
- [✅] Accuracy 100% (verified against manual deduplication sample)
- [✅] Unit tests with 90%+ coverage
- [✅] Unique optimization approach (no standard pandas drop_duplicates)
- [✅] NEVER MOCK DATA - test with real campaign dataset

**Technical Requirements:**
- Language: Python 3.10+
- Libraries allowed: pandas, numpy, polars (optional)
- Input size: typical 100k rows, max 5M rows
- Platform: Local execution, ClickHouse-compatible output

**Expected Deliverables:**
- deduplication_script.py in agent workspace
- Performance benchmarks (CSV with row_count, execution_time)
- test_deduplication.py with pytest cases
- README explaining optimization strategy
```

## Template 3: Research & Analysis

**Use case:** Competitive analysis, market research, technical investigation.

```markdown
## Task: Analyze [Topic] for [Purpose]

**Context:**
- Research area: [Domain/industry/technology]
- Target audience: [Who will use this research]
- Business goal: [Why this research matters]
- Sources available: [Documentation, APIs, web, etc.]

**Success Criteria:**
- [✅] Identify [N]+ [key findings/patterns/competitors]
- [✅] Compare with [existing approach/benchmark]
- [✅] Recommend top [N] [improvements/opportunities] with ROI analysis
- [✅] Provide [implementation timeline/cost estimates/feasibility]
- [✅] Include [code examples/diagrams/data visualizations]
- [✅] NEVER MOCK DATA - use real sources and cite references

**Research Scope:**
- Primary sources: [list]
- Secondary sources: [list]
- Analysis dimensions: [list]
- Time frame: [historical period or future projection]

**Expected Deliverables:**
- Research report (markdown) in agent workspace
- Data/examples supporting findings
- Comparison matrix or decision framework
- Actionable recommendations with priorities

## Agents Artifact Requirement
[Same as Template 1]
```

**Example filled template:**
```markdown
## Task: Analyze Competitor AI Agent Security Approaches for Product Enhancement

**Context:**
- Research area: AI agent security patterns (2024-2025)
- Target audience: Improvado Product & Engineering teams
- Business goal: Enhance AI Agent security to enterprise-grade standards
- Sources available: Technical blogs, GitHub, security papers, competitor docs

**Success Criteria:**
- [✅] Identify 5+ competitor security patterns (with real examples)
- [✅] Compare with Improvado's current dual-verification approach
- [✅] Recommend top 3 improvements with ROI analysis (time/cost/risk)
- [✅] Provide implementation timeline estimates (sprints/complexity)
- [✅] Include code examples or architecture diagrams
- [✅] NEVER MOCK DATA - cite real sources (URLs, papers, GitHub repos)

**Research Scope:**
- Primary sources: Anthropic docs, OpenAI safety guides, competitor security whitepapers
- Secondary sources: HackerNews, security researcher blogs, GitHub security patterns
- Analysis dimensions: Prompt injection prevention, data isolation, tool permissions, audit trails
- Time frame: 2024-2025 modern approaches

**Expected Deliverables:**
- security_analysis_report.md in agent workspace
- Architecture diagrams (Mermaid or images)
- Code examples from competitors (with attribution)
- Recommendations matrix (improvement, effort, impact, priority)
```

## Template 4: API Integration

**Use case:** External system integration, connector development.

```markdown
## Task: Integrate [System Name] API for [Use Case]

**Context:**
- System: [API name and version]
- Purpose: [What data to fetch/send]
- Authentication: [OAuth/API key/etc.]
- Rate limits: [Requests per second/minute]

**Success Criteria:**
- [✅] Authenticate successfully with [auth method]
- [✅] Fetch [specific data] from [N] endpoints
- [✅] Handle rate limiting and pagination
- [✅] Parse response and store in [format/database]
- [✅] Error handling for [common failure modes]
- [✅] Complete in <[N] minutes for [N] records
- [✅] NEVER MOCK API RESPONSES - use real API or fail gracefully

**API Requirements:**
- Base URL: [URL]
- Endpoints: [list]
- Authentication: [method and credentials location]
- Response format: [JSON/XML/etc.]
- Required headers: [list]

**Expected Deliverables:**
- API client code in agent workspace
- Example requests/responses (sanitized)
- Error handling documentation
- Performance metrics (requests/sec, latency)

## Agents Artifact Requirement
[Same as Template 1]
```

**Example filled template:**
```markdown
## Task: Integrate Google Ads Discovery API for Customer Data Extraction

**Context:**
- System: Google Ads API v16
- Purpose: Discover available ad accounts for workspace_id 7661
- Authentication: OAuth 2.0 via DTS proxy
- Rate limits: 10 requests/second

**Success Criteria:**
- [✅] Authenticate successfully with DTS proxy (x-dts-session-id header)
- [✅] Fetch ad account list from /search endpoint
- [✅] Handle pagination for >100 accounts
- [✅] Parse response and store as JSON in agent workspace
- [✅] Error handling for 401, 403, 429, 500 errors
- [✅] Complete in <5 minutes for typical customer (~50 accounts)
- [✅] NEVER MOCK API RESPONSES - use real DTS proxy or document failure

**API Requirements:**
- Base URL: https://report.improvado.io/experimental/agent/api/discovery
- Endpoints: /list-connectors, /request
- Authentication: x-dts-session-id + x-im-workspace-id headers
- Response format: JSON
- Required headers: Content-Type: application/json

**Expected Deliverables:**
- google_ads_discovery_client.py in agent workspace
- example_request.json and example_response.json
- error_handling_guide.md with retry strategies
- Performance log with response times
```

## Template 5: Data Processing Pipeline

**Use case:** ETL, transformation, data quality tasks.

```markdown
## Task: Build [Pipeline Name] for [Data Flow]

**Context:**
- Source: [System/file/database]
- Destination: [System/file/database]
- Transformation: [What changes to apply]
- Volume: [Records per run]
- Frequency: [How often pipeline runs]

**Success Criteria:**
- [✅] Extract data from [source] with [method]
- [✅] Transform [N] records in <[X] seconds
- [✅] Validate data quality ([checks])
- [✅] Load to [destination] without data loss
- [✅] Handle failures with retry logic
- [✅] Log all operations for audit
- [✅] NEVER MOCK DATA - use real source data or synthetic test data (clearly labeled)

**Pipeline Requirements:**
- Input schema: [fields and types]
- Output schema: [fields and types]
- Transformation rules: [list]
- Data quality checks: [list]
- Error handling: [strategy]

**Expected Deliverables:**
- Pipeline code in agent workspace
- Data quality report for test run
- Execution logs showing success/failures
- Performance metrics (records/sec, errors)

## Agents Artifact Requirement
[Same as Template 1]
```

**Example filled template:**
```markdown
## Task: Build Campaign Metrics ETL Pipeline from ClickHouse to Dashboard JSON

**Context:**
- Source: ClickHouse im_XXXX_XXX.mrt_facebook_ads
- Destination: JSON file for HTML dashboard
- Transformation: Aggregate daily metrics to weekly, calculate KPIs
- Volume: 10,000 records per run
- Frequency: Daily (automated)

**Success Criteria:**
- [✅] Extract Facebook Ads data from ClickHouse with SQL query
- [✅] Transform 10k records in <10 seconds
- [✅] Validate data quality (no nulls in required fields, ROAS > 0)
- [✅] Load to dashboard.json without data loss
- [✅] Handle failures with retry logic (3 attempts, exponential backoff)
- [✅] Log all operations to pipeline.log
- [✅] NEVER MOCK DATA - use real Example Client Facebook data

**Pipeline Requirements:**
- Input schema: campaign_name, date, spend, clicks, conversions (from ClickHouse)
- Output schema: week_start, campaign_name, total_spend, total_clicks, avg_roas (JSON)
- Transformation rules: GROUP BY week, SUM metrics, CALCULATE ROAS
- Data quality checks: spend > 0, clicks >= 0, no future dates
- Error handling: Retry on ClickHouse timeout, fail on data quality violation

**Expected Deliverables:**
- etl_pipeline.py in agent workspace
- data_quality_report.json with validation results
- pipeline.log showing successful execution
- performance_metrics.json (10k records processed in X seconds)
```

## Using Templates

### Step 1: Select Template

Choose based on task type. If task combines multiple types, use the primary type template and add criteria from others.

### Step 2: Fill Placeholders

Replace all `[placeholder]` text with specific details:
- `[Customer Name]` → "Example Client"
- `[N]` → specific numbers (5, 100, 1000000, etc.)
- `[X]` → specific values (seconds, MB, %, etc.)

### Step 3: Customize Success Criteria

Add/remove/modify criteria based on specific task requirements:
- Keep criteria measurable and testable
- Include both functional and non-functional requirements
- Always include "NEVER MOCK DATA" criterion

### Step 4: Add Context

Provide enough context for agents to understand:
- Why this task matters (business goal)
- What data/systems are involved
- What constraints exist (time, resources, accuracy)

### Step 5: Specify Deliverables

Be explicit about what artifacts agents should create:
- File names and formats
- Required content
- Location (always in agent workspace folder)

## Template Customization Examples

### Adding Time Constraints

```markdown
**Success Criteria:**
- [✅] Complete entire analysis in <2 hours wall-clock time
- [✅] Each SQL query executes in <30 seconds
- [✅] Report generation takes <5 minutes
```

### Adding Data Quality Checks

```markdown
**Success Criteria:**
- [✅] Validate no duplicate records (group by campaign_id, date)
- [✅] Ensure spend values are non-negative
- [✅] Verify date range is within last 90 days
- [✅] Check for missing required fields (<1% null rate)
```

### Adding Security Requirements

```markdown
**Success Criteria:**
- [✅] Never expose API keys or credentials in code
- [✅] Sanitize all data before logging
- [✅] Use environment variables for sensitive config
- [✅] Encrypt data at rest if writing to disk
```

### Adding Comparison Criteria

```markdown
**Success Criteria:**
- [✅] Unique approach - NOT copying existing solution X
- [✅] Performance >20% better than baseline
- [✅] Code complexity lower than current implementation
- [✅] Different architectural pattern than competitors
```

## Common Pitfalls to Avoid

❌ **Vague criteria:** "Make it fast" → ✅ "Process 1M rows in <5 seconds"
❌ **Unmeasurable goals:** "Good quality" → ✅ "90%+ test coverage, <1% error rate"
❌ **Missing NEVER MOCK DATA:** Always include this criterion explicitly
❌ **No deliverables specified:** Agents won't know what files to create
❌ **Subjective evaluation:** "Nice code" → ✅ "Follows PEP-8, <10 complexity score"

## Template Validation Checklist

Before using a template, verify:
- [ ] All `[placeholders]` replaced with specific values
- [ ] Success criteria are measurable and testable
- [ ] "NEVER MOCK DATA" criterion included
- [ ] Context section provides sufficient background
- [ ] Deliverables section specifies exact artifacts
- [ ] Agents Artifact Requirement section included
- [ ] Criteria count is reasonable (3-7 criteria ideal)

## Related Documentation

- **Script Usage Guide:** `references/script_usage.md` (in this skill)
- **Full Orchestrator Guide:** `algorithms/product_div/Multi_agent_framework/00_MULTI_AGENT_ORCHESTRATOR.md`
- **SKILL.md:** Main skill documentation with workflow
