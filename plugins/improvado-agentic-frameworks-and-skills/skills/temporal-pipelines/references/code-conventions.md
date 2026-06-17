# Temporal Pipelines — Code Conventions (single source of truth)

Every rule here exists because its violation broke a real production pipeline; together they keep peak memory inside the 4 GiB pod budget (limits table: skill §3) and keep a run debuggable from chat. One file, two consumers:

- **Author** (skill §4.4 / §5): Read this file top-to-bottom **immediately before writing or editing code**. Write from the closest `cookbook.md` recipe, then check the draft against every rule. Don't write from memory of this file.
- **Verifier** (skill §7.1 skeptic): re-read this file and judge **every numbered rule** PASS/FAIL against the final `.py` — protocol at the end.

Rule IDs are stable: **T** upload-traps · **C** correctness · **E** efficiency · **L** logging · **P** process checks.

---

## T — Three traps that only fail after upload

Each one costs an S3 round-trip + worker reload to discover. The worker loads your `.py` as the synthetic module `_s3_pipeline_<file>` — that mechanism drives all three.

### T1 — `sandboxed=False`, wrapped imports, one file

Every workflow MUST be `@workflow.defn(sandboxed=False, name='…')` with module-level imports wrapped. Without `sandboxed=False` the worker can't even register the workflow: Temporal's sandbox re-imports the synthetic module → `ModuleNotFoundError` at registration. The `name=` must equal the `workflow_name` passed to the MCP tool (not the Python class name).

```python
# WRONG — default sandbox + bare module-level imports
from temporalio import workflow
from pipeline_sdk.activities import prepare_credentials   # unwrapped

@workflow.defn(name='MyPipeline')          # sandboxed defaults to True
class MyPipeline: ...
```

```python
# RIGHT
import dataclasses                          # dataclasses + @dataclass param/result
from temporalio import workflow             #   classes stay at module top

with workflow.unsafe.imports_passed_through():
    from datetime import timedelta          # stdlib the bodies use goes here too
    from temporalio import activity
    from temporalio.common import RetryPolicy
    from pipeline_sdk.activities import prepare_credentials, cleanup_credentials

@workflow.defn(sandboxed=False, name='MyPipeline')
class MyPipeline: ...
```

- `import dataclasses` + the `@dataclass` param/result classes at module top is **correct** (the decorator runs at import; safe under `sandboxed=False`) — verifier: NOT a violation.
- Workflow + its private `@activity.defn` helpers live in **one file**. Never import from `src/` or `custom_pipelines.*` — they don't ship to S3 → `ModuleNotFoundError`.

### T2 — activities by STRING name, with `result_type=` and a timeout

Function references don't survive the synthetic-module reload; without `result_type=` Temporal hands you a `dict` and attribute access breaks downstream; without `start_to_close_timeout` the call is rejected.

```python
# WRONG
r = await workflow.execute_activity(process_batch, params)

# RIGHT
r = await workflow.execute_activity(
    'process_batch', params,
    start_to_close_timeout=timedelta(hours=1),
    result_type=BatchResult,
)
```

No `task_queue=` on your own activities. **Exception:** SDK reusable activities (`prepare_credentials`, `cleanup_credentials`, `les_extract`, `ch_load`, `register_data_table`) are imported from `pipeline_sdk.activities` (never redefined) and called directly — `await fn(...)` — no string name, no `result_type=`; catalog: `reusable-activities.md`.

### T3 — one activity per logical step, never per item

Looping `execute_activity` over files/rows/dates produces thousands of history events (50K hard cap) and unreadable runs.

```python
# WRONG — O(n) activities
for f in files:
    await workflow.execute_activity('process_file', f, ...)

# RIGHT — O(1): the loop lives inside ONE activity body
await workflow.execute_activity(
    'process_all_files', ProcessAllParams(creds=creds, files=files),
    start_to_close_timeout=timedelta(hours=2),
    heartbeat_timeout=timedelta(minutes=5),
    result_type=BatchResult,
)
```

Target shape: 4–6 activities regardless of input size; `workflow.continue_as_new()` for genuinely unbounded runs.

