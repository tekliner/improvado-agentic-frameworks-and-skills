# Temporal Pipelines — Debugging & Troubleshooting

Shared reference for **both** the `temporal-pipelines` skill (the §debug loop links here) and the verification sub-agent (it uses the symptom table to predict how a `.py` will fail at runtime). Read it when a run fails, hangs, returns empty, or behaves unexpectedly.

Everything below is reachable from chat through the MCP tools.

## The debug loop — cheapest signal first

Escalate in order; stop as soon as you have the cause.

1. **Result / status** — `getTemporalPipelineRunResultTool({run_id})` (status + result/error; sleeps `wait_seconds` before polling, so a loop is paced for you) or `describeTemporalPipelineRunTool({run_id})` (metadata only, non-blocking: status, timings, `schedule_id`).
2. **Worker health** — `getTemporalPipelineWorkersTool()`. Is it a crashed/throttled pod or a code bug? Check `last_error.reason`, `restart_count`, `resources.cpu_throttled_pct`.
3. **Run logs** — `getTemporalPipelineRunLogsTool({run_id, level:'error'})`. Narrow with `contains` / `activity_id`; tail a RUNNING run with `direction:'forward'` + the returned `cursor`.
4. **Run files (S3)** — `listTemporalPipelineRunArtifactsTool({run_id})` lists **every file the run wrote** under its `secret.s3.prefix` (`stages/`, `raw/`, `output/…`) — no publish step (ADR-011). This is the main debugging lever: have the failing activity write the raw API response / rendered SQL / intermediate dump to `secret.s3.prefix`, re-run, then read it back. Narrow a fat run with `prefix:'stages/facebook/'`; page with `cursor`/`page_size`. `getTemporalPipelineRunArtifactUrlTool({run_id, name})` → presigned GET (TTL ~15 min); **never echo the URL** — fetch once, drop it. Empty `[]` = the run wrote nothing under that prefix (did the activity reach the write, or fail first?) *or* wrong `run_id`. A file shows up only **after** the activity closes it — for a live RUNNING run watch logs, not this.

## Observability tools — what they return

| Tool | Key fields | Notes |
|---|---|---|
| `getTemporalPipelineWorkersTool` | `phase`, `ready`, `restart_count`, `last_error {reason: OOMKilled/CrashLoopBackOff, exit_code}`, best-effort live `resources {cpu_throttled_pct, memory_bytes, …}` | Empty `workers:[]` = pod scaled to zero (**normal** when idle). Next `execute` cold-starts (~20–60 s). |
| `getTemporalPipelineRunLogsTool` | `lines[{timestamp, level, message}]`, `next_cursor`, `window` | `direction` `backward` (tail, default) / `forward` (follow a RUNNING run by re-sending `cursor`). Filters: `level`, `activity_id`, `contains`. |

## Symptom → cause → fix

These are **post-upload / runtime** failures. Pre-upload mistakes are caught by the validation gate (`ruff` + `pyright` + `pipeline_sdk validate`) — run it first; it never reaches this table.

