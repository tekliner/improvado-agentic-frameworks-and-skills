---
name: multi-agent-orchestrator
description: Orchestrate parallel execution of multiple CLI agents (Claude Code, Codex, Gemini) for competitive evaluation of complex tasks. Use when user says "run multi-agent framework", "compare agents", "launch competitive evaluation", "use parallel agents", or requests multiple approaches for tasks with complexity >7/10 where multiple valid implementation strategies exist and best solution matters.
---

# Multi-Agent Orchestrator Skill

Orchestrate parallel execution of multiple CLI agents (Claude Code CLI, Codex CLI, Gemini CLI) to competitively solve complex tasks with self-evaluation and winner selection based on measurable success criteria.

## When to Use This Skill

Use this skill when:
- Complex tasks requiring competitive evaluation (complexity >7/10)
- Multiple valid implementation approaches exist
- Need to compare different agent strategies
- High-stakes tasks where best solution matters
- Tasks where one approach might significantly outperform others

**DO NOT USE when:**
- Single specialized capability needed (use Task tool sub-agents instead)
- Simple task with obvious solution (complexity <5/10)
- Standard workflow exists (gmail, notion, jira operations)

## Quick Start Checklist

When user wants multi-agent comparison:

```markdown
[ ] 1. Verify task complexity justifies multi-agent (>7/10)
[ ] 2. Agree on task folder location with user
[ ] 3. Propose descriptive folder name with numeric prefix
[ ] 4. Create task specification file immediately
[ ] 5. User edits task file to refine criteria
[ ] 6. Wait for user confirmation "Ready"
[ ] 7. Launch ./run_parallel_agents.sh in background
[ ] 8. Monitor progress via agent log files
[ ] 9. Compare self-evaluations when complete
[ ] 10. Declare winner based on criteria met
```

**5-Second Decision Tree:**
- Complexity >7/10 AND multiple approaches? → Multi-agent framework
- Single specialized task (gmail/notion/jira)? → Task tool sub-agent
- Simple task? → Handle directly

## Core Principles

**CRITICAL: 🔴 NEVER MOCK DATA!** Try multiple approaches to obtain real data. If all attempts fail, stop the task and document all attempted approaches.

**Progressive disclosure workflow:** Agree on location → Create draft task file → User edits criteria → Confirm readiness → Launch agents → Compare results.

## Practical Workflow

### Phase 1: Setup - Agree on Location FIRST

**MANDATORY FIRST STEP - No file creation until user approves location:**

```
🤖: "For your [task type] task, I suggest these locations:
   1. 📁 /client_cases/[client_name]/15_[task_name]/ (if client-specific)
   2. 📁 /algorithms/product_div/15_[task_name]/ (if product algorithm)
   3. 📁 /analytics/clickhouse/15_[task_name]/ (if data analysis)

   Which location works best? And what should the folder name be?"

👤: "Use client_cases/ClientName/15_customer_metrics_validation/"

🤖: "✅ Agreed! Creating task in: /client_cases/ClientName/15_customer_metrics_validation/"
```

### Phase 2: Create Task File Immediately

**QUICK DRAFT APPROACH - User will edit directly:**

```bash
# 1. Create task folder
mkdir -p [agreed_folder_path]

# 2. Navigate to task folder
cd [agreed_folder_path]

# 3. Create QUICK task file (user will improve)
cat > 01_task_multi_agent.md << 'EOF'
## Task: [Your quick understanding - user will improve this]

**Success Criteria:** [DRAFT - user will refine these]
- [Draft criterion 1 - based on your initial understanding]
- [Draft criterion 2 - based on your initial understanding]
- [Draft criterion 3 - based on your initial understanding]

## Instructions for You (User):
1. **📝 EDIT THIS FILE** - Add details, fix criteria, clarify requirements
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

# 4. Create agent workspaces within task folder
mkdir -p claude_code codex_cli gemini

# 5. Show user the file location
echo "📄 Task file created: [agreed_folder_path]/01_task_multi_agent.md"
echo "🔗 Click to edit: file://[full_path_to_file]"

# 6. Return to parent directory
cd ..
```