---

## C — Correctness rules

- **C1 — deterministic primitives** inside `@workflow.run`: `workflow.now()` / `workflow.sleep()` / `workflow.random()` / `workflow.uuid4()` — never `datetime.utcnow()`, `asyncio.sleep()`, `random`, `uuid.uuid4()` (symptom: nondeterminism errors on replay).
- **C2 — credentials in `try/finally`**: `prepare_credentials(run_id=…, connection_aliases=[…])` first; `cleanup_credentials(…)` in a `finally` that covers success/failure/cancel (skipping it leaks Vault leases). `connection_aliases` match the pipeline's `connection_ids` one-for-one. If **any** data-source proxy / MCP call is made: `prepare_credentials(…, agency_chief_id=<user_id>)` — else `secret.dts_session_id` is empty → 401.
- **C3 — tenant & secrets**: `get_current_tenant()` inside activities for tenant-scoped access; **never** trust `agency_uuid` / `workspace_id` from `params` — they are unauthenticated. The `secret` is never logged and never round-tripped through a Temporal payload.
- **C4 — route connection calls by what the connection gives you.** Platform-held auth (OAuth refresh / request signing — most ad-platform sources) → `call_datasource_proxy` / `call_mcp_tool`. The connection hands you usable creds (warehouses, S3, DBs, plain API keys — read from `secret.connections[alias]`) → call the service directly: native driver or raw `aiohttp`. The `data_source`/`destination` label is a system concept being unified and does NOT decide this — verifier: don't FAIL a native-driver call just because the alias is `type='data_source'`, or vice-versa. Recipes: cookbook 3, 4, 6.
- **C5 — errors & retries**: a plain `raise` is retryable. Permanent failures (validation, 4xx auth, malformed config, missing alias) → `ApplicationError(…, non_retryable=True)`. External LLM/HTTP SDKs: `max_retries=0` — Temporal's `RetryPolicy` is the single retry authority.
- **C6 — cancellation**: long activities catch `asyncio.CancelledError`, clean up partial state (abort the MPU, delete temp keys), and **re-raise** — swallowing it makes Temporal record success. Cancellation is delivered on a heartbeat call: an activity that never heartbeats is uncancellable. Recipe: cookbook 7.

---

## E — Efficiency rules (the 4 GiB survival kit)

Budget recap (full table: skill §3): 4 GiB RAM / 2 cores / ~5 GiB `/tmp` / ~6 threads / **≤4 activities concurrently on one pod** — design as if 3 identical siblings share the pod with you.

- **E1 — heavy data crosses step boundaries as a `DataRef` / S3 key, never as a payload.** Temporal payloads cap at 2 MB hard. Write bytes under `secret.s3.prefix` (`pipeline-data/{agency_uuid}/{workspace_id}/{run_id}`; STS creds scoped to exactly that prefix).
- **E2 — bounded memory: stream, never materialize, never stage on `/tmp`.** No `resp.read()` / `resp.json()` on a large body, no `list(big_iter)` / `b''.join(all_chunks)` / `pd.read_csv(whole_file)` / `json.loads(huge)` that scales with input. Inputs stream (`iter_chunked`, row-by-row `csv.reader`, generators); outputs stream to S3 via multipart upload — bounded buffer, flush ~32 MiB parts (AWS caps an MPU at 10000 parts → ~320 GiB headroom; each part ≥5 MiB except the last). Peak RAM = O(part/window), not O(file). Recipe: cookbook 5.
- **E3 — never block the event loop.** Sync I/O (boto3, `requests`, `clickhouse_connect`, file reads) → `asyncio.to_thread`; CPU-bound (gzip, parse, pandas) holds the GIL on 2 cores → `ProcessPoolExecutor` or keep it short. The pool is ~6 threads — never one `to_thread` per chunk/row; a queue producer stays on the loop: `put_nowait` + `await asyncio.sleep(0.02)` backpressure, **not** `await to_thread(queue.put, …)` (pins a pool thread, can deadlock the fan-out). Read in big chunks (~5 MiB, not 64 KiB) — tiny chunks drown the loop and the heartbeat fires late.
- **E4 — heartbeat from inside the data loop**, throttled by `time.monotonic()` — not a parallel `sleep()` task (under GIL pressure it wakes late and Temporal cancels a live activity). Carry a progress payload (`activity.heartbeat(done)`) so a retry resumes from `activity.info().heartbeat_details`; set `heartbeat_timeout` on the call. Recipe: cookbook 7.
- **E5 — read once, no leaks.** Read the secret once per run and cache it (`(secret_path, vault_token)` behind an `asyncio.Lock`; module-level cache on fan-out) — N activities each calling `read_pipeline_secret()` get HTTP 429 from Vault. aiohttp sessions / boto3 clients / DB connections: once per activity, context-managed (closed) — never per row/iteration (FD + handshake leak).
- **E6 — fan-out is bounded on every axis**: `asyncio.gather(*…, return_exceptions=True)` + BOTH `start_to_close_timeout` and `schedule_to_close_timeout` on every branch — without the second, one stuck branch holds the whole `gather` open forever. Width × peak-RAM-per-activity fits ≤4 concurrent slots / 4 GiB, or is bounded by a semaphore — state the bound. Report per-branch ok/failed in the result. Recipe: cookbook 8.
- **E7 — no DuckDB for plain concat** — pure-Python `gzip → csv` streams with bounded memory and zero disk. DuckDB only for real SQL (joins/aggregations).

