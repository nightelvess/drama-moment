const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const OUT_FILE = path.join(DATA_DIR, "mysql_seed.sql");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "NULL";
}

function sqlJson(value) {
  if (value === null || value === undefined) return "NULL";
  return sqlString(JSON.stringify(value));
}

function sqlDate(value) {
  if (!value) return "NULL";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NULL";
  return sqlString(date.toISOString().slice(0, 23).replace("T", " "));
}

function makeId(prefix, text) {
  return `${prefix}_${crypto.createHash("md5").update(String(text)).digest("hex").slice(0, 16)}`;
}

function parseEpisodeIndex(fileName) {
  const m = String(fileName || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function listEpisodesFromFiles() {
  const dramas = [];
  const episodes = [];
  if (!fs.existsSync(DATA_DIR)) return { dramas, episodes };

  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "generated") continue;
    const dramaDir = path.join(DATA_DIR, entry.name);
    const files = fs.readdirSync(dramaDir, { withFileTypes: true })
      .filter((item) => item.isFile() && /\.mp4$/i.test(item.name))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));

    const dramaId = makeId("drama", entry.name);
    dramas.push({
      id: dramaId,
      title: entry.name,
      description: `真实短剧素材，共 ${files.length} 集`,
      episodeCount: files.length,
    });

    for (const file of files) {
      const episodeKey = `${entry.name}/${file.name}`;
      const stat = fs.statSync(path.join(dramaDir, file.name));
      const index = parseEpisodeIndex(file.name);
      episodes.push({
        id: makeId("ep", episodeKey),
        dramaId,
        episodeKey,
        title: index ? `第${index}集` : file.name.replace(/\.mp4$/i, ""),
        index,
        fileName: file.name,
        videoUrl: `/media/${encodeURIComponent(episodeKey)}`,
        localPath: episodeKey,
        fileSize: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  return { dramas, episodes };
}

function normalizeDramas(db, scanned) {
  const byTitle = new Map(scanned.dramas.map((item) => [item.title, item]));
  for (const [title, raw] of Object.entries(db.dramas || {})) {
    if (!byTitle.has(title)) {
      byTitle.set(title, {
        id: raw.id || makeId("drama", title),
        title,
        description: raw.description || "",
        poster: raw.poster || "",
        episodeCount: raw.episodeCount || 0,
      });
    }
  }
  return Array.from(byTitle.values());
}

function normalizeEpisodes(db, scanned) {
  const byKey = new Map(scanned.episodes.map((item) => [item.episodeKey, item]));
  for (const [episodeKey, raw] of Object.entries(db.episodes || {})) {
    if (!byKey.has(episodeKey)) {
      const dramaTitle = episodeKey.split("/")[0];
      byKey.set(episodeKey, {
        id: raw.id || makeId("ep", episodeKey),
        dramaId: raw.dramaId || makeId("drama", dramaTitle),
        episodeKey,
        title: raw.title || path.basename(episodeKey).replace(/\.mp4$/i, ""),
        index: raw.index || parseEpisodeIndex(episodeKey),
        fileName: raw.fileName || path.basename(episodeKey),
        videoUrl: raw.videoUrl || `/media/${encodeURIComponent(episodeKey)}`,
        localPath: raw.localPath || episodeKey,
        durationSec: raw.durationSec,
        fileSize: raw.fileSize,
        updatedAt: raw.updatedAt,
      });
    }
  }
  return Array.from(byKey.values());
}

function mergeById(items) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function mergeInteractions(items) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item) continue;
    const key = item.id || `${item.highlightId || ""}:${item.reaction || item.buttonText || ""}:${item.createdAt || item.timestamp || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function insert(table, columns, values) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")}) ON DUPLICATE KEY UPDATE ${columns
    .filter((col) => col !== "id")
    .map((col) => `${col}=VALUES(${col})`)
    .join(", ")};`;
}

