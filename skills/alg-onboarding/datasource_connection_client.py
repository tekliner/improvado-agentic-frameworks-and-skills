#!/usr/bin/env python3
"""
ALG onboarding frontend command helper.

Opens datasource connection flows in the product's embedded desktop iframe.
"""

import argparse
import json
import os
import sys
import time
from urllib.parse import quote, urlencode


PLATFORM_HOST = os.getenv(
    "NEXT_PUBLIC_AI_AGENT_BASE_URL",
    os.getenv("PLATFORM_HOST", "https://report.improvado.io"),
).rstrip("/")
WORKSPACE_ID = os.getenv("NEXT_PUBLIC_WORKSPACE_ID", "")


def send_frontend_command(action: str, payload: dict) -> None:
    command = {
        "type": "frontend_command",
        "command": {
            "action": action,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        },
    }
    print(f"{{FRONTEND_COMMAND:{json.dumps(command)}:FRONTEND_COMMAND}}")
    sys.stdout.flush()


def build_connection_path(datasource_name: str, workspace_id: str) -> str:
    encoded_datasource_name = quote(datasource_name, safe="")
    query = urlencode(
        {
            "workspace": workspace_id,
            "embedded": "true",
            "collapseDocs": "true",
        },
    )
    return f"/create_data_source_connection/{encoded_datasource_name}/?{query}"


def open_datasource_connection(args: argparse.Namespace) -> None:
    datasource_name = args.datasource_name
    workspace_id = args.workspace_id or WORKSPACE_ID

    if not workspace_id:
        print(
            "Missing workspace id. Provide --workspace-id or set NEXT_PUBLIC_WORKSPACE_ID.",
            file=sys.stderr,
        )
        sys.exit(1)

    url_path = build_connection_path(datasource_name, workspace_id)
    payload = {
        "relative_file_path": f"datasource/{datasource_name}",
        "port": datasource_name,
        "url_path": url_path,
        "base_url": args.base_url.rstrip("/") if args.base_url else PLATFORM_HOST,
    }

    send_frontend_command("open_preview", payload)
    print(
        f"Opened datasource connection flow for {datasource_name} in embedded view",
        file=sys.stderr,
    )
    print(f"URL: {payload['base_url']}{url_path}", file=sys.stderr)


def reload_datasource_connection(_: argparse.Namespace) -> None:
    send_frontend_command("reload_preview", {})
    print("Reloaded datasource connection iframe", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ALG onboarding datasource connection iframe helper",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    open_parser = subparsers.add_parser(
        "open-datasource-connection",
        help="Open datasource connection flow in embedded iframe view",
    )
    open_parser.add_argument(
        "--datasource-name",
        required=True,
        help="Datasource name, e.g. google_ads",
    )
    open_parser.add_argument(
        "--workspace-id",
        default=None,
        help="Workspace ID (defaults to NEXT_PUBLIC_WORKSPACE_ID)",
    )
    open_parser.add_argument(
        "--base-url",
        default=None,
        help="Platform base URL (defaults to NEXT_PUBLIC_AI_AGENT_BASE_URL or report.improvado.io)",
    )
    open_parser.set_defaults(func=open_datasource_connection)

    reload_parser = subparsers.add_parser(
        "reload-datasource-connection",
        help="Reload the datasource connection embedded iframe",
    )
    reload_parser.set_defaults(func=reload_datasource_connection)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
