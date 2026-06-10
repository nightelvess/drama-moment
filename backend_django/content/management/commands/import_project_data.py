import json
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from content.models import Drama, Episode, Highlight, Interaction, VideoBranch, VideoGenerationTask


NON_EPISODE_DATA_DIRS = {"generated"}


def make_id(prefix, raw):
    import hashlib

    digest = hashlib.sha1(str(raw).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def read_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def episode_index_from_name(name):
    match = re.search(r"第\s*(\d+)\s*集", name)
    return int(match.group(1)) if match else None


def scan_mp4_episodes():
    dramas = {}
    episodes = {}
    data_dir = settings.DATA_DIR
    if not data_dir.exists():
        return dramas, episodes
    for drama_dir in sorted([p for p in data_dir.iterdir() if p.is_dir() and p.name not in NON_EPISODE_DATA_DIRS]):
        mp4_files = sorted(drama_dir.glob("*.mp4"))
        if not mp4_files:
            continue
        drama_title = drama_dir.name
        drama_id = make_id("drama", drama_title)
        dramas[drama_id] = {"id": drama_id, "title": drama_title, "episode_count": len(mp4_files)}
        for file_path in mp4_files:
            episode_key = f"{drama_title}/{file_path.name}"
            stat = file_path.stat()
            episodes[episode_key] = {
                "id": make_id("ep", episode_key),
                "drama_id": drama_id,
                "episode_key": episode_key,
                "title": file_path.stem,
                "episode_index": episode_index_from_name(file_path.name),
                "file_name": file_path.name,
                "video_url": "/media/" + "/".join([drama_title, file_path.name]),
                "local_path": episode_key,
                "file_size": stat.st_size,
            }
    return dramas, episodes


def merge_by_id(items):
    result = {}
    for item in items:
        if item and item.get("id"):
            result[str(item["id"])] = item
    return list(result.values())


class Command(BaseCommand):
    help = "Import existing data/db.json, data/store.json, video-gen tasks, and MP4 catalog into Django database."

    def handle(self, *args, **options):
        data_dir = settings.DATA_DIR
        db = read_json(data_dir / "db.json", {})
        store = read_json(data_dir / "store.json", {})
        video_tasks = read_json(data_dir / "video-gen-tasks.json", [])
        scanned_dramas, scanned_episodes = scan_mp4_episodes()

        # Generated branch videos are assets, not source drama episodes.
        Episode.objects.filter(episode_key__startswith="generated/").delete()
        Drama.objects.filter(title__in=NON_EPISODE_DATA_DIRS).delete()

        for raw in scanned_dramas.values():
            Drama.objects.update_or_create(
                id=raw["id"],
                defaults={
                    "title": raw["title"],
                    "episode_count": raw["episode_count"],
                    "status": "active",
                    "metadata": {"source": "mp4_scan"},
                },
            )

        for raw in scanned_episodes.values():
            drama = Drama.objects.get(id=raw["drama_id"])
            Episode.objects.update_or_create(
                id=raw["id"],
                defaults={
                    "drama": drama,
                    "episode_key": raw["episode_key"],
                    "title": raw["title"],
                    "episode_index": raw["episode_index"],
                    "file_name": raw["file_name"],
                    "storage_type": "local",
                    "video_url": raw["video_url"],
                    "local_path": raw["local_path"],
                    "file_size": raw["file_size"],
                    "mime_type": "video/mp4",
                    "status": "ready",
                    "metadata": {"source": "mp4_scan"},
                },
            )

        episode_by_key = {ep.episode_key: ep for ep in Episode.objects.all()}
        highlights = merge_by_id([*(db.get("highlights") or []), *(store.get("highlights") or [])])
        for raw in highlights:
            episode_key = raw.get("episodeKey") or raw.get("episode_key")
            episode = episode_by_key.get(episode_key)
            if not episode:
                continue
            Highlight.objects.update_or_create(
                id=str(raw["id"]),
                defaults={
                    "episode": episode,
                    "episode_key": episode.episode_key,
                    "start_time": float(raw.get("startTime") or raw.get("start_time") or 0),
                    "end_time": float(raw.get("endTime") or raw.get("end_time") or 0),
                    "type": str(raw.get("type") or raw.get("highlight_type") or "高光"),
                    "emotion": str(raw.get("emotion") or ""),
                    "intensity": float(raw.get("intensity") or 0),
                    "confidence": float(raw.get("confidence") or 0),
                    "summary": str(raw.get("summary") or "高光"),
                    "suggestions": raw.get("suggestions") or raw.get("interaction_suggestions") or [],
                    "status": str(raw.get("status") or "draft"),
                    "model_source": str(raw.get("modelSource") or raw.get("model_source") or ""),
                    "model_reason": str(raw.get("modelReason") or raw.get("model_reason") or raw.get("reason") or ""),
                    "trigger_score": raw.get("triggerScore") or raw.get("trigger_score"),
                    "effect_config": raw.get("effectConfig") or raw.get("effect_config") or {},
                    "raw_payload": raw,
                    "imported_at": timezone.now(),
                },
            )

        highlights_by_id = {h.id: h for h in Highlight.objects.all()}
        interactions = [*(db.get("interactions") or []), *(store.get("interactions") or [])]
        created_interactions = 0
        for raw in interactions:
            highlight = highlights_by_id.get(str(raw.get("highlightId") or raw.get("highlight_id") or ""))
            if not highlight:
                continue
            # JSON interactions do not have stable numeric ids, so use metadata id to avoid duplicate imports.
            raw_id = str(raw.get("id") or "")
            if raw_id and Interaction.objects.filter(metadata__legacy_id=raw_id).exists():
                continue
            Interaction.objects.create(
                highlight=highlight,
                episode=highlight.episode,
                episode_key=highlight.episode_key,
                reaction=str(raw.get("reaction") or raw.get("buttonText") or "已互动"),
                button_text=str(raw.get("buttonText") or raw.get("reaction") or "已互动"),
                user_id=str(raw.get("userId") or "") or None,
                metadata={**raw, "legacy_id": raw_id},
            )
            created_interactions += 1

        for raw in db.get("videoBranches") or []:
            episode_key = raw.get("episodeKey")
            episode = episode_by_key.get(episode_key)
            if not episode:
                continue
            VideoBranch.objects.update_or_create(
                id=str(raw["id"]),
                defaults={
                    "episode": episode,
                    "episode_key": episode.episode_key,
                    "title": str(raw.get("title") or "高光视频分支"),
                    "setup": str(raw.get("setup") or ""),
                    "interaction_nodes": raw.get("interactionNodes") or raw.get("interaction_nodes") or [],
                    "status": str(raw.get("status") or "draft"),
                    "model_source": str(raw.get("modelSource") or raw.get("model_source") or ""),
                    "raw_model_output": raw.get("rawModelOutput") or raw.get("raw_model_output") or raw,
                },
            )

        for raw in video_tasks:
            episode = Episode.objects.filter(id=raw.get("episodeId")).first()
            VideoGenerationTask.objects.update_or_create(
                id=str(raw.get("id")),
                defaults={
                    "episode": episode,
                    "episode_key": raw.get("episodeKey"),
                    "video_branch_id": raw.get("branchId") or None,
                    "provider": raw.get("provider"),
                    "provider_task_id": raw.get("providerTaskId"),
                    "model": raw.get("model"),
                    "title": raw.get("title"),
                    "video_prompt": str(raw.get("videoPrompt") or ""),
                    "status": str(raw.get("status") or "pending"),
                    "progress": int(raw.get("progress") or 0),
                    "video_url": raw.get("videoUrl"),
                    "local_file": raw.get("localFile"),
                    "thumbnail_url": raw.get("thumbnailUrl"),
                    "error_message": raw.get("errorMessage"),
                    "request_payload": raw.get("config") or {},
                    "response_payload": raw,
                },
            )

        self.stdout.write(self.style.SUCCESS(
            f"Imported dramas={Drama.objects.count()}, episodes={Episode.objects.count()}, "
            f"highlights={Highlight.objects.count()}, interactions_added={created_interactions}, "
            f"video_branches={VideoBranch.objects.count()}, video_tasks={VideoGenerationTask.objects.count()}"
        ))
