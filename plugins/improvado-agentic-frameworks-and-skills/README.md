# Agentic Frameworks and Skills

Production-ready Claude Code and Codex skills and frameworks for building, evaluating, and scaling agentic AI systems.

## Codex Plugin Packaging

This repository is prepared as a Codex plugin:

- Plugin manifest: `.codex-plugin/plugin.json`
- Skills bundle: `./skills/`
- MCP bundle: `./.mcp.json`
- MCP endpoint: `https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke`

The Improvado customer MCP config contains no checked-in secrets. Authentication and workspace context are expected to be supplied by the runtime/client connection flow.

## Codex Marketplace Distribution

This repository also includes a Codex marketplace catalog for distributing the plugin from GitHub:

- Marketplace manifest: `.agents/plugins/marketplace.json`
- Marketplace name: `improvado`
- Marketplace plugin package: `plugins/improvado-agentic-frameworks-and-skills/`

Install the marketplace and plugin with:

```bash
codex plugin marketplace add tekliner/improvado-agentic-frameworks-and-skills --ref master
codex plugin add improvado-agentic-frameworks-and-skills@improvado
```

To pick up future marketplace changes:

```bash
codex plugin marketplace upgrade improvado
codex plugin add improvado-agentic-frameworks-and-skills@improvado
```

## 📋 Skills Registry

Current plugin skill inventory:

| # | Skill | Description | When to Use |
|---|-------|-------------|-------------|
| 1 | **[Knowledge Framework](skills/knowledge-framework/)** | Documentation framework using MECE/BFO principles, Mermaid diagrams, and Ground Truth attribution. | Creating `.md` files, documenting systems, building knowledge bases |
| 2 | **[Multi-Agent Orchestrator](skills/multi-agent-orchestrator/)** | Parallel CLI agent orchestration for competitive evaluation across Claude Code, Codex, and Gemini. | Complex tasks with multiple valid approaches |
| 3 | **[Skill Creator](skills/skill-creator/)** | Guide for creating and improving agent skills with frontmatter, workflows, and release logs. | Building or updating skills |
| 4 | **[Claude Code Sessions](skills/claude-code-sessions/)** | Session discovery, search, resume, and analysis across projects. | Finding or resuming prior Claude Code work |
| 5 | **[YouTube to Knowledge Doc](skills/youtube-to-knowledge-doc/)** | Converts YouTube transcripts into structured knowledge docs with timestamp citations. | Documenting videos or preserving learning materials |
| 6 | **[Campaign Launcher OSS](skills/campaign-launcher-oss/)** | Open-source multi-channel campaign planning and launch workflow. | Launching marketing experiments |
| 7 | **[Secure Agents](skills/secure-agents/)** | Plain-English checks for credential leaks, prompt-injection sinks, and missing audit trails. | Quick security checks for AI agents |
| 8 | **[Google Meet Manager](skills/google-meet-manager/)** | Manage Google Meet recordings, transcripts, and Gemini Notes through Drive and Docs. | Searching recordings or meeting transcripts |
| 9 | **[CMO Cross-Channel Dashboard](skills/cmo-cross-channel-dashboard/)** | Executive cross-channel marketing dashboard across spend, funnel, and attribution views. | CMO or VP-level performance dashboards |
| 10 | **[Daily Performance Report](skills/daily-performance-report/)** | Operational daily performance console for multi-channel paid media. | Performance marketer daily monitoring |
| 11 | **[Discovery API](skills/discovery-api/)** | Mandatory protocol for live platform data access through Improvado Discovery API tools. | Fetching current data from ad and analytics platforms |
| 12 | **[Field Mapping](skills/field-mapping/)** | Field mapping and extract setup validation with coverage options. | Finding report types and validating fields |
| 13 | **[Flat Data File Import](skills/flat-data-file-import/)** | File, email, SFTP, and S3 import workflows for flat data. | Importing CSV, Excel, TSV, email, SFTP, or S3 files |
| 14 | **[Full Marketing Audit](skills/full-marketing-audit/)** | Read-only paid-media audit with connection checks, per-channel audits, and dashboard synthesis. | Account, agency, or platform spend audits |
| 15 | **[MDG Create and Edit](skills/mdg-create-and-edit/)** | Marketing Data Governance rule creation, editing, testing, and alerts. | Creating MDG rules or monitoring metrics |
| 16 | **[Notebook Editor](skills/notebook-editor/)** | Edit and run recipe/notebook cells with SQL, union, join, group, and filter operations. | Managing Improvado recipes and notebooks |
| 17 | **[Recipe QA Rules](skills/recipe-qa-rules/)** | Recipe QA flow with topology discovery, QRDs, duplicate checks, and discrepancy checks. | Checking or creating QA for recipe views |
| 18 | **[SQL Import](skills/sql-import/)** | SQL source import workflow for MySQL, Postgres, and MSSQL. | Connecting SQL databases and scheduling extracts |
| 19 | **[Temporal Pipelines](skills/temporal-pipelines/)** | Create, edit, run, and debug Python Temporal workflow pipelines. | Working with Improvado Temporal pipeline workflows |
| 20 | **[Weekly Creative Performance](skills/weekly-creative-performance/)** | Creative performance dashboard with thumbnails, fatigue segments, and Discovery API data. | Weekly creative analysis across paid platforms |

