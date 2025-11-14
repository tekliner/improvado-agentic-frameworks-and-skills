---
name: skill-public-git-sync
description: Automatically sync Claude Code skills to public GitHub repository with security sanitization. Use when updating public skills repo, syncing new skills, or ensuring no sensitive data leaks. Checks for API keys, credentials, absolute paths, and client-specific info before copying.
version: "1.0.0"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite
---

# Skill Public Git Sync

Automatically synchronize Claude Code skills from local development to public GitHub repository with comprehensive security checks and path sanitization.

## When to Use This Skill

**Automatic triggers:**
- User says "sync skills to public repo"
- User says "update public skills repository"
- User says "publish skills to GitHub"
- User asks to "check skills for sensitive data"

**Manual triggers:**
- After creating or updating any skill
- Before releasing skills publicly
- When sanitizing skills for distribution
- Regular maintenance sync

## Quick Start Checklist

```markdown
[ ] 1. Identify skills to sync (all or specific)
[ ] 2. Run security scan on each skill
[ ] 3. Auto-fix absolute paths and client references
[ ] 4. Show sanitization report to user
[ ] 5. User confirms changes look good
[ ] 6. Copy sanitized skills to public repo
[ ] 7. Update public repo README if needed
[ ] 8. Create git commit with changes summary
[ ] 9. Push to GitHub
[ ] 10. Verify sync completed successfully
```

**5-Second Decision Tree:**
- Publishing skills? → Use this skill
- Updated existing skill? → Use this skill to sync
- New skill created? → Use this skill before sharing

## Core Principles

**CRITICAL SECURITY CHECKS:**
1. **No API Keys** - Detect and block secret_, sk-, AIza*, AKIA*, tokens
2. **No Credentials** - Find hardcoded passwords, tokens, auth strings
3. **No Absolute Paths** - Replace ~/ with generic ~/project or ./
4. **No Client Data** - Sanitize client names, database IDs, workspace IDs
5. **No Personal Info** - Check for emails, phone numbers, internal IDs

**Auto-Sanitization Rules:**
- `~/project` → `~/project` or `./`
- `im_XXXX_XXX` → `im_XXXX_XXX`
- `Example Client` → `Example Client` or `ClientName`
- `workspace_id: YYYY` → `workspace_id: YYYY`
- `daniel@improvado.io` → Keep only in author attribution (acceptable)

## Practical Workflow

### Phase 1: Identify Skills to Sync

**Automatic discovery:**
```bash
# Find all skills in local development
SKILLS_DIR="~/project/.claude/skills"
PUBLIC_REPO="~/projects/improvado-agentic-frameworks-and-skills"

# List all skills
ls -1 $SKILLS_DIR/
```

**Selective sync:**
```
🤖: "I found 12 skills in your development directory. Which ones should we sync?

   Current public skills:
   ✅ knowledge-framework
   ✅ claude-code-sessions
   ✅ youtube-to-knowledge-doc
   ✅ multi-agent-orchestrator

   New/Updated skills:
   🆕 skill-public-git-sync (new)
   🔄 notion-tasks-operations (updated)
   🔄 gmail-operations (updated)

   Sync: [all | new | updated | specific names]?"

👤: "all" or "skill-public-git-sync notion-tasks-operations"
```

### Phase 2: Security Scan

**For each skill, run comprehensive checks:**

```bash
# 1. Check for API keys
grep -r -E "(secret_[a-zA-Z0-9]{32,}|sk-[a-zA-Z0-9]{32,}|AIza[a-zA-Z0-9]{35}|AKIA[A-Z0-9]{16})" SKILL_DIR/

# 2. Check for passwords/credentials
grep -r -E "(password|passwd|pwd|token).*[:=].*['\"]" SKILL_DIR/

# 3. Check for absolute paths
grep -r "~" SKILL_DIR/

# 4. Check for client database IDs
grep -r "im_[0-9]{4,}_[0-9]+" SKILL_DIR/

# 5. Check for workspace/agency IDs
grep -r "(workspace_id|agency_id).*[0-9]{4,}" SKILL_DIR/

# 6. Check for Notion database/page IDs
grep -r "[0-9a-f]{32}" SKILL_DIR/
```

**Result format:**
```
🔍 SECURITY SCAN: skill-public-git-sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ API Keys: 0 found
✅ Credentials: 0 found
⚠️  Absolute Paths: 3 found
   - SKILL.md:127: ~/project
   - scripts/sync.sh:45: ~/.claude/skills

⚠️  Client IDs: 2 found
   - references/examples.md:89: im_XXXX_XXX
   - references/examples.md:104: workspace_id: YYYY

✅ Notion IDs: 0 sensitive found (only examples)

STATUS: ⚠️ NEEDS SANITIZATION (5 issues)
```

### Phase 3: Auto-Sanitization

**Apply fixes automatically:**

