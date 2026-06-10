const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const DB_FILE = path.join(DATA, "db.json");
const STORE_FILE = path.join(DATA, "store.json");

const KEY_FIXES = new Map([
  ["北派寻宝笔记/�?3�?mp4", "北派寻宝笔记/第63集.mp4"],
  ["北派寻宝笔记/�?4�?mp4", "北派寻宝笔记/第64集.mp4"],
  ["北派寻宝笔记/�?5�?mp4", "北派寻宝笔记/第65集.mp4"],
  ["北派寻宝笔记/�?6�?mp4", "北派寻宝笔记/第66集.mp4"],
  ["北派寻宝笔记/�?2�?mp4", "北派寻宝笔记/第72集.mp4"],
  ["天下第一纨绔/�?�?mp4", "天下第一纨绔/第1集.mp4"],
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function backup(file) {
  const backupFile = `${file}.bak-highlight-repair-${Date.now()}`;
  fs.copyFileSync(file, backupFile);
  return backupFile;
}

function normalizeHighlight(highlight) {
  const fixedKey = KEY_FIXES.get(highlight.episodeKey);
  if (fixedKey) highlight.episodeKey = fixedKey;
  if (highlight.status !== "published") highlight.status = "published";
  highlight.updatedAt = new Date().toISOString();
  return highlight;
}

function repairDb(db) {
  db.highlights = Array.isArray(db.highlights) ? db.highlights.map(normalizeHighlight) : [];

  const nextEpisodes = {};
  for (const [key, episode] of Object.entries(db.episodes || {})) {
    const fixedKey = KEY_FIXES.get(key) || key;
    nextEpisodes[fixedKey] = {
      ...episode,
      sourceKey: fixedKey,
      title: fixedKey.split("/").pop().replace(/\.mp4$/i, ""),
      videoPath: path.join("data", ...fixedKey.split("/")).replaceAll("\\", "/"),
    };
  }
  db.episodes = nextEpisodes;
  return db;
}

function repairStore(store) {
  store.highlights = Array.isArray(store.highlights) ? store.highlights.map(normalizeHighlight) : [];
  store.updatedAt = new Date().toISOString();
  return store;
}

const dbBackup = backup(DB_FILE);
const storeBackup = backup(STORE_FILE);
const db = repairDb(readJson(DB_FILE));
const store = repairStore(readJson(STORE_FILE));

writeJson(DB_FILE, db);
writeJson(STORE_FILE, store);

console.log(`Repaired highlight data.`);
console.log(`DB backup: ${dbBackup}`);
console.log(`Store backup: ${storeBackup}`);
