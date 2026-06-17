#!/usr/bin/env python3
"""
Notebook Editor API Client
Manages notebook/recipe cells via Improvado API
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import Dict, Any, Optional, List
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')
load_dotenv('.env')

# ============ Config ============
PLATFORM_HOST = os.getenv('NEXT_PUBLIC_AI_AGENT_BASE_URL', 'https://report.improvado.io')
SESSION_ID = os.getenv('NEXT_PUBLIC_DTS_SESSION_ID', '')
WORKSPACE_ID = os.getenv('NEXT_PUBLIC_WORKSPACE_ID', '')
DATABASE_SCHEMA = os.getenv('NEXT_PUBLIC_DATABASE_SCHEMA', '')

# Temporary directory for notebook cell files
# Uses client-specific directory to comply with sandbox security restrictions
def get_temp_dir(database_schema: str) -> str:
    """
    Get temporary directory path based on database schema.

    Args:
        database_schema: Agency database schema (e.g., 'im_10836_2de')

    Returns:
        Path to temp directory in client folder
    """
    if database_schema:
        # Use client-specific temp directory in sandbox environment
        return f'/workspace/clients/{database_schema}/temp'
    else:
        # Fallback to local ./temp for development (not recommended for sandbox)
        print("⚠️  WARNING: database_schema not provided, using local ./temp", file=sys.stderr)
        print("⚠️  This may cause 'Write/Edit to non-client folder blocked' errors in sandbox!", file=sys.stderr)
        return './temp'

def ensure_temp_dir(temp_dir: str):
    """Create temp directory if it doesn't exist"""
    Path(temp_dir).mkdir(parents=True, exist_ok=True)

def resolve_file_path(file_path: str, database_schema: str) -> str:
    """
    Resolve file path - if relative, use client temp dir, if absolute, use as is.
    Ensures temp directory exists.

    Args:
        file_path: File path (relative or absolute)
        database_schema: Agency database schema for temp directory path

    Returns:
        Resolved absolute file path
    """
    if not file_path:
        return file_path

    path = Path(file_path)

    # If absolute path, use as is
    if path.is_absolute():
        return file_path

    # If relative path, use client-specific temp directory
    temp_dir = get_temp_dir(database_schema)
    ensure_temp_dir(temp_dir)
    return str(Path(temp_dir) / file_path)

# ============ API Helpers ============
def fetch_notebook_api(endpoint: str, method: str = 'GET', data: Optional[Dict] = None) -> Any:
    """Execute request to Notebook API"""
    if not SESSION_ID:
        print("❌ Missing NEXT_PUBLIC_DTS_SESSION_ID in environment", file=sys.stderr)
        sys.exit(1)

    url = f"{PLATFORM_HOST}/ai-assistant-backend{endpoint}"

    headers = {
        'Content-Type': 'application/json',
        'Cookie': f'dts_sessionid={SESSION_ID}',
        'X-IM-WORKSPACE-ID': WORKSPACE_ID,
    }

    print(f"🌐 {method} {url}", file=sys.stderr)

    try:
        if method == 'GET':
            response = requests.get(url, headers=headers)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data)
        elif method == 'PUT':
            response = requests.put(url, headers=headers, json=data)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")

        response.raise_for_status()

        # Try to parse JSON
        try:
            return response.json()
        except json.JSONDecodeError:
            return response.text

    except requests.exceptions.HTTPError as e:
        print(f"❌ API Error ({response.status_code}): {response.text}", file=sys.stderr)
        raise
    except requests.exceptions.RequestException as e:
        print(f"❌ Request Error: {e}", file=sys.stderr)
        raise

# ============ Frontend Commands ============
def send_frontend_command(action: str, payload: dict):
    """Output command in special format for frontend stream handler (iframe control)"""
    command = {
        "type": "frontend_command",
        "command": {
            "action": action,
            "payload": payload,
            "timestamp": int(time.time() * 1000)
        }
    }
    print(f"{{FRONTEND_COMMAND:{json.dumps(command)}:FRONTEND_COMMAND}}")
    sys.stdout.flush()


# ============ Commands ============

