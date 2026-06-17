# Temporal Pipelines — `PipelineState`

Shared reference for **both** the `temporal-pipelines` skill (authoring a stateful pipeline) and the verification sub-agent (the checks at the bottom). `PipelineState` is a ClickHouse-backed, per-pipeline key/value store for durable cursors, bookmarks, dedup sets, and small counters that must survive across runs.

Use it for: incremental-extract cursors (`updated_at > last_cursor`), "already-seen" dedup keys, last-success timestamps, lightweight run-to-run counters. **Not** for: heavy data between steps within one run — that's a `DataRef` to S3 (see the skill's data-passing section).

## Init — from the secret, nothing else

```python
from pipeline_sdk.runtime import read_pipeline_secret, PipelineState

secret = await read_pipeline_secret(params.creds)
state = PipelineState(storage=secret.storage)
```

Pass only `StorageCredentials` from `read_pipeline_secret(...)`. **Do NOT pass `pipeline_id`** — the row key is built automatically from `activity.info().workflow_type` + `get_current_tenant().path_prefix`. Passing it manually is wrong.

## Scoping — per workflow class + tenant

State is keyed by `(@workflow.defn(name=X), agency_uuid, workspace_id)`. The **same** `name=X` running for the **same** agency/workspace shares state across runs — that's what makes a cursor durable. Two pipelines with different `name=` never see each other's state; the same pipeline in another tenant is isolated.

Adhoc runs (`workflow_id` starts with `adhoc-`) and saved-pipeline runs share the same bucket, but only adhoc rows carry a **7-day TTL** — saved-pipeline state persists indefinitely. So a value written by a throwaway `runTemporalPipelineCodeTool` test disappears after a week; a saved pipeline's cursor does not.

## API — synchronous, no `await`

| Call | Returns | Notes |
|---|---|---|
| `state.get(key)` | `str \| None` | single key; `None` if absent |
| `state.get()` | `dict[str, str]` | all keys for this workflow + tenant |
| `state.set(key, value)` | — | single upsert; `value` MUST be `str` |
| `state.set({'k': 'v', …})` | — | bulk upsert |
| `state.delete(key)` | — | tombstone one key (writes an empty value) |
| `state.delete()` | — | tombstone all keys for this workflow + tenant |

The methods are **synchronous** — call them directly inside an `@activity.defn`, no `await`. (They do blocking ClickHouse I/O; that's fine inside an activity, just don't call them from `@workflow.run`.)

## Value contract — everything is a string

Values are stored as ClickHouse `String` columns. **Serialize yourself** before `set` and parse on `get`:

```python
import json

state.set('last_cursor', new_cursor)                  # already a str — fine
state.set('counts', json.dumps({'ok': 12, 'err': 3})) # dict → json.dumps
state.set('n', str(n))                                 # int → str

raw = state.get('counts')
counts = json.loads(raw) if raw else {}
```

## Concurrency — last-writer-wins, no atomics

Backed by `ReplacingMergeTree(updated_at)`: if two activities write the same key concurrently, the later `updated_at` wins — the other write is silently dropped. There is **no CAS, no atomic increment**. For a counter under fan-out, don't have N parallel activities each do `get → +1 → set` (they'll clobber each other). Aggregate in memory inside **one** activity and write once. This pairs with the fan-out rule of reading the secret once (see `debugging-and-troubleshooting.md`, the Vault-429 row).

## Cursor correctness — advance only after durable processing

The classic bug: write the new cursor before the rows it covers are safely processed, then the activity fails — next run starts past unprocessed rows and silently skips data. Order it so the cursor moves **last**:

```python
@activity.defn(name='extract_incremental')
async def extract_incremental(params: IncrementalParams) -> IncrementalResult:
    secret = await read_pipeline_secret(params.creds)
    state = PipelineState(storage=secret.storage)

    cursor = state.get('last_cursor') or '1970-01-01T00:00:00Z'

    # 1. extract rows WHERE updated_at > cursor
    # 2. process + write them durably (e.g. stream to S3 / load to destination)
    # 3. ONLY THEN advance the cursor:
    processed: list[dict] = []  # ← filled by steps 1–2 in real code
    new_cursor = max((r['updated_at'] for r in processed), default=cursor)
    rows = len(processed)

    state.set('last_cursor', new_cursor)
    return IncrementalResult(rows=rows, new_cursor=new_cursor)
```

If processing can partially fail, make it idempotent (overwrite by key / dedup on load) so a retry that re-reads from the un-advanced cursor doesn't double-count.

## Reading state from outside the workflow

Same table, plain SQL via `clickhouseTool` — handy for debugging "what's the current cursor?":

```sql
SELECT key, value
FROM _custom_pipeline_state FINAL
WHERE pipeline_id = '{workflow_name}:{agency_uuid}/{workspace_id}'
  AND value != ''
```

`FINAL` collapses the ReplacingMergeTree to the latest value; `value != ''` filters tombstones.

## Verification checks (for the skeptic sub-agent)

- `PipelineState(storage=secret.storage)` — initialized from the secret; **`pipeline_id` never passed** manually.
- Every value written is a `str` (`json.dumps(...)` / `str(n)` applied); reads parse back.
- `state.*` called inside an `@activity.defn`, not from `@workflow.run`; no `await` on `get`/`set`/`delete`.
- No atomic-increment assumption across fan-out — counters aggregated in one activity, not N parallel `get→+1→set`.
- Incremental cursor is advanced **after** the covered rows are durably processed, not before; processing is idempotent or the cursor is per-batch.
- Secret read once + cached if the activity fans out (cross-check with `debugging-and-troubleshooting.md`).

## See also

- `debugging-and-troubleshooting.md` — the cursor-advanced-too-early symptom and the Vault-429 fan-out row.
- `code-conventions.md` — the authoring rules + the skeptic's verification protocol.
- `cookbook.md` recipe 2 — the runnable incremental-cursor shape.
- The `temporal-pipelines` skill — `PipelineState` in the import map (§4.2).
