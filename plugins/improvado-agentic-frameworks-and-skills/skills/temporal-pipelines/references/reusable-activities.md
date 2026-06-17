# Temporal Pipelines — Reusable SDK Activities (catalog)

Shared reference for **both** the `temporal-pipelines` skill and the verification sub-agent. These are the activities `pipeline_sdk` **provides** — import and `await` them instead of hand-rolling source extraction, ClickHouse loading, credentials, or table registration. Keep this catalog in sync with the SDK (see *Stay current* — verify signatures against source, never guess).

**Source:** `temporal-workflow-worker/pipeline-sdk/src/pipeline_sdk/activities/` (`__init__.py`, `les.py`, `ch.py`, `data_table.py`, `credentials.py`) + `types.py`, read 2026-06-09.

Import inside the guard:

```python
with workflow.unsafe.imports_passed_through():
    from pipeline_sdk.activities import (
        prepare_credentials, cleanup_credentials,
        les_extract, ch_load, register_data_table,
    )
    from pipeline_sdk.types import DateRangeRequest, DateRangeType
```

## ⚠️ These are NOT your custom `@activity.defn`

Every wrapper here is **Nexus-backed** and called as a plain `await fn(...)` from `@workflow.run` — **not** through `workflow.execute_activity('name', …)`. Consequences:

- **Do NOT** pass `task_queue=`, `result_type=`, `start_to_close_timeout=`, or `retry_policy=` — each wrapper owns its endpoint, timeout, and retries internally (e.g. `les_extract` 48 h, `ch_load` 2 h envelopes).
- **Tenant comes from the workflow's `x-tenant-id` header** — there is no `agency_uuid`/`workspace_id` argument and you cannot target another tenant.
- Contrast: *your own* `@activity.defn` helpers ARE invoked via `workflow.execute_activity('string_name', …, result_type=…)` — see the skill §4.4. Mixing the two up is a common bug: `workflow.execute_activity('les_extract', …)` will NOT work.

## The catalog

### `prepare_credentials` / `cleanup_credentials` — credential lifecycle

```python
creds = await prepare_credentials(
    run_id: str,                       # workflow.info().workflow_id
    connection_aliases: list[dict],    # [{'alias','connection_id','type'}], match the pipeline's connection_ids
    *, agency_chief_id: int | None = None,  # set → secret.dts_session_id populated (needed for the data-source proxy)
) -> PipelineCredentials                # (secret_path, vault_token, s3_bucket, s3_prefix)

await cleanup_credentials(run_id: str, vault_token: str = '') -> None   # in finally
```

Reserves a Vault secret + scoped S3 prefix; revoke in `finally`. Read the actual secret with `read_pipeline_secret(creds)` (a `pipeline_sdk.runtime` helper, not an activity) → `PipelineSecret(connections, storage, dts_session_id, s3)`. Full credential rules + the try/finally template live in the skill §4.4 / §6.1. **Only needed if your own activities read connection secrets or write to the run's S3 prefix** — `les_extract`/`ch_load`/`register_data_table` below need no `creds` argument.

### `les_extract` — extract from an Improvado-connected source via LES

```python
les = await les_extract(
    connector_id: int,
    data_source: str,                  # e.g. 'facebook', 'google_ads'
    report_type: str,                  # e.g. 'ad_insights'
    date_range: DateRangeRequest | None = None,
    fields: list[str] | None = None,
    args: dict | None = None,
    hashed_fields: list[str] | None = None,
    save_raw_data: bool = False,
    raw_responses_exclude_request: bool = False,
) -> LesActivityWithS3Result           # .data_ref (DataRef→S3), .result_stage_has_data (bool|None)
```