## 🎯 Quick Selection Guide

**Choose your skill based on task type:**

- 📝 **Writing documentation?** → Knowledge Framework
- 🤖 **Complex task needing best solution?** → Multi-Agent Orchestrator
- 🛠️ **Building new skills?** → Skill Creator
- 🔄 **Finding previous work?** → Claude Code Sessions
- 🎥 **Learning from YouTube?** → YouTube to Knowledge Doc
- 📣 **Launching marketing campaigns?** → Campaign Launcher OSS
- 🛡️ **Auditing your AI agent for the basics?** → Secure Agents

## 📖 Core Documentation

**[How to organize documents - Knowledge Framework Guide](How%20to%20organize%20documents_knowladge_framework.md)**

Complete guide to MECE/BFO documentation principles - the foundation for all skills in this repository.

## 🚀 Quick Start

### Installing Skills

**Global installation (recommended):**
```bash
# Clone repository
git clone https://github.com/tekliner/improvado-agentic-frameworks-and-skills.git
cd improvado-agentic-frameworks-and-skills

# Install all skills globally
cp -r skills/* ~/.claude/skills/
```

**Project-level installation:**
```bash
# Copy to specific project
cp -r skills/* /path/to/your-project/.claude/skills/
```

### Installing Dependencies

Some skills require utility scripts and frameworks. Install them to your project:

```bash
# Navigate to your project directory
cd /path/to/your-project

# Copy session management utilities (required for claude-code-sessions, knowledge-framework)
mkdir -p data_sources/claude_code
cp -r data_sources/claude_code/* /path/to/your-project/data_sources/claude_code/

# Copy multi-agent framework (required for multi-agent-orchestrator)
mkdir -p algorithms/product_div/Multi_agent_framework
cp -r algorithms/product_div/Multi_agent_framework/* /path/to/your-project/algorithms/product_div/Multi_agent_framework/

# Make scripts executable
chmod +x /path/to/your-project/algorithms/product_div/Multi_agent_framework/*.sh
chmod +x /path/to/your-project/data_sources/claude_code/get_session_id.py
```

**Dependency matrix:**

| Skill | Dependencies |
|-------|--------------|
| Knowledge Framework | `data_sources/claude_code/get_session_id.py` (optional) |
| Claude Code Sessions | `data_sources/claude_code/{get_session_id.py, 21_universal_session_resume.py, 22_list_all_sessions.py}` (required) |
| Multi-Agent Orchestrator | `algorithms/product_div/Multi_agent_framework/{run_parallel_agents.sh, run_claude_agent.sh, run_codex_agent.sh, run_gemini_agent.sh}` (required) |
| YouTube to Knowledge Doc | None |
| Skill Creator | None |

