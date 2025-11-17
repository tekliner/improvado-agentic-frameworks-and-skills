#!/bin/bash

# Gemini Agent Runner - Multi-Repo Version
# Uses the best Gemini model (gemini-2.0-flash-thinking-exp) in YOLO mode
# This model provides superior reasoning and coding capabilities
# Author: Daniel Kravtsov
# Last Updated: 2025-10-10

set -e

echo "🚀 Gemini Agent - Multi-Repo Execution (Best Model)"
echo "===================================================="

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
OUTPUT_DIR="${TASK_DIR}/gemini"
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

# Ensure Node 22.19.0 is used
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22.19.0 > /dev/null 2>&1 || {
    echo "⚠️  Node.js 22.19.0 not found. Using default version."
}

# Get Gemini path
GEMINI_BIN=$(which gemini 2>/dev/null || echo "$(nvm which 22.19.0 | cut -d'/' -f1-7)/bin/gemini")

if [ ! -f "$GEMINI_BIN" ] && [ ! -x "$GEMINI_BIN" ]; then
    echo "❌ Error: Gemini CLI not found. Please install it first:"
    echo "   npm install -g @google/gemini-cli@nightly"
    exit 1
fi

echo "🔧 Using Gemini: $GEMINI_BIN"
echo ""

# Create the prompt with absolute paths
PROMPT="Read the task file at ${TASK_FILE} and complete the analysis.

IMPORTANT: Your working directory is ${REPO_ROOT}

Create the following files:
1. Your plan document at: ${OUTPUT_DIR}/01_plan_gemini.md
2. Your final results at: ${OUTPUT_DIR}/90_results_gemini.md

Follow all documentation principles specified in the task (MICE, DRY, Mermaid, Minto, Fractal).
Include concrete file paths and code examples from your analysis.

Start by creating the plan file, then execute your analysis, and finally create the results file with self-evaluation."

# Log file
LOG_FILE="${OUTPUT_DIR}/gemini_output.log"

echo "🚀 Launching Gemini agent..."
echo "   Version: $("$GEMINI_BIN" --version 2>/dev/null || echo 'unknown')"
echo "   Model: gemini-2.0-flash-thinking-exp (best reasoning & coding)"
echo "   Mode: YOLO (auto-approve all actions)"
echo "   Log file: $LOG_FILE"
echo ""

# Run Gemini from the repository root
cd "$REPO_ROOT"

# Execute Gemini with best model and YOLO mode
# Using gemini-2.0-flash-thinking-exp for best reasoning and coding capabilities
"$GEMINI_BIN" \
    --model "gemini-2.0-flash-thinking-exp" \
    --yolo \
    --include-directories "${TASK_DIR}" \
    --prompt "$PROMPT" > "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo ""
echo "✅ Gemini agent completed with exit code: $EXIT_CODE"
echo ""

# Check for created files
echo "📂 Checking output files:"
if [ -f "${OUTPUT_DIR}/01_plan_gemini.md" ]; then
    echo "  ✅ Plan created successfully"
    echo "     Size: $(wc -l < "${OUTPUT_DIR}/01_plan_gemini.md") lines"
else
    echo "  ❌ Plan not found"
fi

if [ -f "${OUTPUT_DIR}/90_results_gemini.md" ]; then
    echo "  ✅ Results created successfully"
    echo "     Size: $(wc -l < "${OUTPUT_DIR}/90_results_gemini.md") lines"
else
    echo "  ❌ Results not found"
fi

# Check for Python files
if ls "${OUTPUT_DIR}"/*.py >/dev/null 2>&1; then
    PY_COUNT=$(ls "${OUTPUT_DIR}"/*.py | wc -l)
    echo "  ✅ Python files created: $PY_COUNT"
fi

# Check for test files
if ls "${OUTPUT_DIR}"/test_*.py >/dev/null 2>&1; then
    TEST_COUNT=$(ls "${OUTPUT_DIR}"/test_*.py | wc -l)
    echo "  ✅ Test files created: $TEST_COUNT"
fi

echo ""
echo "📋 Log output (last 20 lines):"
echo "=============================="
tail -n 20 "$LOG_FILE" 2>/dev/null || echo "Log file is empty or unavailable"

echo ""
echo "🏁 Gemini execution complete!"
echo "   Full log: $LOG_FILE"
echo "   Plan: ${OUTPUT_DIR}/01_plan_gemini.md"
echo "   Results: ${OUTPUT_DIR}/90_results_gemini.md"

exit $EXIT_CODE