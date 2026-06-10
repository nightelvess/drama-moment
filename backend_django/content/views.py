import json
import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import (
    AppSetting,
    Continuation,
    Drama,
    Episode,
    Highlight,
    Interaction,
    VideoBranch,
    VideoGenerationTask,
)


def read_body(request):
    if not request.body:
        return {}
    return json.loads(request.body.decode("utf-8"))


def clamp01(value, default=0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(0, min(1, number))


def parse_suggestions(value):
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split("\n") if item.strip()]
    return ["继续看", "有点东西", "先标一个"]


def highlight_stats(highlight):
    rows = Interaction.objects.filter(highlight=highlight)
    breakdown = {}
    for item in rows:
        key = item.reaction or item.button_text or "已互动"
        breakdown[key] = breakdown.get(key, 0) + 1
    return {"total": rows.count(), "breakdown": breakdown}


def highlight_to_dict(highlight, include_stats=True):
    payload = {
        "id": highlight.id,
        "episodeId": highlight.episode_id,
        "episodeKey": highlight.episode_key,
        "startTime": float(highlight.start_time),
        "endTime": float(highlight.end_time),
        "type": highlight.type,
        "emotion": highlight.emotion or "",
        "intensity": float(highlight.intensity),
        "confidence": float(highlight.confidence),
        "summary": highlight.summary,
        "suggestions": highlight.suggestions or [],
        "status": highlight.status,
        "modelSource": highlight.model_source or "",
        "modelReason": highlight.model_reason or "",
        "triggerScore": highlight.trigger_score,
        "effectConfig": highlight.effect_config or {},
        "importedAt": highlight.imported_at.isoformat() if highlight.imported_at else None,
        "createdAt": highlight.created_at.isoformat() if highlight.created_at else None,
        "updatedAt": highlight.updated_at.isoformat() if highlight.updated_at else None,
    }
    if include_stats:
        payload["stats"] = highlight_stats(highlight)
    return payload


def episode_to_dict(episode, include_counts=False):
    payload = {
        "id": episode.id,
        "dramaId": episode.drama_id,
        "drama": {
            "id": episode.drama_id,
            "title": episode.drama.title,
        },
        "dramaTitle": episode.drama.title,
        "title": episode.title,
        "index": episode.episode_index,
        "episodeIndex": episode.episode_index,
        "episodeKey": episode.episode_key,
        "sourceKey": episode.episode_key,
        "fileName": episode.file_name,
        "videoUrl": episode.video_url,
        "durationSec": float(episode.duration_sec) if episode.duration_sec is not None else None,
        "duration": float(episode.duration_sec) if episode.duration_sec is not None else None,
        "sizeBytes": episode.file_size,
        "fileSize": episode.file_size,
        "status": episode.status,
    }
    if include_counts:
        all_highlights = Highlight.objects.filter(episode_key=episode.episode_key)
        payload["highlightCount"] = all_highlights.count()
        payload["publishedCount"] = all_highlights.filter(status="published").count()
    return payload


def branch_to_dict(branch):
    return {
        "id": branch.id,
        "episodeId": branch.episode_id,
        "episodeKey": branch.episode_key,
        "title": branch.title,
        "setup": branch.setup or "",
        "interactionNodes": branch.interaction_nodes or [],
        "interaction_nodes": branch.interaction_nodes or [],
        "status": branch.status,
        "modelSource": branch.model_source or "",
        "rawModelOutput": branch.raw_model_output or {},
        "createdAt": branch.created_at.isoformat() if branch.created_at else None,
        "updatedAt": branch.updated_at.isoformat() if branch.updated_at else None,
    }


def task_to_dict(task):
    playable = ""
    if task.local_file:
        playable = "/media/" + "/".join(part for part in str(task.local_file).replace("\\", "/").split("/"))
    elif task.video_url:
        playable = task.video_url
    return {
        "id": task.id,
        "episodeId": task.episode_id,
        "episodeKey": task.episode_key,
        "branchId": task.video_branch_id,
        "provider": task.provider,
        "model": task.model,
        "title": task.title,
        "videoPrompt": task.video_prompt,
        "promptSummary": task.video_prompt[:100],
        "status": task.status,
        "progress": task.progress,
        "videoUrl": task.video_url,
        "localFile": task.local_file,
        "playableUrl": playable,
        "thumbnailUrl": task.thumbnail_url,
        "errorMessage": task.error_message,
        "createdAt": task.created_at.isoformat() if task.created_at else None,
        "updatedAt": task.updated_at.isoformat() if task.updated_at else None,
    }


