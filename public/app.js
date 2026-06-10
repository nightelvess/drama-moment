﻿const txt = {
  waiting: "\u7b49\u5f85\u89e6\u53d1",
  noHighlight: "\u64ad\u653e\u8fdb\u5165\u9ad8\u5149\u533a\u95f4\u540e\uff0c\u4f1a\u5c55\u793a\u5267\u60c5\u6458\u8981\u3001\u4e92\u52a8\u6309\u94ae\u548c\u6a21\u578b\u5224\u65ad\u3002",
  same: "\u540c\u9891",
  keepWatching: "\u7ee7\u7eed\u770b",
  play: "\u64ad\u653e",
  pause: "\u6682\u505c",
  effectsOn: "\u52a8\u6548\uff1a\u5f00",
  effectsOff: "\u52a8\u6548\uff1a\u5173",
  realVideo: "\u5207\u5230\u771f\u5b9e\u89c6\u9891",
  demoTimeline: "\u5207\u5230\u6f14\u793a\u65f6\u95f4\u8f74",
};

const state = {
  dramas: [],
  currentEpisode: null,
  highlights: [],
  continuations: [],
  videoBranches: [],
  generatedVideos: [],
  branchVideoMode: false,
  mainVideoTime: 0,
  shownBranchTriggers: new Set(),
  activeHighlightId: null,
  activeContinuationId: null,
  currentTime: 0,
  duration: 0,
  demoMode: false,
  demoPlaying: false,
  demoTimer: null,
  triggeredHighlightIds: new Set(),
  lastTriggerTime: 0,
  effectsConfig: {},
  effectsEnabled: true,
  fullscreenControls: null,
  dramaQuery: "",
  lastActivityHighlightId: null,
  activityFeed: null,
};

