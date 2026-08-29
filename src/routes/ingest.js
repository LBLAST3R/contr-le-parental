"use strict";
// Endpoints appelés par l'agent (PC de James). Protégés par la clé agent.

const express = require("express");
const store = require("../store");
const updates = require("../updates");
const telegram = require("../telegram");
const { requireAgent } = require("../auth");

const router = express.Router();
router.use(requireAgent);

router.post("/heartbeat", (req, res) => {
  const { device_id, status } = req.body || {};
  if (!device_id) return res.status(400).json({ error: "device_id manquant" });
  store.upsertDevice(device_id, status || {});
  store.upsertStats(device_id, status || {});
  res.json({ ok: true });
});

router.post("/event", (req, res) => {
  const ev = req.body || {};
  if (!ev.id || !ev.device_id) return res.status(400).json({ error: "event invalide" });
  const isNew = store.insertEvent(ev);
  store.upsertDevice(ev.device_id, null);
  if (isNew && ["MEDIUM", "HIGH", "CRITICAL"].includes(ev.severity)) {
    telegram.sendEvent(ev).catch(() => {});
  }
  res.json({ ok: true, new: isNew });
});

router.get("/commands", (req, res) => {
  const deviceId = req.query.device_id;
  if (!deviceId) return res.status(400).json({ error: "device_id manquant" });
  res.json({ commands: store.takeCommands(deviceId) });
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
