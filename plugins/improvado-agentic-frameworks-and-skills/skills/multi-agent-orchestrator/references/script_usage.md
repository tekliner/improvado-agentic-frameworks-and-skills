# Script Usage Guide

Detailed documentation for all Multi-Agent Orchestrator execution scripts.

## Available Scripts

All scripts are located in `algorithms/product_div/Multi_agent_framework/`

### 1. run_parallel_agents.sh (Recommended)

**Purpose:** Launch all three CLI agents (Claude Code, Codex, Gemini) in parallel for competitive evaluation.

**Usage:**
```bash
./run_parallel_agents.sh <path/to/task_file.md>
```

**Example:**
```bash
cd ~/project
./algorithms/product_div/Multi_agent_framework/run_parallel_agents.sh \
  client_cases/ClientName/15_customer_metrics/01_task_multi_agent.md
```

**What it does:**
1. Validates task file exists and is readable
2. Loads environment variables from `.env` file
3. Creates agent workspaces if they don't exist
4. Launches all three agents in parallel background processes
5. Monitors progress with real-time updates every 5 seconds
6. Displays completion status for each agent

**Expected runtime:**
- Codex: 2-3 minutes
- Claude Code: 5+ minutes (depends on complexity)
- Gemini: 3-5 minutes

**Automatic handling:**
- ✅ Repository root execution
- ✅ Environment variable loading
- ✅ Workspace directory creation
- ✅ Background process management
- ✅ Progress monitoring
- ✅ Error logging

### 2. run_claude_agent.sh

**Purpose:** Launch only Claude Code CLI agent.

**Usage:**
```bash
./run_claude_agent.sh <path/to/task_file.md>
```

**When to use:**
- Testing task file with single agent
- Re-running only Claude Code after fixing issues
- Focused debugging of Claude Code execution

**Script configuration:**
- Uses `--dangerously-disable-sandbox` flag
- Allows file operations
- Auto-approves tool usage with `--yes-always`

### 3. run_codex_agent.sh

**Purpose:** Launch only Codex CLI agent.

**Usage:**
```bash
./run_codex_agent.sh <path/to/task_file.md>
```

**When to use:**
- Fast iteration during task file development
- Re-running only Codex after failures
- Quick validation of task criteria

**Script configuration:**
- Uses Codex CLI with `--auto-run` flag
- Outputs to `codex_cli/` workspace
- Executes from repository root

### 4. run_gemini_agent.sh

**Purpose:** Launch only Gemini CLI agent.

**Usage:**
```bash
./run_gemini_agent.sh <path/to/task_file.md>
```

**When to use:**
- Testing Gemini-specific behavior
- Re-running after Gemini failures
- Comparative analysis against Codex/Claude

**Script configuration:**
- Uses Gemini CLI with appropriate flags
- Outputs to `gemini/` workspace
- Handles Gemini-specific requirements

### 5. run_codex_gpt5pro_agent.sh

**Purpose:** Launch Codex with GPT-5 Pro model (experimental).

**Usage:**
```bash
./run_codex_gpt5pro_agent.sh <path/to/task_file.md>
```

**When to use:**
- Testing GPT-5 Pro capabilities
- Comparing GPT-5 Pro vs standard Codex
- Experimental evaluations

**Note:** Requires GPT-5 Pro access. See `algorithms/product_div/Multi_agent_framework/README_GPT5_PRO_SETUP.md`

## Common Script Patterns

### Running from Claude Code (Background Mode)

When executing from Claude Code, always use background mode to allow monitoring:

```bash
# Launch in background
./run_parallel_agents.sh task_file.md &
SCRIPT_PID=$!

# Monitor progress
ps aux | grep $SCRIPT_PID

# Check agent outputs
tail -f [task_folder]/claude_code/01_*_plan_claude_code.md
tail -f [task_folder]/codex_cli/01_*_plan_codex.md
tail -f [task_folder]/gemini/01_*_plan_gemini.md
```

### Monitoring Real-Time Progress

All scripts create progress files in agent workspaces:

```bash
# Claude Code progress
watch -n 5 "cat [task_folder]/claude_code/01_*_plan_*.md | tail -20"

# Codex progress
watch -n 5 "cat [task_folder]/codex_cli/01_*_plan_*.md | tail -20"

# Gemini progress
watch -n 5 "cat [task_folder]/gemini/01_*_plan_*.md | tail -20"
```

### Checking Completion Status

Results files indicate completion:

```bash
# Check if all agents finished
ls [task_folder]/*/90_results_*.md

# Count completed agents
ls [task_folder]/*/90_results_*.md | wc -l
```

## Environment Variables

All scripts load variables from `.env` file in repository root.

**Required variables:**
```bash
# ClickHouse credentials (for customer data queries)
CLICKHOUSE_HOST="your-host.clickhouse.cloud"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD="your-password"
CLICKHOUSE_PORT=8443

# Notion credentials (for task tracking)
NOTION_TOKEN="secret_..."
NOTION_YOUR_EMAIL="your.email@domain.com"

# Other integrations (as needed)
GMAIL_CREDENTIALS_PATH="/path/to/credentials.json"
JIRA_API_TOKEN="your-jira-token"
```

**Verification:**
```bash
# Check environment loaded
grep CLICKHOUSE .env
echo $CLICKHOUSE_HOST
```

## Error Handling

### Script Not Found

