#!/bin/bash

# Codex Agent Runner - Multi-Repo Version
# Can be run from any directory with absolute paths

set -e

echo "🤖 Codex Agent - Multi-Repo Execution"
echo "====================================="

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
OUTPUT_DIR="${TASK_DIR}/codex_cli"
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
1. Your plan document at: ${OUTPUT_DIR}/01_plan_codex.md
2. Your final results at: ${OUTPUT_DIR}/90_results_codex.md

Follow all documentation principles specified in the task (MICE, DRY, Mermaid, Minto, Fractal).
Include concrete file paths and code examples from your analysis."

# Log file
LOG_FILE="${OUTPUT_DIR}/codex_output.log"

echo "🚀 Launching Codex agent..."
echo "   Log file: $LOG_FILE"
echo ""

# Run Codex from the repository root
cd "$REPO_ROOT"

# Try different Codex execution modes
# First try exec mode with same flags as original script
if command -v codex >/dev/null 2>&1; then
    echo "Using 'codex exec' mode with danger-full-access sandbox..."
    # Using same flags as original: --sandbox danger-full-access and -C for directory
    codex exec --sandbox danger-full-access -C "$OUTPUT_DIR" "$PROMPT" > "$LOG_FILE" 2>&1
    EXIT_CODE=$?
else
    echo "❌ Codex CLI not found. Please install Codex first."
    echo "   Installation: npm install -g @openai/codex"
    exit 1
fi

echo ""
echo "✅ Codex agent completed with exit code: $EXIT_CODE"
echo ""

# Check for created files
echo "📂 Checking output files:"
if [ -f "${OUTPUT_DIR}/01_plan_codex.md" ]; then
    echo "  ✅ Plan created successfully"
    echo "     Size: $(wc -l < "${OUTPUT_DIR}/01_plan_codex.md") lines"
else
    echo "  ❌ Plan not found"
fi

if [ -f "${OUTPUT_DIR}/90_results_codex.md" ]; then
    echo "  ✅ Results created successfully"
    echo "     Size: $(wc -l < "${OUTPUT_DIR}/90_results_codex.md") lines"
else
    echo "  ❌ Results not found"
fi

echo ""
echo "📋 Log output (last 20 lines):"
echo "============================="
tail -n 20 "$LOG_FILE"

echo ""
echo "🏁 Codex execution complete!"
echo "   Full log: $LOG_FILE"
echo "   Plan: ${OUTPUT_DIR}/01_plan_codex.md"
echo "   Results: ${OUTPUT_DIR}/90_results_codex.md"

exit $EXIT_CODE