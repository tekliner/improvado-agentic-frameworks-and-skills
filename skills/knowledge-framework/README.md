# Knowledge Framework Skill

Expert documentation framework using MECE, BFO ontology, and fractal structure principles.

## Installation

### Local Installation
```bash
# Copy to your skills directory
cp -r knowledge-framework ~/.claude/skills/

# Or symlink from project
ln -s /path/to/knowledge-framework ~/.claude/skills/knowledge-framework
```

### Via Plugin (when published)
```bash
# In Claude Code
/plugin install your-username/knowledge-framework
```

## Usage

Claude will automatically invoke this skill when:
- You ask to create documentation
- You mention MECE, ontology, or knowledge framework
- You need to structure complex information
- You ask "how should I document this?"

**Example prompts:**
- "Document the ClickHouse architecture using Knowledge Framework"
- "Create MECE documentation for the ETL pipeline"
- "Help me structure this analysis report properly"

## Features

✅ **MECE Organization:** Mutually Exclusive, Collectively Exhaustive sections
✅ **BFO Ontology:** Proper classification of Continuants (what exists) vs Occurrents (what happens)
✅ **Mermaid Diagrams:** Required visual representations with correct orientation (TD vs LR)
✅ **DRY Principle:** Each fact appears exactly once
✅ **Fractal Structure:** Each level is complete and mirrors the whole
✅ **Quality Checklist:** Built-in verification before completion

## Examples

See `examples/` directory:
- `system_architecture_example.md` - Continuant-heavy (TD diagrams)
- `process_guide_example.md` - Occurrent-heavy (LR diagrams)

## Publishing to Marketplace

See [PUBLISHING.md](PUBLISHING.md) for detailed instructions on:
- Creating a Git repository
- Structuring marketplace JSON
- Sharing with team/community

## License

MIT - Feel free to use and modify!
