#!/usr/bin/env python3
"""
分析一集短剧并导入到本地后端（支持火山引擎文件上传方式）
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

# 尝试导入火山引擎 SDK
try:
    from volcenginesdkarkruntime import AsyncArk
    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
SETTINGS_FILE = DATA_DIR / "model-settings.json"

# Prompt 文件选项
PROMPT_FILES = {
    "original": ROOT_DIR / "prompts" / "doubao-seed-2.0-lite-import.md",
    "optimized": ROOT_DIR / "prompts" / "doubao-seed-2.0-lite-import-optimized.md"
}
DEFAULT_PROMPT = "optimized"
DEFAULT_BACKEND_URL = "http://127.0.0.1:3000"
MAX_VIDEO_BYTES = 200 * 1024 * 1024  # 文件上传支持更大的文件


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_settings() -> dict[str, Any]:
    """加载设置文件"""
    return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))


def extract_code_block(markdown: str, heading: str) -> str:
    """从 Markdown 中提取代码块"""
    start = markdown.find(heading)
    if start < 0:
        raise ValueError(f"Missing section: {heading}")
    fence_start = markdown.find("```", start)
    if fence_start < 0:
        raise ValueError(f"Missing code block after: {heading}")
    fence_end = markdown.find("```", fence_start + 3)
    if fence_end < 0:
        raise ValueError(f"Unclosed code block after: {heading}")
    block = markdown[fence_start + 3 : fence_end]
    first_newline = block.find("\n")
    if first_newline >= 0:
        block = block[first_newline + 1 :]
    return block.strip()


def load_prompt_sections(prompt_type: str = DEFAULT_PROMPT) -> tuple[str, str]:
    """加载提示词"""
    if prompt_type not in PROMPT_FILES:
        raise ValueError(f"Unknown prompt type: {prompt_type}")
    
    prompt_file = PROMPT_FILES[prompt_type]
    text = prompt_file.read_text(encoding="utf-8")
    system = extract_code_block(text, "## System Prompt")
    user_template = extract_code_block(text, "## User Prompt Template")
    return system.strip(), user_template.strip()


def make_episode_id(drama_title: str, episode_title: str) -> str:
    """生成剧集 ID"""
    file_name = episode_title if episode_title.endswith(".mp4") else f"{episode_title}.mp4"
    source_key = f"{drama_title}/{file_name}"
    return f"ep_{hashlib.sha1(source_key.encode('utf-8')).hexdigest()[:16]}"


def fill_user_prompt(template: str, drama_title: str, episode_title: str) -> str:
    """填充用户提示词模板"""
    return template.replace("{{drama_title}}", drama_title).replace("{{episode_title}}", episode_title)


def strip_json_fence(text: str) -> str:
    """移除 JSON 围栏"""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        if first_newline >= 0:
            cleaned = cleaned[first_newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
    return cleaned.strip()


def extract_json_candidate(text: str) -> str:
    """从文本中提取 JSON 候选"""
    cleaned = strip_json_fence(text)
    if cleaned.lower().startswith("json"):
        cleaned = cleaned[4:].lstrip()

    object_start = cleaned.find("{")
    object_end = cleaned.rfind("}")
    array_start = cleaned.find("[")
    array_end = cleaned.rfind("]")

    candidates: list[str] = []
    if object_start >= 0 and object_end > object_start:
        candidates.append(cleaned[object_start : object_end + 1])
    if array_start >= 0 and array_end > array_start:
        candidates.append(cleaned[array_start : array_end + 1])
    return candidates[0] if candidates else cleaned


def normalize_json_text(text: str) -> str:
    """规范化 JSON 文本"""
    normalized = text.strip()
    normalized = normalized.replace("“", '"').replace("”", '"')
    normalized = normalized.replace("‘", '"').replace("’", '"')
    normalized = re.sub(r",(\s*[}\]])", r"\1", normalized)
    return normalized


def fix_common_json_errors(text: str) -> str:
    """修复常见的 JSON 错误"""
    fixed = text
    
    # 修复缺少数组括号的问题
    fixed = re.sub(r'"interaction_suggestions":\s*"([^"]+)"', r'"interaction_suggestions": ["\1"]', fixed)
    
    # 修复单引号问题
    fixed = re.sub(r"'([^']+)'", r'"\1"', fixed)
    
    return fixed


def parse_model_json(message_text: str) -> dict[str, Any] | list[Any]:
    """解析模型输出的 JSON"""
    attempts = [
        strip_json_fence(message_text),
        extract_json_candidate(message_text),
        normalize_json_text(extract_json_candidate(message_text)),
        fix_common_json_errors(normalize_json_text(extract_json_candidate(message_text))),
    ]
    last_error: Exception | None = None

    for attempt in attempts:
        if not attempt:
            continue
        try:
            return json.loads(attempt)
        except json.JSONDecodeError as exc:
            last_error = exc

    raise ValueError(f"Model returned invalid JSON after attempts: {last_error}")


def normalize_model_output(raw_output: dict[str, Any] | list[Any]) -> dict[str, Any]:
    """规范化模型输出"""
    if isinstance(raw_output, list):
        highlights = raw_output
        episode_summary = ""
    else:
        highlights = raw_output.get("highlights")
        episode_summary = raw_output.get("episode_summary", "")
    if not isinstance(highlights, list):
        raise ValueError("Model output must contain a highlights array")
    
    # 英文类型名到中文类型名的映射
    type_mapping = {
        "conflict": "冲突",
        "reversal": "反转",
        "sweet": "甜蜜",
        "satisfying": "爽点",
        "suspense": "悬念"
    }

    normalized = []
    for item in highlights:
        intensity = item.get("intensity", 0.6)
        if intensity > 1.0:
            intensity = intensity / 10.0
        
        # 转换类型名
        highlight_type = item.get("highlight_type", item.get("type"))
        if highlight_type in type_mapping:
            highlight_type = type_mapping[highlight_type]
            
        normalized.append(
            {
                "start_time": item.get("start_time", item.get("startTime")),
                "end_time": item.get("end_time", item.get("endTime")),
                "highlight_type": highlight_type,
                "emotion": item.get("emotion", "待补充"),
                "intensity": intensity,
                "confidence": item.get("confidence", 0.5),
                "summary": item.get("summary", ""),
                "interaction_suggestions": item.get(
                    "interaction_suggestions",
                    item.get("interactionSuggestions", ["继续看", "有点东西"]),
                ),
                "reason": item.get("reason", item.get("modelReason", "由模型生成")),
                "status": item.get("status", "draft"),
            }
        )
    return {
        "episode_summary": episode_summary,
        "highlights": normalized,
    }


async def upload_video(client: AsyncArk, video_path: str) -> str:
    """上传视频文件到火山引擎"""
    print(f"  正在上传视频: {Path(video_path).name}")
    
    with open(video_path, "rb") as f:
        file_obj = await client.files.create(
            file=f,
            purpose="user_data"
        )
    
    print(f"  [OK] 视频上传成功，文件 ID: {file_obj.id}")
    
    # 等待文件处理完成
    await client.files.wait_for_processing(file_obj.id)
    print(f"  [OK] 视频处理完成")
    
    return file_obj.id


async def analyze_with_sdk(
    settings: dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    video_path: str,
) -> str:
    """使用火山引擎 SDK 分析视频"""
    if not SDK_AVAILABLE:
        raise RuntimeError("volcenginesdkarkruntime 未安装")
    
    base_url = settings.get("apiBaseUrl")
    api_key = settings.get("apiKey")
    model_name = settings.get("endpointId") or settings.get("modelName")
    
    if not model_name:
        raise ValueError("缺少 endpointId/modelName")
    if not api_key:
        raise ValueError("缺少 apiKey")
    if not base_url:
        raise ValueError("缺少 apiBaseUrl")
    
    client = AsyncArk(base_url=base_url, api_key=api_key)
    
    try:
        file_id = await upload_video(client, video_path)
        
        print(f"  正在调用模型分析...")
        
        response = await client.responses.create(
            model=model_name,
            input=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "input_video", "file_id": file_id},
                        {"type": "input_text", "text": user_prompt}
                    ]
                }
            ]
        )
        
        print(f"  [OK] 收到模型响应")
        
        # 提取响应文本
        result_text = ""
        if hasattr(response, "output") and response.output:
            for item in response.output:
                if hasattr(item, "type") and item.type == "message":
                    if hasattr(item, "content") and item.content:
                        for content_part in item.content:
                            if hasattr(content_part, "text"):
                                result_text += content_part.text
        
        return result_text
        
    finally:
        await client.close()


def import_to_backend(
    *,
    backend_url: str,
    episode_id: str,
    normalized_output: dict[str, Any],
    replace_existing: bool,
) -> dict[str, Any]:
    """导入结果到后端"""
    import urllib.request
    
    payload = {
        "episodeId": episode_id,
        "replaceExisting": replace_existing,
        "modelOutput": json.dumps(normalized_output, ensure_ascii=False),
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{backend_url.rstrip('/')}/api/model/import",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_args() -> argparse.Namespace:
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="Analyze one episode and optionally import the result into the local backend."
    )
    parser.add_argument("--drama-title", required=True, help="Drama title, for example 北派寻宝笔记")
    parser.add_argument("--episode-title", required=True, help="Episode title, for example 第63集 or 第63集.mp4")
    parser.add_argument("--video-file", required=True, help="Local MP4 file path")
    parser.add_argument("--output-file", help="Write the normalized JSON output to this file")
    parser.add_argument("--raw-output-file", help="Write the raw model response to this file")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL, help="Local backend URL")
    parser.add_argument("--import-result", action="store_true", help="Import the normalized result into the local backend")
    parser.add_argument("--replace-existing", action="store_true", help="Replace existing highlights for the target episode")
    parser.add_argument("--prompt-type", default=DEFAULT_PROMPT, choices=list(PROMPT_FILES.keys()), help="Prompt version to use")
    return parser.parse_args()


def main() -> int:
    """主函数"""
    args = parse_args()
    
    # 检查 SDK
    if not SDK_AVAILABLE:
        print("[ERROR] volcenginesdkarkruntime 未安装", file=sys.stderr)
        print("请运行: pip install volcenginesdkarkruntime", file=sys.stderr)
        return 1
    
    # 加载设置
    try:
        settings = load_settings()
        system_prompt, user_template = load_prompt_sections(args.prompt_type)
        user_prompt = fill_user_prompt(user_template, args.drama_title, args.episode_title)
    except Exception as e:
        print(f"[ERROR] 初始化失败: {e}", file=sys.stderr)
        return 1
    
    # 验证视频文件
    video_path = Path(args.video_file)
    if not video_path.exists():
        print(f"[ERROR] 视频文件不存在: {video_path}", file=sys.stderr)
        return 1
    
    if video_path.stat().st_size > MAX_VIDEO_BYTES:
        limit_mb = MAX_VIDEO_BYTES // (1024 * 1024)
        actual_mb = round(video_path.stat().st_size / (1024 * 1024), 1)
        print(f"[ERROR] 视频文件过大: {actual_mb} MB (限制: {limit_mb} MB)", file=sys.stderr)
        return 1
    
    print(f"[INFO] 使用提示词版本: {args.prompt_type}")
    
    # 执行分析
    try:
        message_text = asyncio.run(analyze_with_sdk(
            settings=settings,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            video_path=str(video_path),
        ))
        
        normalized_output = normalize_model_output(parse_model_json(message_text))
    except Exception as exc:
        print(f"[ERROR] 分析失败: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1
    
    # 保存输出
    if args.raw_output_file:
        Path(args.raw_output_file).write_text(message_text, encoding="utf-8")
        print(f"[OK] 原始响应已保存到: {args.raw_output_file}")
    
    rendered = json.dumps(normalized_output, ensure_ascii=False, indent=2)
    if args.output_file:
        Path(args.output_file).write_text(rendered, encoding="utf-8")
        print(f"[OK] 规范化输出已保存到: {args.output_file}")
    else:
        print("\n[RESULTS]")
        print(rendered)
    
    # 导入到后端
    if args.import_result:
        episode_id = make_episode_id(args.drama_title, args.episode_title)
        try:
            result = import_to_backend(
                backend_url=args.backend_url,
                episode_id=episode_id,
                normalized_output=normalized_output,
                replace_existing=args.replace_existing,
            )
            print(f"\n[OK] 导入成功")
            print(json.dumps({
                "episode_id": episode_id,
                "imported_count": result.get("importedCount"),
                "episode_title": result.get("episodeTitle"),
            }, ensure_ascii=False, indent=2))
        except Exception as exc:
            print(f"[ERROR] 导入失败: {exc}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            return 1
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