**Folder Structure Created:**
```
[agreed_folder_path]/
├── 01_task_multi_agent.md        # Task specification (user will edit)
├── claude_code/                  # Claude workspace
├── codex_cli/                    # Codex workspace
└── gemini/                       # Gemini workspace
```

### Phase 3: User Edits Task File

**User now has full control - they edit the task file directly in their IDE.**

**User workflow:**
1. Open the file (link provided above)
2. Edit directly - improve task description, refine criteria, add details
3. Reply "Ready" when satisfied - OR edit more and reply with specific changes needed

**Example User Edits:**
```markdown
## Task: Analyze customer conversion funnel for HP Q4 campaign performance

**Success Criteria:**
- [✅] Generate conversion rates by channel (Google, Facebook, LinkedIn)
- [✅] Identify top 3 drop-off points in funnel with root causes
- [✅] Provide actionable recommendations for 15% conversion improvement
- [✅] Complete analysis in under 2 hours using available ClickHouse data
```

### Phase 4: Wait for User Confirmation

**DO NOT PROCEED until user explicitly confirms readiness.**

**Acceptable responses:**
- ✅ "Ready" - proceed with current file
- ✅ "Ready with changes: [specific edits]" - apply changes then proceed
- ✅ "Change criterion #2 to: [new text]" - apply single change then proceed

### Phase 5: Launch Parallel Agents

**When user says "Ready":**

```bash
# Run in background so Claude Code can monitor progress
./run_parallel_agents.sh [agreed_folder_path]/01_task_multi_agent.md &
SCRIPT_PID=$!

# Monitor progress
ps aux | grep $SCRIPT_PID
tail -f [task_folder]/*/claude_output.log
```

**The script automatically handles:**
- ✅ Repository root execution
- ✅ Environment variable loading (.env file)
- ✅ Correct agent flags and permissions
- ✅ Workspace setup and cleanup
- ✅ Background process management
- ✅ Real-time progress monitoring (updates every 5 seconds)
- ✅ Agents run in parallel background processes

**Expected timing:**
- **Codex**: 2-3 minutes for most tasks
- **Claude**: 5+ minutes depending on task complexity
- **Gemini**: 3-5 minutes

### Phase 6: Monitor Progress

**Track via plan files:**
```bash
# Check Claude progress
cat [agreed_folder_path]/claude_code/01_*_plan_claude_code.md

# Check Codex progress
cat [agreed_folder_path]/codex_cli/01_*_plan_codex.md

# Check Gemini progress
cat [agreed_folder_path]/gemini/01_*_plan_gemini.md
```

### Phase 7: Compare Self-Evaluations

**No manual testing - compare results files only:**

```
┌────────────────────────┬──────────────┬─────────────┬─────────────┐
│ Success Criteria       │ Claude Code  │ Codex       │ Gemini      │
├────────────────────────┼──────────────┼─────────────┼─────────────┤
│ Process 1M rows <5s    │ ❌ (6.2 sec) │ ✅ (3.8 sec)│ ✅ (4.1 sec)│
│ Handle bad data        │ ✅ (tested)  │ ✅ (tested) │ ✅ (tested) │
│ Unique optimizations   │ ❌ (duplicated)│ ✅ (unique) │ ✅ (unique) │
├────────────────────────┼──────────────┼─────────────┼─────────────┤
│ CRITERIA MET           │ 1/3          │ 3/3         │ 3/3         │
└────────────────────────┴──────────────┴─────────────┴─────────────┘
🏆 WINNER: Tie between Codex and Gemini
```

**Winner = highest score** - agent with most ✅ criteria wins.

## Critical Artifact Placement Rule

**🔴 CRITICAL: ALL ARTIFACTS MUST BE IN AGENT WORKSPACE FOLDER**

Every agent MUST create ALL output files in their assigned workspace folder - NEVER in external directories.

**❌ INCORRECT (violations):**
```bash
[task_folder]/
├── 01_task.md
├── claude_code/
│   ├── 01_plan_claude_code.md      ✅
│   └── 90_results_claude_code.md   ✅
├── data_processed/
│   └── output.csv                  ❌ WRONG! Should be in claude_code/
└── results.json                     ❌ WRONG! Should be in claude_code/
```

