#!/usr/bin/env node
// Capture UI screenshots with Playwright, upload to S3, post as PR comment.
//
// Usage:
//   node publish.mjs \
//     --pr 408 \
//     --capture / \
//     --capture /vms:VMS_list \
//     [--header-only] \
//     [--text "intro markdown"] \
//     [--no-post]              # capture+upload only, print markdown to stdout
//
// `--capture <path>[:label]`: label appears in the comment heading. Default
// label is the path with slashes replaced by underscores.
//
// Env (with sensible project defaults):
//   FRONTEND_DIR    default ./frontend (resolved from cwd)
//   AWS_PROFILE     default agnify
//   AWS_BUCKET      default agnify-data
//   AWS_REGION      default us-east-1
//   BUCKET_PREFIX   default pr-screenshots
//   VITE_PORT       default 5174
//   VIEWPORT_WIDTH  default 1440
//   VIEWPORT_HEIGHT default 900
//   HEADER_HEIGHT   default 120 (pixels — used when --header-only)
//   PRESIGN_TTL     default 604800 (7 days, max for SigV4)

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as wait } from "node:timers/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const env = {
  FRONTEND_DIR: process.env.FRONTEND_DIR ?? path.resolve(process.cwd(), "frontend"),
  AWS_PROFILE: process.env.AWS_PROFILE ?? "agnify",
  AWS_BUCKET: process.env.AWS_BUCKET ?? "agnify-data",
  AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
  BUCKET_PREFIX: process.env.BUCKET_PREFIX ?? "pr-screenshots",
  VITE_PORT: Number(process.env.VITE_PORT ?? 5174),
  VIEWPORT_WIDTH: Number(process.env.VIEWPORT_WIDTH ?? 1440),
  VIEWPORT_HEIGHT: Number(process.env.VIEWPORT_HEIGHT ?? 900),
  HEADER_HEIGHT: Number(process.env.HEADER_HEIGHT ?? 120),
  PRESIGN_TTL: Number(process.env.PRESIGN_TTL ?? 604800),
};

function parseArgs(argv) {
  const args = { captures: [], headerOnly: false, text: "", noPost: false };
  const takeValue = (flag, i) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
      throw new Error(`${flag} requires a value (got ${v ?? "end-of-args"})`);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pr") args.pr = takeValue("--pr", i++);
    else if (a === "--capture") args.captures.push(takeValue("--capture", i++));
    else if (a === "--text") args.text = takeValue("--text", i++);
    else if (a === "--header-only") args.headerOnly = true;
    else if (a === "--no-post") args.noPost = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (args.captures.length === 0) throw new Error("at least one --capture <path>[:label] required");
  if (!args.noPost && !args.pr) throw new Error("--pr <number> required (or pass --no-post)");
  return args;
}

function parseCapture(spec) {
  const i = spec.indexOf(":");
  if (i === -1) return { path: spec, label: spec.replaceAll("/", "_") || "root" };
  return { path: spec.slice(0, i), label: spec.slice(i + 1) };
}

const execFileAsync = promisify(execFile);
async function run(cmd, args) {
  const { stdout } = await execFileAsync(cmd, args);
  return stdout.trim();
}

async function startVite() {
  const bin = path.join(env.FRONTEND_DIR, "node_modules/.bin/vite");
  if (!fs.existsSync(bin)) {
    throw new Error(`vite not found at ${bin} — run \`bun install\` (or \`npm install\`) in ${env.FRONTEND_DIR}`);
  }
  console.error(`[vite] starting on :${env.VITE_PORT}…`);
  const proc = spawn(bin, ["--port", String(env.VITE_PORT), "--host", "127.0.0.1"], {
    cwd: env.FRONTEND_DIR,
    // Spread parent env so AWS creds, NODE_OPTIONS, PATH etc. flow through.
    // VITE_TEST_MODE flips vite.config.ts's alias to the project's
    // clerk-mock, and the dummy publishable key gates the ClerkProvider
    // mount without needing a real Clerk session.
    env: {
      ...process.env,
      VITE_TEST_MODE: "true",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_screenshot_publisher",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => process.stderr.write(`[vite] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[vite-err] ${d}`));
  return proc;
}

async function waitForVite(timeoutMs = 20_000) {
  const url = `http://127.0.0.1:${env.VITE_PORT}/`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error(`vite did not become ready on ${url} within ${timeoutMs}ms`);
}

async function captureScreenshots({ captures, headerOnly }) {
  const pwPath = path.join(env.FRONTEND_DIR, "node_modules/playwright/index.mjs");
  const { chromium } = await import(pwPath);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: env.VIEWPORT_WIDTH, height: env.VIEWPORT_HEIGHT },
  });
  const page = await context.newPage();
  const results = [];
  for (const spec of captures) {
    const { path: route, label } = parseCapture(spec);
    console.error(`[shot] → ${route}`);
    await page.goto(`http://127.0.0.1:${env.VITE_PORT}${route}`);
    await page.waitForSelector("header", { timeout: 15_000 });
    await wait(800); // settle any header animation
    const file = path.join(os.tmpdir(), `screenshot-publisher-${label}-${randomBytes(4).toString("hex")}.png`);
    const opts = headerOnly
      ? { path: file, clip: { x: 0, y: 0, width: env.VIEWPORT_WIDTH, height: env.HEADER_HEIGHT } }
      : { path: file, fullPage: false };
    await page.screenshot(opts);
    results.push({ route, label, file });
  }
  await browser.close();
  return results;
}

// Each upload uses a fresh UUID in the S3 key, so re-runs against the same
// PR don't overwrite the bytes earlier comments rely on (camo caches by
// source URL but re-fetches on cache eviction — overwriting an old key
// would retroactively change the image shown in those older comments).
async function uploadAndPresign({ pr, file, label }) {
  const uuid = randomBytes(4).toString("hex");
  const key = `${env.BUCKET_PREFIX}/${pr ?? "no-pr"}/${uuid}-${label}.png`;
  const s3url = `s3://${env.AWS_BUCKET}/${key}`;
  await run("aws", ["s3", "cp", file, s3url, "--profile", env.AWS_PROFILE, "--region", env.AWS_REGION]);
  return run("aws", [
    "s3", "presign", s3url,
    "--profile", env.AWS_PROFILE,
    "--region", env.AWS_REGION,
    "--expires-in", String(env.PRESIGN_TTL),
  ]);
}

function buildMarkdown({ text, shots }) {
  const parts = [];
  if (text) parts.push(text, "");
  for (const { label, route, url } of shots) {
    parts.push(`**\`${route}\` — ${label}:**`, "", `![${label}](${url})`, "");
  }
  return parts.join("\n").trim() + "\n";
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[usage] ${err.message}`);
    process.exit(2);
  }
  const vite = await startVite();
  let exitCode = 0;
  try {
    await waitForVite();
    const shots = await captureScreenshots(args);
    await Promise.all(shots.map(async (s) => {
      s.url = await uploadAndPresign({ pr: args.pr, file: s.file, label: s.label });
      console.error(`[s3] ${s.label} → uploaded`);
    }));
    const md = buildMarkdown({ text: args.text, shots });
    if (args.noPost) {
      process.stdout.write(md);
    } else {
      await run("gh", ["pr", "comment", String(args.pr), "--body", md]);
      console.error(`[gh] comment posted on PR #${args.pr}`);
    }
  } catch (err) {
    console.error(`[error] ${err.message}`);
    exitCode = 1;
  } finally {
    vite.kill("SIGTERM");
    process.exit(exitCode);
  }
}

main();
