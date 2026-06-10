# Django 后端说明

这个目录是“真实数据库后端”的快速实现版本。它不会替换或修改现有 Node 服务；现有 `server.js` 仍可继续作为演示版本运行。

## 目标

前端行为通过 API 进入后端，后端再写入数据库：

```text
前台播放器 / 审核后台
  -> Django API
  -> Django ORM
  -> SQLite 或 MySQL
```

已覆盖的核心链路：

- 剧集列表：`GET /api/dramas`
- 审核剧集列表：`GET /api/review/episodes`
- 高光列表 / 新增：`GET|POST /api/episodes/<episode_id>/highlights`
- 高光编辑：`PUT /api/highlights/<highlight_id>`
- 高光删除：`DELETE /api/episodes/<episode_id>/highlights/<highlight_id>`
- 用户互动写入：`POST /api/interactions`
- 剧集互动统计：`GET /api/episodes/<episode_id>/activity-feed`
- AIGC 分支生成：`POST /api/episodes/<episode_id>/video-branches/generate`
- 视频生成任务：`POST /api/video-gen/submit`
- 视频任务列表：`GET /api/video-gen/tasks`
- 旧 JSON 数据导入：`python manage.py import_project_data`

## 本地 SQLite 启动

```powershell
cd C:\Users\night\Desktop\AI全栈挑战\backend_django
python -m pip install -r requirements.txt
python manage.py migrate --run-syncdb
python manage.py import_project_data
python manage.py runserver 127.0.0.1:8000
```

访问：

- 前台页面：`http://127.0.0.1:8000/`
- 审核后台：`http://127.0.0.1:8000/review.html`

## MySQL 启动

先创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS juran_moment
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

设置环境变量：

```powershell
$env:MYSQL_DATABASE="juran_moment"
$env:MYSQL_USER="root"
$env:MYSQL_PASSWORD="你的密码"
$env:MYSQL_HOST="127.0.0.1"
$env:MYSQL_PORT="3306"
```

再建表和导入数据：

```powershell
python manage.py migrate --run-syncdb
python manage.py import_project_data
python manage.py runserver 127.0.0.1:8000
```

## 与现有 Node 服务的关系

当前实现是旁路新增，不会破坏原有服务：

- Node 演示版：`node server.js`，默认 `http://127.0.0.1:3000/`
- Django 数据库版：`python manage.py runserver 127.0.0.1:8000`

两者可以保留一个作为演示稳定版，另一个作为真实数据库后端版本。提交时可以说明：Node 版本用于快速演示，Django 版本用于正式数据库持久化。

## 当前限制

`/api/model/analyze` 在 Django 后端中提供了兜底解析逻辑，会生成可审核的 draft 高光并写入数据库。正式接入 Doubao 时，应把现有 `scripts/analyze_episode.py` 的模型调用迁移到 Django view 或 service 中。
