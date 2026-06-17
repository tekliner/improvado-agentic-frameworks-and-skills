---
name: secure-agents
description: 30-second basic security check for AI agents. Three plain checks any non-engineer can run — leaked credentials, prompt injection sinks, missing audit trail. Marketing-friendly report, no jargon, no false-positive noise. Works on Claude Code, Cursor, Cline, Codex, custom Python/TS agents. Triggers on "secure agents", "agent audit", "check my agent", "AI security check", or "АУДИТ", or after seeing the "If you don't give your team safe agents, they'll build unsafe ones" LinkedIn post.
---

# secure-agents — 3-Check Audit for AI Agents

> **🛡️ This is a quick check, not a full security audit.** It catches the three things every team forgets: leaked credentials, agent inputs from untrusted sources, and missing trail for when something breaks. Run it before you wish you had.

## Who this is for

You hired an AI agent (Claude, Cursor, ChatGPT, a custom flow) to do real work — write campaign briefs, query data, send emails, build small tools. You're not a security engineer. This skill takes 30 seconds and tells you, in plain English, whether you're one bad day away from a credential leak, a prompt-injection incident, or a "we can't reproduce what the agent did yesterday" disaster.

## When to invoke

- User says: `/secure-agents`
- User says: "audit my agent" / "check my agent for security" / "АУДИТ"
- User installed the skill after a "safe agents" LinkedIn post

## How to run

### Step 0 — Banner (print verbatim)

If the trigger word was `АУДИТ` (Cyrillic) or the user wrote in Russian, print this two-line preface FIRST, then the English banner:

```
🛡️ Secure Agents · аудит за 30 секунд
Запускаю 3 проверки: креды / prompt injection / audit trail. Отчёт будет на английском — техническая часть стандартная.
```

Then always print the English banner:

```
🛡️ Secure Agents · 3-Check Audit

Safe to run on any project — read-only, no telemetry, nothing leaves your machine.
For extra peace of mind, run on a fresh clone with rotated/dummy keys first.

This skill reads files in your project to find secret patterns. It redacts
anything it finds before writing the report.

You will only see HIGH-confidence findings. No noise.
```

### Step 0.1 — Auto-detect

Probe the working dir for: `.env*`, `.git/`, `package.json`, `requirements.txt`, `*.py`, `*.ts`, `*.js`. Tell user one line: "Detected: `.env` file, git repo, Python project." Don't ask the user what stack — figure it out.

### Step 0.2 — Confirm path

> Run on the current directory? (default Y — say "n" to point at a different one)

The skill is always read-only — it never edits files, only writes the report. No need to ask the user about that.

---

## Step 1 — Check 1: Credentials in the wrong places

**Plain question:** Are API keys, OAuth tokens, or database passwords sitting in files that anyone with repo access can see?

**Scope:**
- All tracked files in the repo
- `.env`, `.env.*`, `*.env`
- `*.pem`, `*.key`, `credentials*.json`, `secrets.{yaml,yml,json}`
- Last 50 commits in git history (light scan)

**HIGH-confidence detectors (only these get reported as ❌):**

**Detection algorithm — apply in this order, FIRST MATCH WINS per line:**
Implementation: read the file, split by `\n`, then for each line try the patterns top-to-bottom and break on the first hit. Record at most ONE finding per line — the most specific one. If a more specific pattern matches (e.g. `sk-ant-`), DO NOT also fire the generic `sk-` pattern on the same line.

