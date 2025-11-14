#!/bin/bash
#
# Security scan for Claude Code skills before public distribution
# Usage: ./security_scan.sh <skill_directory>
#
# Created by: Claude Code
# Date: 2025-11-13

set -e

SKILL_DIR="$1"

if [ -z "$SKILL_DIR" ]; then
    echo "Usage: ./security_scan.sh <skill_directory>"
    exit 1
fi

if [ ! -d "$SKILL_DIR" ]; then
    echo "❌ Error: Directory not found: $SKILL_DIR"
    exit 1
fi

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

SKILL_NAME=$(basename "$SKILL_DIR")

echo "🔍 SECURITY SCAN: $SKILL_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Counters
BLOCKING=0
WARNINGS=0
ALLOWED=0
EXIT_CODE=0

# 1. Check for API keys (BLOCKING)
echo "🔒 Checking for API keys and secrets..."
API_KEYS=$(grep -r -E "(secret_[a-zA-Z0-9]{32,}|sk-[a-zA-Z0-9]{48,}|AIza[a-zA-Z0-9]{35}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|xoxb-[0-9]{10,13})" "$SKILL_DIR" 2>/dev/null || true)

if [ -n "$API_KEYS" ]; then
    echo -e "${RED}❌ API KEYS DETECTED (BLOCKING):${NC}"
    echo "$API_KEYS" | head -5
    BLOCKING=$((BLOCKING + 1))
    EXIT_CODE=1
else
    echo -e "${GREEN}✅ No API keys found${NC}"
fi
echo ""

# 2. Check for hardcoded credentials (BLOCKING)
echo "🔐 Checking for hardcoded credentials..."
CREDS=$(grep -r -E "(password|passwd|pwd|token)\s*[:=]\s*['\"]" "$SKILL_DIR" --exclude-dir=.git 2>/dev/null | grep -v "# Example" || true)

if [ -n "$CREDS" ]; then
    echo -e "${RED}❌ CREDENTIALS DETECTED (BLOCKING):${NC}"
    echo "$CREDS" | head -5
    BLOCKING=$((BLOCKING + 1))
    EXIT_CODE=1
else
    echo -e "${GREEN}✅ No hardcoded credentials${NC}"
fi
echo ""

# 3. Check for absolute paths (WARNING - auto-fixable)
echo "📁 Checking for absolute paths..."
ABS_PATHS=$(grep -r "~" "$SKILL_DIR" 2>/dev/null || true)
ABS_COUNT=$(echo "$ABS_PATHS" | grep -c "~" || echo "0")

if [ "$ABS_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Absolute paths found: $ABS_COUNT (AUTO-FIXABLE)${NC}"
    echo "$ABS_PATHS" | head -3
    WARNINGS=$((WARNINGS + ABS_COUNT))
else
    echo -e "${GREEN}✅ No absolute paths${NC}"
    ALLOWED=$((ALLOWED + 1))
fi
echo ""

# 4. Check for client database IDs (WARNING - auto-fixable)
echo "🗄️  Checking for client database IDs..."
CLIENT_IDS=$(grep -r -E "im_[0-9]{4,}_[0-9]+" "$SKILL_DIR" 2>/dev/null || true)
CLIENT_COUNT=$(echo "$CLIENT_IDS" | grep -c "im_" || echo "0")

if [ "$CLIENT_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Client database IDs found: $CLIENT_COUNT (AUTO-FIXABLE)${NC}"
    echo "$CLIENT_IDS" | head -3
    WARNINGS=$((WARNINGS + CLIENT_COUNT))
else
    echo -e "${GREEN}✅ No client database IDs${NC}"
    ALLOWED=$((ALLOWED + 1))
fi
echo ""

# 5. Check for workspace/agency IDs (WARNING - auto-fixable)
echo "🏢 Checking for workspace/agency IDs..."
WS_IDS=$(grep -r -E "(workspace_id|agency_id).*[0-9]{4,}" "$SKILL_DIR" 2>/dev/null || true)
WS_COUNT=$(echo "$WS_IDS" | grep -c "workspace_id\|agency_id" || echo "0")

if [ "$WS_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Workspace/Agency IDs found: $WS_COUNT (AUTO-FIXABLE)${NC}"
    echo "$WS_IDS" | head -3
    WARNINGS=$((WARNINGS + WS_COUNT))
else
    echo -e "${GREEN}✅ No workspace/agency IDs${NC}"
    ALLOWED=$((ALLOWED + 1))
fi
echo ""

# 6. Check for client names (WARNING - auto-fixable)
echo "👥 Checking for client names..."
CLIENT_NAMES=$(grep -r -E "(Example Client|Example Company|HP)" "$SKILL_DIR" 2>/dev/null || true)
NAME_COUNT=$(echo "$CLIENT_NAMES" | grep -c "Example Client\|Example Company\|HP" || echo "0")

if [ "$NAME_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Client names found: $NAME_COUNT (AUTO-FIXABLE)${NC}"
    echo "$CLIENT_NAMES" | head -3
    WARNINGS=$((WARNINGS + NAME_COUNT))
else
    echo -e "${GREEN}✅ No client names${NC}"
    ALLOWED=$((ALLOWED + 1))
fi
echo ""

# 7. Check for Notion database/user IDs (WARNING - context-dependent)
echo "📋 Checking for internal Notion IDs..."
NOTION_IDS=$(grep -r -E "(DATABASE_ID|3456d36b-7be3-4451-be12|c7ac6729-ef5d)" "$SKILL_DIR" 2>/dev/null || true)

if [ -n "$NOTION_IDS" ]; then
    echo -e "${YELLOW}⚠️  Internal Notion IDs found (REVIEW NEEDED):${NC}"
    echo "$NOTION_IDS" | head -3
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ No internal Notion IDs${NC}"
    ALLOWED=$((ALLOWED + 1))
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SCAN SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $BLOCKING -gt 0 ]; then
    echo -e "${RED}❌ BLOCKING VIOLATIONS: $BLOCKING${NC}"
    echo "   Action: MUST fix before sync"
    echo ""
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  AUTO-FIX NEEDED: $WARNINGS items${NC}"
    echo "   Action: Run sanitize_skill.py to fix"
    echo ""
fi

if [ $BLOCKING -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ CLEAN: Ready for public sync${NC}"
    echo "   All security checks passed!"
    echo ""
fi

echo -e "${GREEN}✅ ALLOWED ITEMS: $ALLOWED checks${NC}"
echo ""

# Status
if [ $BLOCKING -gt 0 ]; then
    echo -e "STATUS: ${RED}🚫 BLOCKED${NC}"
    echo ""
    echo "Fix blocking violations before syncing to public repo."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "STATUS: ${YELLOW}⚠️  NEEDS SANITIZATION${NC}"
    echo ""
    echo "Run: python scripts/sanitize_skill.py \"$SKILL_DIR\""
    exit 2
else
    echo -e "STATUS: ${GREEN}✅ READY TO SYNC${NC}"
    exit 0
fi
