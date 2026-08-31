"use strict";
// Réglages par appareil, modifiables depuis l'app et tirés par l'agent.

const fs = require("fs");
const path = require("path");
const config = require("./config");

const DIR = path.join(config.DATA_DIR, "config");

// Réglages pilotables + valeurs par défaut (miroir de l'agent).
const DEFAULTS = {
  daily_limit_minutes: 180,
  warn_at_minutes: [30, 10, 5],
  bedtime_start: "22:00",
  bedtime_end: "07:00",
  schedule: [],
  app_allowlist: [],
  app_blocklist_extra: [],
  allowlist_mode: false,
  text_scan_enabled: true,
  kill_blocked_processes: true,
  block_payments: true,
  block_blocked_sites: true,
  enforce_firewall: true,
  allow_screenshots: true,
  heartbeat_seconds: 60,
};

function file(id) {
  return path.join(DIR, `${id.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

function stored(id) {
  try {
    return JSON.parse(fs.readFileSync(file(id), "utf8"));
  } catch {
    return {};
  }
}

// Config effective = défauts + ce qui est enregistré.
function getConfig(id) {
  return { ...DEFAULTS, ...stored(id) };
}

// Applique un patch validé/typé et renvoie la config effective.
function setConfig(id, patch) {
  const cur = stored(id);
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (typeof def === "boolean") v = Boolean(v);
    else if (typeof def === "number") v = Math.max(0, parseInt(v, 10) || 0);
    else if (Array.isArray(def)) v = Array.isArray(v) ? v : def;
    cur[k] = v;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file(id), JSON.stringify(cur, null, 2));
  return { ...DEFAULTS, ...cur };
}

module.exports = { getConfig, setConfig, DEFAULTS };
