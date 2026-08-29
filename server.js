"use strict";
// Guardian — tableau de bord parental (Node/Express), déployable sur Hostinger.

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const config = require("./src/config");
const store = require("./src/store");
const telegram = require("./src/telegram");
const auth = require("./src/auth");
const ingestRoutes = require("./src/routes/ingest");
const dashboardRoutes = require("./src/routes/dashboard");

const app = express();
app.set("trust proxy", 1); // derrière le proxy Hostinger (HTTPS, IP réelle)
app.disable("x-powered-by");

// Entêtes de sécurité
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Assets statiques (non sensibles) sous /static
app.use("/static", express.static(path.join(__dirname, "public"), { index: false }));

// --- Santé (public) ---
app.get("/api/health", (req, res) =>
  res.json({ ok: true, telegram: config.TELEGRAM_ENABLED, time: Date.now() / 1000 }));

// --- Connexion parent ---
app.get("/login", (req, res) => {
  if (auth.isAuthed(req)) return res.redirect("/");
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.post("/login", (req, res) => {
  if (auth.loginRateLimited(req)) {
    return res.status(429).sendFile(path.join(__dirname, "views", "login.html"));
  }
  const pw = (req.body && req.body.password) || "";
  if (auth.verifyPassword(pw)) {
    auth.loginSucceeded(req);
    auth.setSessionCookie(res, req);
    return res.redirect("/");
  }
  // Petit délai pour ralentir le brute-force
  setTimeout(() => res.redirect("/login?error=1"), 400);
});

app.post("/logout", (req, res) => {
  auth.clearSessionCookie(res);
  res.redirect("/login");
});

// --- Tableau de bord (protégé) ---
app.get("/", auth.requireParent, (req, res) =>
  res.sendFile(path.join(__dirname, "views", "index.html")));

// --- API ---
app.use("/api/ingest", ingestRoutes);
app.use("/api/dashboard", dashboardRoutes);

// 404 JSON pour l'API, sinon vers login
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "introuvable" });
  res.redirect("/login");
});

// --- Watchdog heartbeat : alerte si un agent ne donne plus signe de vie ---
setInterval(() => {
  for (const d of store.staleDevices(config.HEARTBEAT_TIMEOUT_SECONDS)) {
    const ev = {
      id: crypto.randomUUID(),
      device_id: d.device_id,
      ts: Date.now() / 1000,
      kind: "agent_offline",
      severity: "MEDIUM",
      channel: "alert",
      title: "Agent injoignable",
      detail: `Aucun signe de ${d.name || d.device_id} depuis ` +
        `${Math.round(config.HEARTBEAT_TIMEOUT_SECONDS / 60)} min. ` +
        "Soit le PC est éteint, soit la protection a été coupée — à vérifier.",
      meta: {},
    };
    if (store.insertEvent(ev)) {
      store.markOfflineAlerted(d.device_id);
      telegram.sendEvent(ev).catch(() => {});
    }
  }
}, 60 * 1000);

app.listen(config.PORT, () => {
  console.log(`Guardian (parents) écoute sur le port ${config.PORT}`);
  console.log(`  Connexion : http://localhost:${config.PORT}/login`);
  console.log(`  Telegram  : ${config.TELEGRAM_ENABLED ? "activé" : "désactivé"}`);
  if (!config.PARENT_PASSWORD) console.log("  [!] PARENT_PASSWORD non défini — connexion bloquée.");
  telegram.pollUpdates();
});
