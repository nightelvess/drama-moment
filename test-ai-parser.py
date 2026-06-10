#!/usr/bin/env python3
"""
AI 解析功能完整测试程序（使用官方文件上传方式）
用于本地测试 AI 高光解析功能的各个环节
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

# 尝试导入 volcenginesdkarkruntime
try:
    from volcenginesdkarkruntime import AsyncArk
    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False
    print("[WARN] volcenginesdkarkruntime 未安装")

# 修复 Windows 控制台编码
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# 项目根目录
ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
SETTINGS_FILE = DATA_DIR / "model-settings.json"

# Prompt 文件选项
PROMPT_FILES = {
    "original": ROOT_DIR / "prompts" / "doubao-seed-2.0-lite-import.md",
    "optimized": ROOT_DIR / "prompts" / "doubao-seed-2.0-lite-import-optimized.md"
}
DEFAULT_PROMPT = "optimized"

OUTPUT_DIR = ROOT_DIR / "test_output"
OUTPUT_DIR.mkdir(exist_ok=True)

# 最大视频测试大小 (100MB，文件上传方式更宽松)
MAX_VIDEO_BYTES = 200 * 1024 * 1024


def print_banner(title: str):
    """打印标题横幅"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def print_step(step: str, status: str = "[OK]"):
    """打印步骤信息"""
    print(f"\n{status} {step}")


def load_settings() -> dict[str, Any] | None:
    """加载设置文件"""
    print_step("加载设置文件")
    if not SETTINGS_FILE.exists():
        print(f"[FAIL] 设置文件不存在: {SETTINGS_FILE}")
        return None
    
    try:
        settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        print(f"  [OK] 模型名称: {settings.get('modelName')}")
        print(f"  [OK] API 地址: {settings.get('apiBaseUrl')}")
        print(f"  [OK] API Key: {settings.get('apiKey')[:10]}...")
        return settings
    except Exception as e:
        print(f"[FAIL] 加载设置失败: {e}")
        return None


def check_api_config(settings: dict[str, Any]) -> bool:
    """检查 API 配置"""
    print_step("检查 API 配置")
    
    required_fields = ["modelName", "apiBaseUrl", "apiKey"]
    all_ok = True
    
    for field in required_fields:
        value = settings.get(field)
        if not value:
            print(f"[FAIL] 缺少 {field}")
            all_ok = False
        else:
            print(f"[OK] {field}: OK")
    
    if not SDK_AVAILABLE:
        print(f"[FAIL] 缺少 SDK: 请运行: pip install volcenginesdkarkruntime")
        all_ok = False
    
    return all_ok


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


def load_prompt(prompt_type: str = DEFAULT_PROMPT) -> tuple[str, str] | tuple[None, None]:
    """加载提示词"""
    print_step(f"加载提示词文件 ({prompt_type})")
    
    if prompt_type not in PROMPT_FILES:
        print(f"[FAIL] 未知的 prompt 类型: {prompt_type}")
        print(f"可用选项: {list(PROMPT_FILES.keys())}")
        return None, None
    
    prompt_file = PROMPT_FILES[prompt_type]
    
    if not prompt_file.exists():
        print(f"[FAIL] 提示词文件不存在: {prompt_file}")
        return None, None
    
    try:
        text = prompt_file.read_text(encoding="utf-8")
        system_prompt = extract_code_block(text, "## System Prompt")
        user_template = extract_code_block(text, "## User Prompt Template")
        
        print(f"[OK] 使用文件: {prompt_file.name}")
        print(f"[OK] System Prompt: {len(system_prompt)} 字符")
        print(f"[OK] User Template: {len(user_template)} 字符")
        return system_prompt.strip(), user_template.strip()
    except Exception as e:
        print(f"[FAIL] 加载提示词失败: {e}")
        return None, None