def cmd_list(args):
    """Show list of all cells in notebook"""
    notebook_id = args.notebook_id

    print(f"🌐 Fetching notebook {notebook_id}...", file=sys.stderr)
    data = fetch_notebook_api(f'/api/notebook/v3/{notebook_id}/runs?last_cell_run_data_only=true')

    # V3 API returns cells as dictionary with cell_id keys
    cells_dict = data.get('cells', {})

    print(f"Notebook: {notebook_id}")
    if data.get('title'):
        print(f"Title: {data['title']}")
    if data.get('view_name'):
        print(f"View: {data['view_name']}")
    if data.get('state'):
        print(f"State: {data['state']}")
    if data.get('last_run_status'):
        print(f"Last run status: {data['last_run_status']}")
    print(f"Cells: {len(cells_dict)}\n")

    for idx, (cell_id, cell_data) in enumerate(cells_dict.items()):
        cell_type = cell_data.get('cell_type', 'unknown')
        title = cell_data.get('title', '')
        print(f"[{idx}] {cell_id}")
        print(f"    Type: {cell_type}")
        if title:
            print(f"    Title: {title}")

        # Extract info from the latest cell run
        cell_runs = cell_data.get('cell_runs', {})
        if cell_runs:
            # Get the highest-numbered run (latest)
            last_run_key = max(cell_runs.keys(), key=lambda k: int(k) if k.isdigit() else -1)
            last_run = cell_runs.get(last_run_key, {})

            if isinstance(last_run, dict):
                for run_id, run_entry in last_run.items():
                    if not isinstance(run_entry, dict):
                        continue
                    entry_type = run_entry.get('type', '')
                    entry_data = run_entry.get('data', {})

                    if not isinstance(entry_data, dict):
                        continue

                    block_title = entry_data.get('title', '')
                    block_type = entry_data.get('type', '')
                    block_data = entry_data.get('data', '')

                    # Show errors (SQL Issue, Error, etc.)
                    if block_type == 'sql' and block_title in ('SQL Issue', 'Error'):
                        error_text = str(block_data)[:500] if block_data else ''
                        print(f"    ERROR: {error_text}")

                    # Show generated SQL (truncated)
                    if block_title == 'SQL' and block_type == 'sql' and entry_type == 'block':
                        sql_text = str(block_data)[:300] if block_data else ''
                        print(f"    Generated SQL: {sql_text}...")

        print()




def cmd_run_from_file(args):
    """Run cell from file (after editing)"""
    file_path = resolve_file_path(args.file, args.database_schema)
    cell_id = args.cell_id
    notebook_id = args.notebook_id

    # Read cell from file
    cell = json.loads(Path(file_path).read_text(encoding='utf-8'))

    # Check that cell_id matches
    if cell.get('cell_id') != cell_id:
        print(f"⚠️  Warning: file cell_id ({cell.get('cell_id')}) != provided cell_id ({cell_id})", file=sys.stderr)
        print(f"    Using provided cell_id: {cell_id}", file=sys.stderr)

    # Convert content to JSON string if it's an object
    content = cell.get('content', {})
    if isinstance(content, dict) or isinstance(content, list):
        content_str = json.dumps(content, ensure_ascii=False)
    else:
        content_str = str(content)

    # Form payload
    payload = {
        'notebook_id': notebook_id,
        'cell_id': cell_id,
        'cell_type': cell.get('cell_type'),
        'content': content_str,
    }

    if cell.get('context'):
        payload['context'] = cell['context']

    print(f"🚀 Running cell {cell_id} in notebook {notebook_id}...", file=sys.stderr)

    result = fetch_notebook_api('/api/notebook/v4/run', method='POST', data=payload)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("✅ Cell executed successfully", file=sys.stderr)


