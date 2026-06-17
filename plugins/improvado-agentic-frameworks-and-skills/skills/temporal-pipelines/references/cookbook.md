# Temporal Pipelines — Cookbook (runnable recipes)

Copy-and-adapt skeletons for the tasks that come up again and again. Each recipe is the **smallest workflow that demonstrates one pattern** — business logic stripped out. They are starting points, not drop-ins: adapt the names/params, then run the full local gate (`ruff check`, `pyright`, `python -m pipeline_sdk validate <f> --name <Workflow>`) before uploading.

**These are written on the *current* SDK API**, verified against `pipeline_sdk` source (2026-06-09). Several live prod pipelines use **stale** credential APIs (`creds.connection_secret(...)`, no-arg `prepare_credentials()`, `prepare_credentials("alias")` returning a dict) — do **not** copy those verbatim; follow the shapes here.

This file is the *code* companion. The *semantics/rules* live elsewhere and each recipe links to its reference: `reusable-activities.md` (LES/CH/credential wrappers), `pipeline-state.md` (state correctness), `debugging-and-troubleshooting.md` (runtime failure modes), `code-conventions.md` (every rule the recipes embody + the skeptic's verification protocol).

---

## The credential model (read once, applies to every recipe)

`prepare_credentials` reserves a Vault secret + a scoped S3 prefix for the run; `cleanup_credentials` revokes it in `finally`. Inside an activity, `read_pipeline_secret(creds)` returns the live secret:

| `secret.` field | What it is | Used by |
|---|---|---|
| `s3` → `.access_key/.secret_key/.session_token/.bucket/.prefix` | the **run's own** scratch/output S3 prefix (ADR-011 — WM lists everything under it) | recipes 1, 5 |
| `connections['<alias>']` | a **connection's** credential dict (shape is connector-specific) | recipes 1, 6 |
| `dts_session_id` | session for the data-source proxy / MCP gateway — **empty unless** `agency_chief_id` was passed | recipes 3, 4 |
| `storage` | ClickHouse creds for `PipelineState` | recipe 2 |

`connection_aliases` is a list of dicts: `{'alias': str, 'connection_id': int, 'type': 'data_source' | 'destination'}`. **The `type` is a system label that's being unified — the pipeline doesn't care whether a connection is a "source" or a "destination".** All that matters is the alias yields *enough credentials for the request you need to make*: if the API needs platform-held auth (OAuth refresh, signing) you go through the proxy (recipe 3); if the connection hands you usable creds you call the service directly (recipe 6). Pass `agency_chief_id=<user_id>` whenever you'll use the proxy or an MCP tool.

Every snippet below assumes this preamble (imports trimmed per-recipe to what it uses):

```python
import asyncio
import contextlib
import dataclasses
import time
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

with workflow.unsafe.imports_passed_through():
    import boto3
    from pipeline_sdk.activities import prepare_credentials, cleanup_credentials
    from pipeline_sdk.runtime import (
        read_pipeline_secret,
        call_datasource_proxy,
        call_mcp_tool,
        PipelineState,
    )
    from pipeline_sdk.types import PipelineCredentials
```

---

## 0. Minimal smoke test (no credentials)

**When:** verify the whole loop end-to-end — local gate, upload, worker registration, run result — before investing in real logic. Also the cheapest "does the tenant worker even start" probe.

```python
import dataclasses

from temporalio import workflow


@dataclasses.dataclass(frozen=True)
class HelloParams:
    label: str


@workflow.defn(sandboxed=False, name='HelloWorkflow')
class HelloWorkflow:
    @workflow.run
    async def run(self, params: HelloParams) -> dict:
        return {'label': params.label, 'at': workflow.now().isoformat(),
                'run_id': workflow.info().workflow_id}
```

**Key points**
- No activities, no credentials — it exercises only registration and the deterministic primitives (`workflow.now()`, `workflow.info()`).
- Nothing here needs `imports_passed_through()`; add the guard the moment you import SDK / third-party modules (every recipe below does).
- Run it adhoc: `runTemporalPipelineCodeTool({workflow_code, workflow_name: 'HelloWorkflow', params: {label: 'hi'}, wait_for_result: false})` → poll `getTemporalPipelineRunResultTool({run_id})`.

---

## 1. Write a file to S3

**When:** produce an output/intermediate file. Write it under the run's own prefix and the platform lists it for free (`listTemporalPipelineRunArtifactsTool`) — no publish step.

```python
@dataclasses.dataclass
class PutParams:
    creds: PipelineCredentials
    body: str

@activity.defn(name='put_to_run_prefix')
async def put_to_run_prefix(params: PutParams) -> dict:
    secret = await read_pipeline_secret(params.creds)
    s3 = boto3.client(
        's3',
        aws_access_key_id=secret.s3.access_key,
        aws_secret_access_key=secret.s3.secret_key,
        aws_session_token=secret.s3.session_token,
    )
    key = f'{secret.s3.prefix}/output/report.csv'
    body = params.body.encode('utf-8')
    await asyncio.to_thread(
        s3.put_object,
        Bucket=secret.s3.bucket, Key=key, Body=body, ContentType='text/csv',
    )
    return {'bucket': secret.s3.bucket, 'key': key, 'bytes': len(body)}

@workflow.defn(sandboxed=False, name='WriteToS3')
class WriteToS3:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(run_id=run_id, connection_aliases=[])
        try:
            return await workflow.execute_activity(
                'put_to_run_prefix',
                PutParams(creds=creds, body=params.get('body', 'a,b\n1,2\n')),
                start_to_close_timeout=timedelta(minutes=2),
            )
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- Write under `secret.s3.prefix` → WM lists it (ADR-011), read it back with the artifact tools. No `publish_artifact` (deprecated no-op).
- `connection_aliases=[]` — the run prefix needs no connection. You only add an alias when you read a *connection's* creds.
- boto3 is sync → wrap every call in `asyncio.to_thread` so the event loop stays free.
- Writing to a **customer's** S3 instead? Add that connection's alias and pull keys from `secret.connections['<alias>']` (shape is connector-specific — inspect it, don't guess).
- Big file? Don't `put_object` it from RAM — stream it (recipe 5).

**In the wild:** `PutS3FileWorkflow`, `PutToS3WithCreds` (both read creds via the stale `creds.connection_secret()` — the current way is `read_pipeline_secret` as above).

---

## 2. Durable state / incremental cursor

**When:** remember progress across runs — an incremental cursor, last-seen id, or dedup bookmark for a scheduled pipeline.

```python
@dataclasses.dataclass
class CursorParams:
    creds: PipelineCredentials
    key: str
    value: str = ''

@activity.defn(name='state_get')
async def state_get(params: CursorParams) -> str:
    secret = await read_pipeline_secret(params.creds)
    return PipelineState(storage=secret.storage).get(params.key) or ''

@activity.defn(name='state_set')
async def state_set(params: CursorParams) -> str:
    secret = await read_pipeline_secret(params.creds)
    PipelineState(storage=secret.storage).set(params.key, params.value)
    return params.value

@workflow.defn(sandboxed=False, name='IncrementalSync')
class IncrementalSync:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(run_id=run_id, connection_aliases=[])
        try:
            last = await workflow.execute_activity(
                'state_get', CursorParams(creds=creds, key='cursor'),
                start_to_close_timeout=timedelta(minutes=2),
            )
            # ... do the real work strictly after `last`, compute new_cursor ...
            new_cursor = last  # placeholder

            # Advance the cursor ONLY after the work above durably succeeded.
            await workflow.execute_activity(
                'state_set',
                CursorParams(creds=creds, key='cursor', value=new_cursor),
                start_to_close_timeout=timedelta(minutes=2),
            )
            return {'from': last, 'to': new_cursor}
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- `PipelineState` needs `activity.info()` → usable **only inside an activity**, never in the workflow body. Hence the two tiny get/set activities.
- Scoped by `workflow_type` + tenant → the same pipeline shares one cursor across runs. **Values are strings** (serialize numbers/JSON yourself).
- Write the cursor **last**, only after the rows it covers are durably processed. A failure then leaves the old cursor and the next run retries the same window — the single most common state bug is advancing too early. (full semantics + the failure-advance pitfall: `pipeline-state.md`)
- Last-writer-wins, no atomic increment / CAS. Adhoc-run state TTLs after 7 days; scheduled-run state persists.

**In the wild:** DCM `dcm_state_read_cursor` / `dcm_state_write_cursor` (10-day delivery cadence).

---

## 3. Call a connected source's API through the proxy

**When:** hit a provider whose auth the platform holds (OAuth refresh, request signing) — Google Ads, Meta, GCS, etc. — i.e. your own creds aren't enough to reach it.

```python
@dataclasses.dataclass
class FetchParams:
    creds: PipelineCredentials
    connection_id: int

@activity.defn(name='fetch_via_proxy')
async def fetch_via_proxy(params: FetchParams) -> dict:
    secret = await read_pipeline_secret(params.creds)
    if not secret.dts_session_id:
        raise ApplicationError(
            'dts_session_id empty — pass agency_chief_id to prepare_credentials',
            type='ConfigError', non_retryable=True,
        )
    async with call_datasource_proxy(
        dts_session_id=secret.dts_session_id,
        data_source='google_cs',
        connection_id=params.connection_id,
        method='get',
        url='https://storage.googleapis.com/storage/v1/b/my-bucket/o',
        params={'maxResults': '1000'},
    ) as resp:
        if resp.status >= 400:
            text = (await resp.text())[:300]
            if resp.status in (408, 429) or resp.status >= 500:
                raise RuntimeError(f'HTTP {resp.status}: {text}')  # transient — Temporal retries
            raise ApplicationError(  # other 4xx: auth/config — retrying won't help
                f'HTTP {resp.status}: {text}',
                type='SourceClientError', non_retryable=True,
            )
        body = await resp.json()
    return {'items': len(body.get('items', []))}

@workflow.defn(sandboxed=False, name='ProxyFetch')
class ProxyFetch:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(
            run_id=run_id,
            connection_aliases=[{
                'alias': 'src',
                'connection_id': params['connection_id'],
                'type': 'data_source',
            }],
            agency_chief_id=params['user_id'],
        )
        try:
            return await workflow.execute_activity(
                'fetch_via_proxy',
                FetchParams(creds=creds, connection_id=params['connection_id']),
                start_to_close_timeout=timedelta(minutes=10),
                heartbeat_timeout=timedelta(minutes=2),
            )
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- The proxy returns an aiohttp response context manager — consume with `resp.json()` / `resp.text()` / `resp.content.iter_chunked(...)`. For a large body, stream it (recipe 5).
- `dts_session_id` is populated **only if** `agency_chief_id=<user_id>` was passed to `prepare_credentials`; empty → 401.
- Idempotent methods (GET/HEAD/PUT/DELETE) auto-retry gateway 502/503/504; POST/PATCH retry nothing by default (an opaque 5xx might mean the change already applied). Don't hand-roll a read retry loop — pass `retry_statuses=` to override.
- The status routing is C5 in action: 408/429/5xx → plain `raise` (Temporal retries); any other 4xx → `ApplicationError(non_retryable=True)` — a revoked token must not burn the retry budget.
- **Prototype the exact request live with `discoveryRequestTool` first**, then port the shape here — don't guess the provider's URL/params.

**In the wild:** DCM `dcm_stream_manifest` (pages a flat GCS bucket via the proxy).

---

## 4. Call an internal MCP tool (email, ClickHouse, anything in the agent's chat)

**When:** reuse a platform capability the agent already has — send an email, query ClickHouse, list data tables, or call an upstream MCP tool — instead of reimplementing it.

```python
@dataclasses.dataclass
class NotifyParams:
    creds: PipelineCredentials
    recipients: list[str]
    subject: str
    content: str

@activity.defn(name='send_summary_email')
async def send_summary_email(params: NotifyParams) -> dict:
    secret = await read_pipeline_secret(params.creds)
    result = await call_mcp_tool(
        dts_session_id=secret.dts_session_id,
        tool_name='sendEmailTool',
        arguments={
            'subject': params.subject,
            'content': params.content,      # markdown body
            'recipients': params.recipients,
        },
    )
    return {'sent': True, 'result': result}

@workflow.defn(sandboxed=False, name='NotifyByEmail')
class NotifyByEmail:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(
            run_id=run_id, connection_aliases=[],
            agency_chief_id=params['user_id'],
        )
        try:
            return await workflow.execute_activity(
                'send_summary_email',
                NotifyParams(
                    creds=creds, recipients=params['recipients'],
                    subject='Pipeline run summary', content='**Done.**',
                ),
                start_to_close_timeout=timedelta(minutes=2),
            )
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- `call_mcp_tool` reaches **every tool in the agent's chat** — platform tools (`sendEmailTool`, `clickhouseTool`, `queryDestinationTool`, `listDataTablesTool`, `discoveryRequestTool`) and upstream `mcp__<server>__<name>` tools (put `connection_id` inside `arguments`).
- Needs `dts_session_id` → pass `agency_chief_id`. Returns the parsed result (JSON-decoded or raw text); raises `RuntimeError` on a JSON-RPC error.
- ClickHouse in one line: `await call_mcp_tool(dts_session_id=..., tool_name='clickhouseTool', arguments={'query': 'SELECT count() FROM t'})`.
- Don't pass your own `session=` unless you're batching many calls — the helper owns one otherwise.

**In the wild:** DCM `dcm_send_run_email` (hand-rolls the same JSON-RPC POST — `call_mcp_tool` replaces that boilerplate); `DatasourceMonitorWorkflow` (clickhouseTool + listDatasourcesTool + discoveryRequestTool to post a Google-Chat diff).

---

## 5. Stream a large file to S3 (bounded memory, multipart upload)

**When:** move or produce a file too big for RAM or `/tmp` (the pod is 4 GiB RAM / ~5 GiB tmp) — e.g. download a multi-GB export and land it on S3 without ever buffering the whole thing.

```python
_PART = 32 * 1024 * 1024  # 32 MiB. AWS caps an MPU at 10000 parts → up to ~320 GiB.

@dataclasses.dataclass
class CopyParams:
    creds: PipelineCredentials
    connection_id: int
    src_url: str
    out_name: str

@activity.defn(name='stream_to_s3')
async def stream_to_s3(params: CopyParams) -> dict:
    secret = await read_pipeline_secret(params.creds)
    s3 = boto3.client(
        's3',
        aws_access_key_id=secret.s3.access_key,
        aws_secret_access_key=secret.s3.secret_key,
        aws_session_token=secret.s3.session_token,
    )
    bucket = secret.s3.bucket
    key = f'{secret.s3.prefix}/output/{params.out_name}'

    # Idempotency: a Temporal retry must not re-upload a finished object.
    try:
        head = await asyncio.to_thread(s3.head_object, Bucket=bucket, Key=key)
        if int(head.get('ContentLength', 0)) > 0:
            return {'key': key, 'bytes': int(head['ContentLength']), 'skipped': True}
    except s3.exceptions.ClientError as e:
        if e.response['Error']['Code'] not in ('404', 'NoSuchKey'):
            raise  # IAM / throttle / network — don't silently disarm the idempotency guard
        # 404 → not present, create it

    create = await asyncio.to_thread(
        s3.create_multipart_upload, Bucket=bucket, Key=key,
    )
    upload_id = create['UploadId']
    parts: list[dict] = []
    buf = bytearray()
    last_hb = time.monotonic()
    try:
        async with call_datasource_proxy(
            dts_session_id=secret.dts_session_id,
            data_source='google_cs', connection_id=params.connection_id,
            method='get', url=params.src_url,
            params={'alt': 'media'}, request_timeout=900.0,
        ) as resp:
            if resp.status >= 400:
                text = (await resp.text())[:300]
                if resp.status in (408, 429) or resp.status >= 500:
                    raise RuntimeError(f'HTTP {resp.status}: {text}')
                raise ApplicationError(
                    f'HTTP {resp.status}: {text}',
                    type='SourceClientError', non_retryable=True,
                )
            async for chunk in resp.content.iter_chunked(5 * 1024 * 1024):
                buf.extend(chunk)
                if len(buf) >= _PART:
                    pno = len(parts) + 1
                    r = await asyncio.to_thread(
                        s3.upload_part, Bucket=bucket, Key=key,
                        PartNumber=pno, UploadId=upload_id, Body=bytes(buf),
                    )
                    parts.append({'PartNumber': pno, 'ETag': r['ETag']})
                    buf.clear()
                now = time.monotonic()
                if now - last_hb >= 20.0:
                    activity.heartbeat({'parts': len(parts)})
                    last_hb = now

        # Final tail (< part size). Also the *only* part for a small input.
        if buf:
            pno = len(parts) + 1
            r = await asyncio.to_thread(
                s3.upload_part, Bucket=bucket, Key=key,
                PartNumber=pno, UploadId=upload_id, Body=bytes(buf),
            )
            parts.append({'PartNumber': pno, 'ETag': r['ETag']})

        await asyncio.to_thread(
            s3.complete_multipart_upload, Bucket=bucket, Key=key,
            UploadId=upload_id, MultipartUpload={'Parts': parts},
        )
    except BaseException:
        with contextlib.suppress(Exception):
            await asyncio.to_thread(
                s3.abort_multipart_upload,
                Bucket=bucket, Key=key, UploadId=upload_id,
            )
        raise
    return {'key': key, 'parts': len(parts)}

@workflow.defn(sandboxed=False, name='StreamToS3')
class StreamToS3:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(
            run_id=run_id,
            connection_aliases=[{
                'alias': 'src', 'connection_id': params['connection_id'],
                'type': 'data_source',
            }],
            agency_chief_id=params['user_id'],
        )
        try:
            return await workflow.execute_activity(
                'stream_to_s3',
                CopyParams(
                    creds=creds, connection_id=params['connection_id'],
                    src_url=params['src_url'], out_name=params['out_name'],
                ),
                start_to_close_timeout=timedelta(hours=2),
                heartbeat_timeout=timedelta(minutes=5),
            )
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- Memory is bounded to ~one part (32 MiB) + one read chunk — the whole file never lands in RAM, nothing touches `/tmp`.
- **Part size 32 MiB on purpose:** AWS caps an MPU at 10000 parts, so 32 MiB → ~320 GiB headroom; at 8 MiB a big file blows the cap and `complete_multipart_upload` fails with an opaque error.
- **Heartbeat from inside the read loop** (throttled by `time.monotonic()`) *and* set `heartbeat_timeout` on the activity — a long silent upload gets cancelled.
- **Abort on any failure** (no leaked incomplete-MPU storage) and **HEAD-check first** for idempotency: a part uploaded mid-stream can't be retried in place, so let the whole activity restart with a fresh MPU rather than retrying inside it.
- boto3 is sync → every call goes through `asyncio.to_thread`, keeping the read loop and heartbeat responsive.
- **Transforming mid-stream with a sync library** (gunzip, CSV reparse)? Run the parser in one `to_thread` fed by a bounded `queue.Queue`, and let only that thread touch the buffer/parts. See DCM `_QueueReader` + `_stream_one_file` for the async-producer ↔ sync-parser bridge.

**In the wild:** DCM `dcm_stream_concat_table` (stitches ~150 GiB across 26 tables into per-table CSVs on S3, 26 activities in parallel, each bounded to ~16 MiB).

---

## 6. Query / write a warehouse with its native driver

**When:** the connection hands you usable creds (a service-account JSON, a key pair) and you talk to the service directly — BigQuery, Snowflake, Postgres, ClickHouse, S3 — no proxy needed.

```python
@dataclasses.dataclass
class QueryParams:
    creds: PipelineCredentials

@activity.defn(name='run_bq_job')
async def run_bq_job(params: QueryParams) -> dict:
    from google.cloud import bigquery
    from google.oauth2 import service_account

    secret = await read_pipeline_secret(params.creds)
    sa_info = secret.connections['warehouse']   # connector-specific creds dict
    credentials = service_account.Credentials.from_service_account_info(
        sa_info, scopes=['https://www.googleapis.com/auth/bigquery'],
    )
    client = bigquery.Client(
        project=sa_info.get('project_id'), credentials=credentials,
    )
    rows = await asyncio.to_thread(
        lambda: [dict(r) for r in client.query('SELECT 1 AS x').result(timeout=600)],
    )
    return {'rows': rows}

@workflow.defn(sandboxed=False, name='WarehouseQuery')
class WarehouseQuery:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(
            run_id=run_id,
            connection_aliases=[{
                'alias': 'warehouse',
                'connection_id': params['connection_id'],
                'type': 'destination',
            }],
        )
        try:
            return await workflow.execute_activity(
                'run_bq_job', QueryParams(creds=creds),
                start_to_close_timeout=timedelta(minutes=50),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- Read the connection's creds from `secret.connections['<alias>']` and feed your native client. No `dts_session_id` / proxy here — you already hold the creds. (No `agency_chief_id` needed unless you *also* use the proxy or an MCP tool.)
- The cred dict's shape is **connector-specific** — inspect it / probe it, don't hard-code keys you haven't seen.
- Native clients are sync → wrap calls in `asyncio.to_thread`; set the client's own `max_retries=0` and let Temporal's `retry_policy` own retries.
- For a quick ClickHouse **read**, `clickhouseTool` via `call_mcp_tool` (recipe 4) is simpler; reach for the native driver when you need a real connection — writes, big jobs, non-CH warehouses.

**In the wild:** `IntuitPagesQueryRefresh` (BigQuery `CREATE OR REPLACE TABLE` — note it uses a stale creds API; the current way is `read_pipeline_secret` + `secret.connections[alias]` as above).

---

## 7. Resumable long activity (heartbeat progress + cancellation cleanup)

**When:** one activity grinds through a long list/stream (>30 min) and a worker restart, a retry, or a `CANCEL_OTHER` schedule must not redo finished work or leave partial garbage behind.

```python
@dataclasses.dataclass
class BatchParams:
    creds: PipelineCredentials
    items: list[str]

@activity.defn(name='process_batch')
async def process_batch(params: BatchParams) -> dict:
    # Resume point: heartbeat_details of the PREVIOUS attempt survive into the retry.
    details = activity.info().heartbeat_details
    done = int(details[0]) if details else 0
    activity.logger.info('process_batch start: %d items, resuming at %d', len(params.items), done)

    last_hb = time.monotonic()
    try:
        for i in range(done, len(params.items)):
            # ... process params.items[i] — idempotent, or persist per-item completion ...
            done = i + 1
            now = time.monotonic()
            if now - last_hb >= 20.0:
                activity.heartbeat(done)   # the payload IS the resume point
                activity.logger.info('progress: %d/%d', done, len(params.items))
                last_hb = now
    except asyncio.CancelledError:
        # Delivered on a heartbeat call when the workflow/schedule cancels this run.
        activity.logger.warning('cancelled at %d/%d — cleaning up partial writes', done, len(params.items))
        # ... clean up partial writes (abort MPU, delete temp keys, …) ...
        raise  # MUST re-raise — swallowing it makes Temporal record success
    activity.logger.info('process_batch done: %d/%d items', done, len(params.items))
    return {'processed': done}
```

Workflow side:

```python
r = await workflow.execute_activity(
    'process_batch', BatchParams(creds=creds, items=items),
    start_to_close_timeout=timedelta(hours=4),
    heartbeat_timeout=timedelta(minutes=5),
    retry_policy=RetryPolicy(maximum_attempts=3),
)
```

**Key points**
- `activity.heartbeat(progress)` does two jobs: liveness (vs `heartbeat_timeout`) and the resume point — the next attempt reads `activity.info().heartbeat_details` and skips finished work. A heartbeat **without** a payload means every retry restarts from item 0.
- Throttle by `time.monotonic()` from inside the data loop — never a parallel `sleep()` heartbeat task (it wakes late under GIL pressure and Temporal cancels a live activity).
- Cancellation arrives as `asyncio.CancelledError` **on a heartbeat call** — an activity that never heartbeats is uncancellable. Clean up, then re-raise.
- The resume index is only as good as item idempotency: if reprocessing an item is unsafe, persist per-item completion markers (S3 key / `PipelineState`) instead of a bare index.
- The `activity.logger` lines at start / progress / cancel / end are the logging shape (`code-conventions.md` L1–L4): these are exactly what `getTemporalPipelineRunLogsTool` shows when the run misbehaves. Piggyback the progress log on the heartbeat throttle — never log per item.

---

## 8. Parallel fan-out with bounded failure

**When:** push/process per platform / per workspace / per table in parallel, where one branch failing must not abort the rest — and one stuck branch must not hold the workflow open forever.

```python
@dataclasses.dataclass
class PushParams:
    creds: PipelineCredentials
    platform: str

@dataclasses.dataclass
class PushResult:
    platform: str
    pushed: int

@workflow.defn(sandboxed=False, name='FanOutSync')
class FanOutSync:
    @workflow.run
    async def run(self, params: dict) -> dict:
        run_id = workflow.info().workflow_id
        creds = await prepare_credentials(
            run_id=run_id, connection_aliases=[],  # add the aliases your branches need
        )
        try:
            platforms: list[str] = params['platforms']
            results = await asyncio.gather(
                *[
                    workflow.execute_activity(
                        'push_to_platform',
                        PushParams(creds=creds, platform=p),
                        start_to_close_timeout=timedelta(minutes=10),    # one attempt
                        schedule_to_close_timeout=timedelta(minutes=30), # ALL attempts — bounds a stuck branch
                        retry_policy=RetryPolicy(maximum_attempts=3),
                        result_type=PushResult,
                    )
                    for p in platforms
                ],
                return_exceptions=True,
            )
            ok = [p for p, r in zip(platforms, results) if not isinstance(r, BaseException)]
            failed = {p: str(r) for p, r in zip(platforms, results) if isinstance(r, BaseException)}
            return {'ok': ok, 'failed': failed}
        finally:
            await cleanup_credentials(run_id=run_id, vault_token=creds.vault_token)
```

**Key points**
- `return_exceptions=True` or the first failure cancels every other in-flight branch.
- BOTH timeouts: `start_to_close_timeout` bounds one attempt, `schedule_to_close_timeout` bounds attempts + retries — without it one stuck branch holds the whole `gather` open indefinitely.
- Report per-branch success/failure in the result — a fan-out that returns only "done" hides partial failure from the user and the schedule history.
- Width: branches compete for the **≤4 concurrent activity slots** on a 4 GiB pod (skill §3) — dozens queue fine, but per-activity peak RAM × 4 must fit. Hundreds+ of small items → batch into fewer activities (`code-conventions.md` T3); fan-out is for a handful of chunky, independent branches.
- All branches run in the same worker process — cache the secret at module level instead of `read_pipeline_secret()` per branch (HTTP 429 from Vault otherwise; `code-conventions.md` E5).

---

## See also

- `reusable-activities.md` — `les_extract` / `ch_load` / `register_data_table` / `prepare_credentials` / `cleanup_credentials`: never hand-roll source extraction or CH loading when a wrapper exists.
- `pipeline-state.md` — full `PipelineState` semantics (recipe 2).
- `debugging-and-troubleshooting.md` — when a recipe misbehaves at runtime (OOM, heartbeat loss, 401, empty artifacts).
- `code-conventions.md` — every rule these recipes embody, plus the verification protocol the skeptic runs against your `.py`.
- The `temporal-pipelines` skill — runtime-limits budget and the create/iterate/run flow.