def find_test_video() -> tuple[str, str, str] | None:
    """查找测试用的视频文件"""
    print_step("查找测试视频")
    
    if not DATA_DIR.exists():
        print(f"[FAIL] 数据目录不存在: {DATA_DIR}")
        return None
    
    # 查找子目录
    subdirs = [d for d in DATA_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not subdirs:
        print(f"[FAIL] 没有找到剧集目录")
        return None
    
    # 查找有视频的目录，并选择最小的视频
    for drama_dir in subdirs:
        video_files = list(drama_dir.glob("*.mp4"))
        if video_files:
            # 按文件大小排序，选择最小的
            video_files.sort(key=lambda f: f.stat().st_size)
            video_file = video_files[0]
            drama_title = drama_dir.name
            episode_title = video_file.stem
            
            print(f"[OK] 找到剧集: {drama_title}")
            print(f"[OK] 找到视频: {episode_title}")
            file_size_mb = video_file.stat().st_size / (1024 * 1024)
            print(f"[OK] 文件大小: {file_size_mb:.1f} MB")
            return drama_title, episode_title, str(video_file)
    
    print(f"[FAIL] 没有找到可用的视频文件")
    return None


def check_video_size(video_file: str) -> bool:
    """检查视频大小是否合适"""
    print_step("检查视频大小")
    
    file_path = Path(video_file)
    file_size = file_path.stat().st_size
    size_mb = file_size / (1024 * 1024)
    limit_mb = MAX_VIDEO_BYTES / (1024 * 1024)
    
    print(f"  视频大小: {size_mb:.1f} MB")
    print(f"  限制大小: {limit_mb:.0f} MB")
    
    if file_size > MAX_VIDEO_BYTES:
        print(f"[FAIL] 视频过大，超过限制")
        return False
    elif file_size > 50 * 1024 * 1024:
        print(f"[WARN] 视频较大，上传可能较慢")
        return True
    else:
        print(f"[OK] 视频大小合适")
        return True


async def test_api_connection(settings: dict[str, Any]) -> bool:
    """测试 API 连接（简单文本请求）"""
    print_step("测试 API 连接")
    
    base_url = settings.get("apiBaseUrl")
    api_key = settings.get("apiKey")
    model_name = settings.get("endpointId") or settings.get("modelName")
    
    try:
        print(f"  初始化客户端...")
        client = AsyncArk(base_url=base_url, api_key=api_key)
        
        print(f"  发送测试请求...")
        response = await client.responses.create(
            model=model_name,
            input=[
                {"role": "user", "content": "你好，请回复'连接成功'"}
            ]
        )
        
        print(f"[OK] API 响应正常！")
        
        # 解析响应 - 从 output 中找到 message 类型的项目
        if hasattr(response, 'output') and response.output:
            for item in response.output:
                if hasattr(item, 'type') and item.type == 'message':
                    if hasattr(item, 'content') and item.content:
                        for content_part in item.content:
                            if hasattr(content_part, 'text'):
                                print(f"  模型回复: {content_part.text}")
        
        await client.close()
        return True
    except Exception as e:
        print(f"[FAIL] API 连接失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def upload_video(client: AsyncArk, video_file: str) -> str | None:
    """上传视频文件"""
    print_step("上传视频文件")
    
    try:
        file_path = Path(video_file)
        file_size = file_path.stat().st_size
        print(f"  文件: {file_path.name} ({file_size / (1024 * 1024):.1f} MB)")
        
        print(f"  正在上传...")
        with open(video_file, "rb") as f:
            file_obj = await client.files.create(
                file=f,
                purpose="user_data",
                preprocess_configs={
                    "video": {
                        "fps": 0.3,
                    }
                }
            )
        
        print(f"[OK] 文件上传成功: {file_obj.id}")
        
        print_step("等待文件处理")
        await client.files.wait_for_processing(file_obj.id)
        print(f"[OK] 文件处理完成")
        
        return file_obj.id
    except Exception as e:
        print(f"[FAIL] 上传失败: {e}")
        import traceback
        traceback.print_exc()
        return None


def normalize_model_output(raw_output: dict[str, Any] | list[Any]) -> dict[str, Any]:
    """规范化模型输出"""
    if isinstance(raw_output, list):
        highlights = raw_output
        episode_summary = ""
    else:
        highlights = raw_output.get("highlights", [])
        episode_summary = raw_output.get("episode_summary", "")
    
    if not isinstance(highlights, list):
        raise ValueError("Model output must contain a highlights array")
    
    # 中文类型到英文类型的映射
    type_mapping = {
        "冲突": "conflict",
        "情绪爆发": "conflict",
        "反转": "reversal",
        "身份揭露": "reversal",
        "表白": "sweet",
        "甜蜜": "sweet",
        "打脸": "satisfying",
        "爽点": "satisfying",
        "营救": "satisfying",
        "悬念": "suspense",
        "剧尾钩子": "suspense",
    }
    
    normalized = []
    for item in highlights:
        highlight_type = item.get("highlight_type", item.get("type", "conflict"))
        # 如果类型是中文，尝试映射到英文
        if highlight_type in type_mapping:
            highlight_type = type_mapping[highlight_type]
        # 如果是其他中文，保持原样或者映射到默认
        
        intensity = item.get("intensity", 0.6)
        # 确保 intensity 在 0-1 之间
        if isinstance(intensity, (int, float)):
            if intensity > 1.0:
                # 如果大于 1，假设是 0-10 的范围，除以 10
                intensity = min(intensity / 10.0, 1.0)
            intensity = max(0.0, min(intensity, 1.0))
        else:
            intensity = 0.6
        
        normalized.append({
            "start_time": item.get("start_time", item.get("startTime")),
            "end_time": item.get("end_time", item.get("endTime")),
            "highlight_type": highlight_type,
            "emotion": item.get("emotion", "待补充"),
            "intensity": intensity,
            "confidence": item.get("confidence", 0.5),
            "summary": item.get("summary", ""),
            "interaction_suggestions": item.get("interaction_suggestions", item.get("interactionSuggestions", ["继续看", "有点东西"])),
            "reason": item.get("reason", item.get("modelReason", "由模型生成")),
            "status": item.get("status", "draft"),
        })
    
    return {
        "episode_summary": episode_summary,
        "highlights": normalized,
    }


def parse_model_json(message_text: str, settings: dict[str, Any]) -> dict[str, Any] | list[Any]:
    """解析模型返回的 JSON"""
    import re
    
    # 第一步：尝试直接解析
    text = message_text.strip()
    
    # 保存一份原始文本用于调试
    print(f"  处理前的文本长度: {len(text)}")
    if len(text) < 2000:
        print(f"  完整文本: {text}")
    else:
        print(f"  文本开头: {text[:500]}...")
    
    # 尝试方法 1：直接解析
    try:
        return json.loads(text)
    except:
        pass
    
    # 尝试方法 2：修复常见问题后解析
    fixed_text = fix_common_json_errors(text)
    
    try:
        return json.loads(fixed_text)
    except Exception as e:
        print(f"  修复后还是解析失败: {e}")
        
        # 尝试方法 3：找到第一个 { 到最后一个 } 之间的内容
        import re
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except:
                pass
    
    raise ValueError("Unable to parse JSON from model response")


def fix_common_json_errors(text: str) -> str:
    """尝试修复常见的 JSON 错误"""
    import re
    
    fixed = text
    
    # 1. 修复中文引号和标点
    fixed = fixed.replace("“", '"').replace("”", '"')
    # 注意：中文逗号不要替换，因为可能在内容中，只替换结构中的
    
    # 2. 最重要的修复：查找并修复所有 interaction_suggestions 字段
    # 模式: "interaction_suggestions": "a", "b"], ... → "interaction_suggestions": ["a", "b"], ...
    # 这种模式最常见，我们用一个循环来处理
    
    idx = 0
    while True:
        idx = fixed.find('"interaction_suggestions":', idx)
        if idx == -1:
            break
        
        start_idx = idx + len('"interaction_suggestions":')
        
        # 找到最近的 ] 的位置
        bracket_pos = fixed.find(']', start_idx)
        if bracket_pos == -1:
            idx = start_idx + 10
            continue
        
        # 包括 ] 在内的结束位置
        end_idx = bracket_pos + 1
        
        # 提取这个区域（包括开头到 ] ）
        value_part = fixed[start_idx:end_idx].strip()
        
        # 检查是否已经是正确的数组了
        if value_part.startswith('[') and value_part.endswith(']'):
            idx = end_idx
            continue
        
        # 需要修复，提取里面所有带引号的字符串
        quoted_strings = re.findall(r'"([^"]+)"', value_part)
        
        if quoted_strings:
            new_value = '[' + ', '.join(f'"{s}"' for s in quoted_strings) + ']'
            
            # 替换
            fixed = fixed[:start_idx] + new_value + fixed[end_idx:]
            
            idx = start_idx + len(new_value)
        else:
            idx = end_idx
    
    return fixed


async def test_video_analysis(
    settings: dict[str, Any],
    system_prompt: str,
    user_template: str,
    drama_title: str,
    episode_title: str,
    video_file: str
) -> dict[str, Any] | None:
    """完整视频分析测试"""
    print_step("发送分析请求")
    
    base_url = settings.get("apiBaseUrl")
    api_key = settings.get("apiKey")
    model_name = settings.get("endpointId") or settings.get("modelName")
    
    try:
        client = AsyncArk(base_url=base_url, api_key=api_key)
        
        # 1. 上传视频
        file_id = await upload_video(client, video_file)
        if not file_id:
            await client.close()
            return None
        
        # 2. 构建用户提示词
        user_prompt = user_template.replace("{{drama_title}}", drama_title).replace("{{episode_title}}", episode_title)
        
        print(f"  向 {model_name} 发送请求...")
        
        # 3. 发送请求
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
        
        print(f"[OK] 收到响应！")
        
        # 4. 解析响应 - 从 output 中找到 message 类型的项目并提取文本
        result_text = ""
        if hasattr(response, 'output') and response.output:
            for item in response.output:
                if hasattr(item, 'type') and item.type == 'message':
                    if hasattr(item, 'content') and item.content:
                        for content_part in item.content:
                            if hasattr(content_part, 'text'):
                                result_text += content_part.text
        
        print_step("解析结果")
        
        timestamp = asyncio.get_event_loop().time()
        raw_output_path = OUTPUT_DIR / f"raw_output_{int(timestamp)}.json"
        raw_output_path.write_text(result_text, encoding="utf-8")
        print(f"[OK] 原始输出已保存: {raw_output_path.name}")
        
        try:
            model_result = parse_model_json(result_text, settings)
            normalized = normalize_model_output(model_result)
            
            normalized_path = OUTPUT_DIR / f"normalized_{int(timestamp)}.json"
            normalized_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
            
            print(f"[OK] 解析成功！找到 {len(normalized['highlights'])} 个高光")
            for i, h in enumerate(normalized['highlights'][:3]):
                print(f"  {i+1}. [{h['highlight_type']}] {h['summary'][:50]}...")
            
            if len(normalized['highlights']) > 3:
                print(f"  ... 还有 {len(normalized['highlights']) - 3} 个高光")
            
            return normalized
        except Exception as e:
            print(f"[FAIL] 解析结果失败: {e}")
            print(f"  原始输出开头: {result_text[:200]}...")
            return None
        finally:
            await client.close()
    except Exception as e:
        print(f"[FAIL] 分析失败: {e}")
        import traceback
        traceback.print_exc()
        return None


async def main_async():
    print_banner("AI 解析功能测试程序（文件上传模式）")
    
    parser = argparse.ArgumentParser(description="AI 解析功能完整测试工具")
    parser.add_argument("--quick", action="store_true", help="快速测试（跳过视频分析）")
    parser.add_argument("--video-file", help="指定测试视频文件路径")
    parser.add_argument("--prompt", choices=list(PROMPT_FILES.keys()), default=DEFAULT_PROMPT,
                        help=f"选择使用的 prompt 版本 (默认: {DEFAULT_PROMPT})")
    args = parser.parse_args()
    
    # 1. 加载设置
    settings = load_settings()
    if not settings:
        print("\n[FAIL] 测试失败：无法加载设置")
        return 1
    
    # 2. 检查 API 配置
    if not check_api_config(settings):
        print("\n[FAIL] 测试失败：API 配置不完整")
        return 1
    
    # 3. 加载提示词
    system_prompt, user_template = load_prompt(args.prompt)
    if not system_prompt or not user_template:
        print("\n[FAIL] 测试失败：无法加载提示词")
        return 1
    
    # 4. 测试 API 连接
    if not await test_api_connection(settings):
        print("\n[FAIL] 测试失败：API 连接失败")
        return 1
    
    # 5. 如果是快速测试，这里就结束
    if args.quick:
        print_banner("快速测试完成 [OK]")
        print(f"所有基础功能正常！")
        return 0
    
    # 6. 查找/获取测试视频
    if args.video_file:
        video_path = Path(args.video_file)
        if not video_path.exists():
            print(f"[FAIL] 指定的视频文件不存在: {args.video_file}")
            return 1
        drama_title = "测试剧集"
        episode_title = video_path.stem
        video_file = str(video_path)
    else:
        video_info = find_test_video()
        if not video_info:
            print("\n[FAIL] 测试失败：无法找到测试视频")
            return 1
        drama_title, episode_title, video_file = video_info
    
    # 7. 检查视频大小
    if not check_video_size(video_file):
        print("\n[WARN] 注意：视频可能过大，但继续尝试...")
    
    # 8. 完整分析测试
    result = await test_video_analysis(
        settings=settings,
        system_prompt=system_prompt,
        user_template=user_template,
        drama_title=drama_title,
        episode_title=episode_title,
        video_file=video_file
    )
    
    if result:
        print_banner("测试完成 [OK]")
        print(f"测试结果已保存到: {OUTPUT_DIR}")
        return 0
    else:
        print_banner("测试失败 [FAIL]")
        return 1


def main():
    """同步包装"""
    try:
        return asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n\n用户中断")
        return 1


if __name__ == "__main__":
    sys.exit(main())
