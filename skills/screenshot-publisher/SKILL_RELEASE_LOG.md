# Skill Release Log

## [1.0.0] - 2026-05-07
**Session ID:** `1c13dc7b-d405-47e2-a855-515bee17fe4d` by Anton Slesarev
**Type:** Initial release
**Changes:**
- Extracted from manual workflow used to post visual verification on PR #408 (Editor↔VMS switcher).
- `scripts/publish.mjs` — single Node ESM script that boots vite with `VITE_TEST_MODE=true`, waits for ready, drives Playwright chromium to capture each `--capture <path>[:label]`, uploads each PNG to `s3://AWS_BUCKET/BUCKET_PREFIX/<pr>/<uuid>-<label>.png`, presigns a 7-day GET URL, and posts a markdown comment via `gh pr comment`.
- `--header-only` mode crops to `HEADER_HEIGHT` pixels for tight visuals on layout-only changes.
- `--no-post` mode prints markdown to stdout so the caller can chain (e.g., into a draft PR description).
- Project defaults assume Agnify: `AWS_PROFILE=agnify`, `AWS_BUCKET=agnify-data`, `BUCKET_PREFIX=pr-screenshots`. All overridable via env.
- SKILL.md follows Knowledge Framework — TD anatomy (resources), LR workflow (publish run), MECE sections, ground-truth attribution.
**Issue:** None — clean extraction.
