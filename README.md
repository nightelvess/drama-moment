# 剧燃 Moment

> 基于短剧剧情高光识别的即时互动与 AIGC 分支系统
> 默认后端：Django + ORM + SQLite / MySQL

## 项目简介

剧燃 Moment 面向短剧播放场景，解决“用户情绪最高点没有被及时激发互动”的问题。

系统会对真实短剧 MP4 进行剧情理解，识别冲突、反转、打脸、悬念、甜蜜撒糖等高光片段；高光进入审核后台后，由人工编辑、发布和管理；前台播放器再根据高光时间点展示进度条标记、剧情摘要、互动按钮、全屏动效和互动统计。

核心闭环：

```text
真实短剧 MP4
  -> AI 高光识别
  -> 审核后台发布
  -> 前台播放器互动
  -> 用户行为回流
  -> AIGC 分支生成
```

## 核心亮点

### 1. 短剧高光驱动互动

高光点不是简单手动写死，而是围绕剧情中的冲突、反转、悬念等关键片段生成。前台播放器会在对应时间点展示互动入口，让用户在情绪峰值处完成即时表达。

### 2. AI 生成，人工审核

AI 负责生成候选高光，审核后台负责人工修正和发布。这样既提高内容生产效率，也避免模型误判直接影响前台体验。

### 3. Django 真实数据库后端

项目默认采用 Django 后端实现。前台互动、后台高光编辑、AIGC 分支生成、视频任务提交都会通过 Django API 写入数据库。

### 4. AIGC 分支基于选中高光

AIGC 分支不是对整集随机续写，而是基于某个被选中的剧情高光生成，能更好承接用户对关键剧情的二次想象。

### 5. 分支视频与原始剧集隔离

`data/generated` 中的分支生成视频只作为 AIGC 产物存在，不参与普通剧集扫描，也不会被再次拿去生成高光，避免污染高光数据。

## 功能概览

### 前台播放器

- 剧集搜索与选集
- MP4 播放、暂停、音量、全屏
- 进度条内嵌高光点
- 高光摘要卡片
- 互动按钮与互动统计
- 全屏高光动效展示

### 审核后台

- 按剧集管理高光
- 高光解析 / 导入
- 视频预览与时间轴标记
- 高光编辑、发布、删除
- 批量发布和批量删除
- AIGC 分支管理
- 视频生成任务池

### Django 后端

- 剧集列表 API
- 高光 CRUD API
- 用户互动写入 API
- 活动流和统计 API
- AIGC 分支 API
- 视频生成任务 API
- JSON 数据导入命令
- SQLite / MySQL 数据库支持

## 技术架构

```text
┌──────────────────────────────────────────────┐
│                  Web 前端                     │
│  前台播放器 / 审核后台 / 高光动效 / 互动统计   │
└──────────────────────┬───────────────────────┘
                       │ REST API
                       v
┌──────────────────────────────────────────────┐
│              Django 后端服务                  │
│  API 路由 / 业务服务 / ORM / 媒体访问          │
└───────────────┬──────────────────┬───────────┘
                │                  │
                v                  v
┌──────────────────────┐   ┌───────────────────┐
│   SQLite / MySQL      │   │   AI 与生成能力     │
│  高光 / 互动 / 分支   │   │ Doubao / AIGC 分支  │
└──────────────┬───────┘   └─────────┬─────────┘
               │                     │
               v                     v
┌──────────────────────────────────────────────┐
│                  媒体资源层                   │
│ data/<剧名>/*.mp4 原始剧集                    │
│ data/generated/*.mp4 AIGC 分支视频             │
└──────────────────────────────────────────────┘
```

## 项目结构

```text
backend_django/          Django 数据库后端，默认推荐运行方式
  drama_ai/              Django 项目配置
  content/               业务模型、API、数据导入命令
  manage.py              Django 管理入口
  requirements.txt       Django 依赖

public/                  Web 前端
  index.html             前台播放器
  review.html            审核后台
  app.js                 前台交互逻辑
  review.js              审核后台逻辑
  styles.css             全局样式

data/                    本地数据与视频资源
  db.json                历史 JSON 数据
  store.json             旧版兼容数据
  model-settings.json    模型配置，本地敏感文件不提交
  generated/             AIGC 分支视频，不参与普通剧集扫描
  <剧名>/                真实短剧 MP4

scripts/                 模型调用、测试和数据导出脚本
prompts/                 高光解析与 AIGC 分支 Prompt
docs/                    MySQL schema 与技术文档
server.js                Node 兼容演示后端
android/                 Android WebView 演示壳
```

## 快速启动

### 1. 安装 Django 依赖

```powershell
cd C:\Users\night\Desktop\AI全栈挑战\backend_django
python -m pip install -r requirements.txt
```

### 2. 初始化数据库并导入数据

默认使用 SQLite，适合本地快速演示：

