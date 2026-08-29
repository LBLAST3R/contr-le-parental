"use strict";
require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function csv(name) {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// SESSION_SECRET : depuis l'env, sinon on en génère un et on le persiste
// (pour que les sessions survivent aux redémarrages).
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  const f = path.join(DATA_DIR, "session-secret");
  try {
    sessionSecret = fs.readFileSync(f, "utf8").trim();
  } catch {
    sessionSecret = crypto.randomBytes(48).toString("base64url");
    try { fs.writeFileSync(f, sessionSecret, { mode: 0o600 }); } catch {}
  }
}

const config = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  DATA_DIR,
  PARENT_PASSWORD: process.env.PARENT_PASSWORD || "",
  SESSION_SECRET: sessionSecret,
  SESSION_DAYS: parseInt(process.env.SESSION_DAYS || "90", 10),
  AGENT_API_KEY: process.env.AGENT_API_KEY || "change-moi-cle-agent",
  HEARTBEAT_TIMEOUT_SECONDS: parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS || "600", 10),
  TELEGRAM_BOT_TOKEN: (process.env.TELEGRAM_BOT_TOKEN || "").trim(),
  TELEGRAM_ALERT_CHATS: csv("TELEGRAM_ALERT_CHATS"),
  TELEGRAM_DISTRESS_CHATS: csv("TELEGRAM_DISTRESS_CHATS"),
};
config.TELEGRAM_ENABLED = Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_ALERT_CHATS.length);
if (config.TELEGRAM_DISTRESS_CHATS.length === 0) {
  config.TELEGRAM_DISTRESS_CHATS = config.TELEGRAM_ALERT_CHATS;
}

// Avertissements de sécurité au démarrage
if (!config.PARENT_PASSWORD) {
  console.error("[SÉCURITÉ] PARENT_PASSWORD n'est pas défini : la connexion est BLOQUÉE. " +
    "Définis PARENT_PASSWORD (ex: James85*) dans les variables d'environnement.");
}
if (config.AGENT_API_KEY === "change-moi-cle-agent") {
  console.warn("[SÉCURITÉ] AGENT_API_KEY par défaut — change-la avant la production.");
}

module.exports = config;
