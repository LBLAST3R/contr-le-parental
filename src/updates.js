"use strict";
// Dépôt des mises à jour de l'agent (l'agent tire, vérifie le SHA-256, applique).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("./config");

const DIR = path.join(config.DATA_DIR, "updates");
const META = path.join(DIR, "latest.json");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function publish(version, notes, buffer) {
  fs.mkdirSync(DIR, { recursive: true });
  const filename = `guardian-${version}.zip`;
  fs.writeFileSync(path.join(DIR, filename), buffer);
  const meta = {
    version,
    filename,
    sha256: sha256(buffer),
    size: buffer.length,
    notes: notes || "",
    uploaded_at: Date.now() / 1000,
  };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
  return meta;
}

function getLatest() {
  try {
    return JSON.parse(fs.readFileSync(META, "utf8"));
  } catch {
    return null;
  }
}

function latestZipPath() {
  const meta = getLatest();
  if (!meta) return null;
  const p = path.join(DIR, meta.filename);
  return fs.existsSync(p) ? p : null;
}

module.exports = { publish, getLatest, latestZipPath };
