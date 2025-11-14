# Agentic Frameworks and Skills

Production-ready Claude Code skills and frameworks for building, evaluating, and scaling agentic AI systems.

## 📋 Skills Registry

Complete collection of production-ready skills ordered by importance and usage frequency:

| # | Skill | Description | When to Use |
|---|-------|-------------|-------------|
| 1️⃣ | **[Knowledge Framework](skills/knowledge-framework/)** | Automatic documentation framework using MECE/BFO ontology principles with Mermaid diagrams and Ground Truth attribution | Creating any .md file, documenting systems, building knowledge base |
| 2️⃣ | **[Multi-Agent Orchestrator](skills/multi-agent-orchestrator/)** | Orchestrate parallel execution of multiple CLI agents (Claude Code, Codex, Gemini) for competitive evaluation with objective winner selection | Complex tasks (>7/10), multiple valid approaches, high-stakes solutions |
| 3️⃣ | **[Skill Creator](skills/skill-creator/)** | Guide for creating effective Claude Code skills with YAML frontmatter, Quick Start checklists, and Decision Trees | Building new skills, improving existing skills, skill architecture |
| 4️⃣ | **[Claude Code Sessions](skills/claude-code-sessions/)** | Universal session management - search, resume, and analyze conversations from any directory | Resuming sessions, searching conversation history, tracking work |
| 5️⃣ | **[YouTube to Knowledge Doc](skills/youtube-to-knowledge-doc/)** | Extract YouTube transcripts and convert to Knowledge Framework documentation with clickable timestamps | Documenting videos, preserving external learning, research archival |

## 🎯 Quick Selection Guide

**Choose your skill based on task type:**

- 📝 **Writing documentation?** → Knowledge Framework
- 🤖 **Complex task needing best solution?** → Multi-Agent Orchestrator
- 🛠️ **Building new skills?** → Skill Creator
- 🔄 **Finding previous work?** → Claude Code Sessions
- 🎥 **Learning from YouTube?** → YouTube to Knowledge Doc

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

**Dependencies:** Bash, Python 3.8+, Multiple CLI agents (Claude Code CLI, Codex CLI, Gemini CLI)

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

**Dependencies:** Python 3.8+

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
