const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "db.json");
const original = fs.readFileSync(file, "utf8");
const backup = `${file}.bak-bad-json-${Date.now()}`;

fs.writeFileSync(backup, original, "utf8");

let repaired = original
  .replace(/�\?,/g, "�?\",")
  .replace(/�\?:/g, "�?\":")
  .replace(/�\?(?=\r?\n)/g, "�?\"");

JSON.parse(repaired);
fs.writeFileSync(file, repaired, "utf8");

console.log(`Repaired db.json. Backup: ${backup}`);
