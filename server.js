const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SETTINGS_FILE = path.join(DATA_DIR, "model-settings.json");
const EFFECTS_CONFIG_FILE = path.join(DATA_DIR, "effects-config.json");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PROMPT_FILE = path.join(ROOT_DIR, "prompts", "doubao-seed-2.0-lite-import.md");
const CONTENT_GEN_PROMPT_FILE = path.join(ROOT_DIR, "prompts", "content-generator.md");
const VIDEO_BRANCH_PROMPT_FILE = path.join(ROOT_DIR, "prompts", "video-branch-brainstorm.md");
const ANALYZE_SCRIPT = path.join(ROOT_DIR, "scripts", "analyze_episode.py");
const VIDEO_GEN_FILE = path.join(DATA_DIR, "video-gen-tasks.json");
const GENERATED_DIR = path.join(DATA_DIR, "generated");
const NON_EPISODE_DATA_DIRS = new Set(["generated"]);

// 使用新的 db.json 还是旧的 store.json
const USE_NEW_DB = fs.existsSync(DB_FILE);

// 默认动效配置
const DEFAULT_EFFECTS_CONFIG = {
  screenFlash: {
    enabled: true,
    duration: 700,
    color: "rgba(255, 255, 255, 0.4)"
  },
  heartRain: {
    enabled: true,
    count: 8,
    particleDuration: 2000,
    interval: 120
  },
  highlightTrigger: {
    debounceTime: 5,
    allowRepeat: true
  }
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const DEFAULT_SETTINGS = {
  provider: "volcengine-ark",
  modelName: "Doubao-Seed-2.0-lite",
  apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  endpointId: "",
  apiKey: "",
  importMode: "manual_json",
  promptVersion: "v1",
};

const PROMPT_OUTPUT_EXAMPLE = {
  episode_summary: "本集围绕祠堂对峙展开，核心情绪是压迫、反击与剧尾悬念。",
  highlights: [
    {
      start_time: 12.4,
      end_time: 27.8,
      highlight_type: "悬念",
      emotion: "压迫感",
      intensity: 0.73,
      confidence: 0.84,
      summary: "关键人物被围堵质问，气氛快速收紧。",
      interaction_suggestions: ["不对劲", "谁在撒谎", "继续看"],
      reason: "多人围堵、连续质问和低沉环境音共同强化了悬念感。",
      status: "published"
    }
  ]
};

function ensureJsonFile (filePath, defaultPayload) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultPayload, null, 2), "utf-8");
  }
}

