# Sanitization Patterns

Complete list of automatic replacements for skill sanitization before public distribution.

## Absolute Paths → Relative Paths

### Chrome Extension TCS Project

```
~/project
→ ~/project

~/project/(.+)
→ ~/project/$1
```

### Other Projects

```
~/projects/([^/\s]+)
→ ~/projects/$1

Example:
~/projects/ai-dashboards/src
→ ~/projects/ai-dashboards/src
```

### Home Directory

```
~/\.claude
→ ~/.claude

~
→ ~
```

### Session Directory Patterns

```
-Users-username-projects-project
→ -Users-username-projects-project

-Users-username-projects-([^/]+)
→ -Users-username-projects-$1
```

## Client Database IDs

```
im_\d{4,}_\d+
→ im_XXXX_XXX

Examples:
im_XXXX_XXX → im_XXXX_XXX
im_XXXX_XXXde → im_XXXX_XXX
```

## Workspace & Agency IDs

```
workspace_id:\s*\d{4,}
→ workspace_id: YYYY

agency_id:\s*\d{4,}
→ agency_id: XXXX

Examples:
workspace_id: YYYY → workspace_id: YYYY
agency_id: XXXX → agency_id: XXXX
```

## Client Names in Paths

```
client_cases/Example_Client/
→ client_cases/Example_Client/

client_cases/ClientName/
→ client_cases/ClientName/

client_cases/([^/]+)/
→ client_cases/ClientName/
```

## Client Names in Text

```
Example Client
→ Example Client

HP
→ ClientName (when in client context)

Example Company
→ Example Company
```

## Notion Database IDs (Internal Only)

Only replace if confirmed internal:

```
DATABASE_ID
→ DATABASE_ID

[0-9a-f]{32} (context-dependent)
→ PAGE_ID or DATABASE_ID
```

## Notion User IDs (Internal Only)

```
USER_ID_1
→ USER_ID_1

USER_ID_2
→ USER_ID_2
```

## Email Addresses

**Exception:** Keep in author attribution sections

```
Context: Technical examples, code samples
daniel@improvado.io → user@example.com

Context: Author attribution
daniel@improvado.io → KEEP AS-IS ✅
```

## Session IDs

**Rule:** Keep if clearly example, replace if potentially real

```
Real session (from .claude/sessions):
a1b2c3d4-e5f6-7890-abcd-ef1234567890
→ SESSION_ID

Example session (in documentation):
c080fd31-1fea-44e2-8690-c58ad0f4a829
→ KEEP AS-IS ✅ (documented example)
```

## File Paths in Examples

```
~/project/data_sources/gmail/01_search.py
→ ~/project/data_sources/gmail/01_search.py

~/.claude/skills/knowledge-framework/SKILL.md
→ ~/.claude/skills/knowledge-framework/SKILL.md
```

## Python venv Paths

```
~/project/claude_venv/bin/python
→ ~/project/venv/bin/python

~/project/venv/
→ ~/project/venv/
```

## Conditional Replacements

### Company Name "Improvado"

```
Context: Comparison examples (e.g., "Improvado vs competitors")
→ KEEP AS-IS ✅

Context: Internal operations (e.g., "Improvado's ClickHouse")
→ Replace with "Company" or "Organization"
```

### Discovery API Endpoints

```
Context: Internal API endpoints with auth
https://report.improvado.io/experimental/agent/api/...
→ https://api.example.com/...

Context: Public documentation
→ KEEP AS-IS if it's public API
```

## Replacement Priority

1. **CRITICAL (MUST REPLACE):** API keys, credentials, passwords
2. **HIGH (AUTO-REPLACE):** Absolute paths, client IDs, workspace IDs
3. **MEDIUM (CONTEXT-AWARE):** Client names, company references
4. **LOW (VERIFY FIRST):** Example UUIDs, session IDs

## Context-Aware Rules

### Determine if UUID is Example vs Real

**Example UUID indicators:**
- Appears in "Example" section
- Used in "## Usage" examples
- Appears multiple times (template)
- Pattern: c080fd31... (known example)

**Real UUID indicators:**
- Appears once
- In configuration section
- Matches known internal IDs
- No "Example" context

### Determine if Path is Generic vs Specific

**Generic path (KEEP):**
- algorithms/product_div/
- data_sources/gmail/
- client_cases/ (without client name)

**Specific path (REPLACE):**
- ~/...
- client_cases/Example_Client/
- References to internal project names