```python
# Sanitization patterns (reference: references/sanitization_patterns.md)

REPLACEMENTS = {
    # Absolute paths
    r'~/project': '~/project',
    r'~/projects/([^/\s]+)': r'~/projects/\1',
    r'~/\.claude': '~/.claude',
    r'~': '~',

    # Client database IDs
    r'im_\d{4,}_\d+': 'im_XXXX_XXX',

    # Workspace/Agency IDs
    r'workspace_id[:\s]+\d{4,}': 'workspace_id: YYYY',
    r'agency_id[:\s]+\d{4,}': 'agency_id: XXXX',

    # Client names (context-aware)
    r'Example Client': 'Example Client',
    r'client_cases/ClientName/': 'client_cases/ClientName/',

    # Notion database IDs (only non-example ones)
    r'DATABASE_ID': 'DATABASE_ID',
}
```

**Show changes to user:**
```
📝 SANITIZATION PREVIEW: skill-public-git-sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File: SKILL.md
Line 127:
  BEFORE: cd ~/project
  AFTER:  cd ~/project

File: references/examples.md
Line 89:
  BEFORE: Query ClickHouse im_XXXX_XXX database
  AFTER:  Query ClickHouse im_XXXX_XXX database

TOTAL: 5 replacements in 2 files

Continue with these changes? [yes/no/edit]
```

### Phase 4: Copy to Public Repo

**After user confirms:**

```bash
# 1. Create temp sanitized copy
TEMP_DIR="/tmp/skill_sync_$(date +%s)"
cp -r "$SKILLS_DIR/$SKILL_NAME" "$TEMP_DIR/"

# 2. Apply sanitization to temp copy
python scripts/sanitize_skill.py "$TEMP_DIR/$SKILL_NAME"

# 3. Copy sanitized version to public repo
cp -r "$TEMP_DIR/$SKILL_NAME" "$PUBLIC_REPO/skills/"

# 4. Clean up temp
rm -rf "$TEMP_DIR"
```

### Phase 5: Update Public README

**If new skill or description changed:**

```python
# Update skills registry table in README.md
# Add new skill in appropriate priority position
# Update skills count
# Update last modified date
```

### Phase 6: Git Commit & Push

```bash
cd "$PUBLIC_REPO"

# Add changes
git add skills/$SKILL_NAME README.md

# Create detailed commit
git commit -m "$(cat <<'EOF'
feat: Sync $SKILL_NAME from development

Synchronized skill with security sanitization:
- Replaced absolute paths with relative paths
- Sanitized client-specific database IDs
- Removed internal workspace references

Files synced:
- SKILL.md
- README.md (if applicable)
- scripts/ (if applicable)
- references/ (if applicable)

Security checks passed:
✅ No API keys
✅ No credentials
✅ No absolute paths
✅ No client data
✅ No personal info

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Push to GitHub
git push origin master
```

## Security Patterns Reference

### API Keys & Secrets (BLOCK - Never Allow)

**Patterns to detect:**
```regex
secret_[a-zA-Z0-9]{32,}          # Generic secrets
sk-[a-zA-Z0-9]{32,}              # OpenAI keys
AIza[a-zA-Z0-9]{35}              # Google API keys
AKIA[A-Z0-9]{16}                 # AWS access keys
ghp_[a-zA-Z0-9]{36}              # GitHub personal tokens
xoxb-[0-9]{10,13}-[a-zA-Z0-9]+   # Slack tokens
```

**Action:** BLOCK sync, alert user, request removal

### Credentials (BLOCK - Never Allow)

**Patterns to detect:**
```regex
(password|passwd|pwd|token)\s*[:=]\s*['"]\S+['"]
(api_key|apikey)\s*[:=]\s*['"]\S+['"]
Authorization:\s*Bearer\s+\S+
```

**Action:** BLOCK sync, alert user

### Absolute Paths (AUTO-FIX)

**Patterns to replace:**
```regex
~/project  →  ~/project
~/projects/([^/\s]+)             →  ~/projects/$1
~/\.claude                       →  ~/.claude
~                                →  ~
```

**Action:** AUTO-FIX, show preview, require confirmation

### Client Data (AUTO-FIX)

**Database IDs:**
```regex
im_\d{4,}_\d+                    →  im_XXXX_XXX
```

**Workspace/Agency IDs:**
```regex
workspace_id:\s*\d{4,}           →  workspace_id: YYYY
agency_id:\s*\d{4,}              →  agency_id: XXXX
```

**Client Names:**
```
Example Client                       →  Example Client
client_cases/ClientName/                 →  client_cases/ClientName/
```

**Action:** AUTO-FIX, show preview, require confirmation

### Acceptable Items (ALLOW)

**Author attribution:**
```
daniel@improvado.io              →  ALLOW (in author/contact sections)
Daniel Kravtsov                  →  ALLOW (author name)
```