- Provider key prefixes (try in this order; the first to match wins for the line):
  - `sk-ant-[A-Za-z0-9_-]{20,}` (Anthropic — try FIRST, before generic `sk-`)
  - `sk-(?!ant-|test_|live_placeholder|XXXX|REPLACE|REDACTED|YOUR_)[A-Za-z0-9_-]{20,}` (OpenAI / generic — `ant-` in lookahead so the Anthropic pattern owns its own keys)
  - `sk-or-v1-[A-Za-z0-9]{64}` (OpenRouter)
  - `(AKIA|ASIA)[A-Z0-9]{16}` (AWS Access Key ID — `ASIA*` covers temporary STS creds)
  - `gh[posur]_[A-Za-z0-9]{36}` (GitHub tokens — `ghp_` PAT, `gho_` OAuth, `ghu_` user-to-server, `ghs_` server-to-server, `ghr_` refresh)
  - `glpat-[A-Za-z0-9_-]{20}` (GitLab personal access token)
  - `AIza[A-Za-z0-9_-]{35}` (Google API key)
  - `GOCSPX-[A-Za-z0-9_-]{28}` (Google OAuth client_secret — fires on tracked `credentials.json`)
  - `xox[baprs]-[A-Za-z0-9-]{10,}` (Slack)
  - `(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9]{24,}` (Stripe)
  - `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` (SendGrid)
  - `SK[a-f0-9]{32}` (Twilio API key SID)
  - `npm_[A-Za-z0-9]{36}` (npm publish token)
  - `hf_[A-Za-z0-9]{34}` (HuggingFace)
  - `dckr_pat_[A-Za-z0-9_-]{27}` (Docker Hub)
  - `-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |)PRIVATE KEY-----` (any PEM private key — covers GCP service-account JSON `private_key` field, SSH keys, etc.)
  - `Bearer\s+[A-Za-z0-9._-]{20,}`
- DB connection string with embedded password (capture the password):
  - `(?i)(postgres(?:ql)?|mysql|mongodb|redis)://[^:\s]+:(?<pw>[^@\s]+)@` — apply suppression to the captured `pw` group ONLY, not the whole line. So `postgres://admin:supersecret@db.example.com/prod` correctly fires (suppression check runs on `supersecret`, not on `db.example.com`). **Engine note:** named-group syntax is `(?<pw>...)` (RE2 / JS / modern PCRE). If your scanner uses the older Python-style `(?P<pw>...)`, both forms work in Python — use whichever your engine supports; the spec is `(?<pw>...)` for portability.
