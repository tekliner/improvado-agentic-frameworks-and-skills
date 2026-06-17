# secure-agents

**30-second security check for any AI agent — Claude Code, Cursor, custom Python/TS.**

Three plain-English questions. HIGH-confidence findings only. No false positives, no jargon, no signups, no binary installs.

**Runs 100% locally · No telemetry · MIT license**

> Built by the Improvado AI team. We hit these three gaps on our own AI agents and built this so anyone else can catch them in 30 seconds. Nothing in this skill leaves your machine.

**vs Claude Code's built-in `/security-review`?** Different scope. `/security-review` reads your *code* for code-quality bugs. This skill scans your project's *surroundings* — your `.env`, git history, audit-trail. Use both.

```
🛡️ Secure Agents Audit
Score: 2 of 3 passed

✅ Credentials       — clean
❌ Prompt injection  — 1 sink in agent.py:42
✅ Audit trail       — logging is wired

Open ./agent-security-report-{YYYY-MM-DD}.md for the fix prompt.
```

## What it checks

1. **Credentials** — Are API keys leaked in your `.env`, your git history, or your code?
2. **Prompt injection** — Does your agent feed customer briefs, emails, or CRM notes directly into a SQL or shell call?
3. **Audit trail** — If something breaks tomorrow, can you replay exactly what the agent did?

That's it. Nothing else. The point is to catch the three things every team forgets — not to write a 50-page security report.

## Install

The skill ships from a multi-skill public repo. Clone it once, copy `secure-agents/` into your skills directory.

### macOS / Linux

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/tekliner/improvado-agentic-frameworks-and-skills /tmp/iafs
cp -R /tmp/iafs/skills/secure-agents ~/.claude/skills/secure-agents
```

### Windows (PowerShell)

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null
git clone https://github.com/tekliner/improvado-agentic-frameworks-and-skills $env:TEMP\iafs
Copy-Item "$env:TEMP\iafs\skills\secure-agents" "$HOME\.claude\skills\secure-agents" -Recurse -Force
```

### Cursor / Windsurf / Codex

Same — copy `secure-agents/` from the cloned repo into the equivalent skills directory of your tool:
- Cursor: `~/.cursor/skills/secure-agents/`
- Windsurf: `~/.windsurf/skills/secure-agents/`
- Codex CLI: `~/.codex/skills/secure-agents/`

## Run

In Claude Code, open any project directory and say:

```
/secure-agents
```

or just

```
audit my agent for the basics
```

You get a report file (`agent-security-report-{date}.md`) and ready-to-paste fix prompts for whatever's broken.

## Optional: extra-safe mode (run on a clone)

Safe to run on any project — the skill is read-only and never sends anything anywhere. For extra peace of mind, run on a fresh clone first:

```bash
git clone <your-repo> /tmp/secure-agents-test
cd /tmp/secure-agents-test
# now run /secure-agents here, not in your prod checkout
```

This skill *reads* `.env` and config files looking for secret patterns and redacts whatever it finds before producing the report — but rotated/dummy keys add an extra layer of "no way this leaks" peace of mind.

## Score tiers

| Score | Meaning |
|---|---|
| **3 of 3** | Clean on the basics. You're not bulletproof, but you're not on fire. |
| **2 of 3** | One thing to fix. Paste the report's fix prompt into Claude. ~10 minutes. |
| **1 of 3** | Two things broken. Stop adding features and fix these first. |
| **0 of 3** | If your agent touches customer data today, take it offline until you fix all three. |

## What this is NOT

- **Not** a replacement for Claude Code's built-in `/security-review`. That command scans your *code* for code-quality bugs. This skill scans your project's *surroundings* — files, .env, audit-trail. Use both.
- **Not** a pentesting tool.
- **Not** a SOC 2 / GDPR / HIPAA audit.
- **Not** a 30-point checklist that takes 20 minutes — that's deliberate. Three things, 30 seconds.

## Why we built this

> If you don't give your team safe agents, they'll build unsafe ones.

Every marketing and ops team is now running AI agents — Claude Code, Cursor, custom flows that send emails or write briefs. Most of those teams have never had a security review of those agents. We hit the same three gaps ourselves and built this so anyone can catch them in 30 seconds:

- **Credentials.** Shared API keys in someone's `.env`. Bot scanners hit GitHub every minute.
- **Prompt injection.** A campaign brief used as a prompt with no input check — and the agent leaks customer data.
- **Audit trail.** Something breaks, and there's no way to reproduce or debug it.

## Limitations

- **Static analysis only.** This skill doesn't run your code. Many security properties are runtime — pen-test for those.
- **False negatives are possible.** A clean report means no obvious failures in the three checks; it does not mean no failures. Real security needs human review and runtime testing.
- **Read-only.** This skill won't edit your code. It generates fix prompts you paste into Claude/Cursor for the actual changes.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Open an issue or PR at [github.com/tekliner/improvado-agentic-frameworks-and-skills](https://github.com/tekliner/improvado-agentic-frameworks-and-skills). Found a false positive? File the smallest reproducer you can, and we'll fix the regex.

## Acknowledgments

Built by the Improvado AI team in 2026. Methodology inspired by [Sentry's security-review skill](https://github.com/getsentry/skills) (HIGH-confidence-only finding gating) and the broader Claude Code skill community.
