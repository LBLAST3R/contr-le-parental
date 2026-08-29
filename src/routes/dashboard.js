"use strict";
// Endpoints du tableau de bord parent. Protégés par la session parent (cookie).

const express = require("express");
const multer = require("multer");
const store = require("../store");
const updates = require("../updates");
const { requireParent } = require("../auth");

const router = express.Router();
router.use(requireParent);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get("/overview", (req, res) => {
  const now = Date.now() / 1000;
  const devices = store.listDevices().map((d) => ({ ...d, online: now - (d.last_seen || 0) < 180 }));
  res.json({
    devices,
    counts_24h: store.countsSince(now - 86400),
    counts_7d: store.countsSince(now - 7 * 86400),
    server_time: now,
  });
});

router.get("/device/:id", (req, res) => {
  const dev = store.getDevice(req.params.id);
  if (!dev) return res.status(404).json({ error: "Appareil inconnu" });
  const days = Math.min(parseInt(req.query.days || "7", 10), 31);
  res.json({
    device: { ...dev, online: Date.now() / 1000 - (dev.last_seen || 0) < 180 },
    history: store.getHistory(req.params.id, days),
    events: store.listEvents({ limit: 60, deviceId: req.params.id }),
    counts_24h: store.countsSince(Date.now() / 1000 - 86400),
  });
});

router.get("/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
  const minSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(req.query.min_severity)
    ? req.query.min_severity : null;
  res.json({ events: store.listEvents({ limit, deviceId: req.query.device_id || null, minSeverity }) });
});

router.post("/events/:id/ack", (req, res) => {
  store.ackEvent(req.params.id);
  res.json({ ok: true });
});

router.post("/grant", (req, res) => {
  const { device_id, minutes } = req.body || {};
  const id = store.pushCommand(device_id, "grant_time", { minutes: parseInt(minutes || 30, 10) });
  res.json({ ok: true, command_id: id });
});

router.post("/message", (req, res) => {
  const { device_id, text } = req.body || {};
  const id = store.pushCommand(device_id, "message", { text: String(text || "") });
  res.json({ ok: true, command_id: id });
});

router.post("/lock", (req, res) => {
  const id = store.pushCommand(req.query.device_id, "lock_now", {});
  res.json({ ok: true, command_id: id });
});

router.post("/lockdown", (req, res) => {
  const { device_id, on, reason } = req.body || {};
  const kind = on ? "lockdown_on" : "lockdown_off";
  const id = store.pushCommand(device_id, kind, { reason: reason || "verrouillage d'urgence" });
  res.json({ ok: true, command_id: id, state: on ? "locked" : "unlocked" });
});

router.post("/shutdown", (req, res) => {
  const id = store.pushCommand(req.query.device_id, "shutdown", {});
  res.json({ ok: true, command_id: id });
});

router.get("/update", (req, res) => {
  res.json(updates.getLatest() || {});
});

router.post("/update", upload.single("file"), (req, res) => {
  const version = (req.body && req.body.version) || "";
  const notes = (req.body && req.body.notes) || "";
  if (!version || !req.file || !req.file.originalname.endsWith(".zip")) {
    return res.status(400).json({ error: "version + fichier .zip attendus" });
  }
  const meta = updates.publish(version, notes, req.file.buffer);
  res.json({ ok: true, ...meta });
});

module.exports = router;
