"use strict";
// Alertes Telegram (facultatif) + boutons Autoriser/Refuser/Verrouiller.
// Utilise fetch natif (Node >= 18). Silencieux si non configuré.

const config = require("./config");
const store = require("./store");

const API = (method) => `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`;

async function call(method, payload) {
  if (!config.TELEGRAM_BOT_TOKEN) return null;
  try {
    const r = await fetch(API(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    console.warn("Telegram", method, "échec:", e.message);
    return null;
  }
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const EMOJI = { CRITICAL: "🆘", HIGH: "🔴", MEDIUM: "🟠", LOW: "🟡" };

async function sendEvent(ev) {
  if (!config.TELEGRAM_ENABLED) return;
  if (ev.severity === "LOW") return;
  const text =
    `${EMOJI[ev.severity] || "•"} <b>${esc(ev.title)}</b>\n${esc(ev.detail)}\n\n<i>${esc(ev.device_id)}</i>`;
  const chats = new Set(config.TELEGRAM_ALERT_CHATS);
  let reply_markup;
  if (ev.kind === "child_request" || ev.kind === "payment_page") {
    const dev = ev.device_id;
    reply_markup = {
      inline_keyboard: [
        [
          { text: "✅ Autoriser 1h", callback_data: `grant|${dev}|60` },
          { text: "⛔ Refuser", callback_data: `deny|${dev}` },
        ],
        [{ text: "🔒 Verrouiller le PC", callback_data: `lock|${dev}` }],
      ],
    };
  }
  for (const chat of chats) {
    const payload = { chat_id: chat, text, parse_mode: "HTML" };
    if (reply_markup) payload.reply_markup = reply_markup;
    await call("sendMessage", payload);
  }
}

let polling = false;
async function pollUpdates() {
  if (!config.TELEGRAM_ENABLED || polling) return;
  polling = true;
  let offset = 0;
  console.log("Telegram : long-polling démarré");
  // boucle en arrière-plan
  (async function loop() {
    while (true) {
      const resp = await call("getUpdates", { offset, timeout: 30 });
      if (!resp || !resp.ok) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      for (const upd of resp.result) {
        offset = upd.update_id + 1;
        await handleUpdate(upd);
      }
    }
  })().catch((e) => console.warn("Telegram poll:", e.message));
}

async function handleUpdate(upd) {
  const cq = upd.callback_query;
  if (!cq) return;
  const [action, dev, arg] = (cq.data || "").split("|");
  let answer = "Fait.";
  if (action === "grant" && dev) {
    store.pushCommand(dev, "grant_time", { minutes: parseInt(arg || "60", 10) });
    answer = `✅ ${arg || 60} min accordées.`;
  } else if (action === "deny" && dev) {
    store.pushCommand(dev, "message", { text: "Demande refusée par tes parents." });
    answer = "⛔ Refusé.";
  } else if (action === "lock" && dev) {
    store.pushCommand(dev, "lock_now", {});
    answer = "🔒 Verrouillage demandé.";
  }
  await call("answerCallbackQuery", { callback_query_id: cq.id, text: answer });
  if (cq.message) {
    await call("sendMessage", {
      chat_id: cq.message.chat.id,
      text: `→ ${answer}`,
      reply_to_message_id: cq.message.message_id,
    });
  }
}

module.exports = { sendEvent, pollUpdates };