def cmd_get_cell(args):
    """Get specific cell from notebook"""
    notebook_id = args.notebook_id
    cell_id = args.cell_id
    save_to_file = args.save_to_file
    database_schema = args.database_schema

    # GET /api/notebook/v3/{notebook_id}/cells/{cell_id}
    data = fetch_notebook_api(f'/api/notebook/v3/{notebook_id}/cells/{cell_id}')

    # V3 API returns content as JSON string, parse it to object
    if 'content' in data and isinstance(data['content'], str):
        try:
            data['content'] = json.loads(data['content'])
        except json.JSONDecodeError:
            print(f"⚠️  Warning: content is not valid JSON", file=sys.stderr)

    # Normalize structure: id -> cell_id for compatibility
    if 'id' in data and 'cell_id' not in data:
        data['cell_id'] = data['id']

    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    if save_to_file:
        # Resolve path - use client temp dir for relative paths
        resolved_path = resolve_file_path(save_to_file, database_schema)
        Path(resolved_path).write_text(json_str, encoding='utf-8')
        print(resolved_path)  # stdout for skill (full path)
        print(f"✅ Saved cell to {resolved_path}", file=sys.stderr)
    else:
        print(json_str)

    # Additional information in stderr
    print(f"  - cell_id: {data.get('cell_id') or data.get('id')}", file=sys.stderr)
    print(f"  - cell_type: {data.get('cell_type')}", file=sys.stderr)
    if data.get('title'):
        print(f"  - title: {data.get('title')}", file=sys.stderr)


def cmd_datasources(args):
    """List available datasources (tables) for a cell"""
    notebook_id = args.notebook_id
    cell_id = args.cell_id

    endpoint = f'/api/autocomplete/v2/datasources/?notebook_id={notebook_id}'
    if cell_id:
        endpoint += f'&cell_id={cell_id}&is_wizard=true'

    print(f"📋 Fetching available datasources...", file=sys.stderr)
    data = fetch_notebook_api(endpoint)

    if not isinstance(data, list):
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return

    print(f"Available datasources: {len(data)}\n")

    for item in data:
        table_name = item.get('table_name', '')
        title = item.get('title', '')
        # Mark virtual cell tables
        is_cell_ref = table_name.startswith('cell_')
        marker = ' [CELL OUTPUT]' if is_cell_ref else ''
        print(f"  {table_name}{marker}")
        if title:
            print(f"    Title: {title}")

    # Also output raw JSON to stdout for programmatic use
    print("\n--- RAW JSON ---")
    print(json.dumps(data, indent=2, ensure_ascii=False))


def cmd_columns(args):
    """List columns for a specific table"""
    table_name = args.table_name
    notebook_id = args.notebook_id

    endpoint = f'/api/autocomplete/v2/columns/?table_name={table_name}&notebook_id={notebook_id}'

    print(f"📋 Fetching columns for {table_name}...", file=sys.stderr)
    data = fetch_notebook_api(endpoint)

    if not isinstance(data, list):
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return

    print(f"Columns for {table_name}: {len(data)}\n")

    for col in data:
        col_name = col.get('column_name', '')
        col_type = col.get('type', '')
        print(f"  {col_name}: {col_type}")

    # Also output raw JSON to stdout for programmatic use
    print("\n--- RAW JSON ---")
    print(json.dumps(data, indent=2, ensure_ascii=False))


def cmd_insert_cell(args):
    """Insert a new cell after a specific cell, updating downstream references"""
    file_path = resolve_file_path(args.file, args.database_schema)
    notebook_id = args.notebook_id

    # Read the insert payload from file
    data = json.loads(Path(file_path).read_text(encoding='utf-8'))

    # Build the API payload
    new_cell = data.get('new_cell', {})

    # Stringify new_cell content if needed
    if 'content' in new_cell:
        content = new_cell['content']
        if isinstance(content, dict) or isinstance(content, list):
            new_cell['content'] = json.dumps(content, ensure_ascii=False)

    # Stringify cells_to_update content if needed
    cells_to_update = data.get('cells_to_update', [])
    for cell in cells_to_update:
        if 'content' in cell:
            content = cell['content']
            if isinstance(content, dict) or isinstance(content, list):
                cell['content'] = json.dumps(content, ensure_ascii=False)

    payload = {
        'notebook_id': notebook_id,
        'previous_cell_id': data.get('previous_cell_id', args.previous_cell_id),
        'new_cell': new_cell,
        'cells_to_update': cells_to_update,
    }

    print(f"📌 Inserting cell after {payload['previous_cell_id']} in notebook {notebook_id}...", file=sys.stderr)
    print(f"   Updating {len(cells_to_update)} downstream cell(s)", file=sys.stderr)

    result = fetch_notebook_api(f'/api/notebook/v3/{notebook_id}/cells/insert', method='POST', data=payload)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("✅ Cell inserted successfully", file=sys.stderr)


