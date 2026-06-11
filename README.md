# 剧燃 Moment

基于短剧剧情高光识别的即时互动与 AIGC 分支系统。项目面向短剧播放场景，使用大模型理解真实 MP4 剧集内容，识别剧情高光点，并在播放器端触发摘要卡片、互动按钮、全屏动效和互动统计，形成“AI 内容理解 -> 审核发布 -> 前台互动 -> 数据回流 -> AIGC 分支创作”的完整闭环。

## 项目定位

短剧用户的情绪峰值通常集中在冲突、反转、打脸、悬念、甜蜜撒糖等剧情高光点上。传统播放器只负责播放视频，用户最多发弹幕或者点赞，很难在剧情最强的位置形成高质量互动。

本项目通过大模型自动识别短剧高光，并把这些高光转化为端上可交互内容。当前默认后端为 Django 数据库版本，负责 API、ORM、数据持久化和运行时写入。

## 核心能力

### 1. 短剧播放与高光互动

- 支持从 `data/` 目录读取真实 MP4 短剧。
- 支持剧集搜索、选集、播放、暂停、音量、全屏。
- 支持进度条内嵌高光点，点击高光点可跳转到对应剧情片段。
- 支持高光摘要卡片、互动按钮、全屏动效和互动统计。
- `data/generated` 中的 AIGC 分支视频只作为生成结果，不参与普通剧集扫描和高光解析。

### 2. AI 高光识别

- 预留 Doubao-Seed-2.0-lite 多模态视频理解能力。
- 支持通过 Prompt 输出结构化高光 JSON。
- 高光字段包括开始时间、结束时间、类型、情绪、强度、置信度、摘要、互动建议、模型理由和状态。
- 审核后台可对 AI 结果进行编辑、发布、删除和批量操作。

### 3. 审核后台

- 按剧集管理高光，避免所有内容混在一起。
- 支持视频预览、时间轴高光标记、内联编辑、发布、删除和批量操作。
- 支持解析进度展示，能看到高光是否已写入数据层。
- 支持为选中高光生成 AIGC 分支，并管理每个高光已有的分支。

### 4. Django 数据库后端

- Django 后端提供 ORM 模型和 API。
- 支持 SQLite 本地开发，也支持 MySQL 部署。
- 支持把现有 `data/db.json`、`data/store.json`、MP4 剧集目录和视频任务导入数据库。
- 前端行为可以通过 API 实时写入数据库，例如互动点击、高光编辑、AIGC 分支、视频任务。

## 技术架构

```text
Web 前端
  -> Django REST API
  -> Django ORM
  -> SQLite / MySQL
  -> MP4 媒体资源
  -> Doubao-Seed-2.0-lite / AIGC 分支任务
```

核心业务闭环：

```text
真实短剧 MP4
  -> AI 高光解析
  -> 审核后台编辑发布
  -> 前台播放器高光互动
  -> 用户互动数据回流
  -> 基于选中高光生成 AIGC 分支
  -> 视频生成任务池
```

## 项目结构

```text
backend_django/          Django 数据库后端，默认推荐运行方式
public/                  Web 前端页面与样式
data/                    本地数据与视频资源
scripts/                 模型调用、数据导出和测试脚本
prompts/                 高光解析与 AIGC 分支 Prompt
docs/                    MySQL schema、技术文档和部署说明
server.js                Node 兼容演示后端
android/                 Android WebView 演示壳
```

## 快速启动：Django 数据库版

### 1. 安装依赖

```powershell
cd C:\Users\night\Desktop\AI全栈挑战\backend_django
python -m pip install -r requirements.txt
```

### 2. 初始化数据库

默认使用 SQLite，适合本地快速验证：

```powershell
python manage.py migrate --run-syncdb
python manage.py import_project_data
```

`import_project_data` 会导入：

- `data/db.json`
- `data/store.json`
- `data/video-gen-tasks.json`
- `data/` 下真实 MP4 剧集目录

导入时会跳过 `data/generated`，避免把 AIGC 分支视频误识别成普通剧集。

### 3. 启动服务

```powershell
python manage.py runserver 127.0.0.1:8000
```

访问地址：

```text
前台播放器：http://127.0.0.1:8000/
审核后台：http://127.0.0.1:8000/review.html
```

## 使用 MySQL

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

### 3. 建表并导入数据

```powershell
cd C:\Users\night\Desktop\AI全栈挑战\backend_django
python manage.py migrate --run-syncdb
python manage.py import_project_data
python manage.py runserver 127.0.0.1:8000
```

说明：MP4 文件本体不存入 MySQL。数据库只保存 `video_url`、`local_path`、`file_size`、`duration_sec` 等元信息。视频文件应放在服务器磁盘、对象存储或 CDN 中。

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

- `Drama`：短剧。
- `Episode`：剧集，保存视频路径和元信息。
- `Highlight`：剧情高光。
- `Interaction`：用户互动点击。
- `VideoBranch`：AIGC 剧情分支。
- `VideoGenerationTask`：视频生成任务。
- `ModelRun`：模型调用记录。
- `Continuation`：剧尾续写。
- `AppSetting`：配置项。

## 数据保存逻辑

运行时保存链路：

```text
前端操作
  -> Django API
  -> Django ORM
  -> SQLite / MySQL
```

典型写入：

- 前台点击互动按钮：写入 `interactions`。
- 后台新增或编辑高光：写入 `highlights`。
- 后台生成 AIGC 分支：写入 `video_branches`。
- 提交视频生成任务：写入 `video_generation_tasks`。
- 导入旧 JSON 数据：执行 `python manage.py import_project_data`。

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

## 常见问题

### 为什么生成的视频不参与高光解析？

生成视频是 AIGC 分支产物，不是原始短剧内容。如果把 `data/generated` 当成普通剧集，会导致后台重复对分支视频生成高光，污染审核列表和数据统计。当前 Django 和 Node 兼容链路都已排除 `data/generated`。

### 为什么不把 MP4 直接存入 MySQL？

视频文件体积大，直接存入数据库会影响备份、查询和服务稳定性。更合理的方式是把视频放在服务器磁盘、对象存储或 CDN，数据库只保存 URL 和元信息。

## 交付说明

建议演示时优先展示 Django 数据库版本：

```powershell
cd backend_django
python manage.py runserver 127.0.0.1:8000
```

提交材料建议包含：

- 项目代码仓库。
- 录屏演示链接。
- `提交文档.md` 或 `submission.md`。
- Django 后端说明：`backend_django/README.md`。
- MySQL schema：`docs/mysql_schema.sql`。