const els = {
  dramaList: document.getElementById("drama-list"),
  summaryLists: Array.from(document.querySelectorAll("#highlight-summary")),
  current: document.getElementById("current-highlight"),
  currentTag: document.getElementById("current-tag"),
  stats: document.getElementById("stats-board"),
  videoBranchSummary: document.getElementById("video-branch-summary"),
  heatmap: document.getElementById("heatmap"),
  timeline: document.getElementById("timeline"),
  timeLabel: document.getElementById("time-label"),
  centerPlayBtn: document.getElementById("center-play-btn"),
  playOverlayBtn: document.getElementById("play-overlay-btn"),
  volumeBtn: document.getElementById("volume-btn"),
  toggleMode: document.getElementById("toggle-mode"),
  toggleEffects: document.getElementById("toggle-effects"),
  openSettings: document.getElementById("open-settings"),
  closeSettings: document.getElementById("close-settings"),
  saveSettings: document.getElementById("save-settings"),
  resetSettings: document.getElementById("reset-settings"),
  settingsModal: document.getElementById("settings-modal"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  demoStage: document.getElementById("demo-stage"),
  demoEpisodeTitle: document.getElementById("demo-episode-title"),
  branchVideosBtn: document.getElementById("branch-videos-btn"),
  branchVideoPanel: document.getElementById("branch-video-panel"),
  branchVideoList: document.getElementById("branch-video-list"),
  closeBranchPanel: document.getElementById("close-branch-panel"),
  videoFile: document.getElementById("video-file"),
  videoStage: document.querySelector(".video-stage"),
};

const TYPE_META = {
  conflict: { label: "\u51b2\u7a81", color: "#ff4d6d", word: "\u71c3" },
  reverse: { label: "\u53cd\u8f6c", color: "#ff6b6b", word: "\u53cd\u8f6c" },
  slap: { label: "\u6253\u8138", color: "#ff8e53", word: "\u723d" },
  cool: { label: "\u723d\u70b9", color: "#ffe66d", word: "\u723d" },
  sweet: { label: "\u751c\u871c", color: "#ff97b8", word: "\u751c" },
  funny: { label: "\u641e\u7b11", color: "#ffe66d", word: "\u7b11" },
  rescue: { label: "\u8425\u6551", color: "#4ecdc4", word: "\u6551\u63f4" },
  reveal: { label: "\u8eab\u4efd\u63ed\u9732", color: "#8ab4ff", word: "\u63ed\u9732" },
  emotion: { label: "\u60c5\u7eea\u7206\u53d1", color: "#ff6b6b", word: "\u7206\u53d1" },
  suspense: { label: "\u60ac\u5ff5", color: "#4ecdc4", word: "\u60ac\u5ff5" },
  hook: { label: "\u5267\u5c3e\u94a9\u5b50", color: "#44a08d", word: "\u8ffd\u66f4" },
  default: { label: "\u9ad8\u5149", color: "#a0a0c0", word: "\u9ad8\u5149" },
};

function typeCode (type) {
  const value = String(type || "");
  const rules = [
    ["conflict", ["\u51b2\u7a81"]],
    ["reverse", ["\u53cd\u8f6c"]],
    ["slap", ["\u6253\u8138"]],
    ["cool", ["\u723d\u70b9", "\u540d\u573a\u9762"]],
    ["sweet", ["\u751c\u871c", "\u6492\u7cd6"]],
    ["funny", ["\u641e\u7b11"]],
    ["rescue", ["\u8425\u6551"]],
    ["reveal", ["\u8eab\u4efd\u63ed\u9732", "\u63ed\u9732"]],
    ["emotion", ["\u60c5\u7eea\u7206\u53d1", "\u60c5\u7eea"]],
    ["suspense", ["\u60ac\u5ff5"]],
    ["hook", ["\u5267\u5c3e\u94a9\u5b50", "\u94a9\u5b50"]],
  ];
  return rules.find(([, aliases]) => aliases.some((alias) => value.includes(alias)))?.[0] || "default";
}

function meta (type) {
  return TYPE_META[typeCode(type)] || TYPE_META.default;
}

function formatTime (seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function summary (highlight) {
  const raw = highlight?.summary || highlight?.modelReason || "\u6682\u65e0\u9ad8\u5149\u6458\u8981";
  return raw.length > 30 ? raw.slice(0, 30) + "..." : raw;
}

function escapeAttr (value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function request (url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function effectLayer () {
  let layer = els.videoStage.querySelector(".effect-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "effect-layer";
    els.videoStage.appendChild(layer);
  }
  return layer;
}

function addFx (node, duration) {
  effectLayer().appendChild(node);
  setTimeout(() => node.remove(), duration);
}

function clearFx () {
  effectLayer().innerHTML = "";
}

function fxFlash (color = "rgba(255,255,255,.5)") {
  const node = document.createElement("div");
  node.className = "fx-screen-flash";
  node.style.background = color;
  addFx(node, 720);
}

function fxText (text, color) {
  const node = document.createElement("div");
  node.className = "fx-text-pop";
  node.textContent = text;
  node.style.color = color;
  addFx(node, 1400);
}

function fxBurst (color) {
  const wrap = document.createElement("div");
  wrap.className = "fx-particle-burst";
  for (let i = 0; i < 24; i += 1) {
    const p = document.createElement("span");
    p.style.background = i % 3 === 0 ? "#fff" : color;
    p.style.setProperty("--angle", `${i * 15}deg`);
    p.style.setProperty("--distance", `${90 + Math.random() * 120}px`);
    wrap.appendChild(p);
  }
  addFx(wrap, 1100);
}

function fxGlow (color) {
  const node = document.createElement("div");
  node.className = "fx-border-glow";
  node.style.borderColor = color;
  node.style.boxShadow = `0 0 28px ${color}, inset 0 0 24px ${color}55`;
  addFx(node, 1000);
}

function fxShockwave (color) {
  for (let i = 0; i < 3; i += 1) {
    const node = document.createElement("div");
    node.className = "fx-shockwave";
    node.style.borderColor = color;
    node.style.animationDelay = `${i * 120}ms`;
    addFx(node, 1500);
  }
}

function fxHearts () {
  for (let i = 0; i < 14; i += 1) {
    setTimeout(() => {
      const node = document.createElement("div");
      node.className = "fx-heart";
      node.textContent = i % 2 ? "\u2661" : "\u2665";
      node.style.left = `${14 + Math.random() * 72}%`;
      addFx(node, 2200);
    }, i * 80);
  }
}

function fxFloat (text, color) {
  for (let i = 0; i < 10; i += 1) {
    setTimeout(() => {
      const node = document.createElement("div");
      node.className = "fx-float-text";
      node.textContent = text;
      node.style.left = `${12 + Math.random() * 72}%`;
      node.style.color = color;
      addFx(node, 1800);
    }, i * 70);
  }
}

function fxStamp (text, color) {
  const node = document.createElement("div");
  node.className = "fx-stamp";
  node.textContent = text;
  node.style.borderColor = color;
  node.style.color = color;
  addFx(node, 1300);
}

function fxDanmaku (text, color) {
  for (let i = 0; i < 8; i += 1) {
    setTimeout(() => {
      const node = document.createElement("div");
      node.className = "fx-danmaku";
      node.textContent = text;
      node.style.top = `${18 + Math.random() * 42}%`;
      node.style.color = color;
      addFx(node, 2600);
    }, i * 90);
  }
}

function fxScan (color) {
  const node = document.createElement("div");
  node.className = "fx-scan";
  node.style.background = `linear-gradient(90deg, transparent, ${color}88, transparent)`;
  addFx(node, 1600);
}


function fxScreenShake () {
  els.videoStage.classList.add("fx-screen-shake");
  setTimeout(() => els.videoStage.classList.remove("fx-screen-shake"), 500);
}

function fxCountdownRing (color, count = 3) {
  for (let i = 0; i < count; i += 1) {
    setTimeout(() => {
      const node = document.createElement("div");
      node.className = "fx-countdown-ring";
      node.style.borderColor = color;
      addFx(node, 1200);
    }, i * 200);
  }
}

function fxPlusOne (x, y, color) {
  const node = document.createElement("div");
  node.className = "fx-plus-one";
  node.textContent = "+1";
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.color = color;
  els.videoStage.appendChild(node);
  setTimeout(() => node.remove(), 1200);
}

function spawnDanmaku (text, color, type = "preset") {
  const layer = document.getElementById("danmaku-layer");
  if (!layer) return;
  const node = document.createElement("div");
  node.className = `danmaku-item ${type}`;
  node.textContent = text;
  node.style.top = `${8 + Math.random() * 40}%`;
  node.style.color = color;
  node.style.animationDuration = `${5 + Math.random() * 4}s`;
  layer.appendChild(node);
  node.addEventListener("animationend", () => node.remove());
}

function burstDanmaku (suggestions, color, count = 6) {
  for (let i = 0; i < count; i += 1) {
    setTimeout(() => {
      const text = suggestions[i % suggestions.length] || "🔥";
      spawnDanmaku(text, color, "preset");
    }, i * 150);
  }
}

function userDanmaku (text, color) {
  spawnDanmaku(text, color, "user-sent");
}

let aigcTimer = null;

function showAigcInsert (text, duration = 8) {
  const insert = document.getElementById("aigc-insert");
  if (!insert) return;
  const countdownEl = insert.querySelector(".aigc-countdown");
  const textEl = insert.querySelector(".aigc-text");
  if (!countdownEl || !textEl) return;
  if (!state.demoMode) els.video.pause();
  else stopDemo();
  let remaining = duration;
  countdownEl.textContent = remaining;
  textEl.textContent = text;
  insert.classList.remove("hidden");
  if (!insert.querySelector(".aigc-skip-btn")) {
    const skipBtn = document.createElement("button");
    skipBtn.className = "aigc-skip-btn";
    skipBtn.textContent = "跳过 >>";
    skipBtn.addEventListener("click", hideAigcInsert);
    insert.querySelector(".aigc-content").appendChild(skipBtn);
  }
  aigcTimer = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = remaining;
    if (remaining <= 0) hideAigcInsert();
  }, 1000);
}

function hideAigcInsert () {
  const insert = document.getElementById("aigc-insert");
  if (!insert) return;
  insert.classList.add("hidden");
  if (aigcTimer) { clearInterval(aigcTimer); aigcTimer = null; }
  if (!state.demoMode) els.video.play().catch(() => {});
  else playDemo();
}
function fxNotice (highlight) {
  const node = document.createElement("div");
  node.className = "fx-top-notice";
  node.textContent = `${meta(highlight.type).label}\u9ad8\u5149 · ${Math.floor(60 + Math.random() * 30)}% \u7528\u6237\u6b63\u5728\u540c\u9891`;
  addFx(node, 3000);
}

function playEffect (highlight) {
  if (!state.effectsEnabled || !highlight) return;
  const code = typeCode(highlight.type);
  const m = meta(highlight.type);
  clearFx();

  if (["reverse", "slap", "cool", "reveal"].includes(code)) {
    fxFlash();
    fxBurst(m.color);
    fxShockwave(m.color);
    fxText(m.word, m.color);
    fxFloat(m.word, m.color);
    fxStamp("\u540d\u573a\u9762", m.color);
    fxNotice(highlight);
  } else if (code === "sweet") {
    fxHearts();
    fxText(m.word, m.color);
    fxFloat("\u78d5\u5230\u4e86", m.color);
    fxDanmaku("\u78d5\u5230\u4e86", m.color);
  } else if (["conflict", "emotion", "rescue"].includes(code)) {
    fxGlow(m.color);
    fxBurst(m.color);
    fxShockwave(m.color);
    fxText(m.word, m.color);
    fxStamp("\u9ad8\u80fd", m.color);
  } else if (["suspense", "hook"].includes(code)) {
    fxGlow(m.color);
    fxShockwave(m.color);
    fxScan(m.color);
    fxText(m.word, m.color);
    fxNotice(highlight);
  } else if (code === "funny") {
    fxBurst(m.color);
    fxText(m.word, m.color);
    fxFloat("\u54c8\u54c8", m.color);
    fxDanmaku("\u7b11\u51fa\u9e45\u53eb", m.color);
  } else {
    fxFlash();
    fxText(m.word, m.color);
  }
}

function currentHighlight () {
  const candidates = state.highlights.filter((h) => state.currentTime >= h.startTime && state.currentTime <= h.endTime);
  return candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
}

function currentContinuation () {
  return state.continuations.find((item) => {
    const start = Number(item.triggerTime || 0);
    return item.status === "published" && state.currentTime >= start && state.currentTime <= start + 18;
  }) || null;
}

function jumpToTime (seconds) {
  state.currentTime = Number(seconds) || 0;
  if (!state.demoMode) els.video.currentTime = state.currentTime;
  syncTime(true);
}

function ensureDramaSearch () {
  const existing = document.getElementById("drama-search");
  if (existing) {
    existing.addEventListener("input", (event) => {
      state.dramaQuery = event.target.value.trim();
      renderDramaList();
    });
    return;
  }
  const panel = document.createElement("div");
  panel.className = "drama-search-panel";
  panel.innerHTML = `
    <label class="drama-search-label" for="drama-search">\u641c\u7d22\u77ed\u5267 / \u9009\u96c6</label>
    <div class="drama-search-box">
      <span>\u2315</span>
      <input id="drama-search" type="search" placeholder="\u8f93\u5165\u5267\u540d\u6216\u7b2c\u51e0\u96c6" autocomplete="off" />
    </div>
    <p class="drama-search-hint">\u9ed8\u8ba4\u53ea\u5c55\u793a\u5f53\u524d\u77ed\u5267\uff0c\u641c\u7d22\u540e\u5c55\u793a\u5339\u914d\u5267\u96c6\u3002</p>
  `;
  els.dramaList.parentNode.insertBefore(panel, els.dramaList);
  panel.querySelector("#drama-search").addEventListener("input", (event) => {
    state.dramaQuery = event.target.value.trim();
    renderDramaList();
  });
}

function renderDramaList () {
  els.dramaList.innerHTML = "";
  const query = state.dramaQuery.toLowerCase();
  const currentDrama = state.dramas.find((drama) => drama.episodes.some((episode) => episode.id === state.currentEpisode?.id));
  const dramas = query
    ? state.dramas.filter((drama) => {
      const titleHit = drama.title.toLowerCase().includes(query);
      const episodeHit = drama.episodes.some((episode) => episode.title.toLowerCase().includes(query) || String(episode.index || "").includes(query));
      return titleHit || episodeHit;
    })
    : (currentDrama ? [currentDrama] : state.dramas.slice(0, 1));

  if (!dramas.length) {
    els.dramaList.innerHTML = `<p class="muted">\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u5267\u96c6\u3002</p>`;
    return;
  }

  dramas.forEach((drama) => {
    const episodes = query
      ? drama.episodes.filter((episode) => drama.title.toLowerCase().includes(query) || episode.title.toLowerCase().includes(query) || String(episode.index || "").includes(query))
      : drama.episodes;
    const title = document.createElement("div");
    title.className = "drama-title-row";
    title.innerHTML = `<strong>${drama.title}</strong><span>${episodes.filter((ep) => ep.publishedCount > 0).length}/${episodes.length} \u6709\u9ad8\u5149</span>`;
    els.dramaList.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "episode-grid";
    episodes.forEach((episode) => {
      const button = document.createElement("button");
      button.className = `episode-button ${state.currentEpisode?.id === episode.id ? "active" : ""}`;
      button.innerHTML = `<strong>${episode.index || episode.title.match(/\d+/)?.[0] || "-"}</strong><span>${episode.publishedCount || 0} \u9ad8\u5149</span>`;
      button.addEventListener("click", () => selectEpisode(episode));
      grid.appendChild(button);
    });
    els.dramaList.appendChild(grid);
  });
}

function markerHtml (item) {
  const m = meta(item.type);
  return `
    <span class="marker-dot"></span>
    <span class="marker-card">
      <strong>${m.label}</strong>
      <em>${formatTime(item.startTime)} - ${formatTime(item.endTime)}</em>
      <span>${summary(item)}</span>
    </span>
  `;
}

function renderHeatmap (target = els.heatmap) {
  if (!target) return;
  target.innerHTML = "";
  const duration = state.duration || state.currentEpisode?.durationSec || 1;
  // Draw interaction density bars
  if (state.highlights.length && target === els.heatmap) {
    const maxInteractions = Math.max(1, ...state.highlights.map((h) => (h.stats?.total || 0)));
    state.highlights.forEach((item) => {
      const total = item.stats?.total || 0;
      const density = total / maxInteractions;
      if (density > 0) {
        const bar = document.createElement("div");
        bar.className = `heatmap-density-bar ${density > 0.6 ? "density-high" : density > 0.3 ? "density-mid" : "density-low"}`;
        bar.style.left = `${Math.max(0, Math.min(100, (item.startTime / duration) * 100))}%`;
        bar.style.width = `${Math.max(2, Math.min(8, density * 100))}%`;
        bar.title = `${meta(item.type).label}: ${total} 互动`;
        target.appendChild(bar);
      }
    });
  }
  // Draw highlight markers
  const isFs = target.classList.contains("fs-heatmap");
  state.highlights.forEach((item) => {
    const marker = document.createElement("button");
    marker.className = isFs ? "fs-highlight-marker" : "highlight-marker";
    marker.dataset.id = item.id;
    marker.style.left = `${Math.max(0, Math.min(100, (item.startTime / duration) * 100))}%`;
    marker.style.setProperty("--marker-color", meta(item.type).color);
    // 全屏模式只用 dot，非全屏用完整 marker card
    if (!isFs) marker.innerHTML = markerHtml(item);
    marker.title = isFs ? `${meta(item.type).label}: ${summary(item)}` : "";
    marker.addEventListener("click", (event) => {
      event.preventDefault();
      jumpToTime(item.startTime);
    });
    target.appendChild(marker);
  });
}

function renderHighlightLists () {
  els.summaryLists.forEach((list, index) => {
    list.innerHTML = "";
    if (!state.highlights.length) {
      list.innerHTML = `<p class="muted">\u5f53\u524d\u5267\u96c6\u6682\u65e0\u5df2\u53d1\u5e03\u9ad8\u5149\u3002</p>`;
      return;
    }
    state.highlights.forEach((item) => {
      const m = meta(item.type);
      const card = document.createElement("button");
      card.className = index === 0 ? "summary-card highlight-summary-card" : "highlight-chip";
      card.dataset.id = item.id;
      card.style.setProperty("--marker-color", m.color);
      card.innerHTML = index === 0
        ? `<strong>${m.label}</strong><span>${formatTime(item.startTime)} - ${formatTime(item.endTime)}</span><p>${summary(item)}</p>`
        : `<span class="type-badge" style="background:${m.color}"></span><span class="type-label">${m.label}</span><span class="time-label">${formatTime(item.startTime)}</span>`;
      card.addEventListener("click", () => jumpToTime(item.startTime));
      list.appendChild(card);
    });
  });
}

function setActive (id) {
  document.querySelectorAll(".highlight-chip, .highlight-summary-card, .highlight-marker").forEach((node) => {
    node.classList.toggle("active", node.dataset.id === id);
  });
}

function renderCurrent (highlight) {
  if (!highlight) {
    els.currentTag.className = "chip neutral";
    els.currentTag.textContent = txt.waiting;
    els.current.innerHTML = `<p class="muted">${txt.noHighlight}</p>`;
    els.overlay.classList.add("hidden");
    return;
  }
  const m = meta(highlight.type);
  const buttons = (highlight.suggestions || [txt.same, txt.keepWatching])
    .map((item) => `<button class="reaction-pill" data-reaction="${item}">${item}</button>`)
    .join("");

  els.currentTag.className = "chip live";
  els.currentTag.textContent = `${m.label}\u8fdb\u884c\u4e2d`;
  els.current.innerHTML = `
    <article class="active-highlight-card" style="--marker-color:${m.color}">
      <strong>${summary(highlight)}</strong>
      <p>${highlight.emotion || ""}</p>
      <small>${highlight.modelReason || ""}</small>
      <div class="reaction-row">${buttons}</div>
    </article>
  `;
  els.overlay.classList.remove("hidden");
  els.overlay.innerHTML = `
    <div class="overlay-content" style="--marker-color:${m.color}">
      <button class="overlay-dismiss" type="button" aria-label="\u5173\u95ed">\u00d7</button>
      <strong>${m.label}</strong>
      <span>${summary(highlight)}</span>
      <div class="reaction-row">${buttons}</div>
    </div>
  `;
  els.overlay.querySelector(".overlay-dismiss")?.addEventListener("click", () => {
    els.overlay.classList.add("hidden");
  });
  [els.current, els.overlay].forEach((root) => {
    root.querySelectorAll("[data-reaction]").forEach((button) => {
      button.addEventListener("click", () => submitReaction(highlight.id, button.dataset.reaction));
    });
  });
}

function renderContinuation (continuation) {
  if (!continuation || continuation.id === state.activeContinuationId) return;
  state.activeContinuationId = continuation.id;
  const branches = (continuation.branches || []).map((branch) =>
    `<button class="reaction-pill branch-pill" data-branch="${escapeAttr(branch.id || branch.label)}" data-teaser="${escapeAttr(branch.teaser || "")}">${branch.label || "\u7eed\u5199"}</button>`
  ).join("");
  els.overlay.classList.remove("hidden");
  els.overlay.innerHTML = `
    <div class="overlay-content continuation-overlay" style="--marker-color:#4ecdc4">
      <button class="overlay-dismiss" type="button" aria-label="\u5173\u95ed">\u00d7</button>
      <strong>${continuation.title || "\u5267\u5c3e\u4e92\u52a8\u9009\u62e9"}</strong>
      <span>${continuation.setup || "\u9009\u62e9\u4f60\u60f3\u770b\u7684\u4e0b\u4e00\u6b65\u5267\u60c5"}</span>
      <div class="reaction-row">${branches}</div>
      <p class="branch-preview muted"></p>
    </div>
  `;
  els.overlay.querySelector(".overlay-dismiss")?.addEventListener("click", () => {
    els.overlay.classList.add("hidden");
  });
  els.overlay.querySelectorAll("[data-branch]").forEach((button) => {
    button.addEventListener("click", () => {
      els.overlay.querySelector(".branch-preview").textContent = button.dataset.teaser || "";
      fxBurst("#4ecdc4");
      fxText("\u5df2\u9009\u62e9", "#4ecdc4");
    });
  });
}

function renderStats (highlight) {
  if (!highlight) {
    const activity = state.activityFeed;
    if (activity) {
      const highlights = Object.entries(activity.highlightActivity || {})
        .map(([highlightId, item]) => ({
          highlight: state.highlights.find((h) => h.id === highlightId),
          total: item.total || 0,
          topReactions: item.topReactions || {},
        }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total);
      const hotButtons = {};
      highlights.forEach((item) => {
        Object.entries(item.topReactions).forEach(([label, count]) => {
          hotButtons[label] = (hotButtons[label] || 0) + count;
        });
      });
      const hotRows = Object.entries(hotButtons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => `<div class="stat-meter"><div><strong>${escapeAttr(label)}</strong><span>${count} 次</span></div><i style="width:${Math.min(100, Math.max(8, count * 12))}%"></i></div>`)
        .join("");
      const highlightRows = highlights
        .slice(0, 5)
        .map((item) => `<button class="stat-highlight-row" type="button" data-highlight-id="${escapeAttr(item.highlight?.id || "")}"><strong>${escapeAttr(item.highlight?.type || "高光")}</strong><span>${item.total} 次</span></button>`)
        .join("");
      els.stats.innerHTML = `
        <div class="stats-headline">
          <strong>${activity.totalInteractions || 0}</strong>
          <span>本集总互动 · ${activity.uniqueUsers || 0} 个用户</span>
        </div>
        ${hotRows || `<p class="muted">本集还没有互动按钮数据。</p>`}
        ${highlightRows ? `<div class="stats-highlight-list">${highlightRows}</div>` : ""}
      `;
      els.stats.querySelectorAll("[data-highlight-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const h = state.highlights.find((item) => item.id === button.dataset.highlightId);
          if (h) jumpToTime(h.startTime || 0);
        });
      });
      return;
    }
    els.stats.innerHTML = `
      <div class="stats-empty">
        <strong>0</strong>
        <span>本集暂无互动数据</span>
      </div>
    `;
    return;
  }
  const stats = highlight.stats || { total: 0, breakdown: {} };
  const rows = Object.entries(stats.breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
      const percent = stats.total ? Math.round((count / stats.total) * 100) : 0;
      return `
        <div class="stat-meter">
          <div>
            <strong>${label}</strong>
            <span>${count} \u6b21 · ${percent}%</span>
          </div>
          <i style="width:${percent}%"></i>
        </div>
      `;
    })
    .join("");
  els.stats.innerHTML = `
    <div class="stats-headline">
      <strong>${stats.total}</strong>
      <span>\u672c\u9ad8\u5149\u603b\u4e92\u52a8</span>
    </div>
    ${rows || `<p class="muted">\u8fd8\u6ca1\u6709\u4e92\u52a8\u6570\u636e\u3002</p>`}
  `;
}

