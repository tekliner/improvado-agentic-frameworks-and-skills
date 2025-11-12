# Claude Code Sessions Skill

Search, resume, and analyze Claude Code conversation history from any directory.

## Quick Start

Ask Claude:
```
Resume my last session about dashboard implementation
```

```
Show me all sessions from this week
```

```
Find conversations about Notion integration
```

```
Resume session c080fd31-1fea-44e2-8690
```

## What This Skill Does

- 🔍 **Find sessions** by content, keyword, or session ID
- 📂 **List all sessions** across all projects with statistics
- 🚀 **Resume from anywhere** - automatically handles directory switching
- 📊 **Analyze history** - see what you worked on recently
- ⚡ **Fast search** - grep-based content search across all conversations

## Example Output

```
🔍 Searching across all Claude Code projects...
────────────────────────────────────────────────────────────────

✅ Found session!
  Session ID: c080fd31-1fea-44e2-8690-c58ad0f4a829
  Created in: /Users/Kravtsovd/projects/chrome-extension-tcs
  Modified: 2025-01-15 10:30:00
  Size: 2.45 MB
  Content: implement dashboard with DataTables and real-time...

🚀 Resuming session...
  📁 Directory: /Users/Kravtsovd/projects/chrome-extension-tcs
  🔄 Launching Claude Code...
```

## Core Commands

### Resume Session by ID
```bash
python data_sources/claude_code/21_universal_session_resume.py c080fd31
```

### Search by Text
```bash
python data_sources/claude_code/21_universal_session_resume.py --text "dashboard"
```

### Resume Latest
```bash
python data_sources/claude_code/21_universal_session_resume.py --last
```

### List All Sessions
```bash
python data_sources/claude_code/22_list_all_sessions.py
python data_sources/claude_code/22_list_all_sessions.py --detailed
python data_sources/claude_code/22_list_all_sessions.py --days 7
```

### Fast Grep Search
```bash
# Find sessions containing keyword
grep -l "dashboard" ~/.claude/projects/-Users-*/*.jsonl

# Search with context
grep -C 2 "error" ~/.claude/projects/-Users-*/*.jsonl
```

## Shell Aliases (Optional)

Add to `~/.zshrc`:
```bash
rc() {
    python /path/to/21_universal_session_resume.py "$@"
}
rc-list() {
    python /path/to/22_list_all_sessions.py "$@"
}
rc-last() { rc --last; }
rc-find() { rc --text "$1" --all; }
```

Usage:
```bash
rc c080fd31              # Resume by ID
rc --text "notion"       # Search by text
rc-list --days 7        # Recent sessions
rc-last                 # Latest session
```

## How It Works

1. **Sessions stored in** `~/.claude/projects/` as JSONL files
2. **Each project directory** maps to working directory path
3. **Search scans all projects** - finds session regardless of where created
4. **Auto directory switching** - changes to correct folder before resume
5. **No manual path management** - script handles everything automatically

## Session Storage

```
~/.claude/projects/
├── -Users-Kravtsovd-projects/
│   └── b2435f08-65e2-4b88-91c6.jsonl
├── -Users-Kravtsovd-projects-chrome-extension-tcs/
│   └── c080fd31-1fea-44e2-8690.jsonl
└── -Users-Kravtsovd-projects-ai-dashboards/
    └── a7f3e290-4b3c-11ef-8901.jsonl
```

## Use Cases

### Daily Work Continuation
```
"Resume my last session"
→ Launches most recent conversation
```

### Find Specific Topic
```
"Find all sessions about database optimization"
→ Lists all matching conversations with previews
```

### Project History
```
"What did I work on in chrome-extension-tcs this week?"
→ Shows all sessions from last 7 days with details
```

### Cross-Directory Resume
```
"Resume session c080fd31 (I'm in different folder)"
→ Automatically switches to correct directory and resumes
```

## Troubleshooting

**Session not found?**
- Use `rc-list` to see all available sessions
- Try partial ID: `rc c080fd31` (first 8 chars)
- Use text search: `rc --text "keyword"`

**Multiple matches?**
- Add `--all` flag to see all: `rc --text "dashboard" --all`
- Use more specific search terms
- Check session dates: `rc-list --detailed`

**Wrong directory?**
- Script handles automatically - no action needed
- Finds correct path from session metadata

## Files

- **SKILL.md** - Complete documentation with all features
- **Scripts:**
  - `data_sources/claude_code/21_universal_session_resume.py` - Resume tool
  - `data_sources/claude_code/22_list_all_sessions.py` - Listing tool
  - `data_sources/claude_code/20_find_current_session.py` - Search tool
- **Docs:**
  - `data_sources/claude_code/16_CLAUDE_SESSION_MANAGEMENT.md` - Full guide
  - `data_sources/claude_code/CLAUDE.md` - Progress summary

## Version

v1.0 (2025-01-15)