function main() {
  const db = readJson(DB_FILE, {});
  const store = readJson(STORE_FILE, {});
  const highlights = mergeById([...(db.highlights || []), ...(store.highlights || [])]);
  const interactions = mergeInteractions([...(db.interactions || []), ...(store.interactions || [])]);
  const scanned = listEpisodesFromFiles();
  const dramas = normalizeDramas(db, scanned);
  const episodes = normalizeEpisodes(db, scanned);
  const episodeByKey = new Map(episodes.map((item) => [item.episodeKey, item]));
  const highlightById = new Map(highlights.map((item) => [item.id, item]));

  const lines = [];
  lines.push("-- Generated by scripts/export_db_json_to_mysql_sql.js");
  lines.push("-- Import after docs/mysql_schema.sql");
  lines.push("USE juran_moment;");
  lines.push("SET NAMES utf8mb4;");
  lines.push("SET FOREIGN_KEY_CHECKS = 0;");

  for (const drama of dramas) {
    lines.push(insert("dramas",
      ["id", "title", "description", "poster_url", "episode_count", "metadata"],
      [
        sqlString(drama.id),
        sqlString(drama.title),
        sqlString(drama.description || ""),
        sqlString(drama.poster || drama.posterUrl || ""),
        sqlNumber(drama.episodeCount),
        sqlJson(drama.metadata || null),
      ]));
  }

  for (const episode of episodes) {
    lines.push(insert("episodes",
      ["id", "drama_id", "episode_key", "title", "episode_index", "file_name", "storage_type", "video_url", "local_path", "duration_sec", "file_size", "mime_type", "metadata", "updated_at"],
      [
        sqlString(episode.id),
        sqlString(episode.dramaId),
        sqlString(episode.episodeKey),
        sqlString(episode.title),
        sqlNumber(episode.index),
        sqlString(episode.fileName),
        sqlString("local"),
        sqlString(episode.videoUrl),
        sqlString(episode.localPath),
        sqlNumber(episode.durationSec),
        sqlNumber(episode.fileSize),
        sqlString("video/mp4"),
        sqlJson(episode.metadata || null),
        sqlDate(episode.updatedAt),
      ]));
  }

  for (const h of highlights) {
    const ep = episodeByKey.get(h.episodeKey);
    lines.push(insert("highlights",
      ["id", "episode_id", "episode_key", "start_time", "end_time", "type", "emotion", "intensity", "confidence", "summary", "suggestions", "status", "model_source", "model_reason", "trigger_score", "effect_config", "raw_payload", "imported_at", "updated_at"],
      [
        sqlString(h.id),
        sqlString(ep?.id || null),
        sqlString(h.episodeKey),
        sqlNumber(h.startTime),
        sqlNumber(h.endTime),
        sqlString(h.type || "高光"),
        sqlString(h.emotion || ""),
        sqlNumber(h.intensity),
        sqlNumber(h.confidence),
        sqlString(h.summary || ""),
        sqlJson(h.suggestions || []),
        sqlString(h.status || "draft"),
        sqlString(h.modelSource || ""),
        sqlString(h.modelReason || ""),
        sqlNumber(h.triggerScore),
        sqlJson(h.effectConfig || null),
        sqlJson(h),
        sqlDate(h.importedAt),
        sqlDate(h.updatedAt),
      ]));
  }

  let skippedInteractions = 0;
  for (const item of interactions) {
    const highlight = highlightById.get(item.highlightId);
    if (!highlight) {
      skippedInteractions += 1;
      continue;
    }
    const ep = highlight ? episodeByKey.get(highlight.episodeKey) : null;
    lines.push(`INSERT INTO interactions (highlight_id, episode_id, episode_key, event_type, reaction, button_text, user_id, client_time, metadata) VALUES (${[
      sqlString(item.highlightId),
      sqlString(ep?.id || null),
      sqlString(highlight?.episodeKey || item.episodeKey || null),
      sqlString(item.type || "click"),
      sqlString(item.reaction || item.buttonText || ""),
      sqlString(item.buttonText || item.reaction || ""),
      sqlString(item.userId || null),
      sqlDate(item.timestamp || item.createdAt),
      sqlJson(item),
    ].join(", ")});`);
  }

  if (skippedInteractions) {
    lines.push(`-- Skipped ${skippedInteractions} interactions because their highlight_id was not found.`);
  }

  for (const item of db.continuations || []) {
    const ep = episodeByKey.get(item.episodeKey);
    lines.push(insert("continuations",
      ["id", "episode_id", "episode_key", "trigger_highlight_id", "title", "setup", "branches", "status", "model_source", "raw_model_output", "created_at", "updated_at"],
      [
        sqlString(item.id),
        sqlString(ep?.id || null),
        sqlString(item.episodeKey),
        sqlString(item.triggerHighlightId || item.trigger_highlight_id || null),
        sqlString(item.title || "剧情续写"),
        sqlString(item.setup || ""),
        sqlJson(item.branches || []),
        sqlString(item.status || "draft"),
        sqlString(item.modelSource || ""),
        sqlJson(item.rawModelOutput || null),
        sqlDate(item.createdAt),
        sqlDate(item.updatedAt),
      ]));
  }

  for (const item of db.videoBranches || []) {
    const ep = episodeByKey.get(item.episodeKey);
    lines.push(insert("video_branches",
      ["id", "episode_id", "episode_key", "title", "setup", "interaction_nodes", "status", "model_source", "raw_model_output", "created_at", "updated_at"],
      [
        sqlString(item.id),
        sqlString(ep?.id || item.episodeId || null),
        sqlString(item.episodeKey),
        sqlString(item.title || "视频分支"),
        sqlString(item.setup || ""),
        sqlJson(item.interaction_nodes || []),
        sqlString(item.status || "draft"),
        sqlString(item.modelSource || ""),
        sqlJson(item.rawModelOutput || null),
        sqlDate(item.createdAt),
        sqlDate(item.updatedAt),
      ]));
  }

  lines.push("SET FOREIGN_KEY_CHECKS = 1;");
  fs.writeFileSync(OUT_FILE, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT_DIR, OUT_FILE)}`);
  console.log(`dramas=${dramas.length}, episodes=${episodes.length}, highlights=${highlights.length}, interactions=${interactions.length - skippedInteractions}, skippedInteractions=${skippedInteractions}, videoBranches=${(db.videoBranches || []).length}`);
}

main();