function renderVideoBranches () {
  // AIGC branch management is review-backend only. The player must not render video branch content.
}
function updatePrimaryControls () {
  const playing = state.demoMode ? state.demoPlaying : (!els.video.paused && !els.video.ended);
  if (els.centerPlayBtn) els.centerPlayBtn.classList.toggle("playing", playing);
  if (els.playOverlayBtn) els.playOverlayBtn.textContent = playing ? "⏸" : "▶";
}

function updateFullscreenControls () {
  const controls = state.fullscreenControls;
  if (!controls) return;
  const duration = state.duration || state.currentEpisode?.durationSec || 100;
  const range = controls.querySelector(".fs-timeline");
  const label = controls.querySelector(".fs-time-label");
  if (!range || !label) return;
  range.max = String(duration);
  range.value = String(Math.min(state.currentTime, duration));
  range.style.setProperty("--progress", `${duration ? Math.min(100, (state.currentTime / duration) * 100) : 0}%`);
  label.textContent = `${formatTime(state.currentTime)} / ${formatTime(duration)}`;
  const playing = state.demoMode ? state.demoPlaying : (!els.video.paused && !els.video.ended);
  if (els.centerPlayBtn) els.centerPlayBtn.classList.toggle("playing", playing);
  const toggle = controls.querySelector(".fs-toggle");
  if (toggle) toggle.textContent = playing ? "⏸" : "▶";
}

