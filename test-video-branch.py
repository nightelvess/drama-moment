"""
分支剧情视频生成测试程序
使用火山引擎doubao-seed-2.0-lite模型直接生成视频
"""

import asyncio
import os
import json
from volcenginesdkarkruntime import AsyncArk

# 配置API
client = AsyncArk(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.getenv("ARK_API_KEY")
)

# 模型名称
MODEL_NAME = "doubao-seed-2-0-lite-260215"


async def generate_branch_video(branch_description: str, duration: int = 5):
    """
    生成分支剧情视频

    Args:
        branch_description: 分支剧情描述
        duration: 视频时长（秒），默认5秒
    """
    print(f"\n{'='*60}")
    print("生成分支剧情视频")
    print(f"{'='*60}")
    print(f"剧情描述: {branch_description}")
    print(f"视频时长: {duration}秒")
    print()

    try:
        print("正在调用火山引擎视频生成API...")

        response = await client.responses.create(
            model=MODEL_NAME,
            input=[
                {
                    "type": "input_text",
                    "text": f"请根据以下剧情描述生成{duration}秒的视频片段：\n\n{branch_description}\n\n要求：\n1. 画面精美，电影质感\n2. 人物动作流畅自然\n3. 场景氛围与剧情相符\n4. 保持画面稳定，避免抖动"
                }
            ],
            parameters={
                "duration": duration,
                "aspect_ratio": "16:9",
                "resolution": "1080P"
            }
        )

        print("✅ 视频生成任务提交成功！")
        print(f"任务ID: {response.id}")
        print(f"状态: {response.status}")

        return response

    except Exception as e:
        print(f"❌ 生成失败: {e}")
        return None


async def generate_branch_video_with_reference(
    reference_video_path: str,
    branch_description: str,
    duration: int = 5
):
    """
    使用参考视频生成分支剧情视频

    Args:
        reference_video_path: 参考视频路径
        branch_description: 分支剧情描述
        duration: 视频时长（秒）
    """
    print(f"\n{'='*60}")
    print("使用参考视频生成分支剧情视频")
    print(f"{'='*60}")
    print(f"参考视频: {reference_video_path}")
    print(f"剧情描述: {branch_description}")
    print()

    try:
        print("1. 上传参考视频...")
        with open(reference_video_path, "rb") as video_file:
            file = await client.files.create(
                file=video_file,
                purpose="user_data",
                preprocess_configs={
                    "video": {
                        "fps": 0.5,
                    }
                }
            )
        print(f"   文件上传成功: {file.id}")

        print("2. 等待视频处理完成...")
        await client.files.wait_for_processing(file.id)
        print("   视频处理完成")

        print("3. 生成分支剧情视频...")
        response = await client.responses.create(
            model=MODEL_NAME,
            input=[
                {
                    "type": "input_video",
                    "file_id": file.id
                },
                {
                    "type": "input_text",
                    "text": f"基于参考视频的风格和内容，生成一个新的视频片段：\n\n{branch_description}\n\n要求：\n1. 保持与参考视频一致的视觉风格\n2. 人物形象和场景氛围相似\n3. 展现新的剧情发展\n4. 时长{duration}秒"
                }
            ]
        )

        print("✅ 视频生成任务提交成功！")
        print(f"任务ID: {response.id}")
        print(f"状态: {response.status}")

        return response

    except Exception as e:
        print(f"❌ 生成失败: {e}")
        return None


async def check_task_status(task_id: str):
    """
    查询视频生成任务状态
    """
    print(f"\n{'='*60}")
    print(f"查询任务状态: {task_id}")
    print(f"{'='*60}")

    try:
        response = await client.responses.retrieve(task_id)
        print(f"任务ID: {response.id}")
        print(f"状态: {response.status}")

        if hasattr(response, 'output') and response.output:
            print(f"输出: {response.output}")

        return response

    except Exception as e:
        print(f"❌ 查询失败: {e}")
        return None


