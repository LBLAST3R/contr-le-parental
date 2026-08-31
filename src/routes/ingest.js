"use strict";
// Endpoints appelés par l'agent (PC de James). Protégés par la clé agent.

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("../store");
const telegram = require("../telegram");
const updates = require("../updates");
const deviceconfig = require("../deviceconfig");
const screens = require("../screens");
const { requireAgent } = require("../auth");

const router = express.Router();
router.use(requireAgent);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

router.post("/heartbeat", (req, res) => {
  const { device_id, status } = req.body || {};
  if (!device_id) return res.status(400).json({ error: "device_id manquant" });
  // Reconnexion après une longue absence -> événement "de retour en ligne".
  const prev = db.getDevice(device_id);
  if (prev && prev.offline_alerted) {
    db.insertEvent({
      id: crypto.randomUUID(), device_id, ts: Date.now() / 1000,
      kind: "agent_online", severity: "LOW", channel: "log",
      title: "PC de nouveau en ligne", detail: "L'agent a repris contact.", meta: {},
    });
  }
  db.upsertDevice(device_id, status || {});
  db.upsertStats(device_id, status || {});
  res.json({ ok: true });
});

router.post("/event", (req, res) => {
  const ev = req.body || {};
  if (!ev.id || !ev.device_id) return res.status(400).json({ error: "event invalide" });
  const isNew = db.insertEvent(ev);
  db.upsertDevice(ev.device_id, null);
  if (isNew && ["MEDIUM", "HIGH", "CRITICAL"].includes(ev.severity)) {
    telegram.sendEvent(ev).catch(() => {});
  }
  res.json({ ok: true, new: isNew });
});

router.get("/commands", (req, res) => {
  const deviceId = req.query.device_id;
  if (!deviceId) return res.status(400).json({ error: "device_id manquant" });
  res.json({ commands: db.takeCommands(deviceId) });
});

// Réglages pilotés depuis l'app (l'agent les applique).
router.get("/config", (req, res) => {
  const deviceId = req.query.device_id;
  if (!deviceId) return res.status(400).json({ error: "device_id manquant" });
  res.json(deviceconfig.getConfig(deviceId));
});

// L'agent (tray) téléverse une capture d'écran demandée.
router.post("/screenshot", upload.single("file"), (req, res) => {
  const deviceId = req.query.device_id;
  if (!deviceId || !req.file) return res.status(400).json({ error: "device_id + fichier attendus" });
  screens.save(deviceId, req.file.buffer);
  res.json({ ok: true });
});

router.get("/update", (req, res) => {
  res.json(updates.getLatest() || {});
});

router.get("/update/download", (req, res) => {
  const p = updates.latestZipPath();
  if (!p) return res.status(404).json({ error: "Aucune mise à jour disponible" });
  res.download(p);
});

module.exports = router;