| Symptom (where you see it) | Cause | Fix (in your code) |
|---|---|---|
| `Failed validating workflow X` / `ModuleNotFoundError: _s3_pipeline_X` (result/logs) | missing `sandboxed=False` | add `@workflow.defn(sandboxed=False, name='…')` |
| `NameError` for a module the body uses (e.g. `dataclasses`, `datetime`) | imported locally, or stdlib at module level outside the guard | import at module level **inside** `with workflow.unsafe.imports_passed_through():` |
| `ModuleNotFoundError: custom_pipelines.scheduled` (or any `src/` / worker-internal) | importing a module that doesn't ship to S3 | remove it — only `temporalio.*`, `pipeline_sdk.*`, stdlib, whitelisted third-party are legal |
| activity returns a `dict`, not your dataclass | missing `result_type=` | add `result_type=YourDataclass` to `execute_activity` |
| `Workflow "X" not found in code. Found: [...]` | `workflow_name` ≠ any `@workflow.defn(name=…)` in the file | fix `workflow_name` or the class `name=` |
| activity stuck RUNNING, `history_length=4`, right after an upload | new class not yet registered on the worker | wait for hot-reload (~20 s) and re-trigger (see *After uploading new code*) |
| Heartbeat timeout **while logs show data still flowing** | event loop starved / threadpool (6 threads) exhausted | heartbeat from inside the data loop (throttle by `time.monotonic()`); queue producer uses `put_nowait` + `await asyncio.sleep(0.02)`, not `to_thread(queue.put, …)` |
| `workers` `last_error: OOMKilled` / pod evicted (no "disk full" anywhere) | staged a big file on `/tmp`, or buffered > 4 GiB in RAM | stream to S3 via multipart upload; bounded buffer, flush ~32 MiB parts (MPU caps at 10000 parts); never touch disk |
| `cpu_throttled_pct` high, latency creeps | CPU-bound work (gzip/parse) holding the GIL on 2 cores | `ProcessPoolExecutor` or keep CPU work short; don't fan out more parser threads than cores |
| HTTP 429 from Vault at fan-out | each activity calls `read_pipeline_secret()` independently | read the secret once and cache `(secret_path, vault_token)` behind an `asyncio.Lock` |
| Vault `read_pipeline_secret` hangs (never returns) | `VAULT_ADDR` env missing on the worker pod (SDK defaults to `http://vault:8200`) | infra fix — worker deployment needs `VAULT_ADDR=https://hv.prod.rtb-media.me` + `VAULT_AI_AGENT_MOUNT_POINT=ai_agent` |
| `401 DTS session cookie required` from `call_datasource_proxy` / `call_mcp_tool` | `secret.dts_session_id` is empty | `prepare_credentials(…, agency_chief_id=<user_id>)` — pass a user with permission on the connection |
| `connection_id not found` | connection belongs to a different workspace/agency | confirm via Palantir: `SELECT id, workspace_id FROM internal_analytics.dim_dts_dsas_extraction_connection WHERE id = ?` |
| `Table … doesn't exist` / `Unknown column …` (CH) | table/column names guessed from memory | re-discover: `listDataTablesTool({search})` → `clickhouseTool({query:"DESCRIBE TABLE …"})`, hard-code what `DESCRIBE` returns |
| scheduled trigger silently dropped | `SKIP` overlap + a stale RUNNING run still holding the slot | check `getTemporalPipelineRunsTool({status:'RUNNING', schedule_id})`; an OOM-killed run can stay RUNNING forever — surface it to the user to terminate in the Temporal UI |
| state cursor advanced past unprocessed rows after a failure | cursor written before the rows it covers were durably processed | write the cursor **only after** successful processing — see `pipeline-state.md` |

## After uploading new code

Upload paths: `updateTemporalPipelineTool`, the `generateTemporalPipelineUploadUrlTool` → `curl -X PUT` flow, or `executeTemporalPipelineTool` (re-syncs the saved pipeline's code). In all cases S3 is updated synchronously, but the worker keeps serving the old code until it reloads: a change to an existing `@workflow.defn` is hot-reloaded (`custom_pipelines.hot_reload`, SIGTERM, ~20 s), while a *dependency/image* change needs a full pod rollout. Right after an upload you may briefly hit `Workflow not found` or a stuck RUNNING run — wait ~20–60 s and re-trigger. For a test: upload → wait ~20–60 s → `triggerTemporalPipelineScheduleTool` / `executeTemporalPipelineTool` → fetch the run result. Schedule changes affect only future triggers; running instances continue to completion.

## The rules these symptoms trace back to

Every symptom above is a violation of a numbered rule in `code-conventions.md`; the verifier protocol at the end of that file is what catches them before upload.

## See also

- `cookbook.md` — the runnable recipe a symptom maps back to (e.g. the streaming-MPU recipe for the OOMKilled row, the proxy recipe for the 401/connection rows).
- `pipeline-state.md` — `PipelineState` semantics (cursor/bookmark correctness, the failure-advance pitfall above).
- `code-conventions.md` — the single source of authoring rules + the skeptic's verification protocol.
- The `temporal-pipelines` skill — runtime-limits budget (§Runtime limits) and the authoring rules these symptoms map back to.