- `.env` file git-status check (separate finding, no regex — ASK GIT, don't grep `.gitignore`):
  - For each `.env` / `.env.*` / `*.env` / `*.pem` / `*.key` / `credentials*.json` / `secrets.{yaml,yml,json}` that exists in the working dir:
    1. **Already tracked?** Run `git ls-files --error-unmatch <file>` (exit 0 = tracked). If tracked → ❌ **already leaked** — `.gitignore` won't help, the file is in git history. Recommend `git rm --cached` + history scrub.
    2. **About to be tracked?** Run `git check-ignore -q <file>` (exit 0 = ignored). If NOT tracked AND NOT ignored → ❌ **next `git add` will commit it** — recommend adding pattern to `.gitignore`.
    3. **Properly ignored?** Tracked=no, ignored=yes → ✅ skip, no finding.
  - **Why ask git, not grep `.gitignore`:** the working dir may be a nested repo (its own `.git/` overrides parent rules), `.gitignore` may live higher up the tree, ignore rules may come from `.git/info/exclude` or `core.excludesfile`, AND a file already committed before `.gitignore` was added is still tracked despite matching the pattern. `git check-ignore` + `git ls-files --error-unmatch` are the only correct sources of truth.
  - **If not in a git repo at all** (`git rev-parse --git-dir` fails): fall back to checking whether `.env` / `*.pem` / etc. exist at all → ❌ "secrets in plain files, no version-control discipline yet — add `.gitignore` before `git init`".
- SDK constructor literal:
  - `OpenAI\s*\(\s*api_key\s*=\s*["'][\w-]{20,}`
  - `Anthropic\s*\(\s*api_key\s*=\s*["'][\w-]{20,}`
  - `apiKey\s*:\s*["'][\w-]{20,}`
- Any of the above patterns in last 50 commits

**MEDIUM (reported under "review", not ❌):**
- High-entropy 30+ char alphanumeric string in `.env` files (might be a key, might not)
- `.env.example` or `.env.sample` containing values that don't look like placeholders

**LOW (suppressed unless user asks `--verbose`):**
- Generic 20-char alphanumerics in source code

**Placeholder suppression (CRITICAL — scope to matched group, NOT whole line):**
After a regex matches, take the **matched group** (the actual key/secret string the regex captured — NOT the surrounding line) and lower-case it. Drop the finding only if the matched group itself contains one of these substrings:
- High-confidence placeholder words: `your-api-key-here`, `changeme`, `<paste-key>`, `insert_key_here`, `redacted`, `<your-key>`, `***`, `dummy`, `placeholder`, `replace-with-yours`, `your_token_here`, `fake`, `sk-xxxx`, `sk-test_`
- Repeating-character noise: `xxx`, `aaa` (3+ consecutive same alphanumerics — pattern: `(.)\1{4,}`)
- AWS docs example: exact match `AKIAIOSFODNN7EXAMPLE`

⚠️ **`example` and `sample` were removed from the suppression list in v0.6** — they were too greedy. Real keys whose names happen to contain "example" (e.g. `client_secret_for_examplecorp`) were getting silently dropped. If you need to mark a value as "this is a fake for documentation", use one of the explicit placeholders above instead of relying on the substring `example`.

⚠️ **Why scope-to-match matters:** if you check the whole line, `postgres://user:realpw@db.example.com/prod` gets suppressed because the line contains `example.com`. That's a false negative on a real leak. Always check only the matched group (the key/password itself).

**REDACTION RULE — never break:** Before quoting any line into your report or chat output, replace the **entire regex match span** (not just the captured group, not just the high-entropy tail — the full matched text including any prefix like `sk-ant-`/`AKIA`/`GOCSPX-`) with `***REDACTED***`. Replacing only the tail leaks the prefix and length, which is enough for an attacker to confirm "yes, this is a valid Anthropic key, just rotated". The report itself must not contain a fresh leak.

**Verdict:**
- 1+ HIGH hit → ❌ Found credentials. List `file:line` for each (with REDACTED quote).
- 0 HIGH → ✅ No leaked credentials in the obvious places.

**Auto-attached fix prompt (paste into Claude/Cursor — written in marketer voice, not engineer voice):**

```
I have leaked API keys / passwords in my project — see the file:line list from the audit. Walk me through these steps, one at a time, and STOP and show me before running each:

1. Rotate. For each leaked key, open the provider's website (AWS console, Google Cloud Console, Anthropic dashboard, GitHub settings, etc.) and generate a new key. Tell me which provider each leaked key belongs to so I know where to click. Old keys = burn.

2. Move out of the project. Put the new keys somewhere this repo can't reach — a `.env` file outside the repo folder, or my OS password manager (macOS Keychain / Windows Credential Manager / 1Password). Show me how to do that.

3. Stop tracking the file going forward. Add patterns like `.env`, `*.key`, `*.pem`, `credentials*.json` to `.gitignore`. Then run `git rm --cached <file>` for each file that's currently tracked. Explain what `git rm --cached` does in plain English before running it.

4. If the leaked keys were ever pushed to GitHub (especially a public repo): the keys are in git history forever, even after `git rm`. Tell me what I should do — usually that means rotating + writing off the keys, NOT trying to rewrite git history. Only mention `git filter-repo` / BFG Repo-Cleaner if I explicitly ask, and warn me they can break the repo for collaborators.

5. Confirm clean. Show me how to re-run the audit so I can verify all three checks pass.

Don't run anything without showing me first.
```

---

## Step 2 — Check 2: Prompt injection sinks

**Plain question:** Does your agent take untrusted text — campaign briefs, customer emails, scraped websites, CRM notes — and feed it directly into a database query, shell command, or sensitive tool call?

**Scope:** Python (`*.py`) and JS/TS (`*.ts`, `*.js`, `*.tsx`, `*.jsx`) source files.

**HIGH-confidence detectors (only these get reported as ❌):**

Python:
- `\.(?:execute|executemany|executescript|exec_driver_sql|fetch|fetchrow|fetchval)\(\s*f["']` — covers `cursor.execute(f"...")`, `cursor.executemany(f"...")`, sqlite3 `.executescript(f"...")`, SQLAlchemy 1.4+ `.exec_driver_sql(f"...")`, and asyncpg `.fetch(f"...")` / `.fetchrow(f"...")` / `.fetchval(f"...")` — primary SQL injection detector across sync + async stacks
- **Subprocess detector — broad match, then tier by sub-signature (DO NOT just narrow the regex — that misses real shell-via-tool cases):**
  - **Broad match (anchor):** `subprocess\.(?:run|Popen|call|check_output)\([^)]*\b(f["']|\+\s*\w+)`
  - After matching, classify with these sub-rules (apply in order, first match wins):
    1. **HIGH — first arg is an f-string or `+` concat:** call shape `subprocess.X(f"..."` or `subprocess.X("..." + var` → shell-form, almost always with `shell=True`. Real shell injection.
    2. **HIGH — `shell=True` present anywhere in the call** combined with any f-string or `+`-concat in the args → real shell injection regardless of arg shape.
    3. **HIGH — array form with shell-via-tool:** classify by first two array elements.
       - `["sh", "-c", X]`, `["bash", "-c", X]`, `["zsh", "-c", X]`, `["cmd", "/c", X]`, `["powershell", "-c", X]`, `["pwsh", "-c", X]` — if `X` (specifically index `[2]`, the shell payload) is f-string or concat → shell injection.
       - `["ssh", host, X, ...]`, `["docker", "exec", container, X, ...]`, `["kubectl", "exec", pod, "--", X, ...]` — if any element from index `[2]` onward is f-string or concat → remote/container shell injection (these tools forward the rest as a shell command).
       - `["git", "show", "-c", "user.email=evil"]` and similar git args — be aware that even non-shell tools can have `--upload-pack`/`--receive-pack`-style "execute this string" flags. If the array contains `--upload-pack=`, `--receive-pack=`, `-o ProxyCommand=`, `-c core.sshCommand=` literal substrings AND interpolation, treat as HIGH.
    4. **HIGH — array form where index `[0]` (the program name) is itself an f-string / `+`-concat:** e.g. `subprocess.run([f"{user_chosen_binary}", ...])` → arbitrary-binary execution, different class but same blast radius.
    5. **MEDIUM — array form, f-string only in non-zero positions, no shell-tool:** e.g. `subprocess.run(["git", "show", f":{x}"])` → variable goes as a single argv element, the underlying program parses it; usually safe (git/docker/etc. don't shell-eval their args). Worth a glance, not a ❌.
- `os\.system\([^)]*[\+f]` — concat or f-string in `os.system` → HIGH (no array form, always shell)
- `(?<![\w.])eval\(` — **negative lookbehind blocks `.` (method call), `_` (e.g. `my_eval`), and alphanumerics** so we only match the bare `eval(` builtin. Same shape applies to `(?<![\w.])exec\(`. HIGH.

TypeScript / JavaScript:
- `(?:execute|query|run|raw)\(\s*\`[^\`]*\$\{[^}]+\}` — template-literal with `${...}` in DB method (covers `db.execute`, `db.query`, `knex.raw`, TypeORM `query`, mysql2 `query`) → HIGH
- `\$queryRawUnsafe\s*\(\s*\`[^\`]*\$\{[^}]+\}` and `\$executeRawUnsafe\s*\(\s*\`[^\`]*\$\{[^}]+\}` — Prisma "unsafe" raw query with `${...}` — HIGH (the `Unsafe` suffix exists exactly because the safe form (`$queryRaw\`...\``) does parameterization automatically; if you see `Unsafe` + interpolation, it's a sink)
- `sql\s*\`[^\`]*\$\{[^}]+\}` followed by `db\.execute` or `.run\(sql\b` — Drizzle ORM raw SQL with interpolation → HIGH
- `child_process\.(?:exec|execSync)\([^,)]*[\+\`]` — string concat or template-literal in `exec`/`execSync` (these spawn a shell) → HIGH
- `child_process\.(?:execFile|execFileSync|spawn|spawnSync)\(` and `Bun\.spawn\(` and `new Deno\.Command\(` — Node/Bun/Deno argv-form spawn:
  - HIGH if first arg (the program name) is template-literal / concat / variable → arbitrary binary execution
  - HIGH if program is `sh`/`bash`/`zsh`/`cmd`/`powershell`/`pwsh` AND a later arg-array element is template-literal → shell-via-tool
  - HIGH if program is `ssh`/`docker exec`/`kubectl exec` AND a later arg is template-literal → remote shell
  - MEDIUM otherwise — argv-form passes args as separate strings to the spawned binary; safe unless that binary itself shells out
- `(?<![\w.])eval\(` (raw `eval`, not a method call like `client.eval(`, not `my_eval(`) → HIGH
- `new Function(` with non-static argument → HIGH

LLM-specific:
- A tool/function whose docstring or description contains words like "execute arbitrary", "run any SQL", "run any shell" — without an allowlist nearby

**MEDIUM:**
- File read from disk where the path comes from a variable with no `..` check
- HTTP fetch where the URL is a variable (potential SSRF)

**Plain-language report wording (NO jargon — lead with WHAT happens, code is secondary):**
> "Your agent builds a database query by gluing campaign-brief text directly into it. If a brief contains the right words, the agent runs whatever SQL command is hidden there — not because someone hacked you, just because the agent accepts the brief as-is."
>
> *Found at: `agent.py:42` — `cursor.execute(f"... {brief}")`*

**Verdict:**
- 1+ HIGH hit → ❌
- 0 HIGH → ✅

**Auto-attached fix prompt (paste into Claude/Cursor):**

```
My agent glues outside text (campaign briefs, customer emails, scraped pages, CRM notes) directly into a database query or a system command — see the file:line list above. Walk me through fixing this. For each finding:

1. Read me the line in question and explain in one plain sentence what variable is the "outside text" and where it comes from. (e.g. "the variable `brief` comes from the campaign-brief input on line 12 — that's untrusted text.")

2. Show me the safe rewrite. Don't drop technical names on me — just write the new line and tell me what changed. The general principle:
   - For database queries: keep the data SEPARATE from the query template. The query template stays a fixed string, the data goes in as a parameter the database knows is "just data, never a command".
   - For system commands: pass the variable as its own piece, not glued into a sentence. The operating system then treats it as one literal argument, not as a place to hide more commands.

3. Tell me what would happen if a customer sent a brief like `'; DROP TABLE customers; --` BEFORE and AFTER the fix. Show me concretely that the new code can't be tricked.

4. If the finding involves an AI agent calling a tool with text it generated itself — add a check in front of that tool that compares the AI's request against an explicit allowlist of approved actions. The AI doesn't get to invent the action; it picks from a fixed menu.

5. Show me the diff before applying. I'll say "go" or "wait".
```

---

## Step 3 — Check 3: Missing audit trail

**Plain question:** If your agent does something unexpected today, can you replay exactly what it did and why?

**Scope:** All source files + presence of log files + observability/log-shipping library imports.

**HIGH-confidence detector (apply at REPO level, NOT per-file — single `print()` in one debug script doesn't fail the check):**

Compute these signals across the **whole repo**:
- (A) Repo contains tool/agent code: any of `from anthropic`, `from openai`, `import langchain`, `import litellm`, `import instructor`, `from cohere`, `from mistralai`, `from google.generativeai`, `import genai`, `@tool`, `@function_tool`, `function_tool(`, `import { generateText } from "ai"`, `from "@ai-sdk/`, `from "@modelcontextprotocol/sdk"`, MCP server definitions, `Server(` from `mcp.server`, `@server.list_tools()`
- (B) Logging library present: any import of `logging`, `loguru`, `structlog`, `pino`, `winston`, `bunyan`, `signale` ANYWHERE in the repo
- (C) Observability/log-shipping library present: any import of `datadog`, `splunklib`, `sentry_sdk`, `elasticsearch`, `boto3.*cloudwatch`, `sumologic`, `loki`, `honeycomb`, `@datadog/`, `@sentry/`, `@grafana/`
- (D) Log files exist: any `*.log` file OR `./logs/` dir present
- (E) Tool handlers use `print()` or `console.log()` for state-changing operations — count separately

**Verdict:**
- (A) AND NOT (B) AND NOT (C) AND NOT (D) → ❌ — agent code with zero logging surface
- (A) AND (B or C or D) → ✅ — there's some audit surface; mark MEDIUM if (E) has hits without structured logging

**MEDIUM:**
- Logging is imported but only at INFO level for tool calls — no caller, no args digest, no outcome status

**Plain-language report wording:**
> "Your agent's tool calls aren't written anywhere durable. If a customer asks tomorrow 'why did the agent send this email?', you cannot answer — `print()` to stdout is gone the moment the terminal closes."

**Auto-attached fix prompt (paste into Claude/Cursor):**

```
My agent doesn't keep a durable record of what it did. If something goes wrong tomorrow I can't replay yesterday. Walk me through adding a simple log:

1. For every place where the agent calls a tool, sends an email, queries a database, or writes a file — write ONE line to a log file. The line should answer: WHEN it ran, WHO asked for it (which user / which trigger), WHAT it did (which tool / function), WHAT INPUT it got (a short fingerprint, NOT the raw email body — see step 3), WHAT HAPPENED (success / error / timeout), and HOW LONG it took.

2. Put those lines in `./logs/agent.jsonl` — one line per action, append-only. JSON format so I can grep through it later.

3. Don't write raw customer emails, full payloads, or secrets into the log — replace those with a one-way scrambled fingerprint (a hash) so the log itself doesn't become a new leak. If I ever need the original, I can match the fingerprint against the source data.

4. Add `./logs/` to `.gitignore` so logs don't get committed to git accidentally.

5. Show me the change for ONE handler first. After I approve it, apply the same pattern to the rest. Don't refactor the world — just add the log line.
```

---

## Step 4 — Output report

Write `./agent-security-report-{YYYY-MM-DD}.md`:

```markdown
# 🛡️ Secure Agents Audit — {date}

## Score: {N} of 3 passed

| Check | Status | Detail |
|---|---|---|
| 1. Credentials | ✅ / ❌ | {count} hit(s) in {n} file(s) |
| 2. Prompt injection | ✅ / ❌ | {count} sink(s) at {file:line list} |
| 3. Audit trail | ✅ / ❌ | logging library: {yes/no}; log files: {yes/no} |

---

## ❌ Findings

{For each ❌ check, include:}
{- the file:line list (REDACTED quotes for credentials)}
{- the plain-language explanation}
{- the auto-attached fix prompt block}

---

## What to do in the next 5 minutes

1. Rotate any leaked keys at their providers.
2. Paste the fix prompts above into Claude/Cursor and apply the suggested changes.
3. Re-run `/secure-agents` to confirm clean.

---

## What this skill did NOT check

- Code-level bugs in your application logic — use Claude Code's built-in `/security-review` for that
- Network-level controls (firewall, egress proxy)
- Compliance frameworks (SOC 2, GDPR, HIPAA)
- Production infrastructure (load balancers, secrets managers, identity providers)

The goal is "the basics, in 30 seconds, in plain English". Real security work goes far beyond this.

---

*Run with secure-agents v0.6 · 3-check audit · MIT-licensed · open-source*
```

After writing, print to chat: `Wrote ./agent-security-report-{date}.md — {N}/3 passed. Open the file for fix prompts.`

---

## HARD RULES (never break)

1. **Only 3 checks.** Don't expand. Adding makes it noisy. The whole pitch is "30 seconds, 3 things, no noise".
2. **HIGH-only ❌.** MEDIUM hits go under a "review" subsection in the report, LOW hits are hidden unless `--verbose`. False positives kill viral skills.
3. **Always redact secrets before quoting.** Replace the detected key value with `***REDACTED***` everywhere. The audit report itself must not become a fresh leak.
4. **Read-only by default.** This skill never edits files. Fix prompts ask the user to paste them back into Claude — that's where edits happen.
5. **No external CLI required.** No `gitleaks`, no `trufflehog` install step. All detection is plain regex + glob + read. Marketers can run this without DevOps help.
6. **Plain language only.** No CWE numbers, no CVSS, no "OWASP A03:2021". Say "your agent runs SQL with text from a campaign brief" not "tainted input flows into sink".
7. **No upselling, no signups, no telemetry.** This skill is free. It mentions no commercial product. Trust > conversion.

---

## Acknowledgments

This skill answers three concrete questions a marketing or operations team should be able to ask of any AI agent before a Monday standup:

1. *Did we leak the keys?*
2. *Can a stray document get the agent to do something it shouldn't?*
3. *Can we replay what the agent did yesterday?*

If your team can't answer all three with "yes" today, this skill takes 30 seconds to find out which one is broken.

License: MIT — see LICENSE.