### Using Skills

**Automatic activation** - Skills trigger when Claude Code detects relevant context:
- Creating .md files → `knowledge-framework`
- "Run multi-agent framework" → `multi-agent-orchestrator`
- "Create new skill" → `skill-creator`
- "Resume session abc123" → `claude-code-sessions`
- "Document this YouTube video" → `youtube-to-knowledge-doc`

**Manual invocation:**
```
/skill knowledge-framework
/skill multi-agent-orchestrator
/skill skill-creator
/skill claude-code-sessions
/skill youtube-to-knowledge-doc
```

## 🔧 Detailed Skill Information

### 1️⃣ Knowledge Framework

**Purpose:** Create structured, maintainable documentation automatically

**Key features:**
- MECE section organization (Mutually Exclusive, Collectively Exhaustive)
- Continuant (TD) and Occurrent (LR) Mermaid diagrams
- Numbered sections (§1.0, §2.0) and paragraphs (¶1, ¶2)
- Ground Truth attribution with sources and dates
- Quick Start checklist for rapid application
- Author checklist for quality validation

**Dependencies:** None

**Example output:**
```markdown
## 📋 [Title]
**Thesis:** One sentence previewing all MECE sections...

**Overview:** Paragraph introducing each section...

[Mermaid diagrams - structure + process]

## 1.0 First Section
¶1 Ordering principle: [why this order]...
```

### 2️⃣ Multi-Agent Orchestrator

**Purpose:** Competitive evaluation of complex tasks using multiple AI agents

**Key features:**
- Parallel CLI agent execution (Claude Code, Codex, Gemini)
- Self-evaluation with measurable success criteria (✅/❌/⚠️)
- Automated winner selection based on objective metrics
- Progressive disclosure workflow (location → task file → user edits → launch)
- Artifact placement enforcement (workspace isolation)
- Ready-to-use execution scripts with background monitoring

**Dependencies:**
- Bash, Python 3.8+
- Multiple CLI agents (Claude Code CLI, Codex CLI, Gemini CLI)
- Scripts: `algorithms/product_div/Multi_agent_framework/*.sh` (see Installation section)

**Workflow:**
```
1. User describes complex task
2. Agree on folder location
3. Create task file with success criteria
4. User edits and confirms "Ready"
5. Launch ./run_parallel_agents.sh
6. Compare self-evaluations
7. Declare winner based on criteria met
```

**Success criteria example:**
```markdown
- [✅] Process 1M rows in <5 seconds
- [✅] Handle edge cases (nulls, duplicates)
- [❌] Memory usage <500MB
```

### 3️⃣ Claude Code Sessions

**Purpose:** Universal session management and conversation history

**Key features:**
- Resume by session ID or text search
- Universal session discovery across all projects
- Automatic path resolution and project switching
- Shell integration (`rc` command for quick access)
- Session statistics and metadata
- Search by content, date, or participant

**Dependencies:**
- Python 3.8+
- Scripts: `data_sources/claude_code/{get_session_id.py, 21_universal_session_resume.py, 22_list_all_sessions.py}` (see Installation section)

**Common commands:**
```bash
# Resume by ID
rc c080fd31-1fea-44e2

# Search by text
rc --text "dashboard implementation"

# Resume latest
rc --last

# List all sessions
rc-list --days 7
```

### 4️⃣ YouTube to Knowledge Doc

**Purpose:** Preserve external learning as structured documentation

**Key features:**
- Automatic transcript extraction with yt-dlp
- Intelligent folder placement recommendation
- Clickable YouTube timestamp links (MM:SS → ?t=SECONDS)
- Knowledge Framework compliance (MECE structure, diagrams)
- Ground Truth attribution with video source
- Session ID tracking for provenance

**Dependencies:** yt-dlp, Python 3.8+