def cmd_delete_cell(args):
    """Delete a cell from notebook"""
    notebook_id = args.notebook_id
    cell_id = args.cell_id

    print(f"🗑️  Deleting cell {cell_id} from notebook {notebook_id}...", file=sys.stderr)

    result = fetch_notebook_api(f'/api/notebook/v3/{notebook_id}/cells/{cell_id}', method='DELETE')

    print(json.dumps(result if result else {"status": "deleted"}, indent=2, ensure_ascii=False))
    print(f"✅ Cell {cell_id} deleted successfully", file=sys.stderr)


def cmd_create_cell(args):
    """Create new cell from file"""
    file_path = resolve_file_path(args.file, args.database_schema)
    notebook_id = args.notebook_id

    # Read cell from file
    cell = json.loads(Path(file_path).read_text(encoding='utf-8'))

    cell_type = cell.get('cell_type')
    if not cell_type:
        print("❌ Missing cell_type in file", file=sys.stderr)
        sys.exit(1)

    # Convert content to JSON string if it's an object
    content = cell.get('content', {})
    if isinstance(content, dict) or isinstance(content, list):
        content_str = json.dumps(content, ensure_ascii=False)
    else:
        content_str = str(content)

    # Form payload
    payload = {
        'notebook_id': notebook_id,
        'cell_type': cell_type,
        'content': content_str,
    }

    if cell.get('title'):
        payload['title'] = cell['title']

    print(f"🆕 Creating new cell in notebook {notebook_id}...", file=sys.stderr)

    result = fetch_notebook_api(f'/api/notebook/v3/{notebook_id}/cells', method='POST', data=payload)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("✅ Cell created successfully", file=sys.stderr)
    if result.get('id') or result.get('cell_id'):
        print(f"  - New cell_id: {result.get('id') or result.get('cell_id')}", file=sys.stderr)


def cmd_integrated_build_status(args):
    """Get integrated build status for a transformation (notebook)"""
    transformation_id = args.transformation_id

    print(f"📊 Fetching integrated build status for {transformation_id}...", file=sys.stderr)

    data = fetch_notebook_api(f'/api/transformation/v1/{transformation_id}/integrated-build/status/')

    # Pretty print the status
    parent_recipe = data.get('parent_recipe', {})
    source_builds = data.get('source_builds', {})

    print(f"\n{'='*60}")
    print(f"Integrated Build Status for: {transformation_id}")
    print(f"{'='*60}\n")

    # Parent recipe status
    print("Parent Recipe:")
    print(f"  Status: {parent_recipe.get('status', 'N/A')}")
    print(f"  Updated at: {parent_recipe.get('updated_at', 'N/A')}")
    if parent_recipe.get('dashboard_url'):
        print(f"  Dashboard URL: {parent_recipe.get('dashboard_url')}")
    if parent_recipe.get('recipe_template_id'):
        print(f"  Recipe Template ID: {parent_recipe.get('recipe_template_id')}")

    # Show parent recipe error if exists
    if parent_recipe.get('error'):
        error = parent_recipe['error']
        print(f"\n  ❌ ERROR:")
        print(f"    Message: {error.get('message', 'N/A')}")
        print(f"    Type: {error.get('type', 'N/A')}")
        print(f"    Timestamp: {error.get('timestamp', 'N/A')}")
        print(f"    Stage: {error.get('stage', 'N/A')}")

        if error.get('failed_cell'):
            failed_cell = error['failed_cell']
            print(f"    Failed Cell:")
            print(f"      Notebook ID: {failed_cell.get('notebook_id', 'N/A')}")
            print(f"      Cell ID: {failed_cell.get('cell_id', 'N/A')}")
            print(f"      Cell Type: {failed_cell.get('cell_type', 'N/A')}")

    # Source builds status
    if source_builds:
        print(f"\nSource Builds ({len(source_builds)}):")
        for source_name, build_info in source_builds.items():
            print(f"\n  [{source_name}]")
            print(f"    Status: {build_info.get('status', 'N/A')}")
            print(f"    Datasource: {build_info.get('datasource_title', 'N/A')}")
            print(f"    Extractions: {build_info.get('synced_extractions', 0)}/{build_info.get('total_extractions', 0)} synced")
            print(f"    Transformations: {build_info.get('built_transformations', 0)}/{build_info.get('total_transformations', 0)} built")

            # Show source build error if exists
            if build_info.get('error_info'):
                error_info = build_info['error_info']
                print(f"    ❌ ERROR:")
                print(f"      Stage: {error_info.get('stage', 'N/A')}")

                if error_info.get('error'):
                    error = error_info['error']
                    print(f"      Message: {error.get('message', 'N/A')}")
                    print(f"      Timestamp: {error.get('timestamp', 'N/A')}")

                if error_info.get('failed_cell'):
                    failed_cell = error_info['failed_cell']
                    print(f"      Failed Cell ID: {failed_cell.get('cell_id', 'N/A')}")

    print(f"\n{'='*60}\n")

    # Output raw JSON for programmatic use
    print("\n--- RAW JSON ---")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    print("\n✅ Integrated build status retrieved successfully", file=sys.stderr)


