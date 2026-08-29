"use strict";
// Stockage JSON simple (aucune dépendance native → déploiement Hostinger sans build).
// Échelle familiale : quelques appareils, historique borné. Écriture atomique.

const fs = require("fs");
const path = require("path");
const config = require("./config");

const DB_PATH = path.join(config.DATA_DIR, "db.json");
const MAX_EVENTS = 5000; // borne l'historique en mémoire/disque

const SEV_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

let db = { devices: {}, events: [], commands: [], stats: {}, seq: 0 };
const eventIds = new Set();

function load() {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    db.devices ||= {};
    db.events ||= [];
    db.commands ||= [];
    db.stats ||= {};
    db.seq ||= 0;
    for (const e of db.events) eventIds.add(e.id);
  } catch {
    /* premier lancement : db par défaut */
  }
}

let saveTimer = null;
function save() {
  // écriture atomique différée (coalesce les rafales de heartbeats)
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const tmp = DB_PATH + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB_PATH);
    } catch (e) {
      console.error("Échec sauvegarde db:", e.message);
    }
  }, 400);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ devices
function upsertDevice(deviceId, status) {
  const now = Date.now() / 1000;
  const cur = db.devices[deviceId] || { device_id: deviceId, name: deviceId, status: {} };
  cur.last_seen = now;
  cur.offline_alerted = 0;
  if (status) {
    cur.status = status;
    cur.name = status.child || cur.name || deviceId;
  }
  db.devices[deviceId] = cur;
  save();
}

function getDevice(deviceId) {
  return db.devices[deviceId] || null;
}

function listDevices() {
  return Object.values(db.devices).sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
}

function staleDevices(timeoutSec) {
  const cutoff = Date.now() / 1000 - timeoutSec;
  return Object.values(db.devices).filter((d) => !d.offline_alerted && (d.last_seen || 0) < cutoff);
}

function markOfflineAlerted(deviceId) {
  if (db.devices[deviceId]) {
    db.devices[deviceId].offline_alerted = 1;
    save();
  }
}

// ------------------------------------------------------------------- events
function insertEvent(e) {
  if (eventIds.has(e.id)) return false; // idempotent (rejeu offline de l'agent)
  eventIds.add(e.id);
  db.events.push({
    id: e.id,
    device_id: e.device_id,
    ts: e.ts || Date.now() / 1000,
    kind: e.kind,
    severity: e.severity || "LOW",
    channel: e.channel || "log",
    title: e.title || "",
    detail: e.detail || "",
    meta: e.meta || {},
    ack: 0,
  });
  if (db.events.length > MAX_EVENTS) {
    const removed = db.events.splice(0, db.events.length - MAX_EVENTS);
    for (const r of removed) eventIds.delete(r.id);
  }
  save();
  return true;
}

function listEvents({ limit = 100, deviceId = null, minSeverity = null } = {}) {
  let list = db.events;
  if (deviceId) list = list.filter((e) => e.device_id === deviceId);
  if (minSeverity) {
    const min = SEV_ORDER[minSeverity] ?? 0;
    list = list.filter((e) => (SEV_ORDER[e.severity] ?? 0) >= min);
  }
  return list.slice().sort((a, b) => b.ts - a.ts).slice(0, limit);
}

function countsSince(sinceTs) {
  const out = {};
  for (const e of db.events) {
    if (e.ts >= sinceTs) out[e.severity] = (out[e.severity] || 0) + 1;
  }
  return out;
}

function ackEvent(id) {
  const e = db.events.find((x) => x.id === id);
  if (e) { e.ack = 1; save(); }
}

// ----------------------------------------------------------------- commands
function pushCommand(deviceId, kind, payload) {
  const id = ++db.seq;
  db.commands.push({ id, device_id: deviceId, kind, payload: payload || {}, created: Date.now() / 1000, delivered: 0 });
  save();
  return id;
}

function takeCommands(deviceId) {
  const pending = db.commands.filter((c) => c.device_id === deviceId && !c.delivered);
  for (const c of pending) c.delivered = 1;
  if (pending.length) {
    // purge des commandes livrées anciennes pour ne pas grossir indéfiniment
    db.commands = db.commands.filter((c) => !c.delivered || Date.now() / 1000 - c.created < 3600);
    save();
  }
  return pending.map((c) => ({ kind: c.kind, ...c.payload }));
}

// -------------------------------------------------------------------- stats
function upsertStats(deviceId, status) {
  const day = today();
  db.stats[deviceId] ||= {};
  const cur = db.stats[deviceId][day] || { day, used_minutes: 0, top_apps: [] };
  cur.used_minutes = Math.max(cur.used_minutes, parseInt(status.used_minutes || 0, 10));
  if (Array.isArray(status.top_apps)) cur.top_apps = status.top_apps;
  cur.updated = Date.now() / 1000;
  db.stats[deviceId][day] = cur;
  save();
}

function getHistory(deviceId, days = 7) {
  const byDay = db.stats[deviceId] || {};
  return Object.values(byDay)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-days);
}

load();

module.exports = {
  upsertDevice, getDevice, listDevices, staleDevices, markOfflineAlerted,
  insertEvent, listEvents, countsSince, ackEvent,
  pushCommand, takeCommands,
  upsertStats, getHistory,
};
