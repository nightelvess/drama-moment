# 剧燃 Moment 🔥

> 基于短剧剧情高光识别的即时互动激发平台 — AI 全栈挑战项目

## 📋 项目概述

**剧燃 Moment** 是一个完整的短剧互动体验平台，通过 AI 模型（Doubao-Seed-2.0-lite）自动识别短剧中的剧情高光点，在用户观看时触发即时互动组件（弹幕、动效、剧情分支选择等），降低用户情绪表达门槛，增强看剧参与感。

### 核心功能

| 功能 | 说明 |
|------|------|
| 🎬 短剧播放 | 多剧集列表、MP4 流媒体播放、完整播控能力 |
| 🤖 AI 高光识别 | Doubao-Seed-2.0-lite 自动分析剧情冲突、反转、甜蜜等高光片段 |
| 💥 即时互动 | 高光时刻触发动效（闪屏/爱心雨/震动/倒计时）+ 互动按钮 |
| 📝 审核后台 | 高光点编辑、审核、发布、导入/导出管理 |
| 💬 弹幕引擎 | 高光自动弹幕 + 用户点击生成弹幕 |
| 🌿 剧情分支 | 剧尾钩子触发分支选项，AI 生成多走向剧情脚本 |
| 🚀 AIGC 加速包 | 营救类高光触发 AI 内容插入（加速跳过等待） |
| 📊 互动统计 | 实时互动计数、热力条、用户动态流 |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│              Frontend (Web)             │
│  index.html + app.js + styles.css      │
│  - Video Player (原生 <video>)          │
│  - Danmaku Layer (CSS Animation)       │
│  - Interactive Overlay                  │
│  - Activity Feed Panel                 │
└──────────────┬──────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────┐
│         Backend (Node.js)               │
│  server.js (Zero-dependency HTTP)      │
│  - RESTful API routes                  │
│  - Media streaming (byte-range)        │
│  - JSON file-based storage             │
│  - AI model proxy (Volcengine Ark)     │
└──────────────┬──────────────────────────┘
               │ subprocess
┌──────────────▼──────────────────────────┐
│      AI Pipeline (Python)               │
│  analyze_episode.py / batch_analyze.py │
│  - Doubao-Seed-2.0-lite API call      │
│  - Highlight extraction & normalization│
│  - Auto-import to backend              │
└─────────────────────────────────────────┘
```

### 技术选型

- **前端**: 原生 HTML/CSS/JS（无框架，零依赖）
- **后端**: Node.js HTTP Server（零 npm 依赖）
- **存储**: JSON 文件（`data/store.json` + `data/db.json`）
- **AI 模型**: Doubao-Seed-2.0-lite（火山方舟 API）
- **媒体**: MP4 byte-range streaming
- **部署**: 本地 Node Server + Cloudflare Tunnel 公网穿透

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- Python >= 3.9
- 火山方舟 API Key + Endpoint ID（用于 AI 分析）

### 安装运行

```bash
# 1. 克隆项目
git clone <repo-url>
cd 剧燃Moment

# 2. 放置短剧视频到 data/ 目录
# 目录结构: data/<剧名>/第X集.mp4

# 3. 配置 AI 模型
# 访问 http://127.0.0.1:3000/review.html
# 在设置中填入 API Key 和 Endpoint ID

# 4. 启动服务
node server.js

# 5. 访问
# 播放器: http://127.0.0.1:3000/
# 审核台: http://127.0.0.1:3000/review.html
```

### AI 高光分析

```bash
# 分析单集
python scripts/analyze_episode.py \
  --drama-title "北派寻宝笔记" \
  --episode-title "第63集" \
  --video-file "data/北派寻宝笔记/第63集.mp4" \
  --import-result

# 批量分析所有未分析的剧集
python scripts/batch_analyze.py --dry-run     # 预览
python scripts/batch_analyze.py --import-result # 执行

# 分析指定剧集
python scripts/batch_analyze.py --drama "天下第一纨绔" --import-result
```

### 公网部署

```bash
# 使用 Cloudflare Tunnel
cloudflared tunnel --url http://127.0.0.1:3000

# 或使用 ngrok
ngrok http 3000
```

## 📁 项目结构

```
├── server.js                  # 后端主入口（1800+ 行）
├── public/                    # 前端静态资源
│   ├── index.html             # 播放器页面
│   ├── app.js                 # 播放器逻辑（含弹幕/互动/分支）
│   ├── review.html            # 高光审核台
│   ├── review.js              # 审核台逻辑
│   └── styles.css             # 全局样式（6500+ 行）
├── data/                      # 数据目录
│   ├── store.json             # 高光 + 互动数据
│   ├── db.json                # 剧集元数据 + 统计
│   ├── effects-config.json    # 动效配置
│   ├── model-settings.json    # AI 模型配置
│   └── <剧名>/                # MP4 剧集文件
├── scripts/                   # Python 脚本
│   ├── analyze_episode.py     # 单集 AI 分析
│   ├── batch_analyze.py       # 批量分析
│   └── test_model_call.py     # API 连通性测试
├── prompts/                   # AI Prompt 模板
│   ├── doubao-seed-2.0-lite-import.md
│   ├── doubao-seed-2.0-lite-import-optimized.md
│   ├── content-generator.md
│   └── video-branch-brainstorm.md
└── docs/                      # 技术文档
```

## 🎯 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dramas` | 获取所有剧集列表 |
| GET | `/api/episodes/:id/highlights` | 获取剧集高光点 |
| GET | `/api/highlights/:id/activity` | 获取高光互动统计 |
| GET | `/api/episodes/:id/activity-feed` | 获取剧集互动动态流 |
| POST | `/api/interactions` | 提交互动 |
| POST | `/api/model/import` | 导入 AI 分析结果 |
| PUT | `/api/highlights/:id` | 更新高光点 |
| GET/PUT | `/api/effects/config` | 动效配置 |
| GET/PUT | `/api/model/settings` | 模型配置 |

## 🎨 互动类型

| 高光类型 | 动效 | 弹幕 |
|----------|------|------|
| 反转/打脸/爽点 | 闪屏 + 粒子爆发 + 震动 + 名场面印章 | 🔥 |
| 甜蜜 | 爱心雨 + 文字飘浮 | 💕 |
| 冲突/情绪/营救 | 边框辉光 + 冲击波 + AIGC 加速包 | ⚡ |
| 悬念/剧尾钩子 | 辉光 + 扫描线 + 倒计时环 | ❓ |
| 搞笑 | 爆发 + 文字浮动 | 😂 |

## 📝 交付物

- ✅ GitHub 项目仓库
- ✅ 项目展示录屏
- ✅ 飞书技术文档（`docs/` 目录）
- ✅ AI 参与部分说明

## 🤖 AI 参与说明

本项目在以下环节使用 AI 辅助：

1. **高光识别**: Doubao-Seed-2.0-lite 多模态分析视频内容，自动识别剧情高光点
2. **互动按钮生成**: AI 根据高光类型和剧情摘要生成推荐互动按钮文案
3. **剧情续写**: 剧尾钩子触发时，AI 生成多个剧情分支剧本
4. **AIGC 加速内容**: 营救类高光触发时，AI 实时生成插入内容
5. **视频分支构思**: AI 根据高光点头脑风暴可行的视频分支创意

## 📄 License

MIT
