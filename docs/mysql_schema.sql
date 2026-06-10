-- 剧燃 Moment MySQL schema
-- 目标：数据库保存短剧资产元数据、AI 高光、互动、AIGC 分支和模型调用记录。
-- 注意：MP4 文件本体不放 MySQL。数据库只保存 video_url / source_key / 文件大小 / hash 等元数据。

CREATE DATABASE IF NOT EXISTS juran_moment
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE juran_moment;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS dramas (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  poster_url VARCHAR(1024) NULL,
  episode_count INT NOT NULL DEFAULT 0,
  status ENUM('active', 'hidden', 'archived') NOT NULL DEFAULT 'active',
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_dramas_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS episodes (
  id VARCHAR(64) PRIMARY KEY,
  drama_id VARCHAR(64) NOT NULL,
  episode_key VARCHAR(512) NOT NULL COMMENT '项目中的 sourceKey，例如 北派寻宝笔记/第72集.mp4',
  title VARCHAR(255) NOT NULL,
  episode_index INT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_type ENUM('local', 'server_static', 'object_storage', 'cdn') NOT NULL DEFAULT 'local',
  video_url VARCHAR(1024) NOT NULL COMMENT '前端 video.src 使用的 URL，例如 /media/北派寻宝笔记/第72集.mp4',
  local_path VARCHAR(1024) NULL COMMENT '服务器本地路径或相对路径，不暴露给前端',
  duration_sec DECIMAL(10,3) NULL,
  file_size BIGINT NULL,
  file_hash VARCHAR(128) NULL,
  mime_type VARCHAR(80) NOT NULL DEFAULT 'video/mp4',
  status ENUM('ready', 'processing', 'failed', 'hidden') NOT NULL DEFAULT 'ready',
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_episodes_key (episode_key),
  KEY idx_episodes_drama_index (drama_id, episode_index),
  KEY idx_episodes_status (status),
  CONSTRAINT fk_episodes_drama FOREIGN KEY (drama_id) REFERENCES dramas(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS highlights (
  id VARCHAR(80) PRIMARY KEY,
  episode_id VARCHAR(64) NULL,
  episode_key VARCHAR(512) NOT NULL,
  start_time DECIMAL(10,3) NOT NULL,
  end_time DECIMAL(10,3) NOT NULL,
  type VARCHAR(64) NOT NULL,
  emotion VARCHAR(64) NULL,
  intensity DECIMAL(5,3) NOT NULL DEFAULT 0,
  confidence DECIMAL(5,3) NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  suggestions JSON NULL,
  status ENUM('draft', 'published', 'rejected', 'archived') NOT NULL DEFAULT 'draft',
  model_source VARCHAR(128) NULL,
  model_reason TEXT NULL,
  trigger_score INT NULL,
  effect_config JSON NULL,
  raw_payload JSON NULL,
  imported_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_highlights_episode_time (episode_key, start_time, end_time),
  KEY idx_highlights_episode_status (episode_key, status),
  KEY idx_highlights_type (type),
  KEY idx_highlights_episode_id (episode_id),
  CONSTRAINT fk_highlights_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_highlight_time CHECK (end_time >= start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interactions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  highlight_id VARCHAR(80) NOT NULL,
  episode_id VARCHAR(64) NULL,
  episode_key VARCHAR(512) NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'click',
  reaction VARCHAR(255) NULL,
  button_text VARCHAR(255) NULL,
  user_id VARCHAR(128) NULL,
  device_id VARCHAR(128) NULL,
  user_agent VARCHAR(512) NULL,
  client_time DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON NULL,
  KEY idx_interactions_highlight_time (highlight_id, created_at),
  KEY idx_interactions_episode_time (episode_key, created_at),
  KEY idx_interactions_user (user_id),
  CONSTRAINT fk_interactions_highlight FOREIGN KEY (highlight_id) REFERENCES highlights(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_interactions_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_runs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id VARCHAR(64) NULL,
  episode_key VARCHAR(512) NULL,
  task_type ENUM('highlight_analysis', 'continuation', 'video_branch', 'video_generation') NOT NULL,
  model_source VARCHAR(128) NULL,
  prompt TEXT NULL,
  request_payload JSON NULL,
  raw_response LONGTEXT NULL,
  parsed_result JSON NULL,
  status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  latency_ms INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_model_runs_episode_task (episode_key, task_type, created_at),
  KEY idx_model_runs_status (status),
  CONSTRAINT fk_model_runs_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS continuations (
  id VARCHAR(80) PRIMARY KEY,
  episode_id VARCHAR(64) NULL,
  episode_key VARCHAR(512) NOT NULL,
  trigger_highlight_id VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  setup TEXT NULL,
  branches JSON NOT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  model_source VARCHAR(128) NULL,
  raw_model_output JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_continuations_episode (episode_key, status),
  CONSTRAINT fk_continuations_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_continuations_highlight FOREIGN KEY (trigger_highlight_id) REFERENCES highlights(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_branches (
  id VARCHAR(80) PRIMARY KEY,
  episode_id VARCHAR(64) NULL,
  episode_key VARCHAR(512) NOT NULL,
  title VARCHAR(255) NOT NULL,
  setup TEXT NULL,
  interaction_nodes JSON NOT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  model_source VARCHAR(128) NULL,
  raw_model_output JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_video_branches_episode (episode_key, status),
  CONSTRAINT fk_video_branches_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_generation_tasks (
  id VARCHAR(80) PRIMARY KEY,
  episode_id VARCHAR(64) NULL,
  episode_key VARCHAR(512) NULL,
  video_branch_id VARCHAR(80) NULL,
  provider VARCHAR(64) NULL,
  provider_task_id VARCHAR(128) NULL,
  model VARCHAR(128) NULL,
  title VARCHAR(255) NULL,
  video_prompt TEXT NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  progress INT NOT NULL DEFAULT 0,
  video_url VARCHAR(1024) NULL,
  local_file VARCHAR(1024) NULL,
  thumbnail_url VARCHAR(1024) NULL,
  error_message TEXT NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_vg_episode_status (episode_key, status),
  KEY idx_vg_provider_task (provider, provider_task_id),
  CONSTRAINT fk_vg_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_vg_branch FOREIGN KEY (video_branch_id) REFERENCES video_branches(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- 前台剧集列表：按剧和集聚合高光数量。
CREATE OR REPLACE VIEW v_episode_review_summary AS
SELECT
  e.id AS episode_id,
  e.drama_id,
  d.title AS drama_title,
  e.title AS episode_title,
  e.episode_key,
  e.episode_index,
  e.video_url,
  e.duration_sec,
  COUNT(h.id) AS highlight_count,
  SUM(CASE WHEN h.status = 'published' THEN 1 ELSE 0 END) AS published_count,
  MAX(h.updated_at) AS last_highlight_at
FROM episodes e
JOIN dramas d ON d.id = e.drama_id
LEFT JOIN highlights h ON h.episode_key = e.episode_key
GROUP BY e.id, e.drama_id, d.title, e.title, e.episode_key, e.episode_index, e.video_url, e.duration_sec;

-- 互动统计：每条高光聚合点击数。
CREATE OR REPLACE VIEW v_highlight_stats AS
SELECT
  h.id AS highlight_id,
  h.episode_key,
  h.type,
  h.summary,
  COUNT(i.id) AS total_interactions,
  COUNT(DISTINCT COALESCE(i.user_id, i.device_id, CAST(i.id AS CHAR))) AS unique_users,
  MAX(i.created_at) AS last_interaction_at
FROM highlights h
LEFT JOIN interactions i ON i.highlight_id = h.id
GROUP BY h.id, h.episode_key, h.type, h.summary;

-- 常用查询示例：
-- 1. 获取前台剧集列表
-- SELECT * FROM v_episode_review_summary ORDER BY drama_title, episode_index;
--
-- 2. 获取某集已发布高光
-- SELECT * FROM highlights WHERE episode_key = '北派寻宝笔记/第72集.mp4' AND status = 'published' ORDER BY start_time;
--
-- 3. 获取某条高光互动统计
-- SELECT * FROM v_highlight_stats WHERE highlight_id = 'hl_xxx';
--
-- 4. 获取某集 AIGC 视频分支
-- SELECT * FROM video_branches WHERE episode_key = '北派寻宝笔记/第72集.mp4' AND status = 'published';
