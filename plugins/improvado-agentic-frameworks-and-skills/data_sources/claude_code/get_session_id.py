#!/usr/bin/env python3
"""
Get current Claude Code session ID reliably.

Supports multiple detection methods:
1. From hook input (when called as hook)
2. From environment variable (if set by user)
3. From most recently modified session file (fallback)

Usage:
    python get_session_id.py                    # Auto-detect
    python get_session_id.py --from-hook        # Read from stdin (hook mode)
    python get_session_id.py --fallback-latest  # Use latest modified file
"""

import json
import sys
import os
import glob
from pathlib import Path
from typing import Optional
import argparse


def get_from_hook() -> Optional[str]:
    """Get session ID from hook stdin input"""
    try:
        input_data = json.load(sys.stdin)
        return input_data.get("session_id")
    except:
        return None


def get_from_env() -> Optional[str]:
    """Get session ID from environment variable"""
    return os.environ.get("CLAUDE_SESSION_ID")


def get_from_latest_file() -> Optional[str]:
    """Get session ID from most recently modified session file"""
    session_files = []

    # Method 1: Check ~/.claude/projects/ (newer Claude Code format)
    claude_projects = Path.home() / '.claude' / 'projects'
    if claude_projects.exists():
        for project_dir in claude_projects.iterdir():
            if project_dir.is_dir():
                # Find .jsonl files in project directory
                for session_file in project_dir.glob('*.jsonl'):
                    session_files.append(session_file)

    # Method 2: Check ~/.codex/sessions/ (older rollout format)
    codex_sessions = Path.home() / '.codex' / 'sessions'
    if codex_sessions.exists():
        pattern = str(codex_sessions) + "/**/rollout-*.jsonl"
        rollout_files = glob.glob(pattern, recursive=True)
        session_files.extend([Path(f) for f in rollout_files])

    if not session_files:
        return None

    # Sort by modification time (most recent first)
    session_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    latest_session = session_files[0]

    # Extract UUID from filename
    filename = latest_session.name

    # Format 1: Direct UUID filename (e.g., 1a4b532d-52fd-44b5-9d6f-838e5bb1074a.jsonl)
    if filename.endswith('.jsonl') and len(filename.replace('.jsonl', '')) == 36:
        # Check if it's a valid UUID format (8-4-4-4-12)
        uuid_candidate = filename.replace('.jsonl', '')
        parts = uuid_candidate.split('-')
        if len(parts) == 5 and len(parts[0]) == 8:
            return uuid_candidate

    # Format 2: Rollout format (e.g., rollout-2025-10-02T17-25-43-UUID.jsonl)
    if filename.startswith('rollout-') and filename.endswith('.jsonl'):
        parts = filename.replace('.jsonl', '').split('-')
        if len(parts) >= 9:
            uuid = '-'.join(parts[-5:])  # last 5 parts = UUID
            return uuid

    return None


def main():
    parser = argparse.ArgumentParser(description='Get Claude Code session ID')
    parser.add_argument('--from-hook', action='store_true',
                       help='Read session ID from hook stdin')
    parser.add_argument('--fallback-latest', action='store_true',
                       help='Use latest modified file (fallback method)')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Output only session ID, no labels')

    args = parser.parse_args()

    session_id = None
    method = "unknown"

    # Try methods in order
    if args.from_hook:
        session_id = get_from_hook()
        method = "hook"

    if not session_id:
        session_id = get_from_env()
        method = "environment"

    if not session_id or args.fallback_latest:
        session_id = get_from_latest_file()
        method = "latest_file"

    if session_id:
        if args.quiet:
            print(session_id)
        else:
            print(f"Current session ID: {session_id}")
            if method != "unknown":
                print(f"Method: {method}", file=sys.stderr)
        sys.exit(0)
    else:
        if not args.quiet:
            print("Error: Could not determine session ID", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