**Workflow:**
```
1. User provides YouTube URL
2. Extract transcript and metadata
3. Recommend folder location
4. Generate Knowledge Framework doc
5. Add clickable timestamp citations
```

**Timestamp format:**
```markdown
**Quote:** "Direct quote" ([timestamp 23:11](https://youtu.be/VIDEO_ID?t=1391))
```

### 3️⃣ Skill Creator

**Purpose:** Guide for creating effective Claude Code skills with best practices

**Key features:**
- YAML frontmatter structure and patterns
- Quick Start Checklist creation (5-10 actionable steps)
- 5-Second Decision Tree design
- Practical Workflow examples
- Progressive disclosure architecture
- Reusable resource identification (scripts, references, assets)

**Dependencies:** None

**Workflow:**
```
1. Define concrete usage examples
2. Identify reusable resources
3. Initialize skill structure (SKILL.md, README.md, references/, scripts/)
4. Write YAML frontmatter with triggers
5. Add Quick Start Checklist
6. Create 5-Second Decision Tree
7. Validate against quality checklist
```

**Quality standards:**
- Clear "When to Use" section with automatic triggers
- Actionable Quick Start (not documentation, but steps)
- Decision Tree for rapid skill selection
- Real workflow examples (not abstract descriptions)

## 🎯 Skill Structure

All skills follow consistent architecture:

```
skill-name/
├── SKILL.md                 # Main documentation
│   ├── YAML frontmatter (name, description, triggers)
│   ├── When to Use (automatic + manual triggers)
│   ├── Quick Start Checklist (5-10 steps)
│   ├── 5-Second Decision Tree
│   ├── Practical Workflow examples
│   └── Detailed documentation
├── README.md                # Technical implementation
├── references/              # Additional documentation (loaded as needed)
│   ├── script_usage.md
│   └── task_templates.md
└── scripts/                 # Executable helpers
    └── create_task_file.sh
```

## 📊 Skills Compatibility

**Tested with:**
- Claude Code Desktop v1.0+
- Claude Sonnet 4.5 model
- macOS (primary), Linux (compatible)

**All skills include:**
- ✅ YAML frontmatter with explicit triggers
- ✅ Quick Start Checklist (5-10 steps)
- ✅ 5-Second Decision Tree
- ✅ Practical Workflow examples
- ✅ Clear "When to Use" section
- ✅ Automatic trigger descriptions

## 🛠️ Development

### Skill Creation Guidelines

Follow the skill-creator framework:
1. Define concrete usage examples
2. Identify reusable resources (scripts, references, assets)
3. Initialize skill structure
4. Write SKILL.md with YAML frontmatter
5. Add Quick Start and Decision Tree sections
6. Validate against quality checklist

### Quality Standards

**MANDATORY for all skills:**
- ✅ YAML frontmatter with explicit trigger phrases
- ✅ Quick Start Checklist (actionable steps)
- ✅ 5-Second Decision Tree (rapid selection)
- ✅ Practical Workflow (real examples)
- ✅ Clear "When to Use" section
- ✅ No hardcoded paths or credentials
- ✅ Generic examples (no client-specific data)

## 🤝 Contributing

Skills in this repository are production-tested and follow strict quality standards.

**For improvements:**
1. Test changes thoroughly in real projects
2. Update Quick Start/Decision Tree if workflow changes
3. Maintain YAML frontmatter accuracy
4. Add examples for new features
5. Ensure no sensitive data (API keys, paths, client names)

## 📝 License

Internal use. Not for public distribution without authorization.

## 🔗 Related Resources

- **Knowledge Framework Full Guide:** [How to organize documents](How%20to%20organize%20documents_knowladge_framework.md)
- **Multi-Agent Framework:** `skills/multi-agent-orchestrator/references/`
- **Task Templates:** Available in respective skill `references/` folders

---

**Repository:** https://github.com/tekliner/improvado-agentic-frameworks-and-skills
**Last updated:** 2025-11-13
**Skills count:** 5 production-ready skills