@require_http_methods(["GET"])
def dramas(request):
    items = []
    for drama in Drama.objects.prefetch_related("episodes").order_by("title"):
        episodes = [episode_to_dict(ep, include_counts=True) for ep in drama.episodes.order_by("episode_index", "title")]
        items.append({
            "id": drama.id,
            "title": drama.title,
            "description": drama.description or "",
            "posterUrl": drama.poster_url or "",
            "episodeCount": drama.episode_count or len(episodes),
            "episodes": episodes,
        })
    return JsonResponse({"dramas": items})


@require_http_methods(["GET"])
def review_episodes(request):
    episodes = Episode.objects.select_related("drama").order_by("drama__title", "episode_index", "title")
    return JsonResponse({"episodes": [episode_to_dict(ep, include_counts=True) for ep in episodes]})


@require_http_methods(["GET", "POST"])
def episode_highlights(request, episode_id):
    episode = get_object_or_404(Episode.objects.select_related("drama"), id=episode_id)
    if request.method == "GET":
        include_drafts = request.GET.get("includeDrafts") == "true"
        qs = Highlight.objects.filter(episode_key=episode.episode_key)
        if not include_drafts:
            qs = qs.filter(status="published")
        qs = qs.order_by("start_time", "end_time")
        return JsonResponse({"highlights": [highlight_to_dict(item) for item in qs]})

    body = read_body(request)
    now_ms = int(timezone.now().timestamp() * 1000)
    highlight = Highlight.objects.create(
        id=f"hl_{now_ms}",
        episode=episode,
        episode_key=episode.episode_key,
        start_time=float(body.get("startTime", 10)),
        end_time=float(body.get("endTime", 20)),
        type=str(body.get("type") or "悬念"),
        emotion=str(body.get("emotion") or "待补充"),
        intensity=clamp01(body.get("intensity", 0.6), 0.6),
        confidence=clamp01(body.get("confidence", 0.5), 0.5),
        summary=str(body.get("summary") or "新建候选高光"),
        suggestions=parse_suggestions(body.get("suggestions")),
        status=str(body.get("status") or "draft"),
        model_source=str(body.get("modelSource") or "manual"),
        model_reason=str(body.get("modelReason") or "人工新建候选高光"),
        raw_payload=body,
    )
    return JsonResponse({"highlight": highlight_to_dict(highlight)}, status=201)


@require_http_methods(["PUT"])
def highlight_detail(request, highlight_id):
    highlight = get_object_or_404(Highlight, id=highlight_id)
    body = read_body(request)
    mapping = {
        "startTime": "start_time",
        "endTime": "end_time",
        "modelSource": "model_source",
        "modelReason": "model_reason",
        "triggerScore": "trigger_score",
        "effectConfig": "effect_config",
    }
    for key, value in body.items():
        field = mapping.get(key, key)
        if field in {"start_time", "end_time", "intensity", "confidence"}:
            value = float(value)
        if field == "suggestions":
            value = parse_suggestions(value)
        if hasattr(highlight, field):
            setattr(highlight, field, value)
    highlight.save()
    return JsonResponse({"highlight": highlight_to_dict(highlight)})


@require_http_methods(["DELETE"])
def episode_highlight_delete(request, episode_id, highlight_id):
    get_object_or_404(Episode, id=episode_id)
    highlight = get_object_or_404(Highlight, id=highlight_id)
    highlight.delete()
    return JsonResponse({"success": True})


@require_http_methods(["POST"])
def interactions(request):
    body = read_body(request)
    highlight = get_object_or_404(Highlight, id=body.get("highlightId"))
    interaction = Interaction.objects.create(
        highlight=highlight,
        episode=highlight.episode,
        episode_key=highlight.episode_key,
        reaction=str(body.get("reaction") or "已互动"),
        button_text=str(body.get("buttonText") or body.get("reaction") or "已互动"),
        user_id=str(body.get("userId") or "") or None,
        device_id=str(body.get("deviceId") or "") or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
        metadata=body,
    )
    return JsonResponse({
        "interaction": {
            "id": f"act_{interaction.id}",
            "highlightId": highlight.id,
            "episodeKey": highlight.episode_key,
            "reaction": interaction.reaction,
            "buttonText": interaction.button_text,
            "createdAt": interaction.created_at.isoformat(),
        },
        "stats": highlight_stats(highlight),
    }, status=201)