// 默认 db.json 结构
const DEFAULT_DB = {
  dramas: {},
  episodes: {},
  highlights: [],
  interactions: [],
  continuations: [],
  videoBranches: [],
  interactionTemplates: {
    "冲突": { buttons: ["气死我了", "替她反击", "支持女主"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 8 },
    "反转": { buttons: ["我惊了", "反转了", "太爽了"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 9 },
    "打脸": { buttons: ["太解气", "活该", "继续"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 9 },
    "爽点": { buttons: ["爽", "打脸成功", "终于来了"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 9 },
    "甜蜜": { buttons: ["磕到了", "太甜了", "锁死"], effect: "heart_rain", position: "right", duration: 3000, triggerScore: 7 },
    "搞笑": { buttons: ["哈哈哈哈", "太逗了", "绝了"], effect: "heart_rain", position: "right", duration: 3000, triggerScore: 6 },
    "营救": { buttons: ["太险了", "还好没事", "吓死了"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 7 },
    "身份揭露": { buttons: ["原来是他", "我就知道", "藏得深"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 8 },
    "情绪爆发": { buttons: ["太心疼", "抱抱", "想哭"], effect: "screen_flash", position: "bottom", duration: 3000, triggerScore: 7 },
    "悬念": { buttons: ["快更", "别卡这里", "我猜到了"], effect: "countdown", position: "bottom", duration: 3000, triggerScore: 8 },
    "剧尾钩子": { buttons: ["下一集", "求更新", "不能断"], effect: "countdown", position: "bottom", duration: 3000, triggerScore: 10 },
  },
  analytics: {
    totalImpressions: 0,
    totalClicks: 0,
    totalUsers: 0,
    highlightTypeStats: {},
    popularButtons: {}
  }
};

function ensureDataFiles () {
  ensureJsonFile(STORE_FILE, {
    version: 2,
    updatedAt: new Date().toISOString(),
    highlights: [],
    interactions: [],
  });
  ensureJsonFile(DB_FILE, DEFAULT_DB);
  ensureJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
}

function readJson (filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson (filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

// ========== 旧数据存储兼容 ==========
function loadStore () {
  ensureDataFiles();
  const raw = readJson(STORE_FILE);
  return {
    version: raw.version || 2,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    interactions: Array.isArray(raw.interactions) ? raw.interactions : [],
  };
}

function saveStore (store) {
  store.updatedAt = new Date().toISOString();
  writeJson(STORE_FILE, store);
}

// ========== 新数据存储 (db.json) ==========
function loadDb () {
  ensureDataFiles();
  const raw = readJson(DB_FILE);
  return {
    ...raw,
    dramas: raw.dramas || {},
    episodes: raw.episodes || {},
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    interactions: Array.isArray(raw.interactions) ? raw.interactions : [],
    continuations: Array.isArray(raw.continuations) ? raw.continuations : [],
    videoBranches: Array.isArray(raw.videoBranches) ? raw.videoBranches : [],
    interactionTemplates: raw.interactionTemplates || DEFAULT_DB.interactionTemplates,
    analytics: raw.analytics || DEFAULT_DB.analytics,
  };
}

function saveDb (db) {
  writeJson(DB_FILE, db);
}

// 统一数据读取接口
function getHighlights (episodeKey) {
  if (USE_NEW_DB) {
    const db = loadDb();
    const store = loadStore();
    const merged = [...db.highlights, ...store.highlights];
    const seen = new Set();
    return merged.filter((h) => {
      if (h.episodeKey !== episodeKey || seen.has(h.id)) return false;
      seen.add(h.id);
      return true;
    });
  } else {
    const store = loadStore();
    return store.highlights.filter(h => h.episodeKey === episodeKey);
  }
}

function getAllHighlights () {
  if (USE_NEW_DB) {
    const db = loadDb();
    const store = loadStore();
    const merged = [...db.highlights, ...store.highlights];
    const seen = new Set();
    return merged.filter((h) => {
      if (seen.has(h.id)) return false;
      seen.add(h.id);
      return true;
    });
  } else {
    const store = loadStore();
    return store.highlights;
  }
}

function getContinuations (episodeKey) {
  if (!USE_NEW_DB) {
    return [];
  }
  const db = loadDb();
  return (db.continuations || []).filter(item => item.episodeKey === episodeKey);
}

function upsertContinuation (continuation) {
  const db = loadDb();
  db.continuations = Array.isArray(db.continuations) ? db.continuations : [];
  const index = db.continuations.findIndex(item =>
    item.id === continuation.id ||
    (item.episodeKey === continuation.episodeKey && item.triggerHighlightId === continuation.triggerHighlightId)
  );
  if (index >= 0) {
    db.continuations[index] = { ...db.continuations[index], ...continuation, updatedAt: new Date().toISOString() };
  } else {
    db.continuations.push({ ...continuation, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  saveDb(db);
  return index >= 0 ? db.continuations[index] : db.continuations[db.continuations.length - 1];
}

function getVideoBranches (episodeKey) {
  if (!USE_NEW_DB) return [];
  const db = loadDb();
  return (db.videoBranches || []).filter(item => item.episodeKey === episodeKey);
}

function upsertVideoBranchPackage (videoBranchPackage) {
  const db = loadDb();
  db.videoBranches = Array.isArray(db.videoBranches) ? db.videoBranches : [];
  const index = db.videoBranches.findIndex(item => item.id === videoBranchPackage.id);
  if (index >= 0) {
    db.videoBranches[index] = { ...db.videoBranches[index], ...videoBranchPackage, updatedAt: new Date().toISOString() };
  } else {
    db.videoBranches.push({ ...videoBranchPackage, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  saveDb(db);
  return index >= 0 ? db.videoBranches[index] : db.videoBranches[db.videoBranches.length - 1];
}

function deleteVideoBranchPackage (packageId) {
  if (!USE_NEW_DB) return false;
  const db = loadDb();
  const before = Array.isArray(db.videoBranches) ? db.videoBranches.length : 0;
  db.videoBranches = (db.videoBranches || []).filter((item) => item.id !== packageId);
  if (db.videoBranches.length === before) return false;
  saveDb(db);
  return true;
}

function addHighlights (newHighlights) {
  if (USE_NEW_DB) {
    const db = loadDb();
    const existingIds = new Set(db.highlights.map(h => h.id));
    newHighlights.forEach(h => {
      if (!existingIds.has(h.id)) {
        // 自动添加 effectConfig
        const template = db.interactionTemplates[h.type] || { triggerScore: 7, effect: 'screen_flash' };
        h.triggerScore = h.triggerScore || template.triggerScore;
        h.effectConfig = h.effectConfig || {
          screenFlash: { enabled: template.effect === 'screen_flash', duration: 700, color: "rgba(255, 0, 0, 0.3)" },
          heartRain: { enabled: template.effect === 'heart_rain', count: 30, duration: 3000 }
        };
        db.highlights.push(h);
      }
    });
    saveDb(db);
  } else {
    const store = loadStore();
    const existingIds = new Set(store.highlights.map(h => h.id));
    newHighlights.forEach(h => {
      if (!existingIds.has(h.id)) {
        store.highlights.push(h);
      }
    });
    saveStore(store);
  }
}

function updateHighlight (highlightId, updates) {
  if (USE_NEW_DB) {
    const db = loadDb();
    const index = db.highlights.findIndex(h => h.id === highlightId);
    if (index !== -1) {
      db.highlights[index] = { ...db.highlights[index], ...updates, updatedAt: new Date().toISOString() };
      saveDb(db);
      return db.highlights[index];
    }
    return null;
  } else {
    const store = loadStore();
    const index = store.highlights.findIndex(h => h.id === highlightId);
    if (index !== -1) {
      store.highlights[index] = { ...store.highlights[index], ...updates, updatedAt: new Date().toISOString() };
      saveStore(store);
      return store.highlights[index];
    }
    return null;
  }
}

function deleteHighlight (highlightId) {
  if (USE_NEW_DB) {
    const db = loadDb();
    db.highlights = db.highlights.filter(h => h.id !== highlightId);
    saveDb(db);
  } else {
    const store = loadStore();
    store.highlights = store.highlights.filter(h => h.id !== highlightId);
    saveStore(store);
  }
}

function addInteraction (interaction) {
  if (USE_NEW_DB) {
    const db = loadDb();
    db.interactions.push(interaction);
    // 更新统计
    db.analytics.totalClicks += 1;
    const btnKey = interaction.buttonText;
    db.analytics.popularButtons[btnKey] = (db.analytics.popularButtons[btnKey] || 0) + 1;
    saveDb(db);
  } else {
    const store = loadStore();
    store.interactions.push(interaction);
    saveStore(store);
  }
}

function getInteractions () {
  if (USE_NEW_DB) {
    const db = loadDb();
    return db.interactions;
  } else {
    const store = loadStore();
    return store.interactions;
  }
}

function loadSettings () {
  ensureDataFiles();
  return {
    ...DEFAULT_SETTINGS,
    ...readJson(SETTINGS_FILE),
  };
}

function saveSettings (input) {
  const current = loadSettings();
  const next = {
    ...current,
    provider: String(input.provider || current.provider),
    modelName: String(input.modelName || current.modelName),
    apiBaseUrl: String(input.apiBaseUrl || current.apiBaseUrl),
    endpointId: String(input.endpointId || current.endpointId),
    importMode: String(input.importMode || current.importMode),
    promptVersion: String(input.promptVersion || current.promptVersion),
    apiKey: typeof input.apiKey === "string" && input.apiKey.length ? input.apiKey : current.apiKey,
  };
  writeJson(SETTINGS_FILE, next);
  return next;
}

// 动效配置相关
function ensureEffectsConfig () {
  ensureJsonFile(EFFECTS_CONFIG_FILE, DEFAULT_EFFECTS_CONFIG);
}

function loadEffectsConfig () {
  ensureEffectsConfig();
  return readJson(EFFECTS_CONFIG_FILE);
}

function saveEffectsConfig (input) {
  const current = loadEffectsConfig();
  const next = {
    ...current,
    ...input,
  };
  writeJson(EFFECTS_CONFIG_FILE, next);
  return next;
}

function maskApiKey (apiKey) {
  if (!apiKey) {
    return "";
  }
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
}

function publicSettings (settings) {
  return {
    provider: settings.provider,
    modelName: settings.modelName,
    apiBaseUrl: settings.apiBaseUrl,
    endpointId: settings.endpointId,
    importMode: settings.importMode,
    promptVersion: settings.promptVersion,
    hasApiKey: Boolean(settings.apiKey),
    apiKeyMasked: maskApiKey(settings.apiKey),
  };
}

function sendJson (res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText (res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function notFound (res) {
  sendJson(res, 404, { error: "Not found" });
}

function parseBody (req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf-8");
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function makeId (prefix, source) {
  return `${prefix}_${crypto.createHash("sha1").update(String(source)).digest("hex").slice(0, 16)}`;
}

function parseEpisodeOrder (fileName) {
  const matched = fileName.match(/(\d+)/);
  return matched ? Number(matched[1]) : Number.MAX_SAFE_INTEGER;
}

function buildCatalog () {
  const directories = fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !NON_EPISODE_DATA_DIRS.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  const dramas = [];
  const episodes = [];

  for (const entry of directories) {
    const dramaName = entry.name;
    const dramaId = makeId("drama", dramaName);
    const dramaDir = path.join(DATA_DIR, dramaName);
    const files = fs
      .readdirSync(dramaDir, { withFileTypes: true })
      .filter((file) => file.isFile() && path.extname(file.name).toLowerCase() === ".mp4")
      .sort((a, b) => {
        const diff = parseEpisodeOrder(a.name) - parseEpisodeOrder(b.name);
        return diff || a.name.localeCompare(b.name, "zh-CN");
      });

    dramas.push({
      id: dramaId,
      title: dramaName,
      description: `真实短剧素材，共 ${files.length} 集`,
      poster: "",
      episodeCount: files.length,
    });

    for (const file of files) {
      const sourceKey = `${dramaName}/${file.name}`;
      episodes.push({
        id: makeId("ep", sourceKey),
        dramaId,
        title: path.basename(file.name, path.extname(file.name)),
        fileName: file.name,
        sourceKey,
        videoUrl: `/media/${encodeURIComponent(dramaName)}/${encodeURIComponent(file.name)}`,
        durationSec: null,
        status: "ready",
        sizeBytes: fs.statSync(path.join(dramaDir, file.name)).size,
      });
    }
  }

  return {
    dramas,
    episodes,
    dramaById: new Map(dramas.map((item) => [item.id, item])),
    episodeById: new Map(episodes.map((item) => [item.id, item])),
  };
}

function getHighlightStats (highlightId) {
  const interactions = getInteractions();
  const related = interactions.filter((item) => item.highlightId === highlightId);
  const breakdown = {};
  for (const item of related) {
    const key = item.reaction || item.buttonText;
    breakdown[key] = (breakdown[key] || 0) + 1;
  }
  return {
    total: related.length,
    breakdown,
  };
}

function matchEpisode (item, episode) {
  return item.episodeKey === episode.sourceKey || item.episodeId === episode.id;
}

function getEpisodeHighlights (episode, includeDrafts = false) {
  const highlights = getHighlights(episode.sourceKey);
  return highlights
    .filter((item) => matchEpisode(item, episode) && (includeDrafts || item.status === "published"))
    .sort((a, b) => a.startTime - b.startTime)
    .map((item) => ({
      ...item,
      episodeId: episode.id,
      stats: getHighlightStats(item.id),
    }));
}

function buildReviewEpisode (catalog, episode) {
  const highlights = getEpisodeHighlights(episode, true);
  return {
    ...episode,
    drama: catalog.dramaById.get(episode.dramaId),
    highlightCount: highlights.length,
    publishedCount: highlights.filter((item) => item.status === "published").length,
  };
}

function clamp01 (value, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, num));
}

function toSuggestions (value, fallback) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
}

function readField (source, keys, fallback) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return fallback;
}

function normalizeImportedHighlight (raw, index, episode, payload, settings) {
  const startTime = Number(readField(raw, ["startTime", "start_time", "begin"], 0));
  const endTime = Number(readField(raw, ["endTime", "end_time", "finish"], startTime + 5));
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    throw new Error(`Imported highlight #${index + 1} is missing valid time fields`);
  }

  const status = String(readField(raw, ["status"], payload.defaultStatus || "draft"));
  return {
    id: `hl_import_${Date.now()}_${index}`,
    episodeKey: episode.sourceKey,
    startTime,
    endTime,
    type: String(readField(raw, ["type", "highlightType", "highlight_type"], "悬念")),
    emotion: String(readField(raw, ["emotion", "emotionType", "emotion_type"], "待补充")),
    intensity: clamp01(readField(raw, ["intensity", "score"], 0.6), 0.6),
    confidence: clamp01(readField(raw, ["confidence"], 0.5), 0.5),
    summary: String(readField(raw, ["summary", "description"], `导入高光 ${index + 1}`)),
    suggestions: toSuggestions(
      readField(raw, ["suggestions", "interactionSuggestions", "interaction_suggestions"], null),
      ["继续看", "有点东西", "先标一个"]
    ),
    status,
    modelSource: String(payload.modelSource || settings.modelName || "Doubao-Seed-2.0-lite"),
    modelReason: String(readField(raw, ["reason", "modelReason", "model_reason"], "由模型导入，等待人工审核。")),
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function extractImportedHighlights (payload) {
  if (Array.isArray(payload.highlights)) {
    return payload.highlights;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (typeof payload.modelOutput === "string") {
    const parsed = JSON.parse(payload.modelOutput);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.highlights)) {
      return parsed.highlights;
    }
    throw new Error("modelOutput JSON must be an array or an object with highlights");
  }
  if (payload.modelOutput && Array.isArray(payload.modelOutput.highlights)) {
    return payload.modelOutput.highlights;
  }
  throw new Error("Request body must contain highlights, items, or modelOutput");
}

function serveStatic (res, pathname) {
  let fileName = pathname === "/" ? "index.html" : pathname.substring(1);
  let filePath = path.join(PUBLIC_DIR, fileName);

  if (!fs.existsSync(filePath) && fileName.includes("/")) {
    // 尝试处理嵌套路径
    const parts = fileName.split("/");
    let testPath = PUBLIC_DIR;
    for (const part of parts) {
      testPath = path.join(testPath, part);
    }
    filePath = testPath;
  }

  console.log("Serving static:", pathname, "->", filePath);

  if (!fs.existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  res.end(content);
}

function serveMediaFile (req, res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!range) {
      res.writeHead(200, { "Content-Length": stat.size });
      const stream = fs.createReadStream(filePath);
      stream.on("error", (err) => { console.error("Stream error:", err); res.destroy(); });
      stream.pipe(res);
      return;
    }

    const matched = range.match(/bytes=(\d*)-(\d*)/);
    if (!matched) { sendText(res, 416, "Invalid range"); return; }

    const start = matched[1] ? Number(matched[1]) : 0;
    const end = matched[2] ? Number(matched[2]) : stat.size - 1;
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(stat.size - 1, end);

    if (safeStart > safeEnd || safeStart >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Length": safeEnd - safeStart + 1,
      "Content-Range": `bytes ${safeStart}-${safeEnd}/${stat.size}`,
    });

    const stream = fs.createReadStream(filePath, { start: safeStart, end: safeEnd });
    stream.on("error", (err) => { console.error("Stream error:", err); res.destroy(); });
    stream.pipe(res);
  } catch (error) {
    console.error("serveMediaFile error:", error);
    sendText(res, 500, "Internal server error");
  }
}

function serveMedia (req, res, pathname) {
  // 尝试通过解码后的路径匹配文件
  const rest = pathname.replace(/^\/media\//, "");

  // 处理 generated 目录的视频
  if (rest.startsWith("generated/")) {
    const fileName = rest.replace("generated/", "");
    const filePath = path.join(GENERATED_DIR, decodeURIComponent(fileName));
    if (fs.existsSync(filePath)) {
      serveMediaFile(req, res, filePath);
      return;
    }
    notFound(res);
    return;
  }

  // 获取 data 目录下的所有真实子目录
  const dataDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  const pathSegments = rest.split("/").filter(Boolean);

  // 找到第一个匹配的真实目录名
  let dramaName = null;
  let filePart = null;

  for (const realDir of dataDirs) {
    // 尝试匹配前缀
    const encodedRealDir = encodeURIComponent(realDir);
    if (rest.startsWith(encodedRealDir)) {
      dramaName = realDir;
      filePart = rest.slice(encodedRealDir.length + 1);
      break;
    }
    // 也尝试直接匹配解码后的
    if (decodeURIComponent(rest).startsWith(realDir)) {
      dramaName = realDir;
      const decoded = decodeURIComponent(rest);
      filePart = decoded.slice(realDir.length + 1);
      break;
    }
  }

  // 如果还没找到，尝试暴力匹配所有文件
  let filePath = null;
  if (dramaName && filePart) {
    const dramaDir = path.join(DATA_DIR, dramaName);
    // 找到这个目录下的所有文件
    const files = fs.readdirSync(dramaDir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);

    // 尝试匹配文件名
    for (const f of files) {
      if (filePart.includes(f) || decodeURIComponent(filePart).includes(f)) {
        filePath = path.join(dramaDir, f);
        break;
      }
      // 也尝试用文件名编码后匹配
      if (filePart.includes(encodeURIComponent(f))) {
        filePath = path.join(dramaDir, f);
        break;
      }
    }
  }

  // 如果以上都没找到，尝试最后一种方法：遍历所有文件
  if (!filePath) {
    for (const realDir of dataDirs) {
      const dramaDir = path.join(DATA_DIR, realDir);
      const files = fs.readdirSync(dramaDir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name);

      for (const f of files) {
        const testPath = path.join(dramaDir, f);
        // 检查是否是视频文件
        if (f.toLowerCase().endsWith('.mp4')) {
          // 使用更宽松的匹配策略
          const fileNameEncoded = encodeURIComponent(f);
          if (pathname.includes(fileNameEncoded) || pathname.includes(f)) {
            filePath = testPath;
            dramaName = realDir;
            break;
          }
        }
      }
      if (filePath) break;
    }
  }

  // 如果还找不到，就返回 404
  if (!filePath || !fs.existsSync(filePath)) {
    console.log("Could not find media file for path:", pathname);
    notFound(res);
    return;
  }

  serveMediaFile(req, res, filePath);
}

function readPromptMarkdown () {
  return fs.readFileSync(PROMPT_FILE, "utf-8");
}

function readContentGenPrompt () {
  return fs.readFileSync(CONTENT_GEN_PROMPT_FILE, "utf-8");
}

function readVideoBranchPrompt () {
  if (fs.existsSync(VIDEO_BRANCH_PROMPT_FILE)) {
    return fs.readFileSync(VIDEO_BRANCH_PROMPT_FILE, "utf-8");
  }
  return "You are a short-drama interactive video branch planner. Output strict JSON only.";
}

function stripJsonFence (text) {
  const cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    const trimmed = firstNewline >= 0 ? cleaned.slice(firstNewline + 1) : cleaned.slice(3);
    if (trimmed.endsWith("```")) {
      return trimmed.slice(0, -3).trim();
    }
    return trimmed.trim();
  }
  return cleaned;
}

async function callModelDirect (settings, messages) {
  const modelName = settings.endpointId || settings.modelName;
  const apiKey = settings.apiKey;
  const apiBaseUrl = settings.apiBaseUrl;

  if (!modelName || !apiKey || !apiBaseUrl) {
    throw new Error("Model settings incomplete: need modelName, apiKey, and apiBaseUrl");
  }

  const payload = { model: modelName, messages };
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model API failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Model response missing content");
  }

  return content;
}

// 调用大模型API生成内容
async function callModelAPI (settings, prompt) {
  const modelName = settings.endpointId || settings.modelName;
  const apiKey = settings.apiKey;
  const apiBaseUrl = settings.apiBaseUrl;

  if (!modelName || !apiKey || !apiBaseUrl) {
    throw new Error("Model settings incomplete: need modelName, apiKey, and apiBaseUrl");
  }

  const messages = [
    { role: "system", content: "你是一位专业的短剧编剧，擅长创作剧情分支。" },
    { role: "user", content: prompt }
  ];

  const payload = { model: modelName, messages };
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model API failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Model response missing content");
  }

  return content;
}

function episodeFilePath (episode) {
  const [dramaName, fileName] = String(episode.sourceKey || "").split("/");
  if (!dramaName || !fileName) {
    throw new Error("Episode sourceKey is invalid");
  }
  return path.join(DATA_DIR, dramaName, fileName);
}

function runAnalyzeScript ({ dramaTitle, episodeTitle, videoFile }) {
  return new Promise((resolve, reject) => {
    const args = [
      ANALYZE_SCRIPT,
      "--drama-title",
      dramaTitle,
      "--episode-title",
      episodeTitle,
      "--video-file",
      videoFile,
      "--prompt-type",
      "optimized",
    ];
    const child = spawn("python", args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `analyze script exited with code ${code}`));
        return;
      }

      // 解析输出 - 查找 [RESULTS] 之后的 JSON
      const resultsMarker = "[RESULTS]";
      let jsonStr = stdout;

      if (stdout.includes(resultsMarker)) {
        const markerIndex = stdout.indexOf(resultsMarker);
        jsonStr = stdout.substring(markerIndex + resultsMarker.length).trim();
      }

      try {
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (error) {
        console.error("解析输出失败:", stdout);
        reject(new Error(`invalid analyze script output: ${error.message}`));
      }
    });
  });
}

// ========== 视频生成 Provider 系统 ==========

function loadVideoGenSettings () {
  const settings = loadSettings();
  return {
    provider: settings.videoGen?.provider || "aliyun-bailian",
    apiKey: settings.videoGen?.apiKey || settings.apiKey || "",
    model: settings.videoGen?.model || "happyhorse",
    resolution: settings.videoGen?.resolution || "720p",
    duration: settings.videoGen?.duration || 8,
  };
}

// ============================================================
// 阿里云百炼视频生成 (DashScope Video Synthesis API)
// 文档: https://help.aliyun.com/zh/model-studio/
// 端点: POST .../video-synthesis → GET /api/v1/tasks/{task_id}
// ============================================================

const DASHSCOPE_SUBMIT_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis";
const DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks";

// 模型注册表 — 严格按百炼官方文档
const BAILIAN_MODELS = {
  happyhorse: {
    name: "happyhorse-1.0-t2v",
    buildParams: (prompt, res, dur) => ({
      model: "happyhorse-1.0-t2v",
      input: { prompt },
      parameters: {
        resolution: res === "1080p" ? "1080P" : "720P",
        ratio: "16:9",
        duration: dur,
        watermark: false,
      },
    }),
  },
  wan: {
    name: "wan2.5-t2v-preview",
    buildParams: (prompt, res, dur) => ({
      model: "wan2.5-t2v-preview",
      input: { prompt },
      parameters: {
        size: res === "1080p" ? "1920*1080" : "1280*720",
        duration: dur,
        n: 1,
      },
    }),
  },
  kling: {
    name: "kling/kling-v3-video-generation",
    buildParams: (prompt, res, dur) => ({
      model: "kling/kling-v3-video-generation",
      input: { prompt },
      parameters: {
        mode: "std",
        aspect_ratio: "16:9",
        duration: dur,
        audio: false,
        watermark: false,
      },
    }),
  },
  pixverse: {
    name: "pixverse/pixverse-v6-t2v",
    buildParams: (prompt, res, dur) => ({
      model: "pixverse/pixverse-v6-t2v",
      input: { prompt },
      parameters: {
        size: res === "1080p" ? "1920*1080" : "1280*720",
        duration: dur,
        audio: false,
        watermark: false,
      },
    }),
  },
  vidu: {
    name: "vidu/viduq3-turbo",
    buildParams: (prompt, res, dur) => ({
      model: "vidu/viduq3-turbo",
      input: { prompt },
      parameters: {
        resolution: res,
        duration: dur,
      },
    }),
  },
};

async function bailianSubmitTask (vgSettings, prompt, config) {
  const modelKey = config.model || vgSettings.model || "happyhorse";
  const resolution = config.resolution || vgSettings.resolution || "720p";
  const duration = Number(config.duration || vgSettings.duration || 8);

  const modelDef = BAILIAN_MODELS[modelKey];
  if (!modelDef) throw new Error(`Unknown model: ${modelKey}. Supported: ${Object.keys(BAILIAN_MODELS).join(", ")}`);

  const payload = modelDef.buildParams(prompt, resolution, Math.max(3, Math.min(15, duration)));

  const response = await fetch(DASHSCOPE_SUBMIT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${vgSettings.apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bailian API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const result = await response.json();
  // 响应: { output: { task_id: "...", task_status: "PENDING" }, request_id: "..." }
  const taskId = result.output?.task_id || "";
  if (!taskId) throw new Error(`Bailian response missing task_id: ${JSON.stringify(result).slice(0, 200)}`);

  return {
    providerTaskId: taskId,
    status: "processing",
    provider: "aliyun-bailian",
    model: modelDef.name,
  };
}

async function bailianQueryTask (vgSettings, providerTaskId) {
  // 查询端点: GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}
  const response = await fetch(`${DASHSCOPE_TASK_URL}/${providerTaskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${vgSettings.apiKey}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bailian query error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = await response.json();
  // 响应: { output: { task_id, task_status, video_url, ... }, usage: { duration, size, ... } }
  const status = result.output?.task_status || "UNKNOWN";
  const statusMap = {
    PENDING: "processing",
    RUNNING: "processing",
    SUCCEEDED: "completed",
    FAILED: "failed",
    CANCELED: "failed",
  };

  return {
    status: statusMap[status] || "processing",
    providerStatus: status,
    videoUrl: result.output?.video_url || null,
    thumbnailUrl: result.output?.thumbnail_url || result.output?.cover_url || null,
    progress: status === "SUCCEEDED" ? 100 : status === "RUNNING" ? 50 : 10,
    usage: result.usage || null,
    rawResult: result,
  };
}

async function submitVideoGenTask (settings, prompt, config, title) {
  const vgSettings = loadVideoGenSettings();
  if (!vgSettings.apiKey) {
    throw new Error("Video generation API Key not configured. Set videoGen.apiKey in model-settings.json");
  }

  let providerResult;
  if (vgSettings.provider === "aliyun-bailian") {
    providerResult = await bailianSubmitTask(vgSettings, prompt, config);
  } else if (vgSettings.provider === "volcengine-seedance") {
    // Seedance via Volcengine Ark (future implementation)
    throw new Error("Seedance provider not yet implemented. Use aliyun-bailian for now.");
  } else {
    throw new Error(`Unknown video gen provider: ${vgSettings.provider}`);
  }

  return {
    id: `vg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    videoPrompt: String(prompt),
    title: String(title || "视频生成任务"),
    promptSummary: String(prompt).slice(0, 100),
    config: config || {},
    status: "processing",
    progress: 10,
    videoUrl: null,
    thumbnailUrl: null,
    errorMessage: null,
    providerTaskId: providerResult.providerTaskId,
    provider: providerResult.provider,
    model: providerResult.model,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function queryVideoGenTask (settings, providerTaskId) {
  const vgSettings = loadVideoGenSettings();
  if (!vgSettings.apiKey) {
    throw new Error("Video generation API Key not configured");
  }

  if (vgSettings.provider === "aliyun-bailian") {
    return bailianQueryTask(vgSettings, providerTaskId);
  }
  throw new Error(`Unknown video gen provider: ${vgSettings.provider}`);
}

// 自动刷新本地任务状态（轮询）+ 完成后自动下载视频
async function refreshLocalTasks () {
  const tasks = loadVideoGenTasks();
  let changed = false;
  for (const task of tasks) {
    if (task.status === "completed" || task.status === "failed") continue;
    if (!task.providerTaskId) continue;
    try {
      const status = await queryVideoGenTask(loadSettings(), task.providerTaskId);
      if (status.status !== task.status || status.videoUrl !== task.videoUrl) {
        task.status = status.status;
        task.progress = status.progress;
        task.updatedAt = new Date().toISOString();

        // 视频生成完成 → 自动下载到本地
        if (status.status === "completed" && status.videoUrl && !task.localFile) {
          try {
            const localPath = await downloadGeneratedVideo(task, status.videoUrl);
            task.localFile = localPath;
            task.videoUrl = status.videoUrl; // 保留原始 URL
          } catch (dlErr) {
            task.localFile = null;
            task.errorMessage = `Download failed: ${String(dlErr.message).slice(0, 100)}`;
          }
        } else {
          task.videoUrl = status.videoUrl || task.videoUrl;
        }
        task.thumbnailUrl = status.thumbnailUrl || task.thumbnailUrl;
        changed = true;
      }
    } catch (e) {
      // Keep current status on query error
    }
  }
  if (changed) saveVideoGenTasks(tasks);
  return tasks;
}

// 下载生成的视频到本地 data/generated/
async function downloadGeneratedVideo (task, videoUrl) {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  const ext = ".mp4";
  const safeName = (task.title || task.id).replace(/[<>:"/\\|?*]/g, "_").slice(0, 40);
  const fileName = `${Date.now()}_${safeName}${ext}`;
  const filePath = path.join(GENERATED_DIR, fileName);

  // 流式下载
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const relativePath = `generated/${fileName}`;
  console.log(`[VideoGen] Downloaded: ${relativePath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return relativePath;
}

// GET /api/video-gen/refresh — 刷新所有进行中任务的状态
function handleRefreshTasks (req, res) {
  refreshLocalTasks().then((tasks) => {
    sendJson(res, 200, { tasks: tasks.filter((t) => t.status === "processing").slice(0, 20) });
  }).catch((err) => {
    sendJson(res, 500, { error: String(err.message) });
  });
}

async function handleApi (req, res, url) {
  const settings = loadSettings();
  const catalog = buildCatalog();
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && parts[1] === "episodes" && parts[2] && parts[3] === "continuations") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { continuations: getContinuations(episode.sourceKey) });
    return;
  }

  if (req.method === "GET" && parts[1] === "episodes" && parts[2] && parts[3] === "video-branches") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { videoBranches: getVideoBranches(episode.sourceKey) });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "video-branches" && parts[2]) {
    const deleted = deleteVideoBranchPackage(parts[2]);
    if (!deleted) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { success: true, id: parts[2] });
    return;
  }

  if (req.method === "POST" && parts[1] === "episodes" && parts[2] && parts[3] === "video-branches" && parts[4] === "generate") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }

    let body = {};
    try {
      body = await parseBody(req);
    } catch {
      body = {};
    }

    const drama = catalog.dramaById.get(episode.dramaId);
    const episodeHighlights = getEpisodeHighlights(episode, true);
    const selectedHighlight = body.highlightId
      ? episodeHighlights.find((item) => item.id === body.highlightId)
      : null;

    if (body.highlightId && !selectedHighlight) {
      sendJson(res, 400, { error: "Selected highlight does not belong to this episode" });
      return;
    }

    const highlights = selectedHighlight
      ? [selectedHighlight]
      : episodeHighlights.slice().sort((a, b) => Number(b.intensity || 0) - Number(a.intensity || 0)).slice(0, 5);

    if (!highlights.length) {
      sendJson(res, 400, { error: "Generate video branches after selecting a highlight: no highlight found" });
      return;
    }

    try {
      const highlightBrief = highlights.map((item, index) => ({
        index: index + 1,
        id: item.id,
        type: item.type,
        time: `${item.startTime}-${item.endTime}s`,
        summary: item.summary,
        emotion: item.emotion,
        intensity: item.intensity,
        modelReason: item.modelReason,
      }));
      const rawResult = await callModelDirect(settings, [
        { role: "system", content: readVideoBranchPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            dramaTitle: drama?.title || "",
            episodeTitle: episode.title,
            task: selectedHighlight
              ? "Generate AIGC video branch ideas for the selected highlight only."
              : "Brainstorm interactive video branch ideas from analyzed highlights.",
            generationMode: selectedHighlight ? "selected_highlight" : "episode_top_highlights",
            highlights: highlightBrief,
            outputSchema: {
              title: "string",
              setup: "string",
              interaction_nodes: [
                {
                  node_id: "string",
                  trigger_highlight_id: "string",
                  trigger_time: "number",
                  trigger_description: "string",
                  video_branches: [
                    {
                      branch_id: "string",
                      title: "string",
                      description: "string",
                      duration: "number",
                      user_choice_label: "string",
                      emotion_curve: ["string"],
                      video_prompt: "string",
                      risk_note: "string"
                    }
                  ]
                }
              ]
            }
          }, null, 2)
        }
      ]);
      const parsed = JSON.parse(stripJsonFence(rawResult));
      const nodes = Array.isArray(parsed.interaction_nodes) ? parsed.interaction_nodes.slice(0, 5) : [];
      const normalizedNodes = nodes.map((node, nodeIndex) => {
        const fallbackHighlight = highlights[nodeIndex] || highlights[0];
        return {
          node_id: String(node.node_id || `node_${nodeIndex + 1}`),
          trigger_highlight_id: String(node.trigger_highlight_id || fallbackHighlight.id),
          trigger_time: Number(node.trigger_time ?? fallbackHighlight.startTime ?? 0),
          trigger_description: String(node.trigger_description || fallbackHighlight.summary || ""),
          video_branches: Array.isArray(node.video_branches) ? node.video_branches.slice(0, 3).map((branch, branchIndex) => ({
            branch_id: String(branch.branch_id || `branch_${nodeIndex + 1}_${branchIndex + 1}`),
            title: String(branch.title || `分支 ${branchIndex + 1}`),
            description: String(branch.description || ""),
            duration: Number(branch.duration || 12),
            user_choice_label: String(branch.user_choice_label || branch.title || `选项 ${branchIndex + 1}`),
            emotion_curve: Array.isArray(branch.emotion_curve) ? branch.emotion_curve.slice(0, 5).map(String) : [],
            video_prompt: String(branch.video_prompt || ""),
            risk_note: String(branch.risk_note || ""),
          })) : [],
        };
      });
      const videoBranchPackage = upsertVideoBranchPackage({
        id: makeId("vbranch", `${episode.sourceKey}:${highlights.map(item => item.id).join("|")}`),
        episodeId: episode.id,
        episodeKey: episode.sourceKey,
        title: String(parsed.title || (selectedHighlight ? "选中高光视频分支" : "高光视频分支头脑风暴")),
        setup: String(parsed.setup || (selectedHighlight ? "基于审核选中的高光生成可预处理的视频分支创意。" : "基于本集高光生成可预处理的视频分支创意。")),
        interaction_nodes: normalizedNodes,
        status: "published",
        modelSource: settings.modelName || "Doubao-Seed-2.0-lite",
        rawModelOutput: parsed,
      });
      sendJson(res, 201, { success: true, videoBranchPackage });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && parts[1] === "episodes" && parts[2] && parts[3] === "continuations" && parts[4] === "generate") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }

    const drama = catalog.dramaById.get(episode.dramaId);
    const highlights = getEpisodeHighlights(episode, true);
    const trigger = [...highlights]
      .reverse()
      .find(item => String(item.type || "").includes("钩子") || String(item.type || "").includes("悬念")) || highlights[highlights.length - 1];

    if (!trigger) {
      sendJson(res, 400, { error: "Generate continuations after highlight analysis: no trigger highlight found" });
      return;
    }

    try {
      const rawResult = await callModelDirect(settings, [
        {
          role: "system",
          content: "你是短剧剧情分支创作助手。请基于剧尾钩子或悬念高光，生成详细的剧情分支文字内容，便于后续视频生成。只输出严格 JSON。"
        },
        {
          role: "user",
          content: `剧名：${drama?.title || ""}\n剧集：${episode.title}\n触发高光类型：${trigger.type}\n触发时间：${trigger.startTime}-${trigger.endTime} 秒\n剧情摘要：${trigger.summary || ""}\n模型判断：${trigger.modelReason || ""}\n\n请生成 3 个详细的剧情续写分支，每个分支包含完整的文字剧本内容。输出 JSON 格式：\n{\n  "title": "剧尾互动标题",\n  "setup": "60字以内的剧情引导语",\n  "branches": [\n    {\n      "id": "branch_id_1",\n      "label": "分支选项名称",\n      "emotion": "爽点|悬念|甜蜜|反转|搞笑",\n      "teaser": "80字以内的分支预告",\n      "script": "200-300字的详细剧情脚本，包含场景描述、人物对话和动作描写，适合直接用于视频生成"\n    },\n    {\n      "id": "branch_id_2",\n      "label": "分支选项名称",\n      "emotion": "爽点|悬念|甜蜜|反转|搞笑",\n      "teaser": "80字以内的分支预告",\n      "script": "200-300字的详细剧情脚本，包含场景描述、人物对话和动作描写，适合直接用于视频生成"\n    },\n    {\n      "id": "branch_id_3",\n      "label": "分支选项名称",\n      "emotion": "爽点|悬念|甜蜜|反转|搞笑",\n      "teaser": "80字以内的分支预告",\n      "script": "200-300字的详细剧情脚本，包含场景描述、人物对话和动作描写，适合直接用于视频生成"\n    }\n  ]\n}`
        }
      ]);
      const parsed = JSON.parse(stripJsonFence(rawResult));
      const continuation = upsertContinuation({
        id: makeId("cont", `${episode.sourceKey}:${trigger.id}`),
        episodeId: episode.id,
        episodeKey: episode.sourceKey,
        triggerHighlightId: trigger.id,
        triggerTime: Number(trigger.startTime || 0),
        title: String(parsed.title || "剧尾互动选择"),
        setup: String(parsed.setup || trigger.summary || ""),
        branches: Array.isArray(parsed.branches) ? parsed.branches.slice(0, 3) : [],
        status: "published",
        modelSource: settings.modelName || "Doubao-Seed-2.0-lite",
        rawModelOutput: parsed,
      });
      sendJson(res, 201, { continuation });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dramas") {
    const dramas = catalog.dramas.map((drama) => ({
      ...drama,
      episodes: catalog.episodes
        .filter((episode) => episode.dramaId === drama.id)
        .map((episode) => {
          const highlights = getEpisodeHighlights(episode, true);
          return {
            ...episode,
            highlightCount: highlights.length,
            publishedCount: highlights.filter((item) => item.status === "published").length,
          };
        }),
    }));
    sendJson(res, 200, { dramas });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/review/episodes") {
    const episodes = catalog.episodes.map((episode) => buildReviewEpisode(catalog, episode));
    sendJson(res, 200, { episodes });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/model/settings") {
    sendJson(res, 200, { settings: publicSettings(settings) });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/model/settings") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    const next = saveSettings(body);
    sendJson(res, 200, { settings: publicSettings(next) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/effects/config") {
    const config = loadEffectsConfig();
    sendJson(res, 200, { config });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/effects/config") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    const config = saveEffectsConfig(body);
    sendJson(res, 200, { config });
    return;
  }

  if (req.method === "PUT" && parts[1] === "dramas" && parts[2]) {
    // 更新剧集信息（标题、描述等）
    const dramaId = parts[2];
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    // 我们这里只是返回成功，实际存储可以在 store.json 中扩展
    sendJson(res, 200, { success: true, dramaId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/model/prompt") {
    sendJson(res, 200, {
      provider: settings.provider,
      modelName: settings.modelName,
      markdown: readPromptMarkdown(),
      outputExample: PROMPT_OUTPUT_EXAMPLE,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/content-gen/prompt") {
    sendJson(res, 200, {
      provider: settings.provider,
      modelName: settings.modelName,
      markdown: readContentGenPrompt(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/content-gen/generate") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    if (!body.highlight) {
      sendJson(res, 400, { error: "highlight data is required" });
      return;
    }

    const highlight = body.highlight;
    const generationType = body.type || "suggestions"; // "suggestions" or "extended"

    const systemPrompt = "你是短剧互动内容生成助手。你的任务是根据给定的高光信息，生成更吸引人的互动内容。输出必须严格是JSON格式，不要有任何额外的文字解释。";

    let userPrompt;
    if (generationType === "extended") {
      userPrompt = `请为以下高光生成一组扩展互动内容，包括：
- 不同角度的互动按钮选项
- 一句搞笑/扎心的弹幕文案
- 一个趣味投票问题

高光类型：${highlight.type}
剧情：${highlight.summary || ""}

输出JSON格式：
{
  "extra_suggestions": ["选项1", "选项2", "选项3"],
  "danmaku_text": "适合发弹幕的句子",
  "poll_question": "投票问题？",
  "poll_options": ["选项A", "选项B", "选项C"]
}`;
    } else {
      userPrompt = `请根据以下高光信息，生成更优秀的互动内容。

高光类型：${highlight.type}
当前剧情摘要：${highlight.summary || ""}
当前情绪标签：${highlight.emotion || ""}
当前强度：${highlight.intensity || 0.6}
当前互动按钮：${(highlight.suggestions || []).join(", ")}

请生成：
1. 2-4个更有网感、更吸引人的互动按钮文案
2. 1个吸引人的高光标题
3. 1个更生动的剧情摘要（不超过50字）

输出JSON格式：
{
  "suggestions": ["文案1", "文案2"],
  "title": "吸引人的标题",
  "improved_summary": "更生动的摘要"
}`;
    }

    try {
      const rawResult = await callModelDirect(settings, [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
      const parsed = JSON.parse(stripJsonFence(rawResult));
      sendJson(res, 200, {
        success: true,
        generated: parsed,
        rawResult,
      });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/model/analyze") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const episode = catalog.episodeById.get(String(body.episodeId || ""));
    if (!episode) {
      sendJson(res, 400, { error: "episodeId is required and must match an existing episode" });
      return;
    }

    let analyzedOutput;
    try {
      const drama = catalog.dramaById.get(episode.dramaId);
      analyzedOutput = await runAnalyzeScript({
        dramaTitle: drama.title,
        episodeTitle: episode.title,
        videoFile: episodeFilePath(episode),
      });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
      return;
    }

    let importedHighlights;
    try {
      importedHighlights = extractImportedHighlights({ modelOutput: analyzedOutput }).map((item, index) =>
        normalizeImportedHighlight(item, index, episode, body, settings)
      );
    } catch (error) {
      sendJson(res, 400, { error: String(error.message || error) });
      return;
    }

    if (body.replaceExisting === true) {
      // 先删除旧的高光
      const oldHighlights = getHighlights(episode.sourceKey);
      oldHighlights.forEach(h => deleteHighlight(h.id));
    }

    addHighlights(importedHighlights);
    sendJson(res, 201, {
      analyzed: true,
      importedCount: importedHighlights.length,
      episodeId: episode.id,
      episodeTitle: episode.title,
      videoSource: episode.sourceKey,
      modelOutput: analyzedOutput,
      importedHighlights,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/model/import") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const episode = catalog.episodeById.get(String(body.episodeId || ""));
    if (!episode) {
      sendJson(res, 400, { error: "episodeId is required and must match an existing episode" });
      return;
    }

    let importedHighlights;
    try {
      importedHighlights = extractImportedHighlights(body).map((item, index) =>
        normalizeImportedHighlight(item, index, episode, body, settings)
      );
    } catch (error) {
      sendJson(res, 400, { error: String(error.message || error) });
      return;
    }

    if (body.replaceExisting === true) {
      // 先删除旧的高光
      const oldHighlights = getHighlights(episode.sourceKey);
      oldHighlights.forEach(h => deleteHighlight(h.id));
    }

    addHighlights(importedHighlights);

    sendJson(res, 201, {
      importedCount: importedHighlights.length,
      episodeId: episode.id,
      episodeTitle: episode.title,
      importedHighlights,
    });
    return;
  }

  if (req.method === "GET" && parts[1] === "episodes" && parts[2] && !parts[3]) {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { episode });
    return;
  }

  if (req.method === "GET" && parts[1] === "episodes" && parts[2] && parts[3] === "highlights") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }
    const includeDrafts = url.searchParams.get("includeDrafts") === "true";
    sendJson(res, 200, { highlights: getEpisodeHighlights(episode, includeDrafts) });
    return;
  }

  if (req.method === "POST" && parts[1] === "episodes" && parts[2] && parts[3] === "highlights") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const existingCount = getEpisodeHighlights(episode, true).length;
    const now = new Date().toISOString();
    const highlight = {
      id: `hl_${Date.now()}`,
      episodeKey: episode.sourceKey,
      startTime: Number(body.startTime ?? 10),
      endTime: Number(body.endTime ?? 20),
      type: body.type || "悬念",
      emotion: body.emotion || "待补充",
      intensity: clamp01(body.intensity ?? 0.6, 0.6),
      confidence: clamp01(body.confidence ?? 0.5, 0.5),
      summary: body.summary || `新建候选高光 ${existingCount + 1}`,
      suggestions: toSuggestions(body.suggestions, ["继续看", "有点东西", "先标一个"]),
      status: body.status || "draft",
      modelSource: body.modelSource || "manual",
      modelReason: body.modelReason || "人工新建候选高光，待补充模型判断依据。",
      createdAt: now,
      updatedAt: now,
    };
    addHighlights([highlight]);
    sendJson(res, 201, { highlight: { ...highlight, episodeId: episode.id, stats: getHighlightStats(highlight.id) } });
    return;
  }

  if (req.method === "PUT" && parts[1] === "highlights" && parts[2]) {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const highlight = updateHighlight(parts[2], {
      ...body,
      startTime: body.startTime !== undefined ? Number(body.startTime) : undefined,
      endTime: body.endTime !== undefined ? Number(body.endTime) : undefined,
      intensity: body.intensity !== undefined ? clamp01(body.intensity, undefined) : undefined,
      confidence: body.confidence !== undefined ? clamp01(body.confidence, undefined) : undefined,
      suggestions: body.suggestions !== undefined ? toSuggestions(body.suggestions, undefined) : undefined,
    });

    if (!highlight) {
      notFound(res);
      return;
    }

    sendJson(res, 200, { highlight });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "episodes" && parts[2] && parts[3] === "highlights" && parts[4]) {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }

    const highlightId = parts[4];
    const highlights = getAllHighlights();
    const existing = highlights.find(h => h.id === highlightId);

    if (!existing) {
      notFound(res);
      return;
    }

    deleteHighlight(highlightId);
    sendJson(res, 200, { success: true, message: "高光已删除" });
    return;
  }

  if (req.method === "GET" && parts[1] === "highlights" && parts[2] && parts[3] === "stats") {
    const highlights = getAllHighlights();
    const highlight = highlights.find((item) => item.id === parts[2]);
    if (!highlight) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { stats: getHighlightStats(highlight.id) });
    return;
  }

  // 互动活动数据 API（实时互动计数 + 热门按钮）
  if (req.method === "GET" && parts[1] === "highlights" && parts[2] && parts[3] === "activity") {
    const highlights = getAllHighlights();
    const highlight = highlights.find((item) => item.id === parts[2]);
    if (!highlight) {
      notFound(res);
      return;
    }
    const stats = getHighlightStats(highlight.id);
    const interactions = getInteractions().filter((item) => item.highlightId === highlight.id);
    const recentUsers = interactions.slice(-8).reverse().map((item) => ({
      reaction: item.reaction || item.buttonText,
      time: item.createdAt,
    }));
    sendJson(res, 200, {
      highlightId: highlight.id,
      total: stats.total,
      breakdown: stats.breakdown,
      hotButtons: Object.entries(stats.breakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, count]) => ({ label, count })),
      recentUsers,
      userCount: new Set(interactions.map((item) => item.userId || item.id)).size,
    });
    return;
  }

  // 剧集互动动态流 API
  if (req.method === "GET" && parts[1] === "episodes" && parts[2] && parts[3] === "activity-feed") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) {
      notFound(res);
      return;
    }
    const episodeHighlights = getEpisodeHighlights(episode, true);
    const episodeHighlightIds = new Set(episodeHighlights.map((item) => item.id));
    const interactions = getInteractions().filter((item) =>
      item.episodeKey === episode.sourceKey || episodeHighlightIds.has(item.highlightId)
    );
    const feed = interactions.slice(-20).reverse().map((item) => {
      const relatedHighlight = getAllHighlights().find((h) => h.id === item.highlightId);
      return {
        id: item.id,
        reaction: item.reaction || item.buttonText,
        highlightType: relatedHighlight?.type || "高光",
        highlightSummary: relatedHighlight?.summary || "",
        time: item.createdAt,
      };
    });
    // 聚合每个高光点的互动总数
    const highlightActivity = {};
    interactions.forEach((item) => {
      if (!highlightActivity[item.highlightId]) {
        highlightActivity[item.highlightId] = { total: 0, topReactions: {} };
      }
      highlightActivity[item.highlightId].total += 1;
      const reaction = item.reaction || item.buttonText;
      highlightActivity[item.highlightId].topReactions[reaction] =
        (highlightActivity[item.highlightId].topReactions[reaction] || 0) + 1;
    });
    sendJson(res, 200, {
      episodeId: episode.id,
      totalInteractions: interactions.length,
      feed,
      highlightActivity,
      uniqueUsers: new Set(interactions.map((item) => item.userId || item.id)).size,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/interactions") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const highlights = getAllHighlights();
    const highlight = highlights.find((item) => item.id === body.highlightId);
    if (!highlight) {
      notFound(res);
      return;
    }

    const interaction = {
      id: `act_${Date.now()}`,
      highlightId: highlight.id,
      episodeKey: highlight.episodeKey,
      reaction: body.reaction || "已互动",
      buttonText: body.buttonText || body.reaction || "已互动",
      createdAt: new Date().toISOString(),
    };
    addInteraction(interaction);
    sendJson(res, 201, { interaction, stats: getHighlightStats(highlight.id) });
    return;
  }

  // ========== 视频分支生成 API ==========

  // 生成视频分支（调用大模型生成视频提示词）
  if (req.method === "POST" && url.pathname === "/api/video-branches/generate") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { episodeId, plotSummary, highlights, currentFrame } = body;

    if (!episodeId || !plotSummary) {
      sendJson(res, 400, { error: "Missing required fields: episodeId, plotSummary" });
      return;
    }

    try {
      // 读取视频分支生成的prompt文件
      const promptPath = path.join(ROOT_DIR, "prompts", "video-branch-generator.md");
      const promptTemplate = fs.readFileSync(promptPath, "utf-8");

      // 构建完整的prompt
      const fullPrompt = `${promptTemplate}

## 当前剧集信息

**剧集ID**: ${episodeId}
**剧情概要**: ${plotSummary}
**高光点**: ${JSON.stringify(highlights || [], null, 2)}
**当前帧信息**: ${JSON.stringify(currentFrame || {}, null, 2)}

请基于以上信息，生成交互式视频分支。`;

      // 调用大模型API生成视频提示词
      const modelResponse = await callModelAPI(settings, fullPrompt);

      // 解析返回的JSON
      let branchData;
      try {
        // 尝试提取JSON代码块
        const jsonMatch = modelResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          branchData = JSON.parse(jsonMatch[1]);
        } else {
          // 尝试直接解析
          branchData = JSON.parse(modelResponse);
        }
      } catch (parseError) {
        sendJson(res, 500, {
          error: "Failed to parse model response as JSON",
          rawResponse: modelResponse
        });
        return;
      }

      sendJson(res, 200, {
        success: true,
        data: branchData,
        rawResponse: modelResponse
      });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  // 提交视频生成任务（支持阿里云百炼 / 火山方舟 Seedance）
  if (req.method === "POST" && url.pathname === "/api/video-branches/create") {
    let body;
    try { body = await parseBody(req); } catch { sendJson(res, 400, { error: "Invalid JSON body" }); return; }
    const { videoPrompt, config } = body;
    if (!videoPrompt) { sendJson(res, 400, { error: "videoPrompt is required" }); return; }
    try {
      const task = await submitVideoGenTask(settings, videoPrompt, config || {}, body.title || "");
      sendJson(res, 200, { success: true, taskId: task.providerTaskId || task.id, task });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  // 查询视频生成任务状态
  if (req.method === "GET" && parts[1] === "video-branches" && parts[2] === "status" && parts[3]) {
    try {
      const status = await queryVideoGenTask(settings, parts[3]);
      sendJson(res, 200, { success: true, ...status });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  // 保存视频分支
  if (req.method === "POST" && url.pathname === "/api/video-branches/save") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { episodeId, nodeId, branch } = body;

    if (!episodeId || !nodeId || !branch) {
      sendJson(res, 400, { error: "Missing required fields: episodeId, nodeId, branch" });
      return;
    }

    try {
      const db = loadDb();

      // 添加视频分支记录
      const videoBranch = {
        id: `video_branch_${episodeId}_${nodeId}_${Date.now()}`,
        episodeId,
        nodeId,
        ...branch,
        createdAt: new Date().toISOString(),
        status: "pending"
      };

      if (!db.videoBranches) {
        db.videoBranches = [];
      }

      db.videoBranches.push(videoBranch);
      saveDb(db);

      sendJson(res, 201, {
        success: true,
        videoBranch: videoBranch,
        message: "Video branch saved successfully"
      });
    } catch (error) {
      sendJson(res, 500, { error: String(error.message || error) });
    }
    return;
  }

  // ========== 视频生成 AIGC Pipeline ==========

  if (req.method === "POST" && url.pathname === "/api/video-gen/submit") {
    let body;
    try { body = await parseBody(req); } catch { sendJson(res, 400, { error: "Invalid JSON body" }); return; }
    if (!body.videoPrompt) { sendJson(res, 400, { error: "videoPrompt is required" }); return; }
    try {
      // Try real video generation
      const task = await submitVideoGenTask(settings, body.videoPrompt, body.config || {}, body.title || "");
      task.episodeId = body.episodeId || null;
      task.episodeKey = body.episodeKey || null;
      task.branchId = body.branchId || null;
      task.highlightId = String(body.highlightId || "");
      task.triggerTime = Number(body.triggerTime || 0);
      // Save to local task list
      const tasks = loadVideoGenTasks();
      tasks.unshift(task);
      saveVideoGenTasks(tasks.slice(0, 50));
      sendJson(res, 201, { success: true, task });
    } catch (error) {
      // Fallback: save as pending if API call fails
      const tasks = loadVideoGenTasks();
      const task = {
        id: `vg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        videoPrompt: String(body.videoPrompt),
        title: String(body.title || "视频生成任务"),
        promptSummary: String(body.videoPrompt).slice(0, 100),
        config: body.config || {},
        status: "failed",
        progress: 0,
        videoUrl: null,
        thumbnailUrl: null,
        errorMessage: String(error.message || error).slice(0, 200),
        episodeId: body.episodeId || null,
        episodeKey: body.episodeKey || null,
        branchId: body.branchId || null,
        highlightId: String(body.highlightId || ""),
        triggerTime: Number(body.triggerTime || 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      tasks.unshift(task);
      saveVideoGenTasks(tasks.slice(0, 50));
      sendJson(res, 201, { success: true, task, warning: "Video generation API failed, saved as failed. Check API Key configuration." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/video-gen/tasks") {
    const tasks = loadVideoGenTasks();
    const episodeId = url.searchParams.get("episodeId");
    const filtered = episodeId ? tasks.filter((t) => t.episodeId === episodeId) : tasks;
    sendJson(res, 200, {
      tasks: filtered.slice(0, 20).map((task) => ({
        ...task,
        playableUrl: task.localFile
          ? `/media/${String(task.localFile).split("/").map((part) => encodeURIComponent(part)).join("/")}`
          : task.videoUrl || "",
      })),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/video-gen/refresh") {
    handleRefreshTasks(req, res);
    return;
  }

  // 获取某剧集关联的生成视频（前台播放器用）
  if (req.method === "GET" && parts[1] === "episodes" && parts[2] && parts[3] === "generated-videos") {
    const episode = catalog.episodeById.get(parts[2]);
    if (!episode) { notFound(res); return; }
    const tasks = loadVideoGenTasks();
    const related = tasks.filter((t) =>
      t.status === "completed" && t.localFile &&
      (t.episodeId === episode.id || t.episodeKey === episode.sourceKey)
    );
    const videos = related.map((t) => ({
      id: t.id,
      title: t.title || "分支视频",
      promptSummary: t.promptSummary,
      url: `/media/${encodeURIComponent(t.localFile)}`,
      duration: t.config?.duration || 8,
      triggerTime: t.triggerTime || 0,
      highlightId: t.highlightId || "",
      createdAt: t.createdAt,
      highlightType: t.config?.highlightType || "分支剧情",
      branchLabel: t.config?.branchLabel || "",
    }));
    sendJson(res, 200, { videos });
    return;
  }

  // 列出已生成的视频文件
  if (req.method === "GET" && url.pathname === "/api/video-gen/downloads") {
    const tasks = loadVideoGenTasks();
    const completed = tasks.filter((t) => t.status === "completed" && t.localFile);
    const files = [];
    // 也扫描 generated 目录
    if (fs.existsSync(GENERATED_DIR)) {
      const existing = new Set(completed.map((t) => t.localFile));
      const dirFiles = fs.readdirSync(GENERATED_DIR)
        .filter((f) => f.endsWith(".mp4"))
        .sort()
        .reverse();
      for (const f of dirFiles) {
        const relPath = `generated/${f}`;
        const stat = fs.statSync(path.join(GENERATED_DIR, f));
        const task = completed.find((t) => t.localFile === relPath);
        files.push({
          fileName: f,
          url: `/media/generated/${encodeURIComponent(f)}`,
          localPath: relPath,
          sizeBytes: stat.size,
          createdAt: stat.birthtime.toISOString(),
          title: task?.title || f.replace(/^\d+_/, "").replace(/_/g, " ").replace(".mp4", ""),
          taskId: task?.id || null,
          videoPrompt: task?.promptSummary || "",
        });
      }
    }
    sendJson(res, 200, { files });
    return;
  }

  if (req.method === "GET" && parts[1] === "video-gen" && parts[2] === "status" && parts[3]) {
    const tasks = loadVideoGenTasks();
    const task = tasks.find((t) => t.id === parts[3]);
    if (!task) { notFound(res); return; }
    sendJson(res, 200, {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      videoUrl: task.videoUrl,
      thumbnailUrl: task.thumbnailUrl,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt,
    });
    return;
  }

  if (req.method === "GET" && parts[1] === "video-gen" && parts[2] === "result" && parts[3]) {
    const tasks = loadVideoGenTasks();
    const task = tasks.find((t) => t.id === parts[3]);
    if (!task) { notFound(res); return; }
    sendJson(res, 200, { task });
    return;
  }

  // Update task status (for future provider integration)
  if (req.method === "PUT" && parts[1] === "video-gen" && parts[2] === "status" && parts[3]) {
    let body;
    try { body = await parseBody(req); } catch { sendJson(res, 400, { error: "Invalid JSON body" }); return; }
    const tasks = loadVideoGenTasks();
    const idx = tasks.findIndex((t) => t.id === parts[3]);
    if (idx === -1) { notFound(res); return; }
    tasks[idx] = {
      ...tasks[idx],
      status: body.status || tasks[idx].status,
      progress: body.progress !== undefined ? Number(body.progress) : tasks[idx].progress,
      videoUrl: body.videoUrl !== undefined ? body.videoUrl : tasks[idx].videoUrl,
      thumbnailUrl: body.thumbnailUrl !== undefined ? body.thumbnailUrl : tasks[idx].thumbnailUrl,
      errorMessage: body.errorMessage !== undefined ? body.errorMessage : tasks[idx].errorMessage,
      updatedAt: new Date().toISOString(),
    };
    saveVideoGenTasks(tasks);
    sendJson(res, 200, { success: true, task: tasks[idx] });
    return;
  }

  notFound(res);
}

// ========== Video Gen Task Storage ==========

function loadVideoGenTasks () {
  ensureJsonFile(VIDEO_GEN_FILE, []);
  return readJson(VIDEO_GEN_FILE);
}

function saveVideoGenTasks (tasks) {
  writeJson(VIDEO_GEN_FILE, tasks);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname.startsWith("/media/")) {
      serveMedia(req, res, url.pathname);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: "Internal server error",
      detail: String(error.message || error),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
