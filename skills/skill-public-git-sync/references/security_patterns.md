# Security Patterns

Detection patterns for security scanning before public skill distribution.

## ❌ BLOCKING VIOLATIONS (Must Fix Before Sync)

### API Keys & Secrets

**OpenAI:**
```regex
sk-[a-zA-Z0-9]{48,}
sk-proj-[a-zA-Z0-9]{48,}
```

**Google API:**
```regex
AIza[a-zA-Z0-9]{35}
```

**AWS:**
```regex
AKIA[A-Z0-9]{16}
[A-Za-z0-9/+=]{40}  (AWS Secret Access Key)
```

**GitHub:**
```regex
ghp_[a-zA-Z0-9]{36}
gho_[a-zA-Z0-9]{36}
```

**Slack:**
```regex
xoxb-[0-9]{10,13}-[a-zA-Z0-9]+
xoxp-[0-9]{10,13}-[a-zA-Z0-9]+
```

**Generic Secrets:**
```regex
secret_[a-zA-Z0-9]{32,}
```

**Notion:**
```regex
secret_[a-zA-Z0-9]{43}
ntn_[a-zA-Z0-9]+
```

**Action:** BLOCK sync immediately, alert user, request removal

### Hardcoded Credentials

**Password patterns:**
```regex
(password|passwd|pwd)\s*[:=]\s*['"]\S+['"]
(api_key|apikey|API_KEY)\s*[:=]\s*['"]\S+['"]
(auth_token|token)\s*[:=]\s*['"]\S+['"]
```

**Authorization headers:**
```regex
Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+/]+
Authorization:\s*Basic\s+[A-Za-z0-9+/=]+
```

**Database credentials:**
```regex
(user|username|USER)\s*[:=]\s*['"]\S+['"].*password
mongodb://\S+:\S+@
postgresql://\S+:\S+@
```

**Action:** BLOCK sync, alert user with location

## ⚠️  WARNING VIOLATIONS (Auto-Fix or Review)

### Absolute Paths

**User home directory:**
```regex
/Users/[^/\s]+
/home/[^/\s]+
C:\\Users\\[^\\]+
```

**Specific detection:**
```regex
~
~/project
~/\.claude
```

**Action:** AUTO-FIX with replacements from sanitization_patterns.md

### Client-Specific Database IDs

```regex
im_\d{4,}_\d+
```

**Examples to catch:**
- im_XXXX_XXX
- im_XXXX_XXXde
- im_12345_abc

**Action:** AUTO-FIX → im_XXXX_XXX

### Workspace & Agency IDs

```regex
workspace_id[:\s]+\d{4,}
agency_id[:\s]+\d{4,}
```

**Action:** AUTO-FIX → workspace_id: YYYY, agency_id: XXXX

### Internal Notion IDs

**Database IDs (32 hex chars):**
```regex
[0-9a-f]{32}(?![0-9a-f])
```

**Known internal databases to replace:**
- DATABASE_ID (Tasks DB)

**User IDs (UUID format, known internal):**
- USER_ID_1 (Daniel)
- USER_ID_2 (Nataliia)

**Action:** AUTO-FIX if confirmed internal, ALLOW if example

### Client Names in Text

```regex
(Example Client|Example Company|HP)\b
```

**Context-aware replacement:**
- In file paths → Example_Client
- In text examples → Example Company

**Action:** AUTO-FIX with context awareness

## ✅ ALLOWED PATTERNS (Safe for Public)

### Author Attribution

```regex
daniel@improvado\.io
Daniel Kravtsov
```

**Context:** Only in author/contact/attribution sections
**Action:** ALLOW

### Example Session IDs

**Known safe examples:**
```regex
c080fd31-1fea-44e2-8690-c58ad0f4a829
21fc9ab9-7ffd-40b7-9cac-1a5570f86e7d
550e8400-e29b-41d4-a716-446655440000
```

**Indicators it's an example:**
- Used in "Example" section
- Appears in code blocks as template
- Documented as example in comments

**Action:** ALLOW

### Relative Paths

```regex
^\.\.?/
algorithms/
data_sources/
client_cases/(?!MB2|HP|Example Company)
```

**Action:** ALLOW (these are generic project paths)

### Generic Folder Patterns

```regex
~/projects/\$\{PROJECT_NAME\}
~/project
\./
```

**Action:** ALLOW (these are templated/generic)

## 🔍 CONTEXT-AWARE CHECKS

### Email Address Context

**BLOCK if:**
- In configuration examples
- In API request examples
- In credential sections

**ALLOW if:**
- In author/copyright section
- Explicitly marked as contact info
- In "About the author" sections

### UUID Context Analysis

**Check surrounding context:**

**Example indicators (ALLOW):**
```
"Example session ID: abc123..."
"For testing, use: abc123..."
"# Sample UUID for demonstration"
```

**Real UUID indicators (BLOCK/REPLACE):**
```
session_id = "abc123..."
NOTION_PAGE_ID = "abc123..."
DATABASE_ID = "abc123..."
```

### Company Name Context

**"Improvado" usage analysis:**

**ALLOW:**
- "Improvado vs Competitors" (comparison)
- "Improvado's approach" (attribution)
- Package names, author fields

**REPLACE:**
- "Improvado's database ID" → "Company's database ID"
- "Improvado internal API" → "Internal API"
- Specific internal tool names

## Scan Execution Order

1. **CRITICAL SCAN (Block if found):**
   - API keys & secrets
   - Hardcoded credentials
   - Authorization tokens

2. **PATH SCAN (Auto-fix):**
   - Absolute user paths
   - Specific project paths

3. **DATA SCAN (Auto-fix with review):**
   - Client database IDs
   - Workspace/agency IDs
   - Internal Notion IDs

4. **TEXT SCAN (Context-aware):**
   - Client names
   - Company references
   - Email addresses

5. **VALIDATION SCAN (Verify allowed):**
   - Author attribution
   - Example UUIDs
   - Relative paths

## Report Format

```
🔍 SECURITY SCAN: [skill-name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ BLOCKING VIOLATIONS: X found
  [details if any]

⚠️  AUTO-FIX NEEDED: X found
  [list of paths/IDs to fix]

✅ WARNINGS (REVIEW): X found
  [context-dependent items]

✅ ALLOWED ITEMS: X found
  [verified safe patterns]

STATUS: [BLOCKED | NEEDS_SANITIZATION | READY]
```

## Exit Codes

- **0:** Clean, ready for sync
- **1:** Blocking violations found (API keys, credentials)
- **2:** Auto-fix needed (paths, IDs)
- **3:** Manual review required (context-dependent)