**✅ CORRECT (all artifacts in workspace):**
```bash
[task_folder]/
├── 01_task.md
├── claude_code/
│   ├── 01_plan_claude_code.md      ✅ Planning document
│   ├── 90_results_claude_code.md   ✅ Results + self-evaluation
│   ├── output.csv                  ✅ Data artifact
│   ├── results.json                ✅ Metadata artifact
│   ├── conversion_script.py        ✅ Code artifact
│   └── execution.log               ✅ Log artifact
└── codex_cli/
    ├── 01_plan_codex.md            ✅
    ├── 90_results_codex.md         ✅
    └── analysis.json               ✅
```

**Why This Matters:**
1. **Traceability** - Easy to see which agent created which artifacts
2. **Comparison** - Compare outputs side-by-side without confusion
3. **Cleanup** - Delete failed agent results cleanly
4. **Reproducibility** - Know exact inputs/outputs for each agent
5. **Multi-agent workflows** - Prevent file conflicts when agents run in parallel

## Ready-to-Use Scripts

**All the complex setup is automated in ready-to-use scripts:**

### Main Script (Recommended):
```bash
./run_parallel_agents.sh task_file.md
```

### Individual Agent Scripts:
```bash
./run_claude_agent.sh task_file.md    # Claude only
./run_codex_agent.sh task_file.md     # Codex only
./run_gemini_agent.sh task_file.md    # Gemini only
```

**Scripts location:** `algorithms/product_div/Multi_agent_framework/`

For detailed script documentation, refer to `references/script_usage.md` in this skill directory.

## Common Patterns & Best Practices

### Pattern 1: Customer Data Analysis Task
```markdown
## Task: Validate customer metrics for Example Client Q4 dashboard

**Success Criteria:**
- [✅] Query ClickHouse for Example Client data (im_XXXX_XXX database)
- [✅] Identify any zero-metric campaigns in last 30 days
- [✅] Cross-reference with Google Ads API for accuracy
- [✅] Generate CSV report with discrepancies
- [✅] Complete in <30 minutes
```

### Pattern 2: Algorithm Implementation Task
```markdown
## Task: Implement efficient data deduplication algorithm

**Success Criteria:**
- [✅] Process 1M rows in <5 seconds
- [✅] Handle edge cases (nulls, duplicates, bad data)
- [✅] Memory usage <500MB
- [✅] Unit tests with 90%+ coverage
- [✅] Unique optimization approach (no copying existing code)
```

### Pattern 3: Research & Analysis Task
```markdown
## Task: Analyze competitor AI agent security approaches

**Success Criteria:**
- [✅] Identify 5+ competitor security patterns
- [✅] Compare with Improvado's current approach
- [✅] Recommend top 3 improvements with ROI analysis
- [✅] Provide implementation timeline estimates
- [✅] Include code examples or architecture diagrams
```

## Error Handling

### Common Issues

**1. Script not found:**
```bash
# Ensure you're in repository root
cd ~/project

# Verify script exists
ls algorithms/product_div/Multi_agent_framework/run_parallel_agents.sh
```

**2. Permission denied:**
```bash
# Make scripts executable
chmod +x algorithms/product_div/Multi_agent_framework/*.sh
```

**3. Environment variables not loaded:**
```bash
# Verify .env exists
ls .env

# Check ClickHouse credentials
echo $CLICKHOUSE_HOST
echo $CLICKHOUSE_USER
```

**4. Agent workspace conflicts:**
```bash
# Clean previous run
rm -rf [task_folder]/claude_code/* [task_folder]/codex_cli/* [task_folder]/gemini/*
```

## Integration with Task Tool Sub-Agents

**Use Multi-Agent Framework when:**
- Complexity >7/10
- Multiple valid approaches exist
- Need competitive evaluation
- Best solution critically important

**Use Task Tool Sub-Agents when:**
- Single specialized capability (gmail, notion, jira)
- Standard workflow exists
- Quick operation needed
- Complexity <5/10

**Example decision:**
```
User: "Create Notion task for PR review"
→ Use Task tool with notion-agent (standard workflow)

User: "Implement optimal customer segmentation algorithm"
→ Use Multi-Agent Framework (complex, multiple approaches, need best solution)
```

