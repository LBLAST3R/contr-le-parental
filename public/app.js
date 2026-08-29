/* Guardian dashboard — logique client (vanilla JS, aucune dépendance) */
(() => {
  "use strict";

  const API = ""; // même origine que le backend ; l'authentification est le cookie de session
  let currentSev = "";
  let currentDevice = null;
  let pollTimer = null;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body) headers["Content-Type"] = "application/json";
    // credentials same-origin -> le cookie de session part automatiquement
    const res = await fetch(API + path, Object.assign({ credentials: "same-origin" }, opts, { headers }));
    if (res.status === 401) { location.href = "/login"; throw new Error("unauthorized"); }
    return res.json();
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  function timeAgo(ts) {
    const s = Math.floor(Date.now() / 1000 - ts);
    if (s < 60) return "à l'instant";
    if (s < 3600) return Math.floor(s / 60) + " min";
    if (s < 86400) return Math.floor(s / 3600) + " h";
    return Math.floor(s / 86400) + " j";
  }

  // ---------- rendu ----------
  function sinceText(ts) {
    if (!ts) return "jamais";
    const a = timeAgo(ts);
    return a === "à l'instant" ? "à l'instant" : "il y a " + a;
  }

  function renderDevices(devices) {
    const box = $("#devices");
    box.innerHTML = "";
    if (!devices.length) {
      box.innerHTML = '<p class="muted center">Aucun appareil connecté pour le moment.</p>';
      updateConnBanner([]);
      return;
    }
    for (const d of devices) {
      const st = d.status || {};
      const used = st.used_minutes || 0, quota = st.quota || 1;
      const pct = Math.min(100, Math.round((used / quota) * 100));
      const locked = !!st.lockdown;
      const online = !!d.online;
      const name = d.name || d.device_id;
      const initial = escapeHtml((name.trim()[0] || "?").toUpperCase());
      const presence = locked ? "locked" : (online ? "on" : "off");
      const statusCls = locked ? "locked" : (online ? "online" : "offline");
      const statusTxt = locked ? "Verrouillé" : (online ? "En ligne" : "Hors ligne");
      const stale = !online && !locked;
      const card = el("div", "member");
      card.innerHTML = `
        <div class="m-avatar">${initial}<span class="presence ${presence}"></span></div>
        <div class="m-body">
          <div class="m-top">
            <span class="m-name">${escapeHtml(name)}</span>
            <span class="status ${statusCls}"><span class="s-dot"></span>${statusTxt}</span>
          </div>
          <div class="m-seen${stale ? " stale" : ""}">Dernier contact : ${sinceText(d.last_seen)}</div>
          <div class="m-screen">
            <div class="m-screen-head"><span>Temps d'écran</span><span><b>${used}</b>&nbsp;/&nbsp;${quota} min</span></div>
            <div class="bar${pct >= 80 ? " warn" : ""}"><i style="width:${pct}%"></i></div>
          </div>
          <div class="m-foot">
            <span class="m-fg">${st.foreground ? escapeHtml(st.foreground) : "—"}</span>
            <span class="m-open">Détails ›</span>
          </div>
        </div>`;
      card.addEventListener("click", () => openSheet(d));
      box.appendChild(card);
    }
    updateConnBanner(devices);
  }

  // Bannière "injoignable" : possible contournement (ou PC éteint). Seuil 5 min.
  function updateConnBanner(devices) {
    const banner = $("#conn-banner");
    const now = Date.now() / 1000;
    const off = devices.filter((d) => !(d.status && d.status.lockdown) && (now - (d.last_seen || 0)) > 300);
    if (!off.length) { banner.classList.add("hidden"); return; }
    let msg;
    if (off.length === 1) {
      const d = off[0];
      msg = `<b>${escapeHtml(d.name || d.device_id)}</b> est injoignable (dernier contact ${sinceText(d.last_seen)}). ` +
        "Le PC est éteint, ou la protection a peut-être été contournée — à vérifier.";
    } else {
      msg = `<b>${off.length} appareils</b> sont injoignables. PC éteints, ou protection contournée — à vérifier.`;
    }
    $("#conn-banner-text").innerHTML = msg;
    banner.classList.remove("hidden");
  }

  function renderSummary(o) {
    const c7 = o.counts_7d || {};
    $("#stat-high").textContent = o.counts_24h.HIGH || 0;
    $("#stat-med").textContent = o.counts_24h.MEDIUM || 0;
    $("#stat-crit").textContent = (c7.HIGH || 0) + (c7.MEDIUM || 0) + (c7.CRITICAL || 0);
  }

  function renderFeed(events) {
    const feed = $("#feed");
    feed.innerHTML = "";
    if (!events.length) { feed.innerHTML = '<p class="muted center">Rien à signaler pour le moment.</p>'; return; }
    for (const e of events) {
      const card = el("div", `event sev-${e.severity}${e.ack ? " acked" : ""}`);
      card.innerHTML = `
        <div class="event-head">
          <span class="event-title">${escapeHtml(e.title)}</span>
          <span class="event-time">${timeAgo(e.ts)}</span>
        </div>
        <div class="event-detail">${escapeHtml(e.detail)}</div>
        <div class="event-dev">${escapeHtml(e.device_id)}</div>`;
      if (!e.ack) {
        const b = el("button", "event-ack");
        b.textContent = "Marquer comme vu";
        b.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          await api(`/api/dashboard/events/${e.id}/ack`, { method: "POST" });
          card.classList.add("acked"); b.remove();
        });
        card.appendChild(b);
      }
      feed.appendChild(card);
    }
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- data ----------
  function setConn(state, label) {
    $("#conn-dot").className = "dot" + (state ? " " + state : "");
    $("#conn-label").textContent = label;
  }
  async function refresh() {
    try {
      const o = await api("/api/dashboard/overview");
      renderDevices(o.devices);
      renderSummary(o);
      // La LED reflète l'état du PC surveillé, PAS la liaison au serveur.
      const anyOnline = o.devices.some((d) => d.online);
      if (anyOnline) setConn("on", "PC en ligne");
      else if (o.devices.length) setConn("", "PC hors ligne");
      else setConn("", "Aucun appareil");
      const q = currentSev ? `?min_severity=${currentSev}&limit=150` : "?limit=150";
      const ev = await api("/api/dashboard/events" + q);
      renderFeed(ev.events);
    } catch (e) {
      if (e.message !== "unauthorized") setConn("off", "Serveur injoignable");
    }
  }

  // ---------- sheet ----------
  async function openSheet(d) {
    currentDevice = d.device_id;
    $("#sheet-title").textContent = d.name || d.device_id;
    $("#sheet-detail").innerHTML = '<p class="muted center">Chargement…</p>';
    $("#sheet").classList.remove("hidden");
    try {
      const data = await api(`/api/dashboard/device/${encodeURIComponent(d.device_id)}?days=7`);
      renderDetail(data);
    } catch (e) {
      $("#sheet-detail").innerHTML = '<p class="muted center">Détail indisponible.</p>';
    }
  }
  function closeSheet() { $("#sheet").classList.add("hidden"); currentDevice = null; }

  const DAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  function renderDetail(data) {
    const st = (data.device && data.device.status) || {};
    const quota = st.quota || 180;
    const locked = !!st.lockdown;
    const online = !!data.device.online;
    const statusCls = locked ? "locked" : (online ? "online" : "offline");
    const statusTxt = locked ? "Verrouillé" : (online ? "En ligne" : "Hors ligne");
    const badge = $("#sheet-status");
    badge.textContent = statusTxt;
    badge.className = "status " + statusCls;
    const connLine = `<div class="conn-line"><span class="s-dot ${locked ? "locked" : (online ? "on" : "off")}"></span>` +
      `${statusTxt} · dernier contact ${sinceText(data.device.last_seen)}</div>`;

    // Barres d'historique (temps par jour vs quota)
    let hist = "";
    (data.history || []).forEach((h) => {
      const pct = Math.min(100, Math.round((h.used_minutes / quota) * 100));
      const over = h.used_minutes > quota;
      const dow = DAYS[new Date(h.day + "T12:00:00").getDay()];
      hist += `<div class="col"><div class="bar${over ? " over" : ""}"><i style="height:${pct}%"></i></div><span class="day">${dow}</span></div>`;
    });
    if (!hist) hist = '<span class="muted" style="font-size:.8rem">Pas encore d\'historique.</span>';

    // Top applications aujourd'hui
    const apps = st.top_apps || [];
    const maxMin = apps.length ? Math.max(...apps.map((a) => a.minutes)) : 1;
    let top = "";
    apps.forEach((a) => {
      const pct = Math.round((a.minutes / maxMin) * 100);
      const flag = /discord|\(!\)/i.test(a.app) ? " flag" : "";
      top += `<div class="row${flag}"><span class="name">${escapeHtml(a.app)}</span><span class="track"><i style="width:${pct}%"></i></span><span class="val">${a.minutes} min</span></div>`;
    });
    if (!top) top = '<span class="muted" style="font-size:.8rem">Aucune donnée d\'app aujourd\'hui.</span>';

    $("#sheet-detail").innerHTML = `
      ${connLine}
      <div class="now">
        <span>Aujourd'hui : <b>${st.used_minutes ?? 0}</b> / ${quota} min</span>
        <span>Au 1er plan : <b>${escapeHtml(st.foreground || "—")}</b></span>
      </div>
      <div class="lbl">7 derniers jours</div>
      <div class="hist">${hist}</div>
      <div class="lbl">Top applications aujourd'hui</div>
      <div class="top-apps">${top}</div>`;
  }

  async function grant(minutes) {
    await api("/api/dashboard/grant", { method: "POST", body: JSON.stringify({ device_id: currentDevice, minutes }) });
    toast(`+${minutes} min accordées`); closeSheet();
  }

  // ---------- session ----------
  function startApp() {
    refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 15000);
  }
  async function logout() {
    try { await fetch("/logout", { method: "POST", credentials: "same-origin" }); } catch {}
    location.href = "/login";
  }

  // ---------- events ----------
  $("#refresh-btn").addEventListener("click", refresh);
  $("#logout-btn").addEventListener("click", logout);
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#lock-now").addEventListener("click", async () => {
    await api(`/api/dashboard/lock?device_id=${encodeURIComponent(currentDevice)}`, { method: "POST" });
    toast("Verrouillage demandé"); closeSheet();
  });
  $("#lockdown-on").addEventListener("click", async () => {
    if (!confirm("Verrouiller ENTIÈREMENT le PC ? Il restera verrouillé jusqu'à ce que tu le rouvres depuis l'app.")) return;
    await api("/api/dashboard/lockdown", { method: "POST", body: JSON.stringify({ device_id: currentDevice, on: true }) });
    toast("🔒 PC verrouillé"); closeSheet();
  });
  $("#lockdown-off").addEventListener("click", async () => {
    await api("/api/dashboard/lockdown", { method: "POST", body: JSON.stringify({ device_id: currentDevice, on: false }) });
    toast("🔓 PC rouvert"); closeSheet();
  });
  $("#shutdown").addEventListener("click", async () => {
    if (!confirm("Éteindre le PC maintenant ?")) return;
    await api(`/api/dashboard/shutdown?device_id=${encodeURIComponent(currentDevice)}`, { method: "POST" });
    toast("Extinction demandée"); closeSheet();
  });
  $("#msg-send").addEventListener("click", async () => {
    const text = $("#msg-input").value.trim();
    if (!text) return;
    await api("/api/dashboard/message", { method: "POST", body: JSON.stringify({ device_id: currentDevice, text }) });
    $("#msg-input").value = ""; toast("Message envoyé"); closeSheet();
  });
  document.querySelectorAll("[data-grant]").forEach((b) =>
    b.addEventListener("click", () => grant(parseInt(b.dataset.grant, 10))));
  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active"); currentSev = c.dataset.sev; refresh();
    }));

  // ---------- boot ----------
  startApp();
})();