def cmd_get_integrated_setup(args):
    """Get integrated setup configuration for a transformation (notebook)"""
    notebook_id = args.notebook_id

    print(f"🔧 Fetching integrated setup for {notebook_id}...", file=sys.stderr)

    try:
        data = fetch_notebook_api(f'/api/transformation/v1/{notebook_id}/integrated-setup/')

        # Pretty print the setup
        data_sources = data.get('data_sources', [])
        allowed_data_sources = data.get('allowed_data_sources', [])
        connections = data.get('connections', [])

        print(f"\n{'='*60}")
        print(f"Integrated Setup for: {notebook_id}")
        print(f"{'='*60}\n")

        print(f"Selected Data Sources ({len(data_sources)}):")
        for ds in data_sources:
            print(f"  - {ds}")

        print(f"\nAllowed Data Sources ({len(allowed_data_sources)}):")
        for ds in allowed_data_sources:
            marker = " ✓" if ds in data_sources else ""
            print(f"  - {ds}{marker}")

        print(f"\nConnections ({len(connections)}):")
        for conn in connections:
            conn_id = conn.get('connection_id')
            conn_ds = conn.get('connection_data_source')
            accounts = conn.get('accounts', [])
            print(f"\n  [{conn_ds}] (ID: {conn_id})")
            print(f"    Accounts: {len(accounts)}")
            for acc in accounts[:5]:  # Show first 5 accounts
                print(f"      - ID: {acc.get('id')}, Account ID: {acc.get('account_id')}")
            if len(accounts) > 5:
                print(f"      ... and {len(accounts) - 5} more accounts")

        print(f"\n{'='*60}\n")

        # Output raw JSON for programmatic use
        print("\n--- RAW JSON ---")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        print("\n✅ Integrated setup retrieved successfully", file=sys.stderr)

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f"❌ Integrated setup not found for notebook {notebook_id}", file=sys.stderr)
            print("   This transformation may not have an integrated setup configured.", file=sys.stderr)
            sys.exit(1)
        else:
            raise


def cmd_build_integrated_transformation(args):
    """Build integrated transformation with specified data sources and connections"""
    file_path = resolve_file_path(args.file, args.database_schema)
    transformation_id = args.transformation_id

    # Read build configuration from file
    build_config = json.loads(Path(file_path).read_text(encoding='utf-8'))

    # Validate required fields
    if 'data_sources' not in build_config:
        print("❌ Missing 'data_sources' in build configuration file", file=sys.stderr)
        sys.exit(1)

    if 'connections' not in build_config:
        print("❌ Missing 'connections' in build configuration file", file=sys.stderr)
        sys.exit(1)

    data_sources = build_config.get('data_sources', [])
    connections = build_config.get('connections', [])

    print(f"🚀 Starting integrated build for {transformation_id}...", file=sys.stderr)
    print(f"   Data Sources: {len(data_sources)}", file=sys.stderr)
    print(f"   Connections: {len(connections)}", file=sys.stderr)

    try:
        result = fetch_notebook_api(
            f'/api/transformation/v1/{transformation_id}/integrated-progressive-build/',
            method='POST',
            data=build_config
        )

        print(f"\n{'='*60}")
        print(f"Build Request Submitted")
        print(f"{'='*60}\n")

        print("✅ Integrated build started successfully", file=sys.stderr)
        print("\nUse 'integrated-build-status' command to check build progress:", file=sys.stderr)
        print(f"  python3 notebook_client.py integrated-build-status \\", file=sys.stderr)
        print(f"    --transformation-id {transformation_id} \\", file=sys.stderr)
        print(f"    --database-schema {args.database_schema}", file=sys.stderr)

        # Output raw JSON for programmatic use
        print("\n--- RAW JSON ---")
        print(json.dumps(result, indent=2, ensure_ascii=False))

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 400:
            error_detail = e.response.json().get('detail', 'Unknown error')
            if 'Build already in progress' in error_detail:
                print(f"❌ Build already in progress. Wait for the current build to complete.", file=sys.stderr)
                print(f"   Use 'integrated-build-status' to check current build status.", file=sys.stderr)
            else:
                print(f"❌ Bad request: {error_detail}", file=sys.stderr)
            sys.exit(1)
        elif e.response.status_code == 403:
            print(f"❌ Permission denied. You don't have access to build this transformation.", file=sys.stderr)
            sys.exit(1)
        elif e.response.status_code == 404:
            print(f"❌ Integrated setup not found for transformation {transformation_id}", file=sys.stderr)
            print("   Make sure the transformation has an integrated setup configured.", file=sys.stderr)
            sys.exit(1)
        else:
            raise




