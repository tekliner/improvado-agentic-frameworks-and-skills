#!/bin/bash

# Multi-Agent Task File Generator
# Creates standardized task specification files for multi-agent framework

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage function
usage() {
    echo "Usage: $0 <task_folder_path> <task_name> [template_type]"
    echo ""
    echo "Arguments:"
    echo "  task_folder_path  - Path to task folder (e.g., client_cases/ClientName/15_metrics_validation)"
    echo "  task_name         - Brief task name (e.g., 'customer_metrics_validation')"
    echo "  template_type     - Optional: analysis|algorithm|research|api|pipeline (default: analysis)"
    echo ""
    echo "Examples:"
    echo "  $0 client_cases/ClientName/15_metrics metrics_validation analysis"
    echo "  $0 algorithms/product_div/20_dedup data_deduplication algorithm"
    echo ""
    exit 1
}

# Check arguments
if [ $# -lt 2 ]; then
    usage
fi

TASK_FOLDER="$1"
TASK_NAME="$2"
TEMPLATE_TYPE="${3:-analysis}"

# Validate template type
case "$TEMPLATE_TYPE" in
    analysis|algorithm|research|api|pipeline)
        ;;
    *)
        echo -e "${RED}Error: Invalid template type '$TEMPLATE_TYPE'${NC}"
        echo "Valid types: analysis, algorithm, research, api, pipeline"
        exit 1
        ;;
esac

# Create task folder if it doesn't exist
echo -e "${YELLOW}Creating task folder: $TASK_FOLDER${NC}"
mkdir -p "$TASK_FOLDER"

# Create agent workspace folders
echo -e "${YELLOW}Creating agent workspaces...${NC}"
mkdir -p "$TASK_FOLDER/claude_code"
mkdir -p "$TASK_FOLDER/codex_cli"
mkdir -p "$TASK_FOLDER/gemini"

# Create task file
TASK_FILE="$TASK_FOLDER/01_task_multi_agent_${TASK_NAME}.md"

echo -e "${YELLOW}Creating task file: $TASK_FILE${NC}"

# Generate task file based on template type
case "$TEMPLATE_TYPE" in
    analysis)
        cat > "$TASK_FILE" << 'EOF'
## Task: [Customer/Project Name] [Analysis Type] for [Time Period]

**Context:**
- Customer/Project: [Name with details]
- Database/Source: [Database or data source]
- Time period: [Date range]
- Goal: [Business objective]

**Success Criteria:**
- [✅] Query/Extract data from [source].[table/location]
- [✅] Identify [specific patterns/issues] in last [N] days
- [✅] Cross-reference with [external source] for accuracy
- [✅] Generate [format] report with [specific contents]
- [✅] Complete in <[N] minutes
- [✅] NEVER MOCK DATA - use real data only

**Data Requirements:**
- Tables/Sources: [list]
- Key columns/fields: [list]
- Filters: [date range, status, etc.]

**Expected Deliverables:**
- Report file in agent workspace folder
- Queries/scripts used for analysis
- Summary of findings with evidence

## Instructions for You (User):
1. **📝 EDIT THIS FILE** - Replace all [placeholders] with specific details
2. **✅ CONFIRM** - Reply "Ready" when file looks good
3. **🔄 ITERATE** - If major changes needed, edit the file and reply with changes

**Current Status:** 🔄 AWAITING YOUR EDITS AND CONFIRMATION

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
EOF
        ;;

    algorithm)
        cat > "$TASK_FILE" << 'EOF'
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

## Instructions for You (User):
1. **📝 EDIT THIS FILE** - Replace all [placeholders] with specific details
2. **✅ CONFIRM** - Reply "Ready" when file looks good
3. **🔄 ITERATE** - If major changes needed, edit the file and reply with changes

**Current Status:** 🔄 AWAITING YOUR EDITS AND CONFIRMATION

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
EOF
        ;;

    research)
        cat > "$TASK_FILE" << 'EOF'
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

## Instructions for You (User):
1. **📝 EDIT THIS FILE** - Replace all [placeholders] with specific details
2. **✅ CONFIRM** - Reply "Ready" when file looks good
3. **🔄 ITERATE** - If major changes needed, edit the file and reply with changes

**Current Status:** 🔄 AWAITING YOUR EDITS AND CONFIRMATION

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
EOF
        ;;

    api)
        cat > "$TASK_FILE" << 'EOF'
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

## Instructions for You (User):
1. **📝 EDIT THIS FILE** - Replace all [placeholders] with specific details
2. **✅ CONFIRM** - Reply "Ready" when file looks good
3. **🔄 ITERATE** - If major changes needed, edit the file and reply with changes

**Current Status:** 🔄 AWAITING YOUR EDITS AND CONFIRMATION

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
EOF
        ;;

    pipeline)
        cat > "$TASK_FILE" << 'EOF'
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

## Instructions for You (User):
1. **📝 EDIT THIS FILE** - Replace all [placeholders] with specific details
2. **✅ CONFIRM** - Reply "Ready" when file looks good
3. **🔄 ITERATE** - If major changes needed, edit the file and reply with changes

**Current Status:** 🔄 AWAITING YOUR EDITS AND CONFIRMATION

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
EOF
        ;;
esac

# Make script output the file path
echo ""
echo -e "${GREEN}✅ Task structure created successfully!${NC}"
echo ""
echo "📁 Task folder: $TASK_FOLDER"
echo "📄 Task file: $TASK_FILE"
echo "🔗 File path: file://$(pwd)/$TASK_FILE"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Open task file in your editor"
echo "2. Replace all [placeholders] with specific details"
echo "3. Save the file"
echo "4. Reply 'Ready' to launch agents"
echo ""
echo -e "${YELLOW}Launch command (when ready):${NC}"
echo "algorithms/product_div/Multi_agent_framework/run_parallel_agents.sh $TASK_FILE"
echo ""