function createFullscreenControls () {
  state.fullscreenControls?.remove();
  const wrapper = document.createElement("div");
  wrapper.className = "fullscreen-controls";
  wrapper.innerHTML = '<button class=\"fs-toggle\" type=\"button\" aria-label=\"播放\">▶</button><div class=\"fs-timeline-wrap\"><div class=\"fs-heatmap\"></div><input class=\"fs-timeline\" type=\"range\" min=\"0\" max=\"100\" value=\"0\" step=\"0.1\" /></div><span class=\"fs-time-label\">00:00 / 00:00</span><button class=\"fs-volume\" type=\"button\" aria-label=\"静音\">🔊</button><button class=\"fs-exit\" type=\"button\" aria-label=\"退出全屏\">⛶</button>';
  els.videoStage.appendChild(wrapper);
  state.fullscreenControls = wrapper;

  wrapper.querySelector(".fs-toggle").addEventListener("click", () => {
    const playing = !els.video.paused && !els.video.ended;
    if (playing) { els.video.pause(); }
    else { els.video.play(); }
    updateFullscreenControls();
  });
  wrapper.querySelector(".fs-timeline").addEventListener("input", (event) => jumpToTime(Number(event.target.value)));
  wrapper.querySelector(".fs-exit").addEventListener("click", () => document.exitFullscreen?.());
  wrapper.querySelector(".fs-volume")?.addEventListener("click", () => {
    els.video.muted = !els.video.muted;
    const volBtn = wrapper.querySelector(".fs-volume");
    if (volBtn) volBtn.textContent = els.video.muted ? "🔇" : "🔊";
    if (els.volumeBtn) els.volumeBtn.textContent = els.video.muted ? "🔇" : "🔊";
  });
  renderHeatmap(wrapper.querySelector(".fs-heatmap"));
  updateFullscreenControls();
}
function handleFullscreenChange () {
  const overlay = document.getElementById("video-controls-overlay");
  if (document.fullscreenElement === els.videoStage) {
    if (overlay) overlay.style.display = "none";
    createFullscreenControls();
    renderCurrent(currentHighlight());
  } else {
    if (overlay) overlay.style.display = "";
    if (state.fullscreenControls) {
      state.fullscreenControls.remove();
      state.fullscreenControls = null;
    }
  }
}
function ensureFullscreenButton () {
  if (els.videoStage.querySelector(".stage-fullscreen-btn")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage-fullscreen-btn";
  button.setAttribute("aria-label", "\u5168\u5c4f\u64ad\u653e");
  button.innerHTML = `<span>\u26f6</span><em>\u5168\u5c4f</em>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    els.videoStage.requestFullscreen?.();
  });
  els.videoStage.appendChild(button);
}

function setupDrawerTabs () {
  const tabs = Array.from(document.querySelectorAll("[data-drawer-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-drawer-panel]"));
  if (!tabs.length || !panels.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.drawerTab;
      tabs.forEach((item) => item.classList.toggle("active", item === tab));
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.drawerPanel === target);
      });
    });
  });
}

function syncTime (force = false) {
  const duration = state.duration || state.currentEpisode?.durationSec || 100;
  const pct = duration ? Math.min(100, (state.currentTime / duration) * 100) : 0;
  els.timeline.max = String(duration);
  els.timeline.value = String(Math.min(state.currentTime, duration));
  els.timeline.style.setProperty("--progress", `${pct}%`);
  // Update visual played bar
  const playedBar = document.getElementById("timeline-played");
  if (playedBar) playedBar.style.width = `${pct}%`;
  els.timeLabel.textContent = `${formatTime(state.currentTime)} / ${formatTime(duration)}`;
  updateFullscreenControls();
  updatePrimaryControls();

  // 检查是否有分支视频需要在当前时间触发
  checkBranchVideoTrigger();

  const highlight = currentHighlight();
  const continuation = currentContinuation();
  if (continuation) {
    renderContinuation(continuation);
  } else if (!highlight) {
    state.activeContinuationId = null;
  }
  if (force || highlight?.id !== state.activeHighlightId) {
    const debounce = state.effectsConfig?.highlightTrigger?.debounceTime || 5;
    const repeat = state.effectsConfig?.highlightTrigger?.allowRepeat !== false;
    if (highlight && (!state.triggeredHighlightIds.has(highlight.id) || (repeat && Math.abs(state.currentTime - state.lastTriggerTime) > debounce))) {
      state.triggeredHighlightIds.add(highlight.id);
      state.lastTriggerTime = state.currentTime;
      playEffect(highlight);
    }
    state.activeHighlightId = highlight?.id || null;
    if (!continuation) renderCurrent(highlight);
    renderStats(highlight);
    if (highlight && highlight.id !== state.lastActivityHighlightId) {
      state.lastActivityHighlightId = highlight.id;
      loadActivityFeed();
    }
    setActive(state.activeHighlightId);
  }
}

function setMode (useDemo) {
  state.demoMode = useDemo;
  els.demoStage.classList.toggle("hidden", !useDemo);
  els.video.classList.toggle("hidden", useDemo);
  if (els.toggleMode) els.toggleMode.textContent = useDemo ? txt.realVideo : txt.demoTimeline;
  if (useDemo) els.video.pause();
}

function stopDemo () {
  state.demoPlaying = false;
  clearInterval(state.demoTimer);
  state.demoTimer = null;
  updatePrimaryControls();
  updateFullscreenControls();
}

function playDemo () {
  if (state.demoTimer) return;
  state.demoPlaying = true;
  updatePrimaryControls();
  updateFullscreenControls();
  state.demoTimer = setInterval(() => {
    state.currentTime += 0.25;
    if (state.currentTime >= (state.duration || 100)) stopDemo();
    syncTime();
  }, 250);
}

async function submitReaction (highlightId, reaction) {
  const result = await request("/api/interactions", {
    method: "POST",
    body: JSON.stringify({ highlightId, reaction, buttonText: reaction }),
  });
  const highlight = state.highlights.find((item) => item.id === highlightId);
  if (!highlight) return;
  highlight.stats = result.stats;
  renderStats(highlight);
  const m = meta(highlight.type);
  if (state.effectsEnabled) {
    fxHearts();
    userDanmaku(reaction, m.color);
  }
  // +1 animation at a random position near center
  const rect = els.videoStage.getBoundingClientRect();
  const x = rect.width * (0.3 + Math.random() * 0.4);
  const y = rect.height * (0.2 + Math.random() * 0.3);
  fxPlusOne(x, y, m.color);
  // Refresh activity feed
  loadActivityFeed();
}

async function loadActivityFeed () {
  if (!state.currentEpisode) return;
  try {
    const result = await request(`/api/episodes/${state.currentEpisode.id}/activity-feed`);
    state.activityFeed = result;
    const activity = result.highlightActivity || {};
    state.highlights = state.highlights.map((highlight) => {
      const item = activity[highlight.id];
      if (!item) return highlight;
      return {
        ...highlight,
        stats: {
          ...(highlight.stats || {}),
          total: item.total || 0,
          breakdown: item.topReactions || {},
        },
      };
    });
    const active = currentHighlight();
    renderStats(active || null);
    renderHeatmap();
    if (state.fullscreenControls) renderHeatmap(state.fullscreenControls.querySelector(".fs-heatmap"));
  } catch (error) {
    console.warn("Failed to load activity feed:", error);
  }
}

async function selectEpisode (episode) {
  stopDemo();
  clearFx();
  els.video.pause();
  state.currentEpisode = episode;
  state.currentTime = 0;
  state.duration = episode.durationSec || 100;
  state.activeHighlightId = null;
  state.activeContinuationId = null;
  state.triggeredHighlightIds = new Set();
  state.shownBranchTriggers = new Set();
  state.lastTriggerTime = 0;
  state.highlights = [];
  state.continuations = [];
  state.videoBranches = [];
  state.activityFeed = null;
  els.demoEpisodeTitle.textContent = episode.title;
  if (episode.videoUrl) {
    els.video.src = episode.videoUrl;
    els.video.load();
    setMode(false);
  } else {
    setMode(true);
  }

  const highlightResult = await request(`/api/episodes/${episode.id}/highlights`).catch((error) => {
    console.warn("Failed to load highlights:", error);
    return { highlights: [] };
  });
  state.highlights = highlightResult.highlights || [];
  const continuationsResult = await request(`/api/episodes/${episode.id}/continuations`).catch(() => ({ continuations: [] }));
  state.continuations = continuationsResult.continuations || [];
  const videoBranchesResult = await request(`/api/episodes/${episode.id}/video-branches`).catch(() => ({ videoBranches: [] }));
  state.videoBranches = videoBranchesResult.videoBranches || [];
  // 加载本集已生成的分支视频
  const genVidResult = await request(`/api/episodes/${episode.id}/generated-videos`).catch(() => ({ videos: [] }));
  state.generatedVideos = genVidResult.videos || [];
  updateBranchVideoUI();
  renderDramaList();
  renderHighlightLists();
  renderHeatmap();
  if (state.fullscreenControls) renderHeatmap(state.fullscreenControls.querySelector(".fs-heatmap"));
  renderCurrent(null);
  renderVideoBranches();
  await loadActivityFeed();
  renderStats(null);
  syncTime(true);
}

function setupControls () {
  ensureDramaSearch();
  ensureFullscreenButton();
  setupDrawerTabs();
  // 中央播放按钮 — 暂停时显示，点击播放
  if (els.centerPlayBtn) {
    els.centerPlayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.demoMode) { playDemo(); }
      else { els.video.play(); }
    });
  }
  // 覆盖层播放按钮 — 切换播放/暂停
  if (els.playOverlayBtn) {
    els.playOverlayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.demoMode) return;
      els.video.paused ? els.video.play() : els.video.pause();
    });
  }
  // 点击视频区域切换播放/暂停
  const videoOverlay = els.videoStage.querySelector(".video-overlay");
  if (videoOverlay) {
    videoOverlay.addEventListener("click", () => {
      if (state.demoMode) return;
      els.video.paused ? els.video.play() : els.video.pause();
    });
  }
  // 音量按钮
  if (els.volumeBtn) {
    els.volumeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.video.muted = !els.video.muted;
      els.volumeBtn.textContent = els.video.muted ? "🔇" : "🔊";
    });
  }
  els.timeline.addEventListener("input", (event) => jumpToTime(Number(event.target.value)));
  // Hover preview on timeline
  const hoverPreview = document.getElementById("timeline-hover-preview");
  if (hoverPreview) {
    els.timeline.addEventListener("mousemove", (event) => {
      const rect = els.timeline.getBoundingClientRect();
      const pct = (event.clientX - rect.left) / rect.width;
      const duration = state.duration || state.currentEpisode?.durationSec || 100;
      const hoverTime = Math.max(0, Math.min(duration, pct * duration));
      hoverPreview.textContent = formatTime(hoverTime);
      hoverPreview.style.left = `${event.clientX - rect.left}px`;
      hoverPreview.classList.add("visible");
    });
    els.timeline.addEventListener("mouseleave", () => {
      hoverPreview.classList.remove("visible");
    });
  }
  els.toggleMode?.addEventListener("click", () => setMode(!state.demoMode));
  els.toggleEffects?.addEventListener("click", () => {
    state.effectsEnabled = !state.effectsEnabled;
    if (els.toggleEffects) els.toggleEffects.textContent = state.effectsEnabled ? txt.effectsOn : txt.effectsOff;
  });
  els.video.addEventListener("timeupdate", () => {
    if (state.demoMode) return;
    state.currentTime = els.video.currentTime;
    syncTime();
  });
  els.video.addEventListener("loadedmetadata", () => {
    state.duration = els.video.duration || state.currentEpisode?.durationSec || 100;
    renderHeatmap();
    syncTime(true);
  });
  els.video.addEventListener("play", () => {
    updatePrimaryControls();
    updateFullscreenControls();
  });
  els.video.addEventListener("pause", () => {
    updatePrimaryControls();
    updateFullscreenControls();
  });
  els.video.addEventListener("error", () => setMode(true));
  els.videoFile.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    els.video.src = URL.createObjectURL(file);
    setMode(false);
  });
  els.videoStage.addEventListener("dblclick", () => els.videoStage.requestFullscreen?.());
  document.addEventListener("fullscreenchange", handleFullscreenChange);
}

function setupSettings () {
  els.openSettings?.addEventListener("click", () => els.settingsModal?.classList.remove("hidden"));
  els.closeSettings?.addEventListener("click", () => els.settingsModal?.classList.add("hidden"));
  els.settingsModal?.addEventListener("click", (event) => {
    if (event.target === els.settingsModal) els.settingsModal.classList.add("hidden");
  });
  els.saveSettings.addEventListener("click", async () => {
    const config = {
      screenFlash: { enabled: document.getElementById("screen-flash-enabled").checked, duration: Number(document.getElementById("screen-flash-duration").value) },
      heartRain: { enabled: document.getElementById("heart-rain-enabled").checked, count: Number(document.getElementById("heart-rain-count").value), particleDuration: Number(document.getElementById("heart-rain-particle-duration").value), interval: 120 },
      highlightTrigger: { debounceTime: Number(document.getElementById("debounce-time").value), allowRepeat: document.getElementById("allow-repeat-trigger").checked },
    };
    const result = await request("/api/effects/config", { method: "PUT", body: JSON.stringify(config) });
    state.effectsConfig = result.config;
    els.settingsModal.classList.add("hidden");
  });
  els.resetSettings.addEventListener("click", async () => {
    const result = await request("/api/effects/config", { method: "PUT", body: JSON.stringify({}) });
    state.effectsConfig = result.config;
  });
}

// ========== 分支视频面板 ==========

function setupBranchVideoPanel () {
  els.branchVideosBtn?.addEventListener("click", toggleBranchVideoPanel);
  els.closeBranchPanel?.addEventListener("click", () => {
    els.branchVideoPanel.classList.add("hidden");
  });
  // 面板关闭时恢复主视频
  els.branchVideoPanel?.addEventListener("transitionend", () => {
    if (els.branchVideoPanel.classList.contains("hidden") && state.branchVideoMode) {
      restoreMainVideo();
    }
  });
}

function updateBranchVideoUI () {
  if (!els.branchVideosBtn) return;
  if (state.generatedVideos.length > 0) {
    els.branchVideosBtn.classList.remove("hidden");
    els.branchVideosBtn.textContent = `🎬 ${state.generatedVideos.length}`;
    renderBranchVideoList();
  } else {
    els.branchVideosBtn.classList.add("hidden");
  }
}

function toggleBranchVideoPanel () {
  const panel = els.branchVideoPanel;
  if (!panel) return;
  if (panel.classList.contains("hidden")) {
    renderBranchVideoList();
    panel.classList.remove("hidden");
  } else {
    panel.classList.add("hidden");
  }
}

function renderBranchVideoList () {
  if (!els.branchVideoList) return;
  if (!state.generatedVideos.length) {
    els.branchVideoList.innerHTML = `<p class="muted">本集暂无分支视频。<br>在审核台生成并下载后，这里会出现跳转入口。</p>`;
    return;
  }
  els.branchVideoList.innerHTML = state.generatedVideos.map((v) => {
    const label = v.branchLabel || v.title || "分支剧情";
    const timeLabel = v.triggerTime > 0 ? `⏱ 第${Math.floor(v.triggerTime)}秒触发` : "";
    return `
    <button class="branch-video-card" data-url="${escapeAttr(v.url)}" data-title="${escapeAttr(label)}">
      <span class="branch-video-icon">▶</span>
      <div class="branch-video-info">
        <strong>${escapeAttr(label)}</strong>
        <span>${timeLabel || escapeAttr(v.promptSummary?.slice(0, 40) || "")}</span>
      </div>
    </button>`;
  }).join("");

  els.branchVideoList.querySelectorAll(".branch-video-card").forEach((card) => {
    card.addEventListener("click", () => {
      playBranchVideo(card.dataset.url, card.dataset.title);
    });
  });
}

function checkBranchVideoTrigger () {
  if (state.branchVideoMode) return;
  if (!state.generatedVideos.length) return;

  const highlight = currentHighlight();
  if (!highlight) return;

  // 查找是否有绑定到当前高光的分支视频
  const matchedVid = state.generatedVideos.find((v) =>
    v.highlightId && v.highlightId === highlight.id
  );
  if (!matchedVid) return;
  if (state.shownBranchTriggers.has(matchedVid.id)) return;

  state.shownBranchTriggers.add(matchedVid.id);
  showBranchVideoOverlay(matchedVid);
}

function showBranchVideoOverlay (vid) {
  // 移除已有的分支浮层
  document.querySelector(".branch-trigger-overlay")?.remove();

  const highlight = currentHighlight();
  const typeLabel = highlight ? (meta(highlight.type).label || "高光") : "剧情";

  const overlay = document.createElement("div");
  overlay.className = "branch-trigger-overlay";
  overlay.innerHTML = `
    <div class="branch-trigger-card">
      <span class="branch-trigger-icon">🎬</span>
      <div class="branch-trigger-text">
        <strong>${typeLabel} · ${escapeAttr(vid.branchLabel || vid.title || "分支剧情")}</strong>
        <span>点击查看这个走向的AIGC剧情视频</span>
      </div>
      <button class="branch-trigger-btn">查看</button>
      <button class="branch-trigger-dismiss">×</button>
    </div>
  `;
  els.videoStage.appendChild(overlay);

  overlay.querySelector(".branch-trigger-btn")?.addEventListener("click", () => {
    overlay.remove();
    playBranchVideo(vid.url, vid.branchLabel || vid.title);
  });
  overlay.querySelector(".branch-trigger-dismiss")?.addEventListener("click", () => {
    overlay.remove();
  });

  // 5秒后自动消失
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 6000);
}

function playBranchVideo (url, title) {
  if (!url) return;
  // 保存主视频播放位置
  if (!state.demoMode) {
    state.mainVideoTime = els.video.currentTime;
    els.video.pause();
  } else {
    state.mainVideoTime = state.currentTime;
    stopDemo();
  }
  state.branchVideoMode = true;
  // 切换视频源
  els.video.src = url;
  els.video.load();
  els.video.play().catch(() => {});
  setMode(false);
  els.demoEpisodeTitle.textContent = `🎬 ${title || "分支视频"}`;
  els.branchVideoPanel.classList.add("hidden");
  els.branchVideosBtn.textContent = "⏎ 返回";
  els.branchVideosBtn.classList.remove("hidden");

  // 分支视频播完后自动回到主视频
  els.video.onended = () => {
    restoreMainVideo();
  };
}

function restoreMainVideo () {
  state.branchVideoMode = false;
  els.video.onended = null;
  if (state.currentEpisode?.videoUrl) {
    els.video.src = state.currentEpisode.videoUrl;
    els.video.load();
    els.video.currentTime = state.mainVideoTime;
    els.video.play().catch(() => {});
    els.demoEpisodeTitle.textContent = state.currentEpisode.title;
  }
  updateBranchVideoUI();
}

async function bootstrap () {
  setupControls();
  setupSettings();
  effectLayer();
  const [dramasResult, effectsResult] = await Promise.all([
    request("/api/dramas"),
    request("/api/effects/config").catch(() => ({ config: null })),
  ]);
  state.dramas = dramasResult.dramas;
  state.effectsConfig = effectsResult.config || {};
  renderDramaList();
  const first = state.dramas.flatMap((drama) => drama.episodes).find((episode) => episode.publishedCount > 0) || state.dramas[0]?.episodes?.[0];
  if (first) await selectEpisode(first);

  // 初始化剧情分支功能
  setupStoryBranches();
  // 初始化视频分支功能
  setupVideoBranches();
  // 初始化分支视频面板
  setupBranchVideoPanel();
  // 启动定期刷新互动数据 (每10秒)
  setInterval(() => {
    if (state.currentEpisode) loadActivityFeed();
  }, 10000);
}

// ========== 剧情分支功能 ==========

function setupStoryBranches () {
  const generateBtn = document.getElementById("generate-branches-btn");
  const loadBtn = document.getElementById("load-branches-btn");

  if (generateBtn) {
    generateBtn.addEventListener("click", generateStoryBranches);
  }

  if (loadBtn) {
    loadBtn.addEventListener("click", loadSavedBranches);
  }
}

async function generateStoryBranches () {
  if (!state.currentEpisode) {
    alert("请先选择一集剧集");
    return;
  }

  const branchList = document.getElementById("branch-list");
  branchList.innerHTML = '<div class="branch-loading">正在生成剧情分支，请稍候...</div>';

  try {
    // 准备剧情数据
    const plotSummary = state.highlights
      .filter(h => h.status === "published")
      .map(h => `${h.type}：${h.summary}`)
      .join("；");

    const highlightsData = state.highlights
      .filter(h => h.status === "published")
      .map(h => ({
        type: h.type,
        startTime: h.startTime,
        endTime: h.endTime,
        summary: h.summary,
        intensity: h.intensity
      }));

    // 调用API生成剧情分支
    const result = await request("/api/story-branches/generate", {
      method: "POST",
      body: JSON.stringify({
        episodeId: state.currentEpisode.id,
        plotSummary: plotSummary || "本集剧情暂无概要",
        highlights: highlightsData,
        characters: {} // 可以从剧集中获取人物信息
      })
    });

    if (result.success && result.data) {
      // 渲染生成的分支
      renderBranches(result.data);

      // 询问是否保存
      if (confirm("剧情分支已生成，是否保存到数据库？")) {
        await saveBranches(result.data.story_branches || []);
      }
    } else {
      throw new Error("生成失败");
    }
  } catch (error) {
    branchList.innerHTML = `<div class="branch-error">生成失败：${error.message}</div>`;
  }
}

async function loadSavedBranches () {
  if (!state.currentEpisode) {
    alert("请先选择一集剧集");
    return;
  }

  const branchList = document.getElementById("branch-list");
  branchList.innerHTML = '<div class="branch-loading">正在加载已保存的剧情分支...</div>';

  try {
    const result = await request(`/api/story-branches/${state.currentEpisode.id}`);

    if (result.branches && result.branches.length > 0) {
      renderSavedBranches(result.branches);
    } else {
      branchList.innerHTML = '<p class="muted">暂无已保存的剧情分支</p>';
    }
  } catch (error) {
    branchList.innerHTML = `<div class="branch-error">加载失败：${error.message}</div>`;
  }
}

async function saveBranches (branches) {
  try {
    const result = await request("/api/story-branches", {
      method: "POST",
      body: JSON.stringify({
        episodeId: state.currentEpisode.id,
        branches: branches
      })
    });

    if (result.success) {
      alert(`成功保存 ${result.branches.length} 个剧情分支`);
    }
  } catch (error) {
    alert(`保存失败：${error.message}`);
  }
}

function renderBranches (data) {
  const branchList = document.getElementById("branch-list");

  if (!data.story_branches || data.story_branches.length === 0) {
    branchList.innerHTML = '<p class="muted">未生成任何剧情分支</p>';
    return;
  }

  let html = "";

  // 渲染推荐信息
  if (data.recommendations) {
    html += `
      <div class="branch-recommendation">
        <h3>推荐分支：${data.story_branches.find(b => b.branch_id === data.recommendations.best_branch)?.title || "未知"}</h3>
        <p><strong>理由：</strong>${data.recommendations.reason}</p>
        <p><strong>适合观众：</strong>${data.recommendations.audience_preference}</p>
      </div>
    `;
  }

  // 渲染分支列表
  data.story_branches.forEach((branch, index) => {
    html += renderBranchCard(branch, index);
  });

  branchList.innerHTML = html;

  // 添加点击事件
  document.querySelectorAll(".branch-card").forEach((card, index) => {
    card.addEventListener("click", () => selectBranch(index));
  });
}

function renderSavedBranches (branches) {
  const branchList = document.getElementById("branch-list");

  let html = '<p class="muted" style="margin-bottom: 12px;">已保存的剧情分支：</p>';

  branches.forEach((branch, index) => {
    html += renderBranchCard(branch, index, true);
  });

  branchList.innerHTML = html;

  // 添加点击事件
  document.querySelectorAll(".branch-card").forEach((card, index) => {
    card.addEventListener("click", () => selectBranch(index));
  });
}

function renderBranchCard (branch, index, isSaved = false) {
  const emotionCurve = branch.emotion_curve || [];
  const highlights = branch.highlights || [];

  return `
    <div class="branch-card" data-index="${index}">
      <div class="branch-header">
        <span class="branch-title">${branch.title || `分支 ${index + 1}`}</span>
        <span class="branch-probability">可能性：${Math.round((branch.probability || 0.5) * 100)}%</span>
      </div>
      <p class="branch-description">${branch.description || "暂无描述"}</p>
      
      ${emotionCurve.length > 0 ? `
        <div class="branch-emotion-curve">
          ${emotionCurve.map(point => `
            <div class="emotion-point">
              <strong>${point.time || ""}</strong>
              <span>${point.emotion || ""} (${Math.round((point.intensity || 0) * 100)}%)</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      
      ${highlights.length > 0 ? `
        <div class="branch-highlights">
          ${highlights.map(h => `<span class="highlight-tag">${h.type || "高光"}</span>`).join("")}
        </div>
      ` : ""}
      
      ${branch.ending ? `
        <div class="branch-ending">
          <strong>结局类型：${branch.ending.type || "未知"}</strong>
          <p>${branch.ending.description || ""}</p>
        </div>
      ` : ""}
      
      ${isSaved ? `<p style="margin-top: 8px; font-size: 12px; color: var(--muted);">保存时间：${new Date(branch.createdAt).toLocaleString()}</p>` : ""}
    </div>
  `;
}

function selectBranch (index) {
  // 移除所有选中状态
  document.querySelectorAll(".branch-card").forEach(card => {
    card.classList.remove("selected");
  });

  // 添加选中状态
  const selectedCard = document.querySelector(`.branch-card[data-index="${index}"]`);
  if (selectedCard) {
    selectedCard.classList.add("selected");
  }

  console.log(`选中分支 ${index + 1}`);
}

// ========== 视频分支功能 ==========

let videoBranchData = null;
let selectedVideoBranch = null;
let interactionNodes = [];

function setupVideoBranches () {
  const generateBtn = document.getElementById("generate-video-branches-btn");
  const previewBtn = document.getElementById("preview-video-branch-btn");
  const closeModalBtn = document.getElementById("close-branch-modal");

  if (generateBtn) {
    generateBtn.addEventListener("click", generateVideoBranches);
  }

  if (previewBtn) {
    previewBtn.addEventListener("click", previewVideoBranches);
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeVideoBranchModal);
  }

  // 点击背景关闭模态框
  const backdrop = document.querySelector(".video-branch-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", closeVideoBranchModal);
  }
}

async function generateVideoBranches () {
  if (!state.currentEpisode) {
    alert("请先选择一集剧集");
    return;
  }

  const videoBranchList = document.getElementById("video-branch-list");
  videoBranchList.innerHTML = '<div class="branch-loading">正在生成视频分支，请稍候...</div>';

  try {
    // 准备剧情数据
    const plotSummary = state.highlights
      .filter(h => h.status === "published")
      .map(h => `${h.type}：${h.summary}`)
      .join("；");

    const highlightsData = state.highlights
      .filter(h => h.status === "published")
      .map(h => ({
        type: h.type,
        startTime: h.startTime,
        endTime: h.endTime,
        summary: h.summary,
        intensity: h.intensity
      }));

    // 获取当前帧信息
    const currentFrame = {
      description: "当前视频截图",
      visual_style: "电影风格"
    };

    // 调用API生成视频分支
    const result = await request("/api/video-branches/generate", {
      method: "POST",
      body: JSON.stringify({
        episodeId: state.currentEpisode.id,
        plotSummary: plotSummary || "本集剧情暂无概要",
        highlights: highlightsData,
        currentFrame: currentFrame
      })
    });

    if (result.success && result.data) {
      // 保存视频分支数据
      videoBranchData = result.data;
      interactionNodes = result.data.interaction_nodes || [];

      // 渲染视频分支列表
      renderVideoBranchList(videoBranchData);

      // 启用预览按钮
      const previewBtn = document.getElementById("preview-video-branch-btn");
      if (previewBtn) {
        previewBtn.disabled = false;
      }

      // 询问是否保存
      if (confirm("视频分支已生成，是否保存到数据库？")) {
        await saveVideoBranches(videoBranchData);
      }
    } else {
      throw new Error("生成失败");
    }
  } catch (error) {
    videoBranchList.innerHTML = `<div class="branch-error">生成失败：${error.message}</div>`;
  }
}

function renderVideoBranchList (data) {
  const videoBranchList = document.getElementById("video-branch-list");

  if (!data.interaction_nodes || data.interaction_nodes.length === 0) {
    videoBranchList.innerHTML = '<p class="muted">未生成任何交互节点</p>';
    return;
  }

  let html = "";

  // 渲染交互节点
  data.interaction_nodes.forEach((node, nodeIndex) => {
    html += `
      <div class="video-branch-node" data-node-index="${nodeIndex}">
        <div class="node-header">
          <h4>🎯 交互节点 ${nodeIndex + 1}</h4>
          <span class="node-time">⏱️ ${node.trigger_time || "00:00"}</span>
        </div>
        <p class="node-description">${node.trigger_description || "关键抉择点"}</p>
        <div class="node-branches">
    `;

    if (node.video_branches && node.video_branches.length > 0) {
      node.video_branches.forEach((branch, branchIndex) => {
        html += renderVideoBranchCard(branch, nodeIndex, branchIndex);
      });
    }

    html += '</div></div>';
  });

  videoBranchList.innerHTML = html;

  // 添加点击事件
  document.querySelectorAll(".video-branch-card").forEach(card => {
    card.addEventListener("click", handleVideoBranchClick);
  });
}

function renderVideoBranchCard (branch, nodeIndex, branchIndex) {
  const emotionTags = (branch.emotion_curve || [])
    .slice(0, 3)
    .map(point => point.emotion)
    .filter(Boolean);

  return `
    <div class="video-branch-card" 
         data-node-index="${nodeIndex}" 
         data-branch-index="${branchIndex}"
         data-branch-id="${branch.branch_id}">
      <div class="video-branch-card-header">
        <span class="video-branch-title">${branch.title || `选项 ${branchIndex + 1}`}</span>
        <span class="video-branch-duration">⏱️ ${branch.duration || 20}秒</span>
      </div>
      <p class="video-branch-description">${branch.description || "暂无描述"}</p>
      
      ${emotionTags.length > 0 ? `
        <div class="video-branch-emotion">
          ${emotionTags.map(emotion => `
            <span class="emotion-tag">${emotion}</span>
          `).join("")}
        </div>
      ` : ""}
      
      <div class="video-branch-meta">
        <span class="video-branch-type">📹 视频生成</span>
        <button class="video-branch-generate-btn" 
                data-prompt="${encodeURIComponent(branch.video_prompt || "")}">
          生成视频
        </button>
      </div>
    </div>
  `;
}

function handleVideoBranchClick (e) {
  // 如果点击的是生成按钮，不触发选择
  if (e.target.classList.contains("video-branch-generate-btn")) {
    return;
  }

  const card = e.currentTarget;
  const nodeIndex = parseInt(card.dataset.nodeIndex);
  const branchIndex = parseInt(card.dataset.branchIndex);

  // 移除所有选中状态
  document.querySelectorAll(".video-branch-card").forEach(c => {
    c.classList.remove("selected");
  });

  // 添加选中状态
  card.classList.add("selected");

  // 保存选中的分支
  selectedVideoBranch = {
    nodeIndex,
    branchIndex,
    node: interactionNodes[nodeIndex],
    branch: interactionNodes[nodeIndex]?.video_branches?.[branchIndex]
  };

  // 在视频上显示选择提示
  showVideoBranchOverlay(selectedVideoBranch);
}

async function generateVideoForBranch (videoPrompt, cardElement) {
  const generateBtn = cardElement.querySelector(".video-branch-generate-btn");
  const originalText = generateBtn.textContent;

  // 显示加载状态
  generateBtn.disabled = true;
  generateBtn.textContent = "生成中...";

  try {
    // 调用API提交视频生成任务
    const result = await request("/api/video-branches/create", {
      method: "POST",
      body: JSON.stringify({
        videoPrompt: decodeURIComponent(videoPrompt),
        config: {
          model: "video-gen-1",
          resolution: "1920x1080",
          fps: 30,
          duration: 20,
          style: "cinematic"
        }
      })
    });

    if (result.success && result.taskId) {
      // 添加预览区域
      let previewArea = cardElement.querySelector(".video-branch-preview");
      if (!previewArea) {
        previewArea = document.createElement("div");
        previewArea.className = "video-branch-preview";
        cardElement.appendChild(previewArea);
      }

      // 显示生成状态
      previewArea.innerHTML = `
        <div class="video-branch-status generating">
          <div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
          <span>正在生成视频...</span>
        </div>
      `;

      // 轮询查询生成状态
      await pollVideoGenerationStatus(result.taskId, previewArea);
    } else {
      throw new Error(result.error || "生成失败");
    }
  } catch (error) {
    // 显示错误状态
    const previewArea = cardElement.querySelector(".video-branch-preview");
    if (previewArea) {
      previewArea.innerHTML = `
        <div class="video-branch-status error">
          <span>❌ ${error.message}</span>
        </div>
      `;
    }
  } finally {
    // 恢复按钮状态
    generateBtn.disabled = false;
    generateBtn.textContent = originalText;
  }
}

async function pollVideoGenerationStatus (taskId, previewArea, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await request(`/api/video-branches/status/${taskId}`);

      if (result.status === "completed") {
        // 生成完成，显示视频
        previewArea.innerHTML = `
          <video controls>
            <source src="${result.videoUrl}" type="video/mp4">
          </video>
        `;
        return;
      } else if (result.status === "failed") {
        // 生成失败
        previewArea.innerHTML = `
          <div class="video-branch-status error">
            <span>❌ 视频生成失败</span>
          </div>
        `;
        return;
      }

      // 还在生成中，更新进度
      if (previewArea.querySelector(".video-branch-status.generating")) {
        previewArea.querySelector(".video-branch-status.generating span").textContent =
          `生成中... ${result.progress || 0}%`;
      }

      // 等待2秒后继续轮询
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("查询视频生成状态失败:", error);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 超时
  previewArea.innerHTML = `
    <div class="video-branch-status error">
      <span>⏱️ 生成超时，请稍后重试</span>
    </div>
  `;
}

function showVideoBranchOverlay (selection) {
  const modal = document.getElementById("video-branch-modal");
  const triggerInfo = document.getElementById("branch-trigger-info");
  const branchOptions = document.getElementById("branch-options");

  if (!modal) return;

  // 设置触发信息
  if (triggerInfo && selection.node) {
    triggerInfo.textContent = selection.node.trigger_description || "关键抉择点";
  }

  // 渲染当前节点的分支选项
  if (branchOptions && selection.node) {
    let html = "";
    selection.node.video_branches?.forEach((branch, index) => {
      html += renderVideoBranchCard(branch, selection.nodeIndex, index);
    });
    branchOptions.innerHTML = html;

    // 添加点击事件
    branchOptions.querySelectorAll(".video-branch-card").forEach(card => {
      card.addEventListener("click", handleVideoBranchClick);
    });
  }

  // 显示模态框
  modal.classList.remove("hidden");
}

function closeVideoBranchModal () {
  const modal = document.getElementById("video-branch-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

async function saveVideoBranches (data) {
  if (!state.currentEpisode || !data.interaction_nodes) return;

  try {
    for (const node of data.interaction_nodes) {
      if (node.video_branches) {
        for (const branch of node.video_branches) {
          await request("/api/video-branches/save", {
            method: "POST",
            body: JSON.stringify({
              episodeId: state.currentEpisode.id,
              nodeId: node.node_id,
              branch: branch
            })
          });
        }
      }
    }
    alert("视频分支保存成功");
  } catch (error) {
    console.error("保存视频分支失败:", error);
  }
}

function previewVideoBranches () {
  if (interactionNodes.length > 0) {
    // 显示第一个交互节点的分支选择
    showVideoBranchOverlay({
      nodeIndex: 0,
      node: interactionNodes[0]
    });
  } else {
    alert("请先生成视频分支");
  }
}

// 为生成按钮添加事件委托
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("video-branch-generate-btn")) {
    const card = e.target.closest(".video-branch-card");
    const videoPrompt = e.target.dataset.prompt;
    if (card && videoPrompt) {
      generateVideoForBranch(videoPrompt, card);
    }
  }
});

bootstrap().catch((error) => {
  console.error(error);
  els.current.innerHTML = `<p class="muted">\u521d\u59cb\u5316\u5931\u8d25\uff1a${error.message}</p>`;
});
