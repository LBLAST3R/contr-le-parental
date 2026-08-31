"use strict";
// Stockage des captures d'écran à la demande (dernière image par appareil).

const fs = require("fs");
const path = require("path");
const config = require("./config");

const DIR = path.join(config.DATA_DIR, "screens");

function file(id) {
  return path.join(DIR, `${id.replace(/[^a-z0-9_-]/gi, "_")}.jpg`);
}

function save(id, buffer) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file(id), buffer);
}

function latestPath(id) {
  const p = file(id);
  return fs.existsSync(p) ? p : null;
}

function latestMeta(id) {
  const p = file(id);
  try {
    const st = fs.statSync(p);
    return { exists: true, ts: st.mtimeMs / 1000, size: st.size };
  } catch {
    return { exists: false };
  }
}

module.exports = { save, latestPath, latestMeta };
