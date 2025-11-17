#!/usr/bin/env python3
"""
Universal Claude Code Session Resume

Этот скрипт находит и возобновляет сессии Claude Code из любой директории.
Решает проблему когда сессия создана в одной папке, а возобновить нужно из другой.

Использование:
    python 21_universal_session_resume.py "текст из начала разговора"
    python 21_universal_session_resume.py --id b2435f08-65e2-4b88-91c6-79f3a93ced9a
    python 21_universal_session_resume.py --last
    python 21_universal_session_resume.py "текст" --auto  # автоматически запустить
"""

import json
import sys
import os
import argparse
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Tuple


def decode_project_path(encoded: str) -> str:
    """Преобразует имя папки Claude Code обратно в путь"""
    return encoded.replace('-', '/')


def get_cwd_from_session_file(session_file: Path) -> Optional[str]:
    """
    Находит cwd в файле сессии, просматривая все строки.
    cwd может быть в любой строке, не обязательно в первой.
    """
    try:
        with open(session_file, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if 'cwd' in data and data['cwd']:
                        return data['cwd']
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass
    return None


def find_session_in_all_projects(
    search_text: Optional[str] = None,
    session_id: Optional[str] = None,
    find_last: bool = False
) -> List[Dict]:
    """
    Ищет сессию во всех проектах
    
    Returns:
        Список найденных сессий с информацией о них
    """
    claude_dir = Path.home() / '.claude' / 'projects'
    
    if not claude_dir.exists():
        print(f"❌ Claude directory not found: {claude_dir}")
        return []
    
    found_sessions = []
    
    # Сканируем все папки проектов
    for project_dir in claude_dir.iterdir():
        if not project_dir.is_dir():
            continue
        
        # Декодируем путь проекта
        project_path = decode_project_path(project_dir.name)
        
        # Если ищем по ID
        if session_id:
            session_file = project_dir / f"{session_id}.jsonl"
            if session_file.exists():
                # Ищем cwd в файле (может быть в любой строке)
                cwd = get_cwd_from_session_file(session_file)
                if not cwd:
                    # Если cwd не найден, используем декодированный путь
                    cwd = decode_project_path(project_dir.name)
                
                found_sessions.append({
                    'session_id': session_id,
                    'project_dir': project_dir.name,
                    'project_path': project_path,
                    'cwd': cwd,
                    'file': str(session_file),
                    'modified': datetime.fromtimestamp(session_file.stat().st_mtime),
                    'size': session_file.stat().st_size
                })
        
        # Если ищем по тексту или последнюю
        else:
            for session_file in project_dir.glob('*.jsonl'):
                if find_last:
                    # Для поиска последней просто добавляем все
                    cwd = get_cwd_from_session_file(session_file)
                    if not cwd:
                        cwd = decode_project_path(project_dir.name)
                    
                    found_sessions.append({
                        'session_id': session_file.stem,
                        'project_dir': project_dir.name,
                        'project_path': project_path,
                        'cwd': cwd,
                        'file': str(session_file),
                        'modified': datetime.fromtimestamp(session_file.stat().st_mtime),
                        'size': session_file.stat().st_size
                    })
                
                elif search_text:
                    # Ищем по тексту в первых строках
                    try:
                        # Сначала получаем cwd из любой строки файла
                        cwd = get_cwd_from_session_file(session_file)
                        if not cwd:
                            cwd = decode_project_path(project_dir.name)
                        
                        with open(session_file, 'r') as f:
                            found = False
                            
                            for i, line in enumerate(f):
                                if i >= 20:  # Проверяем первые 20 строк
                                    break
                                
                                try:
                                    msg = json.loads(line)
                                    
                                    # Ищем текст в user сообщениях
                                    if msg.get('type') == 'user' and 'message' in msg:
                                        content = None
                                        
                                        if isinstance(msg['message'], dict):
                                            content = msg['message'].get('content', '')
                                        elif isinstance(msg['message'], str):
                                            content = msg['message']
                                        
                                        if content and isinstance(content, str):
                                            if search_text.lower() in content.lower():
                                                found = True
                                                found_sessions.append({
                                                    'session_id': session_file.stem,
                                                    'project_dir': project_dir.name,
                                                    'project_path': project_path,
                                                    'cwd': cwd,
                                                    'file': str(session_file),
                                                    'modified': datetime.fromtimestamp(
                                                        session_file.stat().st_mtime
                                                    ),
                                                    'size': session_file.stat().st_size,
                                                    'content_preview': content[:200]
                                                })
                                                break
                                except:
                                    continue
                                    
                    except Exception as e:
                        continue
    
    # Сортируем по времени модификации (самые новые первые)
    found_sessions.sort(key=lambda x: x['modified'], reverse=True)
    
    return found_sessions


def generate_resume_command(session_info: Dict) -> str:
    """
    Генерирует команду для возобновления сессии
    """
    cwd = session_info['cwd']
    session_id = session_info['session_id']
    
    # Проверяем существует ли директория
    if Path(cwd).exists():
        return f'cd "{cwd}" && claude --resume {session_id} --dangerously-skip-permissions'
    else:
        # Если оригинальная директория не существует, используем project_path
        project_path = session_info['project_path']
        if Path(project_path).exists():
            print(f"  ⚠️  Original: {cwd} (not found)")
            print(f"  ✓ Using: {project_path}")
            return f'cd "{project_path}" && claude --resume {session_id} --dangerously-skip-permissions'
        else:
            print(f"  ⚠️  Directory not found: {cwd}")
            return f'claude --resume {session_id} --dangerously-skip-permissions'


def main():
    parser = argparse.ArgumentParser(
        description='Universal Claude Code session resume',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Resume session by ID (default)
  %(prog)s c080fd31-1fea-44e2-8690-c58ad0f4a829
  %(prog)s c080fd31  # partial ID also works
  
  # Search by text (use --text flag)
  %(prog)s --text "dashboard implementation"
  %(prog)s -t "explain what we have"
  
  # Resume latest session
  %(prog)s --last
  
  # Only show command without executing
  %(prog)s --dry-run c080fd31
  
  # Show all matches (for text search)
  %(prog)s --text "dashboard" --all
        """
    )
    
    parser.add_argument('session_input', nargs='?', 
                       help='Session ID (default) or text search with --text flag')
    parser.add_argument('--text', '-t', action='store_true',
                       help='Treat input as text search instead of session ID')
    parser.add_argument('--last', action='store_true',
                       help='Find the last modified session across all projects')
    parser.add_argument('--dry-run', action='store_true',
                       help='Only show command without executing')
    parser.add_argument('--all', action='store_true',
                       help='Show all matching sessions, not just the first')
    
    args = parser.parse_args()
    
    # Определяем режим поиска
    if args.last:
        session_id = None
        search_text = None
        find_last = True
    elif args.text and args.session_input:
        session_id = None
        search_text = args.session_input
        find_last = False
    elif args.session_input:
        # По умолчанию считаем что это session ID
        session_id = args.session_input
        search_text = None
        find_last = False
    else:
        parser.error("Provide session ID, use --text for text search, or --last")
    
    # Поиск сессий
    print("🔍 Searching across all Claude Code projects...")
    print("-" * 60)
    
    sessions = find_session_in_all_projects(
        search_text=search_text,
        session_id=session_id,
        find_last=find_last
    )
    
    if not sessions:
        print("\n❌ No sessions found")
        
        if search_text:
            print("\nTips for text search:")
            print("1. Try searching with fewer words")
            print("2. Use --last to find the most recent session")
            print("3. Search is case-insensitive")
        elif session_id:
            print(f"\nNo session with ID: {session_id}")
            print("Tips:")
            print("1. Check if ID is correct")
            print("2. Try partial ID (first 8+ characters)")
            print("3. Use --last for the most recent session")
        
        sys.exit(1)
    
    # Если --last, берем только первую (самую новую)
    if args.last and not args.all:
        sessions = sessions[:1]
    
    # Если не --all, показываем только первую
    if not args.all and not args.last:
        sessions = sessions[:1]
    
    # Показываем результаты
    for i, session in enumerate(sessions, 1):
        if len(sessions) > 1:
            print(f"\n📋 Session {i}/{len(sessions)}:")
        else:
            print(f"\n✅ Found session!")
        
        print(f"  Session ID: {session['session_id']}")
        print(f"  Created in: {session['cwd']}")
        print(f"  Project folder: {session['project_dir']}")
        print(f"  Modified: {session['modified'].strftime('%Y-%m-%d %H:%M:%S')}")
        
        size_kb = session['size'] / 1024
        print(f"  Size: {size_kb:.2f} KB")
        
        if 'content_preview' in session:
            print(f"  Content: {session['content_preview'][:100]}...")
        
        # Генерируем команду
        resume_cmd = generate_resume_command(session)
        
        # Если --dry-run, только показываем команду
        if args.dry_run:
            print(f"\n📂 Resume command (dry run):")
            print(f"  {resume_cmd}")
        else:
            # Автоматически запускаем для первой сессии
            if i == 1:
                print(f"\n🚀 Resuming session...")
                
                # Разбираем команду
                if " && " in resume_cmd:
                    cd_part, claude_part = resume_cmd.split(" && ", 1)
                    # Извлекаем путь из cd команды
                    path = cd_part.replace('cd "', '').replace('"', '').replace('cd ', '')
                    
                    # Меняем директорию и запускаем claude
                    try:
                        os.chdir(path)
                        print(f"  📁 Directory: {path}")
                        print(f"  🔄 Launching Claude Code...")
                        
                        # Запускаем claude
                        subprocess.run(claude_part, shell=True)
                    except Exception as e:
                        print(f"  ❌ Error: {e}")
                else:
                    # Если нет cd части, просто запускаем
                    subprocess.run(resume_cmd, shell=True)
                
                break  # Выходим после запуска
            else:
                # Для остальных сессий (при --all) только показываем
                print(f"\n📂 Resume command:")
                print(f"  {resume_cmd}")
    
    if args.all and len(sessions) > 1:
        print(f"\n📊 Total found: {len(sessions)} sessions")


if __name__ == '__main__':
    main()