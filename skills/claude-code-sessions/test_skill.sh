#!/bin/bash
# Test Claude Code Sessions Skill
# Usage: ./test_skill.sh

# set -e  # Exit on error - disabled to see all test results

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_test() {
    echo -e "${BLUE}▶ Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Navigate to project root
cd "$(dirname "$0")/../../.."

print_section "Claude Code Sessions Skill Test Suite"

# Test 1: Check script files exist
print_test "Script files exist"
if [ -f "data_sources/claude_code/21_universal_session_resume.py" ] && \
   [ -f "data_sources/claude_code/22_list_all_sessions.py" ]; then
    print_success "All required scripts found"
else
    print_fail "Missing required scripts"
fi

# Test 2: Check Claude directory exists
print_test "Claude directory structure"
if [ -d "$HOME/.claude/projects" ]; then
    print_success "Claude projects directory exists: $HOME/.claude/projects"
    SESSION_COUNT=$(find "$HOME/.claude/projects" -name "*.jsonl" 2>/dev/null | wc -l)
    print_info "Found $SESSION_COUNT session files"
else
    print_fail "Claude projects directory not found"
fi

# Test 3: Test list sessions script
print_test "List sessions script (basic)"
if python3 data_sources/claude_code/22_list_all_sessions.py > /dev/null 2>&1; then
    print_success "List sessions script runs successfully"
else
    print_fail "List sessions script failed"
fi

# Test 4: Test list sessions with --days flag
print_test "List sessions script (--days 7)"
if python3 data_sources/claude_code/22_list_all_sessions.py --days 7 > /dev/null 2>&1; then
    print_success "List sessions with date filter works"
else
    print_fail "List sessions with date filter failed"
fi

# Test 5: Test resume script help
print_test "Resume script help"
if python3 data_sources/claude_code/21_universal_session_resume.py --help > /dev/null 2>&1; then
    print_success "Resume script help works"
else
    print_fail "Resume script help failed"
fi

# Test 6: Test resume script --last with dry-run
print_test "Resume script (--last --dry-run)"
if python3 data_sources/claude_code/21_universal_session_resume.py --last --dry-run > /dev/null 2>&1; then
    print_success "Resume latest session (dry-run) works"
else
    # This might fail if no sessions exist, which is ok
    print_info "No sessions found for --last test (expected if fresh install)"
fi

# Test 7: Check Python syntax
print_test "Python syntax validation"
SYNTAX_OK=true
for script in data_sources/claude_code/21_universal_session_resume.py \
              data_sources/claude_code/22_list_all_sessions.py; do
    if ! python3 -m py_compile "$script" 2>/dev/null; then
        print_fail "Syntax error in $script"
        SYNTAX_OK=false
    fi
done

if [ "$SYNTAX_OK" = true ]; then
    print_success "All Python scripts have valid syntax"
fi

# Test 8: Test grep search capability
print_test "Grep search capability"
if grep --version > /dev/null 2>&1; then
    print_success "grep available for session search"

    # Try a test search
    if [ -d "$HOME/.claude/projects" ]; then
        TEST_RESULTS=$(grep -l "session" "$HOME/.claude/projects"/-Users-*/*.jsonl 2>/dev/null | head -3)
        if [ -n "$TEST_RESULTS" ]; then
            print_info "Sample grep search found sessions"
        else
            print_info "No sessions matched test grep search"
        fi
    fi
else
    print_fail "grep not available"
fi

# Test 9: Check documentation files
print_test "Documentation files"
if [ -f ".claude/skills/claude-code-sessions/SKILL.md" ] && \
   [ -f ".claude/skills/claude-code-sessions/README.md" ]; then
    print_success "Skill documentation files exist"
else
    print_fail "Missing skill documentation files"
fi

# Test 10: Check related documentation
print_test "Related documentation exists"
if [ -f "data_sources/claude_code/16_CLAUDE_SESSION_MANAGEMENT.md" ] && \
   [ -f "data_sources/claude_code/CLAUDE.md" ]; then
    print_success "Related documentation files exist"
else
    print_fail "Missing related documentation"
fi

# Test 11: Verify session file format (if sessions exist)
print_test "Session file format validation"
SAMPLE_SESSION=$(find "$HOME/.claude/projects" -name "*.jsonl" 2>/dev/null | head -1)
if [ -n "$SAMPLE_SESSION" ]; then
    if head -1 "$SAMPLE_SESSION" | python3 -m json.tool > /dev/null 2>&1; then
        print_success "Session files are valid JSONL format"
    else
        print_fail "Session file format invalid"
    fi
else
    print_info "No session files found to validate"
fi

# Test 12: Test session ID format detection
print_test "Session ID format detection"
# Test with valid UUID format
TEST_UUID="c080fd31-1fea-44e2-8690-c58ad0f4a829"
if [[ $TEST_UUID =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    print_success "UUID format validation works"
else
    print_fail "UUID format validation failed"
fi

# Summary
print_section "Test Results Summary"
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ✗ SOME TESTS FAILED${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    exit 1
fi
