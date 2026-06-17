#!/usr/bin/env python3
"""
List All Claude Code Sessions

Этот скрипт показывает ВСЕ сессии Claude Code из всех проектов.
Группирует их по реальным путям и показывает статистику.

Использование:
    python 22_list_all_sessions.py
    python 22_list_all_sessions.py --detailed
    python 22_list_all_sessions.py --project ~/projects
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
from collections import defaultdict


def decode_project_path(encoded: str) -> str:
    """Преобразует имя папки Claude Code обратно в путь"""
    return encoded.replace('-', '/')


def get_session_info(session_file: Path) -> Dict:
    """
    Получает информацию о сессии из файла
    """
    info = {
        'session_id': session_file.stem,
        'file': str(session_file),
        'size': session_file.stat().st_size,
        'modified': datetime.fromtimestamp(session_file.stat().st_mtime),
        'created': datetime.fromtimestamp(session_file.stat().st_ctime),
        'cwd': None,
        'first_message': None,
        'message_count': 0
    }

    try:
        with open(session_file, 'r') as f:
            lines = f.readlines()
            info['message_count'] = len(lines)

            # Читаем первую строку для получения cwd и первого сообщения
            if lines:
                first_data = json.loads(lines[0])
                info['cwd'] = first_data.get('cwd', None)

                # Ищем первое user сообщение
                for line in lines[:10]:
                    try:
                        msg = json.loads(line)
                        if msg.get('type') == 'user' and 'message' in msg:
                            content = None
                            if isinstance(msg['message'], dict):
                                content = msg['message'].get('content', '')
                            elif isinstance(msg['message'], str):
                                content = msg['message']

                            if content:
                                info['first_message'] = content[:100]
                                break
                    except:
                        continue
    except:
        pass

    return info


def scan_all_sessions() -> Dict[str, List[Dict]]:
    """
    Сканирует все сессии и группирует их по проектам

    Returns:
        Словарь где ключ - путь проекта, значение - список сессий
    """
    claude_dir = Path.home() / '.claude' / 'projects'

    if not claude_dir.exists():
        print(f"❌ Claude directory not found: {claude_dir}")
        return {}

    projects = defaultdict(list)

    # Сканируем все папки проектов
    for project_dir in claude_dir.iterdir():
        if not project_dir.is_dir():
            continue

        # Декодируем путь проекта
        project_path = decode_project_path(project_dir.name)

        # Собираем информацию о всех сессиях в этом проекте
        for session_file in project_dir.glob('*.jsonl'):
            session_info = get_session_info(session_file)
            session_info['project_dir'] = project_dir.name
            session_info['project_path'] = project_path

            # Группируем по cwd если есть, иначе по project_path
            group_key = session_info['cwd'] or project_path
            projects[group_key].append(session_info)

    # Сортируем сессии в каждом проекте по времени модификации
    for key in projects:
        projects[key].sort(key=lambda x: x['modified'], reverse=True)

    return dict(projects)


def format_size(size_bytes: int) -> str:
    """Форматирует размер в человекочитаемый вид"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def format_duration(start: datetime, end: datetime) -> str:
    """Форматирует продолжительность"""
    delta = end - start
    if delta.days > 0:
        return f"{delta.days} days"
    elif delta.seconds > 3600:
        return f"{delta.seconds // 3600} hours"
    else:
        return f"{delta.seconds // 60} minutes"


def main():
    parser = argparse.ArgumentParser(
        description='List all Claude Code sessions across all projects',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all sessions grouped by project
  %(prog)s

  # Show detailed information
  %(prog)s --detailed

  # Filter by project path
  %(prog)s --project ~/projects/chrome-extension-tcs

  # Show only recent sessions (last 7 days)
  %(prog)s --days 7
        """
    )

    parser.add_argument('--detailed', action='store_true',
                       help='Show detailed information for each session')
    parser.add_argument('--project',
                       help='Filter by project path (substring match)')
    parser.add_argument('--days', type=int,
                       help='Show only sessions modified in last N days')

    args = parser.parse_args()

    # Сканируем все сессии
    print("📊 Scanning all Claude Code sessions...")
    print("=" * 70)

    projects = scan_all_sessions()

    if not projects:
        print("\n❌ No sessions found")
        sys.exit(1)

    # Фильтруем по проекту если указан
    if args.project:
        projects = {k: v for k, v in projects.items()
                   if args.project.lower() in k.lower()}

        if not projects:
            print(f"\n❌ No sessions found for project: {args.project}")
            sys.exit(1)

    # Фильтруем по дате если указано
    if args.days:
        cutoff_date = datetime.now() - timedelta(days=args.days)
        for project_path in list(projects.keys()):
            projects[project_path] = [s for s in projects[project_path]
                                     if s['modified'] > cutoff_date]
            if not projects[project_path]:
                del projects[project_path]

    # Статистика
    total_sessions = sum(len(sessions) for sessions in projects.values())
    total_size = sum(s['size'] for sessions in projects.values() for s in sessions)

    print(f"\n📈 Summary:")
    print(f"  Total projects: {len(projects)}")
    print(f"  Total sessions: {total_sessions}")
    print(f"  Total size: {format_size(total_size)}")

    # Сортируем проекты по количеству сессий
    sorted_projects = sorted(projects.items(),
                            key=lambda x: len(x[1]), reverse=True)

    # Показываем проекты и их сессии
    print(f"\n📁 Projects and Sessions:\n")

    for project_path, sessions in sorted_projects:
        # Считаем статистику для проекта
        project_size = sum(s['size'] for s in sessions)

        print(f"📂 {project_path}")
        print(f"   Sessions: {len(sessions)} | Size: {format_size(project_size)}")

        if sessions:
            latest = sessions[0]['modified']
            oldest = min(s['modified'] for s in sessions)
            print(f"   Period: {oldest.strftime('%Y-%m-%d')} to {latest.strftime('%Y-%m-%d')}")

        if args.detailed:
            # Показываем детали каждой сессии
            for i, session in enumerate(sessions[:10], 1):  # Показываем первые 10
                print(f"\n   {i}. {session['session_id']}")
                print(f"      Modified: {session['modified'].strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"      Size: {format_size(session['size'])}")
                print(f"      Messages: {session['message_count']}")

                if session['first_message']:
                    print(f"      First: {session['first_message'][:60]}...")

                if session['cwd'] and session['cwd'] != project_path:
                    print(f"      CWD: {session['cwd']}")

            if len(sessions) > 10:
                print(f"\n   ... and {len(sessions) - 10} more sessions")
        else:
            # Краткий вид - показываем только последние 3 сессии
            for i, session in enumerate(sessions[:3], 1):
                age = datetime.now() - session['modified']
                if age.days > 0:
                    age_str = f"{age.days}d ago"
                elif age.seconds > 3600:
                    age_str = f"{age.seconds // 3600}h ago"
                else:
                    age_str = f"{age.seconds // 60}m ago"

                preview = session['first_message'][:40] if session['first_message'] else "..."
                print(f"   • {session['session_id'][:8]}... ({age_str}) - {preview}...")

            if len(sessions) > 3:
                print(f"   ... and {len(sessions) - 3} more sessions")

        print()

    # Подсказки
    print("\n💡 Tips:")
    print("  • Use --detailed to see more information")
    print("  • Use --project to filter by path")
    print("  • Use 21_universal_session_resume.py to resume any session")


if __name__ == '__main__':
    main()