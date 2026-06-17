# Publishing Knowledge Framework Skill to Marketplace

## 📋 Overview

This guide shows how to publish the Knowledge Framework Skill to a Claude Code Plugin Marketplace, enabling easy installation across projects and sharing with team/community.

## 🎯 Publishing Steps

### Step 1: Create Git Repository

```bash
# Initialize Git repo for your Skill
cd ~/.claude/skills/knowledge-framework
git init
git add .
git commit -m "Initial commit: Knowledge Framework Skill"

# Create GitHub repository (example - use any git hosting)
# 1. Go to github.com/new
# 2. Name: "claude-code-knowledge-framework"
# 3. Description: "MECE + BFO ontology documentation framework for Claude Code"
# 4. Public or Private (your choice)

# Push to GitHub
git remote add origin https://github.com/YOUR-USERNAME/claude-code-knowledge-framework.git
git branch -M main
git push -u origin main
```

### Step 2: Create Marketplace Repository

**Option A: Single Skill Marketplace** (simplest)

```bash
# Create new repo for marketplace
mkdir claude-code-marketplace
cd claude-code-marketplace

# Create marketplace.json
cat > marketplace.json << 'EOF'
{
  "name": "Your Skills Marketplace",
  "description": "Custom Claude Code skills and plugins",
  "owner": "YOUR-USERNAME",
  "plugins": [
    {
      "name": "knowledge-framework",
      "description": "MECE + BFO ontology documentation framework",
      "source": "https://github.com/YOUR-USERNAME/claude-code-knowledge-framework.git",
      "type": "skill",
      "version": "1.0.0",
      "author": "YOUR-NAME"
    }
  ]
}
EOF

# Publish marketplace
git init
git add marketplace.json
git commit -m "Add Knowledge Framework skill to marketplace"
git remote add origin https://github.com/YOUR-USERNAME/claude-code-marketplace.git
git push -u origin main
```

**Option B: Multi-Plugin Marketplace** (recommended for teams)

```json
{
  "name": "Improvado Internal Skills",
  "description": "Internal skills and tools for Improvado team",
  "owner": "improvado",
  "plugins": [
    {
      "name": "knowledge-framework",
      "description": "MECE + BFO documentation framework",
      "source": "https://github.com/improvado/claude-code-knowledge-framework.git",
      "type": "skill",
      "version": "1.0.0",
      "author": "Daniel Kravtsov",
      "tags": ["documentation", "mece", "ontology"]
    },
    {
      "name": "clickhouse-helpers",
      "description": "ClickHouse query patterns and utilities",
      "source": "https://github.com/improvado/claude-code-clickhouse.git",
      "type": "skill",
      "version": "1.0.0",
      "author": "Improvado Team"
    }
  ]
}
```

### Step 3: Configure in Project (Team-wide Access)

For your team to access the marketplace automatically in specific projects:

```bash
# In your project (chrome-extension-tcs)
cd ~/project

# Add to .claude/settings.json
cat > .claude/settings.json << 'EOF'
{
  "extraKnownMarketplaces": [
    {
      "owner": "YOUR-USERNAME",
      "repo": "claude-code-marketplace",
      "branch": "main"
    }
  ]
}
EOF

# Commit to repo - now all team members get marketplace access
git add .claude/settings.json
git commit -m "Add internal skills marketplace"
git push
```

### Step 4: Installation (Users)

**For other projects/users:**

```bash
# Add marketplace (one time per user)
/plugin marketplace add YOUR-USERNAME/claude-code-marketplace

# Install skill
/plugin install knowledge-framework

# Enable/disable as needed
/plugin enable knowledge-framework
/plugin disable knowledge-framework
```

## 🔧 Marketplace JSON Schema

```json
{
  "name": "string (marketplace display name)",
  "description": "string (marketplace description)",
  "owner": "string (GitHub username or org)",
  "plugins": [
    {
      "name": "string (unique plugin identifier)",
      "description": "string (what this skill does)",
      "source": "string (git repository URL)",
      "type": "skill | agent | command | mcp",
      "version": "string (semantic version: 1.0.0)",
      "author": "string (creator name)",
      "tags": ["array", "of", "keywords"] // optional
    }
  ]
}
```

## 📦 Directory Structure (Published)

```
YOUR-USERNAME/claude-code-knowledge-framework/
├── SKILL.md                    # Main skill file (REQUIRED)
├── README.md                   # GitHub landing page
├── PUBLISHING.md              # This file
├── examples/                  # Example usage
│   ├── system_architecture_example.md
│   └── process_guide_example.md
└── LICENSE                    # Optional

YOUR-USERNAME/claude-code-marketplace/
└── marketplace.json           # Marketplace manifest
```

## 🌐 Sharing Options

### 1. Public Marketplace (Open Source)
- GitHub public repository
- Anyone can add via `/plugin marketplace add YOUR-USERNAME/marketplace-repo`
- Great for community sharing

### 2. Private Marketplace (Team Only)
- GitHub private repository
- Team members with access can add via same command
- Requires repository access permissions

### 3. Enterprise Marketplace (Organization)
- GitHub organization repository
- Centralized skill management
- Version control and team collaboration

## 🚀 Quick Start Example

**For Improvado Team:**

```bash
# 1. Create marketplace repo
mkdir ~/improvado-claude-marketplace
cd ~/improvado-claude-marketplace

# 2. Create marketplace.json
{
  "name": "Improvado Claude Skills",
  "owner": "improvado",
  "plugins": [
    {
      "name": "knowledge-framework",
      "source": "https://github.com/improvado/knowledge-framework.git",
      "type": "skill",
      "version": "1.0.0"
    }
  ]
}

# 3. Publish to GitHub
git init && git add . && git commit -m "Init marketplace"
git remote add origin git@github.com:improvado/claude-marketplace.git
git push -u origin main

# 4. Team members install
/plugin marketplace add improvado/claude-marketplace
/plugin install knowledge-framework
```

## 🔄 Updating Skills

```bash
# Update skill content
cd ~/.claude/skills/knowledge-framework
# Make changes to SKILL.md
git add .
git commit -m "Update documentation patterns"
git push

# Update version in marketplace.json
{
  "version": "1.1.0"  # Increment version
}

# Users update
/plugin update knowledge-framework
```

## ✅ Pre-Publishing Checklist

- [ ] SKILL.md follows proper structure (Description, When to Use, Instructions)
- [ ] Examples directory includes real usage examples
- [ ] README.md explains what the skill does
- [ ] Git repository is public (or team has access if private)
- [ ] marketplace.json has correct repository URL
- [ ] Version follows semantic versioning (1.0.0)
- [ ] Tested locally before publishing

## 🎯 Next Steps

1. **Test locally first:**
   ```bash
   # Skill already installed at ~/.claude/skills/knowledge-framework
   # Start Claude Code and ask: "Help me document this using Knowledge Framework"
   ```

2. **Create GitHub repo** for the skill

3. **Create marketplace repo** with marketplace.json

4. **Share with team** via settings.json or manual add

5. **Iterate based on usage** - update version numbers when improving

---

**Pro Tip:** You can have multiple marketplaces! Official Anthropic marketplace + your team's private marketplace + personal experimental marketplace.

**Example:**
```bash
/plugin marketplace add anthropics/skills          # Official
/plugin marketplace add improvado/claude-skills    # Team
/plugin marketplace add your-name/experiments      # Personal
```
