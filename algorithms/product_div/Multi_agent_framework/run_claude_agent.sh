#!/bin/bash

# Claude Code Agent Runner - Multi-Repo Version
# Can be run from any directory with absolute paths

set -e

echo "🤖 Claude Code Agent - Multi-Repo Execution"
echo "==========================================="

if [ -z "$1" ]; then
    echo "❌ Usage: $0 <absolute_path_to_task_file.md>"
    echo "   Example: $0 /Users/me/projects/repo/task.md"
    exit 1
fi

TASK_FILE="$1"

# Check if task file exists
if [ ! -f "$TASK_FILE" ]; then
    echo "❌ Error: Task file not found: $TASK_FILE"
    exit 1
fi

# Get directory and name from task file
TASK_DIR=$(dirname "$TASK_FILE")
TASK_NAME=$(basename "$TASK_FILE" .md)

# Create output directory next to task file
OUTPUT_DIR="${TASK_DIR}/claude_code"
mkdir -p "$OUTPUT_DIR"

# Get the repository root
if git -C "$TASK_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    REPO_ROOT=$(git -C "$TASK_DIR" rev-parse --show-toplevel)
else
    REPO_ROOT="$TASK_DIR"
fi

echo "📋 Task file: $TASK_FILE"
echo "📂 Output directory: $OUTPUT_DIR"
echo "📁 Repository root: $REPO_ROOT"
echo "🕐 Start time: $(date)"
echo ""

# Create the prompt with absolute paths
PROMPT="Read the task file at ${TASK_FILE} and complete the analysis.

IMPORTANT: Your working directory is ${REPO_ROOT}

Create the following files:
1. Your plan document at: ${OUTPUT_DIR}/01_plan_claude_code.md
2. Your final results at: ${OUTPUT_DIR}/90_results_claude_code.md

Follow all documentation principles specified in the task (MICE, DRY, Mermaid, Minto, Fractal).
Include concrete file paths and code examples from your analysis."

# Log file
LOG_FILE="${OUTPUT_DIR}/claude_output.log"

echo "🚀 Launching Claude Code agent..."
echo "   Log file: $LOG_FILE"
echo ""

# Run Claude from the repository root
cd "$REPO_ROOT"

# Execute Claude with various permission modes
claude --print \
    --permission-mode bypassPermissions \
    --add-dir "${TASK_DIR}" \
    --add-dir "${REPO_ROOT}" \
    "$PROMPT" > "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo ""
echo "✅ Claude Code agent completed with exit code: $EXIT_CODE"
echo ""

# Check for created files
echo "📂 Checking output files:"
if [ -f "${OUTPUT_DIR}/01_plan_claude_code.md" ]; then
    echo "  ✅ Plan created successfully"
    echo "     Size: $(wc -l < "${OUTPUT_DIR}/01_plan_claude_code.md") lines"
else
    echo "  ❌ Plan not found"
fi

if [ -f "${OUTPUT_DIR}/90_results_claude_code.md" ]; then
    echo "  ✅ Results created successfully"
    echo "     Size: $(wc -l < "${OUTPUT_DIR}/90_results_claude_code.md") lines"
else
    echo "  ❌ Results not found"
fi

echo ""
echo "📋 Log output (last 20 lines):"
echo "=============================="
tail -n 20 "$LOG_FILE"

echo ""
echo "🏁 Claude Code execution complete!"
echo "   Full log: $LOG_FILE"
echo "   Plan: ${OUTPUT_DIR}/01_plan_claude_code.md"
echo "   Results: ${OUTPUT_DIR}/90_results_claude_code.md"

exit $EXIT_CODE