@require_http_methods(["GET"])
def activity_feed(request, episode_id):
    episode = get_object_or_404(Episode, id=episode_id)
    highlights = list(Highlight.objects.filter(episode_key=episode.episode_key))
    highlight_ids = [item.id for item in highlights]
    interactions_qs = Interaction.objects.filter(highlight_id__in=highlight_ids).order_by("-created_at")
    highlight_by_id = {item.id: item for item in highlights}
    feed = []
    highlight_activity = {}
    for item in interactions_qs[:100]:
        h = highlight_by_id.get(item.highlight_id)
        reaction = item.reaction or item.button_text or "已互动"
        bucket = highlight_activity.setdefault(item.highlight_id, {"total": 0, "topReactions": {}})
        bucket["total"] += 1
        bucket["topReactions"][reaction] = bucket["topReactions"].get(reaction, 0) + 1
        if len(feed) < 20:
            feed.append({
                "id": f"act_{item.id}",
                "reaction": reaction,
                "highlightType": h.type if h else "高光",
                "highlightSummary": h.summary if h else "",
                "time": item.created_at.isoformat(),
            })
    return JsonResponse({
        "episodeId": episode.id,
        "totalInteractions": interactions_qs.count(),
        "feed": feed,
        "highlightActivity": highlight_activity,
        "uniqueUsers": interactions_qs.exclude(user_id__isnull=True).exclude(user_id="").values("user_id").distinct().count(),
    })


@require_http_methods(["GET"])
def continuations(request, episode_id):
    episode = get_object_or_404(Episode, id=episode_id)
    items = Continuation.objects.filter(episode_key=episode.episode_key).order_by("-updated_at")
    return JsonResponse({"continuations": [{
        "id": item.id,
        "episodeId": item.episode_id,
        "episodeKey": item.episode_key,
        "triggerHighlightId": item.trigger_highlight_id,
        "title": item.title,
        "setup": item.setup,
        "branches": item.branches,
        "status": item.status,
    } for item in items]})


@require_http_methods(["GET"])
def episode_video_branches(request, episode_id):
    episode = get_object_or_404(Episode, id=episode_id)
    items = VideoBranch.objects.filter(episode_key=episode.episode_key).order_by("-updated_at")
    return JsonResponse({"videoBranches": [branch_to_dict(item) for item in items]})


@require_http_methods(["POST"])
def generate_video_branches(request, episode_id):
    episode = get_object_or_404(Episode, id=episode_id)
    body = read_body(request)
    highlight = get_object_or_404(Highlight, id=body.get("highlightId"), episode_key=episode.episode_key)
    branch_id = f"vbranch_{highlight.id}"
    nodes = [
        {
            "node_id": "node_1",
            "trigger_highlight_id": highlight.id,
            "choice_text": "追问真相",
            "branch_summary": f"围绕“{highlight.summary[:40]}”继续推进冲突，让角色选择正面揭开真相。",
            "video_prompt": f"短剧分支视频，基于高光：{highlight.summary}。角色选择追问真相，气氛紧张，节奏强烈。",
        },
        {
            "node_id": "node_2",
            "trigger_highlight_id": highlight.id,
            "choice_text": "暂时隐忍",
            "branch_summary": f"围绕“{highlight.summary[:40]}”改写为隐忍蓄势，保留后续反转空间。",
            "video_prompt": f"短剧分支视频，基于高光：{highlight.summary}。角色暂时隐忍，埋下反击伏笔，悬念感强。",
        },
    ]
    branch, _ = VideoBranch.objects.update_or_create(
        id=branch_id,
        defaults={
            "episode": episode,
            "episode_key": episode.episode_key,
            "title": f"高光分支：{highlight.type}",
            "setup": highlight.summary,
            "interaction_nodes": nodes,
            "status": "draft",
            "model_source": "django-rule-demo",
            "raw_model_output": {"source": "local_demo", "highlightId": highlight.id},
        },
    )
    return JsonResponse({"videoBranch": branch_to_dict(branch), "videoBranches": [branch_to_dict(branch)]}, status=201)


@require_http_methods(["DELETE"])
def video_branch_detail(request, package_id):
    branch = get_object_or_404(VideoBranch, id=package_id)
    branch.delete()
    return JsonResponse({"success": True})