---

## L — Logging rules

Run logs (`getTemporalPipelineRunLogsTool`) are the debug loop's main signal — a silent pipeline is undebuggable from chat, because nobody can attach a debugger to the worker pod.

- **L1 — log stage boundaries.** Every activity logs start and end with the numbers that matter: item/row counts, bytes, duration, and the S3 keys it wrote. That line is exactly what the debug loop will read after a failure.
- **L2 — use the Temporal loggers.** `activity.logger` inside activities (lines land in Loki filterable by `activity_id`); `workflow.logger` in workflow code — it is replay-safe (silent during replay), while bare `print` / stdlib `logging` duplicates every line on each replay.
- **L3 — levels with intent.** INFO = stage boundaries and progress; WARNING = retryable oddities (a 429, an empty page, a retried batch); ERROR = context immediately before a `raise` — what it was doing, key params, progress so far.
- **L4 — throttle inside data loops**: log every N batches or on a `time.monotonic()` interval (same shape as the E4 heartbeat) — never per row.
- **L5 — never log**: secret material, presigned URLs, PII, raw response bodies. Need a payload to debug? Dump it to `secret.s3.prefix` and read it back via run artifacts (skill §6.1, step 4).

Recipe 7 in the cookbook shows the L1–L4 shape inline.

---

## Pre-installed libraries (import freely, inside the T1 guard)

- **DB drivers:** `psycopg2-binary` · `mysql-connector-python` · `pymssql` · `snowflake-connector-python[pandas]` · `google-cloud-bigquery[pandas]` · `clickhouse-connect` · `pyodbc` · `sqlalchemy`
- **Storage:** `boto3` · `google-cloud-storage` · `gspread` · `azure-storage-*`
- **Transfer / HTTP:** `paramiko` · `requests` · `httpx` · `aiohttp`
- **Data:** `pandas` · `numpy` · `pyarrow` · `openpyxl` · `duckdb` · `pydantic` · `python-dateutil`
- **Infra:** `hvac` · `temporalio` · `structlog` · `sentry-sdk` · `improvado-pipeline-sdk`

Anything not on this list (and anything from `src/` / `custom_pipelines.*`) → T1: it doesn't exist on the worker.

---

## P — Process checks (verifier-only; not provable from the code alone)