def cmd_open_recipe(args):
    """Open recipe in embedded iframe via frontend command"""
    recipe_id = args.recipe_id
    workspace_id = args.workspace_id or WORKSPACE_ID

    if not workspace_id:
        print("❌ Missing workspace_id. Provide --workspace-id or set NEXT_PUBLIC_WORKSPACE_ID", file=sys.stderr)
        sys.exit(1)

    base_url = PLATFORM_HOST
    url_path = f"/my-recipes/{recipe_id}/embedded?workspace={workspace_id}"

    payload = {
        "relative_file_path": f"recipe/{recipe_id}",
        "port": 443,
        "url_path": url_path,
        "base_url": base_url
    }

    send_frontend_command("open_preview", payload)
    print(f"✅ Opened recipe {recipe_id} in embedded view", file=sys.stderr)
    print(f"   URL: {base_url}{url_path}", file=sys.stderr)


def cmd_reload_recipe(args):
    """Reload the recipe embedded iframe"""
    send_frontend_command("reload_preview", {})
    print("✅ Recipe iframe reloaded", file=sys.stderr)


# ============ Main ============
def main():
    parser = argparse.ArgumentParser(
        description='Notebook Editor API Client',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all cells
  python3 notebook_client.py list \\
    --notebook-id abc-123 \\
    --database-schema im_10836_2de

  # Get specific cell (saves to /workspace/clients/im_10836_2de/temp/)
  python3 notebook_client.py get-cell \\
    --notebook-id abc-123 \\
    --cell-id cell-789 \\
    --database-schema im_10836_2de \\
    --save-to-file cell.json

  # Create new cell from file
  python3 notebook_client.py create-cell \\
    --file new-cell.json \\
    --notebook-id abc-123 \\
    --database-schema im_10836_2de

  # Run cell from file (after editing)
  python3 notebook_client.py run-from-file \\
    --file cell.json \\
    --notebook-id abc-123 \\
    --cell-id cell-789 \\
    --database-schema im_10836_2de

Required Parameters:
  --database-schema  - Agency database schema (e.g., im_10836_2de)
                       Used to determine client folder for temp files
                       Files are saved to /workspace/clients/{schema}/temp/

Environment Variables:
  NEXT_PUBLIC_AI_AGENT_BASE_URL  - Platform host (default: https://report.improvado.io)
  NEXT_PUBLIC_DTS_SESSION_ID     - Session ID for auth (required)
  NEXT_PUBLIC_WORKSPACE_ID       - Workspace ID

Temporary Files:
  Relative paths (e.g., 'cell.json') are saved to /workspace/clients/{database_schema}/temp/
  This complies with sandbox security that allows writes only to client folders.
  Absolute paths are used as-is.
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # LIST command
    list_parser = subparsers.add_parser('list', help='List all cells in notebook')
    list_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    list_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # GET-CELL command
    get_cell_parser = subparsers.add_parser('get-cell', help='Get specific cell from notebook')
    get_cell_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    get_cell_parser.add_argument('--cell-id', required=True, help='Cell ID')
    get_cell_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')
    get_cell_parser.add_argument('--save-to-file', help='File path to save cell (relative or absolute)')

    # RUN-FROM-FILE command
    run_file_parser = subparsers.add_parser('run-from-file', help='Run cell from edited file')
    run_file_parser.add_argument('--file', required=True, help='Cell file path (relative or absolute)')
    run_file_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    run_file_parser.add_argument('--cell-id', required=True, help='Cell ID to run')
    run_file_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # DATASOURCES command
    ds_parser = subparsers.add_parser('datasources', help='List available datasources (tables) for a cell')
    ds_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    ds_parser.add_argument('--cell-id', default=None, help='Cell ID (shows cell output tables available to this cell)')
    ds_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # COLUMNS command
    col_parser = subparsers.add_parser('columns', help='List columns for a specific table')
    col_parser.add_argument('--table-name', required=True, help='Table name to get columns for')
    col_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    col_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # INSERT-CELL command
    insert_parser = subparsers.add_parser('insert-cell', help='Insert cell between existing cells with reference updates')
    insert_parser.add_argument('--file', required=True, help='Insert payload file (JSON with new_cell, previous_cell_id, cells_to_update)')
    insert_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    insert_parser.add_argument('--previous-cell-id', default=None, help='Cell ID to insert after (overrides file value)')
    insert_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # DELETE-CELL command
    delete_parser = subparsers.add_parser('delete-cell', help='Delete a cell from notebook')
    delete_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    delete_parser.add_argument('--cell-id', required=True, help='Cell ID to delete')
    delete_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # CREATE-CELL command
    create_cell_parser = subparsers.add_parser('create-cell', help='Create new cell from file')
    create_cell_parser.add_argument('--file', required=True, help='Cell file path (relative or absolute)')
    create_cell_parser.add_argument('--notebook-id', required=True, help='Notebook ID')
    create_cell_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # INTEGRATED-BUILD-STATUS command
    status_parser = subparsers.add_parser('integrated-build-status', help='Get integrated build status for a transformation (notebook)')
    status_parser.add_argument('--transformation-id', required=True, help='Transformation ID (notebook ID)')
    status_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # GET-INTEGRATED-SETUP command
    get_setup_parser = subparsers.add_parser('get-integrated-setup', help='Get integrated setup configuration for a transformation')
    get_setup_parser.add_argument('--notebook-id', required=True, help='Notebook ID (transformation ID)')
    get_setup_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # BUILD-INTEGRATED-TRANSFORMATION command
    build_parser = subparsers.add_parser('build-integrated-transformation', help='Build integrated transformation with data sources and connections')
    build_parser.add_argument('--file', required=True, help='Build configuration file (JSON with data_sources and connections)')
    build_parser.add_argument('--transformation-id', required=True, help='Transformation ID (notebook ID)')
    build_parser.add_argument('--database-schema', required=True, help='Agency database schema (e.g., im_10836_2de)')

    # OPEN-RECIPE command (frontend iframe)
    open_recipe_parser = subparsers.add_parser('open-recipe', help='Open recipe in embedded iframe view')
    open_recipe_parser.add_argument('--recipe-id', required=True, help='Recipe/notebook ID')
    open_recipe_parser.add_argument('--workspace-id', default=None, help='Workspace ID (defaults to NEXT_PUBLIC_WORKSPACE_ID)')

    # RELOAD-RECIPE command (frontend iframe)
    subparsers.add_parser('reload-recipe', help='Reload the recipe embedded iframe')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == 'list':
            cmd_list(args)
        elif args.command == 'get-cell':
            cmd_get_cell(args)
        elif args.command == 'run-from-file':
            cmd_run_from_file(args)
        elif args.command == 'datasources':
            cmd_datasources(args)
        elif args.command == 'columns':
            cmd_columns(args)
        elif args.command == 'insert-cell':
            cmd_insert_cell(args)
        elif args.command == 'delete-cell':
            cmd_delete_cell(args)
        elif args.command == 'create-cell':
            cmd_create_cell(args)
        elif args.command == 'integrated-build-status':
            cmd_integrated_build_status(args)
        elif args.command == 'get-integrated-setup':
            cmd_get_integrated_setup(args)
        elif args.command == 'build-integrated-transformation':
            cmd_build_integrated_transformation(args)
        elif args.command == 'open-recipe':
            cmd_open_recipe(args)
        elif args.command == 'reload-recipe':
            cmd_reload_recipe(args)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