@require_http_methods(["POST"])
def video_gen_submit(request):
    body = read_body(request)
    prompt = str(body.get("videoPrompt") or "").strip()
    if not prompt:
        return JsonResponse({"error": "videoPrompt is required"}, status=400)
    task_id = f"vg_{int(timezone.now().timestamp() * 1000)}"
    episode = Episode.objects.filter(id=body.get("episodeId")).first()
    branch = VideoBranch.objects.filter(id=body.get("branchId")).first()
    task = VideoGenerationTask.objects.create(
        id=task_id,
        episode=episode,
        episode_key=body.get("episodeKey") or (episode.episode_key if episode else None),
        video_branch=branch,
        provider="manual-demo",
        model=str((body.get("config") or {}).get("model") or "pending-provider"),
        title=str(body.get("title") or "分支剧情视频"),
        video_prompt=prompt,
        status="pending",
        progress=0,
        request_payload=body,
    )
    return JsonResponse({"success": True, "task": task_to_dict(task)}, status=201)


@require_http_methods(["GET"])
def video_gen_tasks(request):
    episode_id = request.GET.get("episodeId")
    qs = VideoGenerationTask.objects.order_by("-created_at")
    if episode_id:
        qs = qs.filter(episode_id=episode_id)
    return JsonResponse({"tasks": [task_to_dict(item) for item in qs[:20]]})


@require_http_methods(["GET"])
def video_gen_downloads(request):
    tasks = VideoGenerationTask.objects.filter(status="completed").exclude(local_file__isnull=True).order_by("-updated_at")
    return JsonResponse({"files": [{
        "fileName": Path(item.local_file or "").name,
        "url": "/media/" + str(item.local_file or "").replace("\\", "/"),
        "localPath": item.local_file,
        "title": item.title or "分支视频",
        "taskId": item.id,
        "videoPrompt": item.video_prompt[:100],
    } for item in tasks]})


@require_http_methods(["GET"])
def generated_videos(request, episode_id):
    episode = get_object_or_404(Episode, id=episode_id)
    tasks = VideoGenerationTask.objects.filter(
        episode=episode,
        status="completed",
    ).exclude(local_file__isnull=True).order_by("-updated_at")
    return JsonResponse({"videos": [{
        "id": item.id,
        "title": item.title or "分支视频",
        "promptSummary": item.video_prompt[:100],
        "url": "/media/" + str(item.local_file or "").replace("\\", "/"),
        "duration": (item.request_payload or {}).get("duration", 8) if isinstance(item.request_payload, dict) else 8,
        "triggerTime": (item.request_payload or {}).get("triggerTime", 0) if isinstance(item.request_payload, dict) else 0,
        "highlightId": (item.request_payload or {}).get("highlightId", "") if isinstance(item.request_payload, dict) else "",
        "createdAt": item.created_at.isoformat() if item.created_at else None,
    } for item in tasks]})


@require_http_methods(["GET"])
def story_branches(request, episode_id):
    episode = get_object_or_404(Episode, id=episode_id)
    items = Continuation.objects.filter(episode=episode).order_by("-updated_at")
    return JsonResponse({"branches": [{
        "id": item.id,
        "title": item.title,
        "setup": item.setup,
        "branches": item.branches,
        "status": item.status,
    } for item in items]})


@require_http_methods(["GET"])
def model_settings(request):
    path = settings.DATA_DIR / "model-settings.json"
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        payload = {}
    payload.pop("apiKey", None)
    payload["hasApiKey"] = bool(os.getenv("ARK_API_KEY"))
    return JsonResponse(payload)


@require_http_methods(["GET"])
def model_prompt(request):
    path = settings.PROJECT_ROOT / "prompts" / "doubao-seed-2.0-lite-import.md"
    return JsonResponse({"prompt": path.read_text(encoding="utf-8") if path.exists() else ""})


@require_http_methods(["POST"])
def model_import(request):
    body = read_body(request)
    episode = get_object_or_404(Episode, id=body.get("episodeId"))
    items = body.get("highlights") or body.get("items") or []
    created = []
    for index, raw in enumerate(items):
        hid = str(raw.get("id") or f"hl_import_{int(timezone.now().timestamp() * 1000)}_{index}")
        highlight, _ = Highlight.objects.update_or_create(
            id=hid,
            defaults={
                "episode": episode,
                "episode_key": episode.episode_key,
                "start_time": float(raw.get("startTime") or raw.get("start_time") or 0),
                "end_time": float(raw.get("endTime") or raw.get("end_time") or 10),
                "type": str(raw.get("type") or raw.get("highlight_type") or "高光"),
                "emotion": str(raw.get("emotion") or ""),
                "intensity": clamp01(raw.get("intensity", 0.7), 0.7),
                "confidence": clamp01(raw.get("confidence", 0.8), 0.8),
                "summary": str(raw.get("summary") or "AI 导入高光"),
                "suggestions": parse_suggestions(raw.get("suggestions") or raw.get("interaction_suggestions")),
                "status": str(raw.get("status") or "draft"),
                "model_source": str(raw.get("modelSource") or "manual-import"),
                "model_reason": str(raw.get("modelReason") or raw.get("reason") or ""),
                "raw_payload": raw,
                "imported_at": timezone.now(),
            },
        )
        created.append(highlight_to_dict(highlight))
    return JsonResponse({"importedCount": len(created), "importedHighlights": created}, status=201)


