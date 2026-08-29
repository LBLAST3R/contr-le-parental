"use strict";
// Authentification :
//  - Parents : mot de passe unique -> cookie de session signé, longue durée
//    (ils ne retapent PAS le mot de passe à chaque fois).
//  - Agent (PC de James) : clé d'API (X-API-Key).

const crypto = require("crypto");
const config = require("./config");

const COOKIE = "gp_session";

// --- Mot de passe : on ne garde qu'un hash (scrypt) en mémoire ---
let pwSalt = null, pwHash = null;
if (config.PARENT_PASSWORD) {
  pwSalt = crypto.randomBytes(16);
  pwHash = crypto.scryptSync(config.PARENT_PASSWORD, pwSalt, 32);
}

function verifyPassword(pw) {
  if (!pwHash) return false; // fail-closed si PARENT_PASSWORD absent
  if (typeof pw !== "string" || pw.length === 0 || pw.length > 200) return false;
  const h = crypto.scryptSync(pw, pwSalt, 32);
  return crypto.timingSafeEqual(h, pwHash);
}

// --- Jeton de session : base64url(payload).signature(HMAC) ---
function sign(data) {
  return crypto.createHmac("sha256", config.SESSION_SECRET).update(data).digest("base64url");
}

function makeToken() {
  const exp = Date.now() + config.SESSION_DAYS * 86400 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp, v: 1 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

function isSecure(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function setSessionCookie(res, req) {
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(req),
    maxAge: config.SESSION_DAYS * 86400 * 1000,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function isAuthed(req) {
  return verifyToken(req.cookies && req.cookies[COOKIE]);
}

// --- Middlewares ---
function requireParent(req, res, next) {
  if (isAuthed(req)) return next();
  // req.originalUrl est toujours complet (req.path est relatif dans un routeur monté)
  if (req.originalUrl.startsWith("/api/")) return res.status(401).json({ error: "non authentifié" });
  return res.redirect("/login");
}

function requireAgent(req, res, next) {
  const key = req.headers["x-api-key"] || "";
  const a = Buffer.from(String(key));
  const b = Buffer.from(config.AGENT_API_KEY);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  return res.status(401).json({ error: "Clé agent invalide" });
}

// --- Anti-force brute sur la connexion (par IP) ---
const attempts = new Map();
function loginRateLimited(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip || "?";
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 15 * 60 * 1000; }
  rec.count += 1;
  attempts.set(ip, rec);
  return rec.count > 10; // > 10 essais / 15 min -> bloqué
}
function loginSucceeded(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip || "?";
  attempts.delete(ip);
}

module.exports = {
  verifyPassword, setSessionCookie, clearSessionCookie, isAuthed,
  requireParent, requireAgent, loginRateLimited, loginSucceeded,
};
