# Skill Release Log: skill-creator

## [2.2.0] - 2025-11-13
**Session ID:** `e9ce3592-bd66-4a98-b0e7-fcdd8edb5d42` by Daniel Kravtsov
**Type:** Feature - Mermaid Diagram Headers
**Changes:**
- Added descriptive headers for all Mermaid diagrams (2-5 words, specific to skill)
- Updated both diagrams: "Skill Package Anatomy (Continuant - TD)" and "Skill Creation & Evolution Workflow (Occurrent - LR)"
- Added explicit reference to `knowledge-framework` skill in Step 4
- Updated template structure to include diagram header examples
- Added diagram header examples (✅ specific vs ❌ generic)
- Added "Diagram headers" checkbox to Quality Checklist
- Updated `knowledge-framework` skill with mandatory diagram header rules (¶1 in Mermaid Patterns)
**Issue:** Mermaid diagrams need descriptive headers for clarity - generic "Structure" not helpful, need specific "Skill Package Anatomy"

## [2.1.0] - 2025-11-13
**Session ID:** `e9ce3592-bd66-4a98-b0e7-fcdd8edb5d42` by Daniel Kravtsov
**Type:** Feature - Self-Healing Skills
**Changes:**
- Added self-healing capability: skills auto-update on runtime errors
- Added `SKILL_RELEASE_LOG.md` format and tracking
- Updated Mermaid LR diagram to show self-healing flow (Runtime Error → Update → Version → Log)
- Added "Versioning & Evolution" section to Quality Checklist
- Updated Meta Note to mention self-healing skills
- Added preservation rules for Ground Truth attribution during updates
**Issue:** Skills should evolve and stay current, tracking all changes with proper attribution

## [2.0.0] - 2025-11-13
**Session ID:** `e9ce3592-bd66-4a98-b0e7-fcdd8edb5d42` by Daniel Kravtsov
**Type:** Major update - Knowledge Framework Integration
**Changes:**
- Migrated to Knowledge Framework structure
- Added Core Principle statement
- Added 2 Mermaid diagrams (TD: skill structure, LR: creation process)
- Added Ontological Rule statement
- Added Ground Truth attribution (session ID + primary source)
- Restructured with emoji-sections (🎯, 📐, 🔄, 🔗, ✅)
- Added ¶-numbering within all sections
- Reduced from 407 to ~390 lines (-4%)
- Added "Knowledge Framework Integration" section with template structure
- Added anti-patterns specific to KF violations
- Updated Quality Checklist with KF requirements
**Issue:** skill-creator should demonstrate the framework it teaches (recursive self-compliance)

## [1.3.2] - 2025-01-13
**Type:** Enhancement - Portability
**Changes:**
- Added portability & reusability best practices
- Critical rule: Never use absolute paths
- Required: Use relative paths for cross-machine compatibility
- Added examples of correct vs incorrect path references
**Issue:** Skills should work on any machine without modification

## [1.3.1] - 2025-01-13
**Type:** Enhancement - Packaging
**Changes:**
- Added "When to Package" guidelines
- Clarified use of `quick_validate.py` vs `package_skill.py`
- Prevents unnecessary packaging during development
**Issue:** Over-packaging during incremental development

## [1.3.0] - 2025-01-13
**Type:** Enhancement - Metadata
**Changes:**
- Comprehensive update with all documented and community-discovered fields
- Added complete list of optional fields: `model`, `version`, `license`, `disable-model-invocation`, `mode`
- Documented experimental fields with warnings
- Added clear distinction between required, optional, and experimental fields
**Issue:** Incomplete documentation of available YAML frontmatter fields

## [1.2.0] - 2025-01-13
**Type:** Correction - Standards Compliance
**Changes:**
- Corrected to official Claude Code standards
- Removed unofficial `metadata` fields (keywords_en/keywords_ru)
- Added bilingual trigger phrases support in `description` field
- Added validation rule: description cannot contain angle brackets
**Issue:** Using non-standard metadata fields not supported by Claude Code

## [1.1.0] - 2025-01-12
**Type:** Enhancement - Trigger Phrases
**Changes:**
- Added guidance to include trigger phrases in YAML `description` field
- Added section on allowed frontmatter fields
- Added YAML frontmatter examples
- Emphasized triggers should be in YAML, not body
**Issue:** Skills not activating correctly without trigger phrases in description

## [1.0.0] - Original
**Type:** Initial Release
**Source:** Anthropic base skill-creator
**Changes:**
- Six-step skill creation process
- Progressive disclosure design principle
- Bundled resources structure (scripts/references/assets)
- Writing style guidance (imperative/infinitive form)
**Issue:** Base skill-creator from Anthropic