@require_http_methods(["POST"])
def model_analyze_placeholder(request):
    body = read_body(request)
    episode = get_object_or_404(Episode, id=body.get("episodeId"))
    if body.get("replaceExisting"):
        Highlight.objects.filter(episode_key=episode.episode_key).delete()
    existing = Highlight.objects.filter(episode_key=episode.episode_key).order_by("start_time")
    if existing.exists() and not body.get("forceCreate"):
        imported = [highlight_to_dict(item) for item in existing[:3]]
        return JsonResponse({
            "analyzed": True,
            "importedCount": 0,
            "episodeId": episode.id,
            "episodeTitle": episode.title,
            "videoSource": episode.episode_key,
            "modelOutput": {"source": "existing_database", "message": "已有高光，未重复生成。"},
            "importedHighlights": imported,
        }, status=200)
    start = 8 + existing.count() * 12
    highlight = Highlight.objects.create(
        id=f"hl_django_{int(timezone.now().timestamp() * 1000)}",
        episode=episode,
        episode_key=episode.episode_key,
        start_time=start,
        end_time=start + 10,
        type="悬念",
        emotion="紧张",
        intensity=0.72,
        confidence=0.60,
        summary=f"{episode.title} 的候选剧情高光：角色关系出现变化，适合触发观众即时互动。",
        suggestions=["这里有反转", "继续看", "先标记"],
        status="draft",
        model_source="django-demo-analyzer",
        model_reason="Django 后端兜底解析结果，用于验证前端解析动作到数据库写入链路；正式部署时可替换为 Doubao 脚本调用。",
        raw_payload={"request": body, "source": "django_fallback"},
        imported_at=timezone.now(),
    )
    return JsonResponse({
        "analyzed": True,
        "importedCount": 1,
        "episodeId": episode.id,
        "episodeTitle": episode.title,
        "videoSource": episode.episode_key,
        "modelOutput": {"source": "django-demo-analyzer"},
        "importedHighlights": [highlight_to_dict(highlight)],
    }, status=201)


@require_http_methods(["GET", "PUT"])
def effects_config(request):
    setting, _ = AppSetting.objects.get_or_create(setting_key="effects_config", defaults={"setting_value": {}})
    if request.method == "PUT":
        setting.setting_value = {**(setting.setting_value or {}), **read_body(request)}
        setting.save()
    return JsonResponse({"config": setting.setting_value or {}})


def public_file(request, relative_path):
    path = (settings.PUBLIC_DIR / relative_path).resolve()
    if not str(path).startswith(str(settings.PUBLIC_DIR.resolve())) or not path.exists():
        raise Http404()
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(open(path, "rb"), content_type=content_type)


def frontend_index(request):
    return public_file(request, "index.html")


def frontend_review(request):
    return public_file(request, "review.html")


def media_file(request, relative_path):
    path = (settings.DATA_DIR / relative_path).resolve()
    if not str(path).startswith(str(settings.DATA_DIR.resolve())) or not path.exists():
        raise Http404()
    size = path.stat().st_size
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    range_header = request.headers.get("Range")
    if not range_header:
        response = FileResponse(open(path, "rb"), content_type=content_type)
        response["Accept-Ranges"] = "bytes"
        return response
    units, _, range_spec = range_header.partition("=")
    if units != "bytes":
        return HttpResponse(status=416)
    start_s, _, end_s = range_spec.partition("-")
    start = int(start_s or 0)
    end = int(end_s or size - 1)
    end = min(end, size - 1)
    if start > end:
        return HttpResponse(status=416)
    with open(path, "rb") as fh:
        fh.seek(start)
        data = fh.read(end - start + 1)
    response = HttpResponse(data, status=206, content_type=content_type)
    response["Content-Range"] = f"bytes {start}-{end}/{size}"
    response["Accept-Ranges"] = "bytes"
    response["Content-Length"] = str(len(data))
    return response