```powershell
python manage.py migrate --run-syncdb
python manage.py import_project_data
```

`import_project_data` 会导入：

- `data/db.json`
- `data/store.json`
- `data/video-gen-tasks.json`
- `data/` 下真实 MP4 剧集目录

导入时会跳过：

```text
data/generated
```

原因是该目录只保存 AIGC 分支生成视频，不属于原始短剧剧集。

### 3. 启动 Django 服务

```powershell
python manage.py runserver 127.0.0.1:8000
```

访问地址：

```text
前台播放器：http://127.0.0.1:8000/
审核后台：http://127.0.0.1:8000/review.html
```

## MySQL 部署

### 1. 创建数据库

```sql
CREATE DATABASE IF NOT EXISTS juran_moment
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

### 2. 设置环境变量

```powershell
$env:MYSQL_DATABASE="juran_moment"
$env:MYSQL_USER="root"
$env:MYSQL_PASSWORD="你的密码"
$env:MYSQL_HOST="127.0.0.1"
$env:MYSQL_PORT="3306"
```

### 3. 建表、导入并启动

```powershell
cd C:\Users\night\Desktop\AI全栈挑战\backend_django
python manage.py migrate --run-syncdb
python manage.py import_project_data
python manage.py runserver 127.0.0.1:8000
```

说明：MP4 文件本体不建议存入 MySQL。数据库只保存 `video_url`、`local_path`、`file_size`、`duration_sec` 等元信息。视频文件更适合放在服务器磁盘、对象存储或 CDN。

## 模型配置

模型配置文件：

```text
data/model-settings.json
```

主要字段：

- `apiKey`：火山引擎 API Key
- `endpointId`：火山引擎模型 Endpoint
- `modelName`：模型名称，例如 Doubao-Seed-2.0-lite
- `apiBaseUrl`：模型 API 基础地址
- `importMode`：模型导入方式

高光解析 Prompt：

```text
prompts/doubao-seed-2.0-lite-import.md
```

Django 版本目前提供数据库写入和兜底解析逻辑。正式部署时建议将 `scripts/analyze_episode.py` 中的 Doubao 调用迁移到 Django service 层。

## 关键 API

### 前台播放器

```text
GET  /api/dramas
GET  /api/episodes/<episode_id>/highlights
POST /api/interactions
GET  /api/episodes/<episode_id>/activity-feed
GET  /api/episodes/<episode_id>/generated-videos
GET  /media/<path>
```

### 审核后台

```text
GET    /api/review/episodes
GET    /api/episodes/<episode_id>/highlights?includeDrafts=true
POST   /api/episodes/<episode_id>/highlights
PUT    /api/highlights/<highlight_id>
DELETE /api/episodes/<episode_id>/highlights/<highlight_id>
POST   /api/model/analyze
POST   /api/model/import
POST   /api/episodes/<episode_id>/video-branches/generate
DELETE /api/video-branches/<package_id>
POST   /api/video-gen/submit
GET    /api/video-gen/tasks
GET    /api/video-gen/downloads
```

## 数据库模型

Django 后端包含以下核心模型：

- `Drama`：短剧
- `Episode`：剧集与视频元信息
- `Highlight`：剧情高光
- `Interaction`：用户互动记录
- `VideoBranch`：AIGC 剧情分支
- `VideoGenerationTask`：视频生成任务
- `ModelRun`：模型调用记录
- `Continuation`：剧尾续写
- `AppSetting`：系统配置

## 数据保存逻辑

```text
前端操作
  -> Django API
  -> Django ORM
  -> SQLite / MySQL
```

典型写入：

- 用户点击互动按钮：写入 `interactions`
- 审核后台新增或编辑高光：写入 `highlights`
- 后台生成 AIGC 分支：写入 `video_branches`
- 提交视频生成任务：写入 `video_generation_tasks`
- 导入旧 JSON 数据：执行 `python manage.py import_project_data`

## Node 兼容演示后端

当前 README 默认说明 Django 后端。`server.js` 仅作为兼容演示后端保留：

```powershell
node server.js
```

访问地址：

```text
前台播放器：http://127.0.0.1:3000/
审核后台：http://127.0.0.1:3000/review.html
```

## 已验证内容

```text
python manage.py check 通过
python manage.py migrate --run-syncdb 通过
python manage.py import_project_data 通过
GET /api/dramas 返回剧集和高光统计
POST /api/interactions 可写入数据库
POST /api/episodes/<id>/video-branches/generate 可写入数据库
POST /api/video-gen/submit 可写入数据库
data/generated 不会进入普通剧集列表
```

## 常见问题

## 为什么不把 MP4 直接存入 MySQL？

视频文件体积大，直接存入数据库会影响备份、查询和服务稳定性。更合理的方式是把视频放在服务器磁盘、对象存储或 CDN，数据库只保存 URL 和元信息。