- **P1 — the gate ran clean on this exact file**: `ruff check` + `pyright` + `python -m pipeline_sdk validate <f> --name <WorkflowName> --json` (skill §4.5).
- **P2 — recon was live, not memory**: HTTP shapes prototyped via `discoveryRequestTool` / `mcpCallToolTool`; ClickHouse table/column names came from `listDataTablesTool` + `DESCRIBE` (skill §4.3). Verify it was claimed in the work log.
- **P3 — edits are a minimal diff** off the live code (`getTemporalPipelineTool` first), no duplicate `createTemporalPipelineTool` (skill §5).
- **P4 — visualization present** on any create/structure-change: `metadata.graph_ui` + `details_ui` in business language (no `@workflow.defn`/`pipeline_sdk`/Temporal/MCP in user-facing text), no secrets in `kv`, 2–5 nodes/steps; `category` set (skill §7.2).
- **P5 — schedule is deliberate** (if scheduled): overlap policy picked from the skill §4.6 table on purpose; `catchup_window_seconds` sane for the cadence; cron is **UTC**; the schedule was enabled only **after** the verify pass.

---

## Verifier protocol (the skill §7.1 skeptic runs this)

You are an adversarial reviewer **and a senior Python performance engineer**. You read this `.py` the way someone who knows exactly what each line *costs* reads it: you see where a list grows without bound, where a `.read()`/`.json()` pulls a multi-GB body into RAM, where a sync call blocks the event loop, where the GIL pins both cores, where a buffer is never flushed. You are given a pipeline `.py` file (and optionally the user's intent).

Run **two passes**:

**Pass 1 — Resource profile (do this FIRST; it's the point).** For **each activity**, write 2–4 lines that *trace the bytes and the time*:

- **Largest realistic input** — how many rows / bytes in production? If the code doesn't bound it (no `LIMIT`, no date window, no paging cap), assume it's huge — a full historical pull, a multi-GB export, a 200M-row fact. **State the number you're assuming.**
- **Peak memory** — follow the data: O(input) (grows with the data → FAIL per E2) or O(window) (streamed)? Give the rough peak in MiB and compare to the 4 GiB pod split across ≤4 activities.
- **Event loop & CPU** — any blocking call not in `to_thread`? Any CPU-bound loop holding the GIL? Longest uninterrupted stretch vs `heartbeat_timeout`?
- **Fan-out** — parallel width × peak-per-activity: fits, or bounded by a semaphore?

Quote the **exact line** that would blow up and name the failure mode (OOMKilled / heartbeat-cancel / 2 MB payload reject / 10000-part MPU cap / threadpool starvation / GIL stall). The cheapest fix is almost always *stream it* — cookbook recipe 5 is the reference shape.

**Pass 2 — every rule above** (T1–T3, C1–C6, E1–E7, L1–L5, P1–P5): report `PASS` / `FAIL` / `N/A` per rule, quoting the line that satisfies or violates it, one-line reason; for any FAIL give the exact fix. Do not summarize or assume — if you can't find evidence, it's a FAIL.

Conditional deep references: `pipeline-state.md` when the pipeline uses `PipelineState` (it ends with its own checks block — apply it too); `debugging-and-troubleshooting.md` to name the runtime failure a violation maps to; `cookbook.md` to confirm a "correct shape" before failing a rule.

Output format:

```
RESOURCE PROFILE
  stream_to_s3   input ~80 GiB (full export, unbounded in code) | peak ~40 MiB (32 MiB MPU part + 5 MiB read chunk, streamed) — OK
  load_rows      input ~200M rows | peak O(input) — line 88 `rows = await resp.json()` pulls the whole body into RAM → OOMKilled. FIX: iter_chunked + row-by-row.
  fan-out        8 tables × ~40 MiB across ≤4 concurrent — fits.
T1 PASS — line 42: @workflow.defn(sandboxed=False, name='StreamPipeline')
T1 FAIL — line 7: `import pandas` at module level outside imports_passed_through() → wrap it
E2 FAIL — line 88: resp.json() materialises the whole response → stream with iter_chunked
L1 FAIL — no stage-boundary logging in any activity → add activity.logger.info at start/end with counts
...
VERDICT: FIX (T1, E2, L1)
```

End with **SHIP** (zero FAILs and a sane resource profile) or **FIX** (list the FAILs). After fixes: re-run the gate (P1), then re-verify the changed rules.