async def list_recent_tasks(limit: int = 10):
    """
    列出最近的任务
    """
    print(f"\n{'='*60}")
    print(f"最近的任务 (限制: {limit})")
    print(f"{'='*60}")

    try:
        responses = await client.responses.list(limit=limit)
        for resp in responses:
            print(f"  - {resp.id}: {resp.status}")
        return responses
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        return None


def generate_branch_descriptions(plot_summary: str, num_branches: int = 3):
    """
    生成多个分支剧情描述（用于生成视频）

    Args:
        plot_summary: 原剧情概要
        num_branches: 分支数量
    """
    print(f"\n{'='*60}")
    print("基于原剧情生成分支剧情描述")
    print(f"{'='*60}")
    print(f"原剧情: {plot_summary}")
    print()

    # 这里可以调用AI来生成分支剧情描述
    # 暂时使用预定义的分支
    branches = []

    if num_branches >= 1:
        branches.append({
            "id": "branch_1",
            "title": "英雄救美",
            "description": "主角在危急时刻出现，成功救出被困的朋友，展现出超凡的能力和勇气。"
        })

    if num_branches >= 2:
        branches.append({
            "id": "branch_2",
            "title": "意外发现",
            "description": "在逃亡过程中，主角意外发现了一个隐藏的密室，里面藏有重要的线索。"
        })

    if num_branches >= 3:
        branches.append({
            "id": "branch_3",
            "title": "情感突破",
            "description": "面对强大的敌人，主角选择相信队友，两人联手击退了敌人，关系更进一步。"
        })

    for i, branch in enumerate(branches):
        print(f"分支 {i+1}: {branch['title']}")
        print(f"描述: {branch['description']}")
        print()

    return branches


async def main():
    """
    主函数 - 测试分支剧情视频生成
    """
    print("╔" + "═"*58 + "╗")
    print("║        分支剧情视频生成 - 火山引擎API测试程序           ║")
    print("╚" + "═"*58 + "╝")

    # 检查API Key
    if not os.getenv("ARK_API_KEY"):
        print("❌ 错误: 请设置 ARK_API_KEY 环境变量")
        print("   Windows: set ARK_API_KEY=your_api_key")
        print("   或在代码中设置: os.environ['ARK_API_KEY'] = 'your_api_key'")
        return

    print(f"\n✅ API Key已配置")
    print(f"使用的模型: {MODEL_NAME}")

    # 示例1: 直接生成分支剧情视频（文字描述）
    print("\n" + "="*60)
    print("示例1: 基于文字描述生成视频")
    print("="*60)

    branch_desc = """
    场景：一座古老的寺庙，夜色笼罩，月光透过残破的屋顶洒落。
    人物：一位身穿白衣的年轻女子，手持一盏灯笼，独自站在庭院中央。
    动作：她缓缓抬起头，望向天空，突然一阵风吹过，灯笼摇曳。
    氛围：神秘、幽静、带有淡淡的忧伤。
    情绪：从孤独到释然。
    """

    task = await generate_branch_video(branch_desc.strip(), duration=5)

    if task:
        print(f"\n任务已提交，请记录任务ID: {task.id}")
        print("可以使用 check_task_status() 函数查询进度")

    # 示例2: 如果有参考视频，可以使用参考视频生成
    # reference_video = "path/to/your/video.mp4"
    # task2 = await generate_branch_video_with_reference(
    #     reference_video,
    #     "主角在古墓中发现宝藏，展现出惊讶的表情",
    #     duration=5
    # )

    # 示例3: 查询最近的任务
    await list_recent_tasks(limit=5)

    print("\n" + "="*60)
    print("测试完成！")
    print("="*60)
    print("\n使用说明:")
    print("1. generate_branch_video() - 直接基于文字描述生成视频")
    print("2. generate_branch_video_with_reference() - 使用参考视频生成")
    print("3. check_task_status() - 查询任务状态")
    print("4. list_recent_tasks() - 查看最近任务")


if __name__ == "__main__":
    # 设置API Key（请替换为你的实际API Key）
    # os.environ["ARK_API_KEY"] = "your_actual_api_key_here"

    asyncio.run(main())