## Success Indicators

✅ User clearly understands task criteria before launch
✅ All agents complete without external artifact violations
✅ Self-evaluations are honest and evidence-based
✅ Winner is clear based on objective criteria
✅ Results are immediately usable (no mock data)

## Anti-Patterns

❌ **Using for simple tasks:** "Create a CSV from this data" - just do it directly
❌ **No clear success criteria:** Vague goals lead to vague results
❌ **Mocking data:** NEVER create fake data/responses
❌ **Skipping user confirmation:** Always wait for "Ready"
❌ **External artifacts:** All outputs must be in agent workspace folders
❌ **Subjective evaluation:** Use measurable, testable criteria only

## Quick Reference

### Workflow Summary
```
1. User describes complex task
2. Verify complexity >7/10 (justify multi-agent)
3. Agree on task folder location
4. Create quick draft task file
5. User edits and confirms "Ready"
6. Launch ./run_parallel_agents.sh in background
7. Monitor progress via plan files
8. Compare self-evaluations (90_results_*.md)
9. Declare winner based on criteria met
10. Document results and reasoning
```

### File Template Reference
```markdown
# 01_plan_[agent].md
## My Approach ([agent])
- [ ] Step 1: [action]
## Progress Updates: ✅ [timestamp] Step 1 complete

# 90_results_[agent].md
## Self-Evaluation ([agent])
### Criterion 1: [from task file]
**Status:** ✅/❌/⚠️ | **Evidence:** [data] | **Details:** [how tested]
## Overall: X/Y criteria met | Grade: ✅/❌/⚠️
```

## Bundled Resources

### Scripts
- **Task file generator:** Use `scripts/create_task_file.sh` to generate standardized task specification files
- **Agent launcher:** Execution scripts are located at `algorithms/product_div/Multi_agent_framework/`

### References
- **Script usage guide:** `references/script_usage.md` - Detailed documentation for all agent execution scripts
- **Task file templates:** `references/task_templates.md` - Pre-built task templates for common scenarios
- **Full orchestrator guide:** `algorithms/product_div/Multi_agent_framework/00_MULTI_AGENT_ORCHESTRATOR.md`

### When to Load References
- **Script usage guide:** Load when encountering script execution errors or needing advanced configuration
- **Task templates:** Load when creating task files for specific domains (data analysis, algorithm implementation, research)
- **Full guide:** Load for comprehensive understanding of the framework architecture and design decisions

## Integration with Task Tool Sub-Agents

**Use Multi-Agent Framework when:**
- Complexity >7/10
- Multiple valid approaches exist
- Need competitive evaluation
- Best solution critically important

**Use Task Tool Sub-Agents when:**
- Single specialized capability (gmail, notion, jira)
- Standard workflow exists
- Quick operation needed
- Complexity <5/10

## Related Documentation

- **Full Guide:** `algorithms/product_div/Multi_agent_framework/00_MULTI_AGENT_ORCHESTRATOR.md`
- **Scripts Location:** `algorithms/product_div/Multi_agent_framework/`
- **Task Tool Sub-Agents:** `.claude/agents/` (notion-agent, jira-agent, gmail-agent, etc.)

## Version History

- **v1.2 (2025-01-12):** Updated to official 2025 Claude Code skill standards
  - **CRITICAL:** Moved trigger phrases to YAML `description` field (official requirement)
  - Removed "AUTOMATIC TRIGGERS" section from body (community pattern, not official)
  - Updated description to include specific user phrases: "run multi-agent framework", "compare agents", etc.
  - Aligned with Anthropic's official skill activation model
- **v1.1 (2025-01-12):** Improved skill based on skill-creator best practices
  - Updated description to third-person imperative form
  - Added Core Principles section
  - Added bundled resources structure (scripts/references)
  - Improved progressive disclosure with reference loading guidance
  - Enhanced clarity on when to load specific references
- **v1.0 (2025-01-12):** Initial skill creation based on Multi-Agent Orchestrator framework
  - Parallel CLI agent execution (Claude Code, Codex, Gemini)
  - Self-evaluation comparison workflow
  - Artifact placement enforcement
  - User-editable task specification approach
