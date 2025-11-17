#!/bin/bash

# Multi-Agent Orchestrator - Multi-Repo Version
# Now with three agents: Claude, Codex, and Gemini
# Author: Daniel Kravtsov
# Last Updated: 2025-09-23

set -e

# Load environment variables from .env if it exists
if [ -f .env ]; then
    set -a  # Mark all variables for export
    source .env
    set +a  # Unset auto-export
fi

echo "🚀 Multi-Agent Orchestrator - Parallel Execution"
echo "=========================================================="

if [ -z "$1" ]; then
    echo "❌ Usage: $0 <task_file.md>"
    echo "   Example: $0 task.md"
    echo "   Example: $0 /absolute/path/to/task.md"
    exit 1
fi

TASK_FILE="$1"

# Convert to absolute path if relative
if [[ ! "$TASK_FILE" = /* ]]; then
    TASK_FILE="$(pwd)/$TASK_FILE"
fi

# Check if task file exists
if [ ! -f "$TASK_FILE" ]; then
    echo "❌ Error: Task file not found: $TASK_FILE"
    exit 1
fi

# Get directory of task file for output
TASK_DIR=$(dirname "$TASK_FILE")
TASK_NAME=$(basename "$TASK_FILE" .md)

# Create output directories next to task file
CLAUDE_OUTPUT_DIR="${TASK_DIR}/claude_code"
CODEX_OUTPUT_DIR="${TASK_DIR}/codex_cli"
GEMINI_OUTPUT_DIR="${TASK_DIR}/gemini"

echo "📋 Task: $TASK_FILE"
echo "📂 Output directories:"
echo "   - Claude: $CLAUDE_OUTPUT_DIR"
echo "   - Codex: $CODEX_OUTPUT_DIR"
echo "   - Gemini: $GEMINI_OUTPUT_DIR"
echo "🕐 Start time: $(date)"
echo ""

# Create output directories
mkdir -p "$CLAUDE_OUTPUT_DIR"
mkdir -p "$CODEX_OUTPUT_DIR"
mkdir -p "$GEMINI_OUTPUT_DIR"

# Get the repository root (where task references might point)
if git -C "$TASK_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    REPO_ROOT=$(git -C "$TASK_DIR" rev-parse --show-toplevel)
else
    REPO_ROOT="$TASK_DIR"
fi

# Reload .env from repository root if different from current directory
if [ -f "${REPO_ROOT}/.env" ] && [ "$REPO_ROOT" != "$(pwd)" ]; then
    set -a
    source "${REPO_ROOT}/.env"
    set +a
fi

echo "📁 Repository root: $REPO_ROOT"
echo ""

# Prepare prompts for agents with absolute paths
CLAUDE_PROMPT="Read the task file at ${TASK_FILE} and complete the analysis.
Your working directory is ${REPO_ROOT}.
Create your plan in ${CLAUDE_OUTPUT_DIR}/01_plan_claude_code.md
and final results in ${CLAUDE_OUTPUT_DIR}/90_results_claude_code.md"

CODEX_PROMPT="Read the task file at ${TASK_FILE} and complete the analysis.
Your working directory is ${REPO_ROOT}.
Create your plan in ${CODEX_OUTPUT_DIR}/01_plan_codex.md
and final results in ${CODEX_OUTPUT_DIR}/90_results_codex.md"

GEMINI_PROMPT="Read the task file at ${TASK_FILE} and complete the analysis.
Your working directory is ${REPO_ROOT}.
Create your plan in ${GEMINI_OUTPUT_DIR}/01_plan_gemini.md
and final results in ${GEMINI_OUTPUT_DIR}/90_results_gemini.md"

echo "🚀 Launching THREE agents in parallel..."
echo ""

# Launch Claude Code agent - CONFIRMED WORKING COMMAND
echo "Starting Claude Code agent..."
(
    cd "$REPO_ROOT"
    # CRITICAL: Use --print with stdin for non-interactive mode
    echo "$CLAUDE_PROMPT" | claude --print \
        --permission-mode bypassPermissions \
        --add-dir "${TASK_DIR}" \
        > "${CLAUDE_OUTPUT_DIR}/claude_output.log" 2>&1
    echo "Claude exit code: $?" >> "${CLAUDE_OUTPUT_DIR}/claude_output.log"
) &
CLAUDE_PID=$!

# Launch Codex agent
echo "Starting Codex agent..."
(
    cd "$REPO_ROOT"
    # CRITICAL: Use -c shell_environment_policy.inherit=all to pass OPENAI_API_KEY from .env
    codex exec --sandbox danger-full-access -c shell_environment_policy.inherit=all -C "$CODEX_OUTPUT_DIR" "$CODEX_PROMPT" \
        > "${CODEX_OUTPUT_DIR}/codex_output.log" 2>&1
    echo "Codex exit code: $?" >> "${CODEX_OUTPUT_DIR}/codex_output.log"
) &
CODEX_PID=$!

# Launch Gemini agent
echo "Starting Gemini agent..."
(
    cd "$REPO_ROOT"
    
    # Ensure Node.js 22.19.0 is available
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm use 22.19.0 > /dev/null 2>&1 || echo "Warning: Node.js 22.19.0 not found"
    
    # Get Gemini binary path
    GEMINI_BIN=$(which gemini 2>/dev/null || echo "$(nvm which 22.19.0 | cut -d'/' -f1-7)/bin/gemini")
    
    # Execute Gemini with YOLO mode and include directories
    "$GEMINI_BIN" \
        --yolo \
        --include-directories "${TASK_DIR}" \
        --prompt "$GEMINI_PROMPT" \
        > "${GEMINI_OUTPUT_DIR}/gemini_output.log" 2>&1
    echo "Gemini exit code: $?" >> "${GEMINI_OUTPUT_DIR}/gemini_output.log"
) &
GEMINI_PID=$!

echo "🔍 Agents launched:"
echo "   - Claude Code PID: $CLAUDE_PID"
echo "   - Codex PID: $CODEX_PID"
echo "   - Gemini PID: $GEMINI_PID"
echo ""

echo "⏳ Monitoring agent progress..."
echo "   Tip: You can monitor logs in real-time with:"
echo "   tail -f ${CLAUDE_OUTPUT_DIR}/claude_output.log"
echo "   tail -f ${CODEX_OUTPUT_DIR}/codex_output.log"
echo "   tail -f ${GEMINI_OUTPUT_DIR}/gemini_output.log"
echo ""

# Wait for both agents to complete with progress monitoring
START_TIME=$(date +%s)
LAST_CLAUDE_LINES=0
LAST_CODEX_LINES=0
LAST_GEMINI_LINES=0

while kill -0 $CLAUDE_PID 2>/dev/null || kill -0 $CODEX_PID 2>/dev/null || kill -0 $GEMINI_PID 2>/dev/null; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    # Check Claude status and log progress
    CLAUDE_STATUS="🔄 running"
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
        CLAUDE_STATUS="✅ completed"
    elif [ -f "${CLAUDE_OUTPUT_DIR}/claude_output.log" ]; then
        CLAUDE_LINES=$(wc -l < "${CLAUDE_OUTPUT_DIR}/claude_output.log" 2>/dev/null || echo 0)
        if [ "$CLAUDE_LINES" -gt "$LAST_CLAUDE_LINES" ]; then
            CLAUDE_STATUS="📝 writing (${CLAUDE_LINES} lines)"
            LAST_CLAUDE_LINES=$CLAUDE_LINES
        fi
    fi

    # Check Codex status and log progress
    CODEX_STATUS="🔄 running"
    if ! kill -0 $CODEX_PID 2>/dev/null; then
        CODEX_STATUS="✅ completed"
    elif [ -f "${CODEX_OUTPUT_DIR}/codex_output.log" ]; then
        CODEX_LINES=$(wc -l < "${CODEX_OUTPUT_DIR}/codex_output.log" 2>/dev/null || echo 0)
        if [ "$CODEX_LINES" -gt "$LAST_CODEX_LINES" ]; then
            CODEX_STATUS="📝 writing (${CODEX_LINES} lines)"
            LAST_CODEX_LINES=$CODEX_LINES
        fi
    fi

    # Check Gemini status and log progress
    GEMINI_STATUS="🔄 running"
    if ! kill -0 $GEMINI_PID 2>/dev/null; then
        GEMINI_STATUS="✅ completed"
    elif [ -f "${GEMINI_OUTPUT_DIR}/gemini_output.log" ]; then
        GEMINI_LINES=$(wc -l < "${GEMINI_OUTPUT_DIR}/gemini_output.log" 2>/dev/null || echo 0)
        if [ "$GEMINI_LINES" -gt "$LAST_GEMINI_LINES" ]; then
            GEMINI_STATUS="📝 writing (${GEMINI_LINES} lines)"
            LAST_GEMINI_LINES=$GEMINI_LINES
        fi
    fi

    # Display progress
    printf "\r⏱️  %ds | Claude: %s | Codex: %s | Gemini: %s" "$ELAPSED" "$CLAUDE_STATUS" "$CODEX_STATUS" "$GEMINI_STATUS"

    sleep 5
done

echo ""  # New line after progress monitoring
echo ""
echo "✅ All THREE agents completed!"
echo ""

# Wait for processes to finish and get exit codes
wait $CLAUDE_PID 2>/dev/null
CLAUDE_EXIT=$?

wait $CODEX_PID 2>/dev/null
CODEX_EXIT=$?

wait $GEMINI_PID 2>/dev/null
GEMINI_EXIT=$?

echo "📊 EXECUTION SUMMARY:"
echo "===================="
echo "Claude Code exit code: $CLAUDE_EXIT"
echo "Codex exit code: $CODEX_EXIT"
echo "Gemini exit code: $GEMINI_EXIT"
echo ""

# Check outputs
echo "📝 OUTPUT FILES:"
echo "==============="

echo "Claude Code outputs:"
if [ -f "${CLAUDE_OUTPUT_DIR}/claude_output.log" ]; then
    LOG_LINES=$(wc -l < "${CLAUDE_OUTPUT_DIR}/claude_output.log")
    echo "  ✅ Log file: ${LOG_LINES} lines"

    # Check for errors in log (first few lines often contain setup errors)
    if head -10 "${CLAUDE_OUTPUT_DIR}/claude_output.log" | grep -q "Error:"; then
        echo "  ⚠️  Setup errors detected in log!"
        head -10 "${CLAUDE_OUTPUT_DIR}/claude_output.log" | grep "Error:" | head -2
    fi
fi

# Check created files
CLAUDE_FILES=0
[ -f "${CLAUDE_OUTPUT_DIR}/01_plan_claude_code.md" ] && { echo "  ✅ Plan created"; CLAUDE_FILES=$((CLAUDE_FILES + 1)); } || echo "  ❌ Plan missing"
[ -f "${CLAUDE_OUTPUT_DIR}/90_results_claude_code.md" ] && { echo "  ✅ Results created"; CLAUDE_FILES=$((CLAUDE_FILES + 1)); } || echo "  ❌ Results missing"

# Check for Python files
if ls "${CLAUDE_OUTPUT_DIR}"/*.py >/dev/null 2>&1; then
    PY_COUNT=$(ls "${CLAUDE_OUTPUT_DIR}"/*.py | wc -l)
    echo "  ✅ Python files: $PY_COUNT"
    CLAUDE_FILES=$((CLAUDE_FILES + PY_COUNT))
fi

# Check for test files
if ls "${CLAUDE_OUTPUT_DIR}"/test_*.py >/dev/null 2>&1; then
    TEST_COUNT=$(ls "${CLAUDE_OUTPUT_DIR}"/test_*.py | wc -l)
    echo "  ✅ Test files: $TEST_COUNT"
fi

echo ""
echo "Codex outputs:"
if [ -f "${CODEX_OUTPUT_DIR}/codex_output.log" ]; then
    LOG_LINES=$(wc -l < "${CODEX_OUTPUT_DIR}/codex_output.log")
    echo "  ✅ Log file: ${LOG_LINES} lines"
fi

# Check created files
CODEX_FILES=0
[ -f "${CODEX_OUTPUT_DIR}/01_plan_codex.md" ] && { echo "  ✅ Plan created"; CODEX_FILES=$((CODEX_FILES + 1)); } || echo "  ❌ Plan missing"
[ -f "${CODEX_OUTPUT_DIR}/90_results_codex.md" ] && { echo "  ✅ Results created"; CODEX_FILES=$((CODEX_FILES + 1)); } || echo "  ❌ Results missing"

# Check for Python files
if ls "${CODEX_OUTPUT_DIR}"/*.py >/dev/null 2>&1; then
    PY_COUNT=$(ls "${CODEX_OUTPUT_DIR}"/*.py | wc -l)
    echo "  ✅ Python files: $PY_COUNT"
    CODEX_FILES=$((CODEX_FILES + PY_COUNT))
fi

# Check for test files
if ls "${CODEX_OUTPUT_DIR}"/test_*.py >/dev/null 2>&1 || ls "${CODEX_OUTPUT_DIR}"/*test*.py >/dev/null 2>&1; then
    TEST_COUNT=$(ls "${CODEX_OUTPUT_DIR}"/*test*.py 2>/dev/null | wc -l)
    echo "  ✅ Test files: $TEST_COUNT"
fi

echo ""
echo "Gemini outputs:"
if [ -f "${GEMINI_OUTPUT_DIR}/gemini_output.log" ]; then
    LOG_LINES=$(wc -l < "${GEMINI_OUTPUT_DIR}/gemini_output.log")
    echo "  ✅ Log file: ${LOG_LINES} lines"
fi

# Check created files
GEMINI_FILES=0
[ -f "${GEMINI_OUTPUT_DIR}/01_plan_gemini.md" ] && { echo "  ✅ Plan created"; GEMINI_FILES=$((GEMINI_FILES + 1)); } || echo "  ❌ Plan missing"
[ -f "${GEMINI_OUTPUT_DIR}/90_results_gemini.md" ] && { echo "  ✅ Results created"; GEMINI_FILES=$((GEMINI_FILES + 1)); } || echo "  ❌ Results missing"

# Check for Python files
if ls "${GEMINI_OUTPUT_DIR}"/*.py >/dev/null 2>&1; then
    PY_COUNT=$(ls "${GEMINI_OUTPUT_DIR}"/*.py | wc -l)
    echo "  ✅ Python files: $PY_COUNT"
    GEMINI_FILES=$((GEMINI_FILES + PY_COUNT))
fi

# Check for test files
if ls "${GEMINI_OUTPUT_DIR}"/test_*.py >/dev/null 2>&1 || ls "${GEMINI_OUTPUT_DIR}"/*test*.py >/dev/null 2>&1; then
    TEST_COUNT=$(ls "${GEMINI_OUTPUT_DIR}"/*test*.py 2>/dev/null | wc -l)
    echo "  ✅ Test files: $TEST_COUNT"
fi

echo ""
echo "🏏 COMPARISON:"
echo "============="

# Score based on actual files created
echo "Claude artifacts created: $CLAUDE_FILES"
echo "Codex artifacts created: $CODEX_FILES"
echo "Gemini artifacts created: $GEMINI_FILES"

# Determine winner based on artifacts created
MAX_FILES=$CLAUDE_FILES
WINNER="Claude Code"

if [ $CODEX_FILES -gt $MAX_FILES ]; then
    MAX_FILES=$CODEX_FILES
    WINNER="Codex"
fi

if [ $GEMINI_FILES -gt $MAX_FILES ]; then
    MAX_FILES=$GEMINI_FILES
    WINNER="Gemini"
fi

# Check for ties
TIE_COUNT=0
[ $CLAUDE_FILES -eq $MAX_FILES ] && TIE_COUNT=$((TIE_COUNT + 1))
[ $CODEX_FILES -eq $MAX_FILES ] && TIE_COUNT=$((TIE_COUNT + 1))
[ $GEMINI_FILES -eq $MAX_FILES ] && TIE_COUNT=$((TIE_COUNT + 1))

if [ $TIE_COUNT -gt 1 ]; then
    echo "🤝 Tie between $TIE_COUNT agents - each created $MAX_FILES artifacts"
else
    echo "🏆 Winner: $WINNER (created $MAX_FILES artifacts)"
fi

# Performance comparison
echo ""
echo "⏱️  Performance:"
echo "  Claude: Generated $(wc -l < "${CLAUDE_OUTPUT_DIR}/claude_output.log" 2>/dev/null || echo 0) log lines"
echo "  Codex: Generated $(wc -l < "${CODEX_OUTPUT_DIR}/codex_output.log" 2>/dev/null || echo 0) log lines"
echo "  Gemini: Generated $(wc -l < "${GEMINI_OUTPUT_DIR}/gemini_output.log" 2>/dev/null || echo 0) log lines"

echo ""
echo "📍 Next steps:"
echo "  1. Review the log files for any errors"
echo "  2. Compare the plan files to understand each agent's approach"
echo "  3. Review the results files for self-evaluation"
echo "  4. Test the implementations if created"
echo ""
echo "📂 All outputs saved in:"
echo "  ${TASK_DIR}/"
echo ""
echo "🎉 Multi-agent execution complete (3 agents)!"