**Example UUIDs:**
```
c080fd31-1fea-44e2-8690-...     →  ALLOW (clearly example session IDs)
```

**Generic paths:**
```
algorithms/product_div/          →  ALLOW (relative paths)
data_sources/gmail/              →  ALLOW (project structure)
```

## Bundled Scripts

### scripts/sanitize_skill.py

Python script that performs actual sanitization:

```python
#!/usr/bin/env python3
"""
Sanitize skill for public distribution
Usage: python sanitize_skill.py <skill_directory>
"""

import re
import os
import sys
from pathlib import Path

# Load patterns from references/sanitization_patterns.md
# Apply replacements
# Generate report
# Return exit code (0 = success, 1 = blocked)
```

### scripts/security_scan.sh

Bash script for quick security scanning:

```bash
#!/bin/bash
# Quick security scan for a skill
# Usage: ./security_scan.sh <skill_directory>

SKILL_DIR="$1"

echo "🔍 SECURITY SCAN: $(basename $SKILL_DIR)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run all checks
# Output color-coded results
# Exit with status code
```

## Common Patterns & Best Practices

### Pattern 1: Sync All Updated Skills

```
User: "Sync all updated skills to public repo"

Workflow:
1. Compare local skills with public repo (git diff)
2. Identify changed skills
3. Run security scan on each
4. Show combined sanitization report
5. User confirms
6. Batch sync all skills
7. Single git commit for all changes
```

### Pattern 2: Sync Single New Skill

```
User: "I just created skill-xyz, publish it"

Workflow:
1. Scan skill-xyz
2. Auto-sanitize
3. Show preview
4. User confirms
5. Copy to public repo
6. Update README registry
7. Git commit + push
```

### Pattern 3: Emergency Security Check

```
User: "Check all public skills for leaked secrets"

Workflow:
1. Scan PUBLIC repo (not local)
2. Report any findings
3. If issues found → URGENT fix required
4. Create sanitization commits
5. Force push with fixes
```

## Error Handling

### Security Violation Found

```
🚨 SECURITY VIOLATION DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Skill: notion-tasks-operations
File: SKILL.md
Line: 234

ISSUE: API key detected
Pattern: secret_abc123def456...

ACTION REQUIRED:
1. Remove the API key from source file
2. Re-run sync after fixing
3. Check if key was already committed to git
4. Rotate key if compromised

SYNC BLOCKED ❌
```

### Path Sanitization Conflict

```
⚠️  PATH CONFLICT DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Skill: youtube-to-knowledge-doc
File: SKILL.md

CONFLICT: Multiple absolute paths with different context

Line 45:  ~/project/scripts
  Suggested: ~/project/scripts

Line 67:  ~/projects/ai-dashboards/public
  Suggested: ~/projects/ai-dashboards/public

CHOOSE APPROACH:
1. Use ~/project for all (single project context)
2. Keep project names (~/projects/PROJECT_NAME)
3. Manual review required

Selection: [1/2/3]
```

## Integration with Other Skills

**Used by:**
- Any skill development workflow
- Regular maintenance sync process
- Pre-release validation

**Uses:**
- Read/Write/Edit tools for file operations
- Bash for git operations
- Grep for pattern matching

## Success Indicators

✅ All security scans pass (0 violations)
✅ Sanitization preview shows correct replacements
✅ User confirms changes before sync
✅ Public repo updated successfully
✅ Git commit created with detailed message
✅ Push to GitHub succeeds
✅ No sensitive data in public repo (verified)

## Anti-Patterns

❌ **Skipping security scan:** Never sync without checking
❌ **Auto-fixing without preview:** Always show changes to user
❌ **Batch operations without confirmation:** Confirm each skill or batch
❌ **Ignoring blocking violations:** If API key found, MUST block
❌ **Generic commit messages:** Always include what was sanitized

## Quick Reference

### Sync All Skills
```
User: "sync all skills to public repo"
→ Scans all local skills
→ Shows combined report
→ User confirms
→ Batch sync + commit
```

### Sync Single Skill
```
User: "sync skill-xyz"
→ Scans skill-xyz only
→ Shows specific report
→ User confirms
→ Copy + commit + push
```

### Security Check Only
```
User: "check public repo for secrets"
→ Scans PUBLIC repo
→ Reports violations
→ Suggests fixes
```

## Configuration

**Paths (configured in skill):**
```bash
LOCAL_SKILLS="~/project/.claude/skills"
PUBLIC_REPO="~/projects/improvado-agentic-frameworks-and-skills"
```

**Patterns (loaded from):**
- `references/sanitization_patterns.md` - Replacement patterns
- `references/security_patterns.md` - Detection patterns

## Version History

- **v1.0 (2025-11-13):** Initial skill creation
  - Comprehensive security scanning
  - Auto-sanitization with preview
  - Git integration with detailed commits
  - Support for batch and single skill sync
  - Blocking violations for critical security issues