Runs the LES extraction and stages the result in S3. `date_range=DateRangeRequest(date_range_type=DateRangeType.AUTO, params={...})` — `DateRangeType` ∈ `LIVE/AUTO/MANUAL/MAX/SYNC_HISTORICAL/CUSTOM/CUSTOM_REFRESH_WINDOW/LIFETIME`; the `params` shape depends on the type (probe / check LES docs, don't guess). **Always gate the load on `les.result_stage_has_data`** — an empty extract has no data to load.

### `ch_load` — load a LES extraction result into ClickHouse

```python
load = await ch_load(
    les_result: LesActivityWithS3Result,   # positional — the les_extract output
    *, data_source: str, report_type: str, account_id: str,
) -> PipelineLoadResult                    # error, inserted_rows, deleted_rows, processed_rows,
                                           # updated_rows, duplicate_rows, actual_date_from/to (date)
```

Pairs with `les_extract`. The write method / scope / dedup come from the LES result's report-type metadata — you don't specify them. Check `load.error` and the row counts.

### `register_data_table` — make a pipeline-produced CH table visible to the platform

```python
table = await register_data_table(
    *, sql_name: str,
    source_connection_ids: list[int] | None = None,
    source_tables: list[tuple[str, str]] | None = None,   # [(database, table), …] — feeds lineage
    recipe_id: str | None = None, recipe_name: str | None = None,
) -> DataTableRegistration                                 # data_table_id, sql_name, database, freshness
```

Upserts the DTS `DataTable` row, syncs the schema (DTS reads it via `DESCRIBE TABLE`), refreshes freshness, draws Marquez lineage. **The table must already exist in ClickHouse** — write it first (a custom activity, or `ch_load`), then register. `run_id`/`workflow_type` are read from `workflow.info()` — don't pass them.

## Canonical LES → CH pattern

```python
@workflow.defn(sandboxed=False, name='FacebookAdsToCH')
class FacebookAdsToCH:
    @workflow.run
    async def run(self, params: Params) -> dict:
        les = await les_extract(
            connector_id=params.connector_id,
            data_source='facebook',
            report_type='ad_insights',
            date_range=DateRangeRequest(date_range_type=DateRangeType.AUTO, params={}),
        )
        if not les.result_stage_has_data:
            return {'rows': 0, 'note': 'no data in range'}
        load = await ch_load(
            les, data_source='facebook', report_type='ad_insights',
            account_id=params.account_id,
        )
        return {'inserted': load.inserted_rows,
                'date_from': load.actual_date_from.isoformat()}
```

No `prepare_credentials` here — the three wrappers are tenant-scoped via the header. Add `prepare_credentials`/`cleanup_credentials` (try/finally) only when you also run custom activities that read connection secrets or write to `secret.s3.prefix`.

## When to use a wrapper vs your own activity

| Need | Use |
|---|---|
| Pull data from an Improvado-connected source | `les_extract` — never hand-roll the source API |
| Load an extraction into the customer's ClickHouse | `ch_load` |
| Register a table your pipeline produced so the platform can see/load it | `register_data_table` (after the table exists in CH) |
| Transform, custom HTTP, S3 shuffling, anything else | your own `@activity.defn` (skill §4.4) |

## Stay current — don't trust this catalog blindly

The SDK evolves; verify before relying on an arg you don't see used in a working pipeline:

```bash
python -c "import pipeline_sdk.activities as a; print(a.__all__)"
python -c "import inspect, pipeline_sdk.activities as a; print(inspect.signature(a.les_extract))"
# or read the source directly:
cat .../pipeline_sdk/activities/{les,ch,data_table,credentials}.py
```

If the source and this file disagree, **trust the source** and update this file (and tell the user so the catalog gets fixed).

## Verification checks (for the skeptic sub-agent)

- `les_extract` / `ch_load` / `register_data_table` / `prepare_credentials` / `cleanup_credentials` are called as `await fn(...)`, **never** via `workflow.execute_activity('…')`.
- No `task_queue=` / `result_type=` / `start_to_close_timeout=` / `retry_policy=` on these wrappers.
- `ch_load` is guarded by `if les.result_stage_has_data:` (or equivalent).
- `register_data_table` is called **after** the table is written to CH, not before.
- These wrappers are imported from `pipeline_sdk.activities`, not redefined; tenant is never passed as an argument.
- `prepare_credentials` present iff custom activities need secrets/S3; `cleanup_credentials` in `finally`.

## See also

- `cookbook.md` — runnable recipes (S3 write, state cursor, data-source proxy, MCP-tool call, large-file streaming MPU, native warehouse driver).
- `pipeline-state.md` — durable cursors/bookmarks (often paired with `les_extract` incremental).
- `debugging-and-troubleshooting.md` — run-file inspection, symptom table.
- `code-conventions.md` — the authoring rules (T2 covers how these wrappers differ from string-name activities) + the skeptic's verification protocol.
- The `temporal-pipelines` skill — credential lifecycle and the create/iterate/run flow.