**Error:**
```
bash: ./run_parallel_agents.sh: No such file or directory
```

**Solution:**
```bash
# Ensure you're in repository root
cd ~/project

# Verify script exists
ls algorithms/product_div/Multi_agent_framework/run_parallel_agents.sh

# Use full path
./algorithms/product_div/Multi_agent_framework/run_parallel_agents.sh task.md
```

### Permission Denied

**Error:**
```
bash: ./run_parallel_agents.sh: Permission denied
```

**Solution:**
```bash
# Make all scripts executable
chmod +x algorithms/product_div/Multi_agent_framework/*.sh
```

### Environment Variables Not Loaded

**Error:**
```
Error: CLICKHOUSE_HOST not set
```

**Solution:**
```bash
# Verify .env exists in repository root
ls -la .env

# Load manually if needed
source .env

# Verify loaded
echo $CLICKHOUSE_HOST
```

### Task File Not Found

**Error:**
```
Error: Task file not found: path/to/task.md
```

**Solution:**
```bash
# Use absolute path
./run_parallel_agents.sh /full/path/to/task_file.md

# Or relative from repository root
./run_parallel_agents.sh client_cases/ClientName/15_task/01_task.md
```

### Agent Workspace Conflicts

**Error:**
```
Error: Workspace directory not empty
```

**Solution:**
```bash
# Clean previous run artifacts
rm -rf [task_folder]/claude_code/*
rm -rf [task_folder]/codex_cli/*
rm -rf [task_folder]/gemini/*

# Or preserve logs
mv [task_folder]/claude_code [task_folder]/claude_code.backup
mkdir -p [task_folder]/claude_code
```

## Script Internals

### run_parallel_agents.sh Flow

```bash
1. Validate task file exists
2. Extract task folder path
3. Load .env file
4. Create agent workspace directories
5. Launch run_claude_agent.sh in background
6. Launch run_codex_agent.sh in background
7. Launch run_gemini_agent.sh in background
8. Monitor all three processes
9. Display real-time progress updates
10. Report completion status
```

### Agent Workspace Structure

Each agent creates files in its workspace:

```
[task_folder]/
├── claude_code/
│   ├── 01_*_plan_claude_code.md     # Planning & progress
│   ├── 90_*_results_claude_code.md  # Results & self-evaluation
│   ├── *.py                         # Code artifacts
│   ├── *.csv                        # Data artifacts
│   └── *.log                        # Execution logs
├── codex_cli/
│   ├── 01_*_plan_codex.md
│   ├── 90_*_results_codex.md
│   └── [artifacts]
└── gemini/
    ├── 01_*_plan_gemini.md
    ├── 90_*_results_gemini.md
    └── [artifacts]
```

## Advanced Usage

### Custom Script Flags

Modify scripts to add custom flags:

```bash
# Edit run_claude_agent.sh to add flags
nano algorithms/product_div/Multi_agent_framework/run_claude_agent.sh

# Example: Add timeout
claude-code "$TASK_FILE" --timeout 600 --yes-always
```

### Parallel Execution Tuning

Adjust monitoring interval in `run_parallel_agents.sh`:

```bash
# Default: 5 seconds
sleep 5

# Faster updates: 2 seconds (more CPU)
sleep 2

# Slower updates: 10 seconds (less CPU)
sleep 10
```

### Selective Agent Execution

Run specific combinations:

```bash
# Only Claude + Codex (skip Gemini)
./run_claude_agent.sh task.md &
./run_codex_agent.sh task.md &

# Only Codex + Gemini (skip Claude)
./run_codex_agent.sh task.md &
./run_gemini_agent.sh task.md &
```

## Debugging

### Enable Verbose Logging

Add debug flags to scripts:

```bash
# Edit script
nano run_parallel_agents.sh

# Add at top
set -x  # Enable verbose mode
set -e  # Exit on error
```

### Capture Full Output

Redirect all output to log file:

```bash
./run_parallel_agents.sh task.md > execution.log 2>&1
```

### Monitor System Resources

Check CPU/memory usage during execution:

```bash
# Monitor processes
top -pid $(pgrep -f claude-code)
top -pid $(pgrep -f codex)
top -pid $(pgrep -f gemini)

# Memory usage
ps aux | grep -E "claude-code|codex|gemini" | awk '{print $4, $11}'
```

## Best Practices

1. **Always run from repository root** - Ensures proper path resolution
2. **Use absolute task file paths** - Prevents "file not found" errors
3. **Monitor progress actively** - Don't assume agents completed successfully
4. **Check environment variables** - Verify .env loaded before execution
5. **Clean workspace before reruns** - Avoid mixing artifacts from multiple runs
6. **Use background mode from Claude Code** - Allows monitoring while agents execute
7. **Verify all agents completed** - Check for all three 90_results_*.md files
8. **Review self-evaluations carefully** - Winner isn't always obvious

## Related Documentation

- **Full Orchestrator Guide:** `algorithms/product_div/Multi_agent_framework/00_MULTI_AGENT_ORCHESTRATOR.md`
- **Task Templates:** `references/task_templates.md` (in this skill)
- **GPT-5 Pro Setup:** `algorithms/product_div/Multi_agent_framework/README_GPT5_PRO_SETUP.md`
- **Codex Usage:** `algorithms/product_div/Multi_agent_framework/README_CODEX_GPT5_PRO_USAGE.md`
