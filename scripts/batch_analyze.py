#!/usr/bin/env python3
"""
批量分析短剧剧集 - 扫描 data 目录中所有未分析的剧集并调用 AI 进行高光识别

Usage:
    python scripts/batch_analyze.py                           # 分析所有未分析的剧集
    python scripts/batch_analyze.py --drama "北派寻宝笔记"    # 只分析指定剧集
    python scripts/batch_analyze.py --dry-run                 # 仅列出待分析的剧集，不实际执行
    python scripts/batch_analyze.py --skip-existing           # 跳过已有高光的剧集（默认）
    python scripts/batch_analyze.py --force                   # 强制重新分析所有剧集
    python scripts/batch_analyze.py --import-result           # 分析后自动导入到本地后端
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
ANALYZE_SCRIPT = ROOT_DIR / "scripts" / "analyze_episode.py"
DB_FILE = DATA_DIR / "db.json"
STORE_FILE = DATA_DIR / "store.json"
DEFAULT_BACKEND_URL = "http://127.0.0.1:3000"


def get_existing_highlights() -> dict[str, int]:
    """获取已有高光的剧集列表（返回 sourceKey -> count 映射）"""
    existing: dict[str, int] = {}

    # 从 store.json 读取
    if STORE_FILE.exists():
        try:
            data = json.loads(STORE_FILE.read_text(encoding="utf-8"))
            for h in data.get("highlights", []):
                key = h.get("episodeKey", "")
                existing[key] = existing.get(key, 0) + 1
        except (json.JSONDecodeError, KeyError):
            pass

    # 从 db.json 读取
    if DB_FILE.exists():
        try:
            data = json.loads(DB_FILE.read_text(encoding="utf-8"))
            for h in data.get("highlights", []):
                key = h.get("episodeKey", "")
                existing[key] = existing.get(key, 0) + 1
        except (json.JSONDecodeError, KeyError):
            pass

    return existing


def scan_episodes() -> list[dict]:
    """扫描 data 目录获取所有剧集"""
    episodes = []
    if not DATA_DIR.exists():
        print(f"[ERROR] Data directory not found: {DATA_DIR}")
        return episodes

    for drama_dir in sorted(DATA_DIR.iterdir()):
        if not drama_dir.is_dir():
            continue
        drama_name = drama_dir.name
        for video_file in sorted(drama_dir.iterdir()):
            if not video_file.is_file() or video_file.suffix.lower() != ".mp4":
                continue
            # 从文件名提取集数
            import re
            match = re.search(r"(\d+)", video_file.stem)
            ep_num = int(match.group(1)) if match else 0
            source_key = f"{drama_name}/{video_file.name}"
            episodes.append({
                "drama_title": drama_name,
                "episode_title": video_file.stem,
                "episode_number": ep_num,
                "source_key": source_key,
                "file_path": str(video_file),
                "file_size_mb": video_file.stat().st_size / (1024 * 1024),
            })

    episodes.sort(key=lambda e: (e["drama_title"], e["episode_number"]))
    return episodes


def import_to_backend(drama_title: str, episode_title: str, backend_url: str) -> bool:
    """将分析结果导入到本地后端"""
    import urllib.request

    # 首先获取剧集列表找到对应的 episodeId
    try:
        req = urllib.request.Request(f"{backend_url}/api/dramas")
        response = urllib.request.urlopen(req, timeout=10)
        dramas_data = json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"  [WARN] Cannot connect to backend: {e}")
        return False

    episode_id = None
    for drama in dramas_data.get("dramas", []):
        for ep in drama.get("episodes", []):
            if drama.get("title") == drama_title and ep.get("title") == episode_title:
                episode_id = ep.get("id")
                break

    if not episode_id:
        print(f"  [WARN] Episode not found in backend: {drama_title}/{episode_title}")
        return False

    # 直接调用 analyze_episode.py 并导入
    cmd = [
        sys.executable,
        str(ANALYZE_SCRIPT),
        "--drama-title", drama_title,
        "--episode-title", episode_title,
        "--video-file", str(DATA_DIR / drama_title / f"{episode_title}.mp4"),
        "--import-result",
        "--replace-existing",
    ]
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(ROOT_DIR), capture_output=True, text=True, timeout=300)
    if result.returncode == 0:
        print(f"  [OK] Imported: {drama_title}/{episode_title}")
        return True
    else:
        print(f"  [ERROR] Import failed: {result.stderr[:200]}")
        return False


def main():
    parser = argparse.ArgumentParser(description="批量分析短剧剧集高光")
    parser.add_argument("--drama", type=str, help="只分析指定剧集")
    parser.add_argument("--dry-run", action="store_true", help="仅列出待分析的剧集")
    parser.add_argument("--skip-existing", action="store_true", default=True, help="跳过已有高光的剧集（默认）")
    parser.add_argument("--force", action="store_true", help="强制重新分析所有剧集")
    parser.add_argument("--import-result", action="store_true", help="分析后自动导入到本地后端")
    parser.add_argument("--backend-url", type=str, default=DEFAULT_BACKEND_URL, help="后端 API 地址")
    parser.add_argument("--delay", type=float, default=2.0, help="每集分析间隔（秒），避免 API 限流")
    args = parser.parse_args()

    if args.force:
        args.skip_existing = False

    episodes = scan_episodes()
    existing = get_existing_highlights()

    # 筛选需要分析的剧集
    todo = []
    skipped = 0
    for ep in episodes:
        if args.drama and ep["drama_title"] != args.drama:
            continue

        highlight_count = existing.get(ep["source_key"], 0)
        if args.skip_existing and highlight_count > 0:
            print(f"  [SKIP] {ep['source_key']} ({highlight_count} highlights exist)")
            skipped += 1
            continue

        todo.append(ep)

    print(f"\n=== 批量分析摘要 ===")
    print(f"总剧集: {len(episodes)}, 待分析: {len(todo)}, 跳过: {skipped}")

    if args.dry_run:
        print("\n待分析列表:")
        for ep in todo:
            print(f"  - {ep['source_key']} ({ep['file_size_mb']:.1f} MB)")
        return

    if not todo:
        print("没有需要分析的剧集！")
        return

    print(f"\n开始分析 {len(todo)} 集，每集间隔 {args.delay}s...\n")

    success = 0
    fail = 0
    for i, ep in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] {ep['drama_title']}/{ep['episode_title']} ({ep['file_size_mb']:.1f} MB)")

        if args.import_result:
            ok = import_to_backend(ep["drama_title"], ep["episode_title"], args.backend_url)
        else:
            # 只分析不导入
            cmd = [
                sys.executable,
                str(ANALYZE_SCRIPT),
                "--drama-title", ep["drama_title"],
                "--episode-title", ep["episode_title"],
                "--video-file", ep["file_path"],
            ]
            result = subprocess.run(cmd, cwd=str(ROOT_DIR), capture_output=True, text=True, timeout=300)
            ok = result.returncode == 0
            if ok:
                print(f"  [OK] Analyzed: {ep['drama_title']}/{ep['episode_title']}")
            else:
                print(f"  [ERROR] {result.stderr[:200]}")

        if ok:
            success += 1
        else:
            fail += 1

        if i < len(todo) - 1:
            time.sleep(args.delay)

    print(f"\n=== 完成 ===")
    print(f"成功: {success}, 失败: {fail}")
    print(f"使用审核台审核并发布: http://127.0.0.1:3000/review.html")


if __name__ == "__main__":
    main()
