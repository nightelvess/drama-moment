const reviewState = {
  episodes: [],
  currentEpisodeId: null,
  highlights: [],
  outputExample: null,
  hasApiKey: false,
  query: "",
  filter: "all",
  selectedHighlights: new Set(),
  currentHighlightIndex: -1,
  editingHighlightId: null,
  videoGenTasks: [],
  videoBranches: [],
};

const reviewEls = {
  reviewTitleInline: document.getElementById("review-title-inline"),
  copyPrompt: document.getElementById("copy-prompt"),
  createHighlight: document.getElementById("create-highlight"),
  currentHighlightIndicator: document.getElementById("current-highlight-indicator"),
  defaultStatus: document.getElementById("default-status"),
  editCancel: document.getElementById("edit-cancel"),
  editConfidence: document.getElementById("edit-confidence"),
  editConfidenceValue: document.getElementById("edit-confidence-value"),
  editDelete: document.getElementById("edit-delete"),
  editEndTime: document.getElementById("edit-end-time"),
  editForm: document.getElementById("highlight-edit-form"),
  editReason: document.getElementById("edit-reason"),
  editStartTime: document.getElementById("edit-start-time"),
  editStatus: document.getElementById("edit-status"),
  editSuggestions: document.getElementById("edit-suggestions"),
  editSummary: document.getElementById("edit-summary"),
  editType: document.getElementById("edit-type"),
  editorEmpty: document.getElementById("editor-empty"),
  episodeList: document.getElementById("episode-list"),
  episodeSearch: document.getElementById("episode-search"),
  fillExample: document.getElementById("fill-example"),
  generateContinuation: document.getElementById("generate-continuation"),
  highlightOverviewModal: document.getElementById("highlight-overview-modal"),
  importJson: document.getElementById("import-json"),
  importStatus: document.getElementById("import-status"),
  jumpToNext: document.getElementById("jump-to-next"),
  jumpToPrev: document.getElementById("jump-to-prev"),
  kpiApi: document.getElementById("kpi-api"),
  kpiEpisodes: document.getElementById("kpi-episodes"),
  kpiHighlights: document.getElementById("kpi-highlights"),
  kpiPublished: document.getElementById("kpi-published"),
  overviewCloseBtn: document.getElementById("overview-close-btn"),
  overviewDeleteSelected: document.getElementById("overview-delete-selected"),
  overviewList: document.getElementById("overview-list"),
  overviewMeta: document.getElementById("overview-meta"),
  overviewPublishSelected: document.getElementById("overview-publish-selected"),
  overviewSelectAll: document.getElementById("overview-select-all"),
  overviewSelectedInfo: document.getElementById("overview-selected-info"),
  overviewTitle: document.getElementById("overview-title"),
  pageHighlightCount: document.getElementById("page-highlight-count"),
  pagePublishedCount: document.getElementById("page-published-count"),
  pagePendingCount: document.getElementById("page-pending-count"),
  promptMarkdown: document.getElementById("prompt-markdown"),
  refreshVgTasks: document.getElementById("refresh-vg-tasks"),
  replaceExisting: document.getElementById("replace-existing"),
  reviewMeta: document.getElementById("review-meta"),
  reviewTitle: document.getElementById("review-title"),
  runAnalyze: document.getElementById("run-analyze"),
  runImport: document.getElementById("run-import"),
  analyzeProgress: document.getElementById("analyze-progress"),
  analyzeProgressTitle: document.getElementById("analyze-progress-title"),
  analyzeProgressDetail: document.getElementById("analyze-progress-detail"),
  analyzeProgressMeta: document.getElementById("analyze-progress-meta"),
  showOverview: document.getElementById("show-overview"),
  shortcutsHelpModal: document.getElementById("shortcuts-help-modal"),
  selectedHighlightForBranch: document.getElementById("selected-highlight-for-branch"),
  selectedHighlightBranches: document.getElementById("selected-highlight-branches"),
  video: document.getElementById("review-video"),
  videoBranchResult: document.getElementById("video-branch-result"),
  videoFullscreen: document.getElementById("video-fullscreen"),
  generatedVideos: document.getElementById("generated-videos"),
  videoGenTasks: document.getElementById("video-gen-tasks"),
  videoHighlightMarks: document.getElementById("video-highlight-marks"),
  videoMute: document.getElementById("video-mute"),
  videoPlay: document.getElementById("video-play"),
  videoProgress: document.getElementById("video-progress"),
  videoTime: document.getElementById("video-time"),
};

const HIGHLIGHT_TYPES = ["冲突", "反转", "打脸", "爽点", "甜蜜", "搞笑", "营救", "身份揭露", "情绪爆发", "悬念", "剧尾钩子"];
const HIGHLIGHT_COLORS = {
  "冲突": "#ef4444", "反转": "#8b5cf6", "打脸": "#f59e0b", "爽点": "#10b981",
  "甜蜜": "#ec4899", "搞笑": "#f97316", "营救": "#06b6d4", "身份揭露": "#84cc16",
  "情绪爆发": "#f43f5e", "悬念": "#6366f1", "剧尾钩子": "#14b8a6",
};

// ========== Utilities ==========

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function formatSize(sizeBytes) {
  const size = Number(sizeBytes) || 0;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function setStatus(text, tone = "idle") {
  reviewEls.importStatus.textContent = text;
  reviewEls.importStatus.style.color = tone === "success" ? "#70ecd9" : tone === "error" ? "#f05f75" : tone === "busy" ? "#ffca6b" : "#dbe8ff";
}

function setAnalyzeProgress({ title, detail, meta = "", tone = "idle", visible = true }) {
  if (!reviewEls.analyzeProgress) return;
  reviewEls.analyzeProgress.classList.toggle("hidden", !visible);
  reviewEls.analyzeProgress.dataset.tone = tone;
  if (reviewEls.analyzeProgressTitle) reviewEls.analyzeProgressTitle.textContent = title || "";
  if (reviewEls.analyzeProgressDetail) reviewEls.analyzeProgressDetail.textContent = detail || "";
  if (reviewEls.analyzeProgressMeta) reviewEls.analyzeProgressMeta.textContent = meta || "";
}

async function runAction(successText, fn) {
  try {
    setStatus("处理中...", "busy");
    await fn();
    if (successText) setStatus(successText, "success");
  } catch (error) {
    console.error(error);
    setStatus(`失败：${error.message}`, "error");
  }
}

function selectedEpisode() {
  return reviewState.episodes.find((item) => item.id === reviewState.currentEpisodeId) || null;
}

function selectedHighlight() {
  return reviewState.highlights.find((item) => item.id === reviewState.editingHighlightId) || null;
}

function updateSelectedHighlightForBranch() {
  const h = selectedHighlight();
  if (!reviewEls.selectedHighlightForBranch) return;
  if (!h) {
    reviewEls.selectedHighlightForBranch.textContent = "未选择高光";
    reviewEls.selectedHighlightForBranch.dataset.empty = "true";
    renderSelectedHighlightBranches();
    return;
  }
  reviewEls.selectedHighlightForBranch.dataset.empty = "false";
  reviewEls.selectedHighlightForBranch.textContent = `已选择：${h.type || "高光"} · ${formatTime(h.startTime || 0)}-${formatTime(h.endTime || 0)} · ${h.summary || ""}`;
  renderSelectedHighlightBranches();
}

function branchPackagesForSelectedHighlight() {
  const h = selectedHighlight();
  if (!h) return [];
  return (reviewState.videoBranches || []).filter((pack) =>
    (pack.interaction_nodes || []).some((node) => String(node.trigger_highlight_id || "") === h.id)
  );
}

function renderSelectedHighlightBranches() {
  if (!reviewEls.selectedHighlightBranches) return;
  const h = selectedHighlight();
  if (!h) {
    reviewEls.selectedHighlightBranches.innerHTML = `<p class="rv2-muted">选中高光后，这里会展示该高光已有的 AIGC 分支。</p>`;
    return;
  }
  const packages = branchPackagesForSelectedHighlight();
  if (!packages.length) {
    reviewEls.selectedHighlightBranches.innerHTML = `<p class="rv2-muted">当前高光还没有 AIGC 分支。点击下方按钮生成。</p>`;
    return;
  }
  reviewEls.selectedHighlightBranches.innerHTML = packages.map((pack) => {
    const nodes = (pack.interaction_nodes || []).filter((node) => String(node.trigger_highlight_id || "") === h.id);
    const nodesHtml = nodes.map((node) => {
      const branches = node.video_branches || [];
      const branchesHtml = branches.map((branch) => `
        <article class="rv2-branch-admin-card">
          <div class="rv2-branch-admin-head">
            <strong>${escapeHtml(branch.title || branch.user_choice_label || "分支")}</strong>
            <span>${Number(branch.duration || 12)}s</span>
          </div>
          <p>${escapeHtml(branch.description || "")}</p>
          <details>
            <summary>查看 video_prompt</summary>
            <textarea readonly rows="3">${escapeHtml(branch.video_prompt || "")}</textarea>
          </details>
          <button class="vg-submit-btn" type="button" data-prompt="${escapeHtml(branch.video_prompt || "")}" data-title="${escapeHtml(branch.title || "")}" data-label="${escapeHtml(branch.user_choice_label || branch.title || "")}" data-trigger="${escapeHtml(String(node.trigger_time || 0))}" data-hlid="${escapeHtml(String(node.trigger_highlight_id || ""))}">提交视频生成</button>
        </article>
      `).join("");
      return `
        <section class="rv2-branch-admin-node">
          <div class="rv2-branch-admin-time">${formatTime(node.trigger_time || h.startTime || 0)}</div>
          <p>${escapeHtml(node.trigger_description || h.summary || "")}</p>
          <div class="rv2-branch-admin-grid">${branchesHtml || `<p class="rv2-muted">暂无分支选项。</p>`}</div>
        </section>
      `;
    }).join("");
    return `
      <div class="rv2-branch-admin-package">
        <div class="rv2-branch-admin-package-head">
          <strong>${escapeHtml(pack.title || "AIGC 分支包")}</strong>
          <button class="rv2-delete-btn" type="button" data-delete-vbranch="${escapeHtml(pack.id)}">删除分支包</button>
        </div>
        <p class="rv2-muted">${escapeHtml(pack.setup || "")}</p>
        ${nodesHtml}
      </div>
    `;
  }).join("");

  reviewEls.selectedHighlightBranches.querySelectorAll(".vg-submit-btn").forEach((btn) => {
    btn.addEventListener("click", () => submitVideoGenTask(
      btn.dataset.prompt, btn.dataset.title, btn.dataset.label || "",
      btn.dataset.trigger, btn.dataset.hlid
    ));
  });
  reviewEls.selectedHighlightBranches.querySelectorAll("[data-delete-vbranch]").forEach((btn) => {
    btn.addEventListener("click", () => deleteVideoBranchPackage(btn.dataset.deleteVbranch));
  });
}

// ========== KPI & Filtering ==========

function updateKpis() {
  const totalHighlights = reviewState.episodes.reduce((sum, item) => sum + (item.highlightCount || 0), 0);
  const totalPublished = reviewState.episodes.reduce((sum, item) => sum + (item.publishedCount || 0), 0);
  reviewEls.kpiEpisodes.textContent = String(reviewState.episodes.length);
  reviewEls.kpiHighlights.textContent = String(totalHighlights);
  reviewEls.kpiPublished.textContent = String(totalPublished);
  reviewEls.kpiApi.textContent = reviewState.hasApiKey ? "已配置" : "未配置";
}

function filteredEpisodes() {
  const query = reviewState.query.trim().toLowerCase();
  return reviewState.episodes.filter((episode) => {
    if (reviewState.filter === "todo" && episode.highlightCount > 0) return false;
    if (reviewState.filter === "ready" && episode.highlightCount <= 0) return false;
    if (!query) return true;
    const title = (episode.drama?.title || "").toLowerCase();
    const epTitle = (episode.title || "").toLowerCase();
    return `${title} ${epTitle}`.includes(query);
  });
}

// ========== Episode List ==========

function renderEpisodeList() {
  const episodes = filteredEpisodes();
  reviewEls.episodeList.innerHTML = "";
  if (!episodes.length) {
    reviewEls.episodeList.innerHTML = `<p class="rv2-muted">没有找到匹配剧集。</p>`;
    return;
  }
  const groups = new Map();
  episodes.forEach((ep) => {
    const title = ep.drama?.title || "未知短剧";
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(ep);
  });
  groups.forEach((items, dramaTitle) => {
    const group = document.createElement("div");
    group.className = "rv2-ep-group";
    group.innerHTML = `<div class="rv2-ep-group-title">${escapeHtml(dramaTitle)}<span>${items.length} 集</span></div>`;
    items.forEach((ep) => {
      const pending = Math.max(0, (ep.highlightCount || 0) - (ep.publishedCount || 0));
      const btn = document.createElement("button");
      btn.className = `rv2-ep-card ${reviewState.currentEpisodeId === ep.id ? "active" : ""}`;
      btn.innerHTML = `
        <strong>${escapeHtml(ep.title)}</strong>
        <span class="ep-stats">${ep.publishedCount || 0}/${ep.highlightCount || 0}</span>
        ${pending ? `<span class="ep-pending">${pending} 待审</span>` : ""}
      `;
      btn.addEventListener("click", () => selectEpisode(ep.id));
      group.appendChild(btn);
    });
    reviewEls.episodeList.appendChild(group);
  });
}

function renderPageSummary(episode) {
  if (!episode) {
    reviewEls.pageHighlightCount.textContent = "0";
    reviewEls.pagePublishedCount.textContent = "0";
    reviewEls.pagePendingCount.textContent = "0";
    return;
  }
  const total = episode.highlightCount || 0;
  const published = episode.publishedCount || 0;
  reviewEls.pageHighlightCount.textContent = String(total);
  reviewEls.pagePublishedCount.textContent = String(published);
  reviewEls.pagePendingCount.textContent = String(Math.max(0, total - published));
}

// ========== Highlight Timeline (matches frontend heatmap style) ==========

function markerHtml(item) {
  const m = HIGHLIGHT_COLORS[item.type] ? { color: HIGHLIGHT_COLORS[item.type], label: item.type } : { color: "#6b7280", label: "高光" };
  return `<span class="marker-dot"></span>
    <span class="marker-card">
      <strong>${escapeHtml(m.label)}</strong>
      <em>${formatTime(item.startTime)} - ${formatTime(item.endTime)}</em>
      <span>${escapeHtml(item.summary || item.modelReason || "暂无摘要")}</span>
      <span style="font-size:10px;color:var(--rv2-muted);margin-top:4px;display:block">${item.status === "published" ? "✅ 已发布" : "📝 草稿"} · 置信度 ${Math.round((item.confidence || 0) * 100)}%</span>
    </span>`;
}

function renderHighlightMarks() {
  if (!reviewEls.videoHighlightMarks) return;
  reviewEls.videoHighlightMarks.innerHTML = "";
  const heatmap = document.getElementById("video-heatmap");
  if (heatmap) heatmap.innerHTML = "";

  if (!reviewState.highlights.length) { renderRuler(100); return; }
  const duration = reviewEls.video.duration || selectedEpisode()?.durationSec || 100;
  renderRuler(duration);

  // Heatmap density bars (same as frontend)
  if (heatmap) {
    const maxIntensity = Math.max(1, ...reviewState.highlights.map((h) => h.intensity || 0.6));
    reviewState.highlights.forEach((item) => {
      const density = (item.intensity || 0.6) / maxIntensity;
      const bar = document.createElement("div");
      bar.className = `heatmap-density-bar ${density > 0.7 ? "density-high" : density > 0.4 ? "density-mid" : "density-low"}`;
      bar.style.left = `${Math.max(0, Math.min(100, ((item.startTime || 0) / duration) * 100))}%`;
      bar.style.width = `${Math.max(2, (( (item.endTime || item.startTime + 5) - (item.startTime || 0)) / duration) * 100)}%`;
      heatmap.appendChild(bar);
    });
  }

  // Dot markers on the heatmap (same as frontend highlight-marker)
  reviewState.highlights.forEach((item, idx) => {
    const color = HIGHLIGHT_COLORS[item.type] || "#6b7280";
    const marker = document.createElement("button");
    marker.className = "highlight-marker";
    marker.dataset.id = item.id;
    marker.style.left = `${Math.max(0, Math.min(100, ((item.startTime || 0) / duration) * 100))}%`;
    marker.style.setProperty("--marker-color", color);
    marker.innerHTML = markerHtml(item);
    marker.addEventListener("click", (event) => {
      event.preventDefault();
      reviewEls.video.currentTime = item.startTime || 0;
      openInlineEditor(item.id);
    });
    reviewEls.videoHighlightMarks.appendChild(marker);
  });
  updatePlayhead();
}

function renderRuler(duration) {
  const ruler = document.getElementById("timeline-ruler");
  if (!ruler) return;
  const ticks = 6;
  let html = "";
  for (let i = 0; i <= ticks; i++) {
    const t = (duration / ticks) * i;
    html += `<span>${formatTime(t)}</span>`;
  }
  ruler.innerHTML = html;
}

function updatePlayhead() {
  const ph = document.getElementById("timeline-playhead");
  if (!ph) return;
  const duration = reviewEls.video.duration || selectedEpisode()?.durationSec || 100;
  const ct = reviewEls.video.currentTime || 0;
  const pct = Math.min(100, Math.max(0, (ct / duration) * 100));
  ph.style.left = `${pct}%`;
}

function setupTimelineClick() {
  const zone = document.getElementById("timeline-click-zone");
  if (!zone) return;
  zone.addEventListener("click", (e) => {
    const rect = zone.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const duration = reviewEls.video.duration || selectedEpisode()?.durationSec || 100;
    reviewEls.video.currentTime = Math.max(0, Math.min(duration, pct * duration));
  });
}

function updateActiveMark() {
  if (!reviewState.highlights.length) return;
  const ct = reviewEls.video.currentTime;
  let activeIdx = -1;
  reviewState.highlights.forEach((h, idx) => {
    if (ct >= (h.startTime || 0) && ct <= (h.endTime || 0)) activeIdx = idx;
  });
  reviewEls.videoHighlightMarks.querySelectorAll(".highlight-marker").forEach((m, i) => {
    m.classList.toggle("active", i === activeIdx);
  });
  updatePlayhead();
  if (activeIdx >= 0 && activeIdx !== reviewState.currentHighlightIndex) {
    reviewState.currentHighlightIndex = activeIdx;
    reviewEls.currentHighlightIndicator.textContent = `第 ${activeIdx + 1}/${reviewState.highlights.length} 个高光`;
    openInlineEditor(reviewState.highlights[activeIdx].id);
  }
}

// ========== Inline Editor ==========

function openInlineEditor(highlightId) {
  const h = reviewState.highlights.find((item) => item.id === highlightId);
  if (!h) return;
  reviewState.editingHighlightId = h.id;
  updateSelectedHighlightForBranch();
  reviewEls.editorEmpty.classList.add("hidden");
  reviewEls.editForm.classList.remove("hidden");
  reviewEls.editType.value = h.type || "悬念";
  reviewEls.editStatus.value = h.status || "draft";
  reviewEls.editStartTime.value = String(h.startTime ?? 0);
  reviewEls.editEndTime.value = String(h.endTime ?? 10);
  reviewEls.editConfidence.value = String(h.confidence ?? 0.8);
  reviewEls.editConfidenceValue.textContent = `${Math.round((h.confidence ?? 0.8) * 100)}%`;
  reviewEls.editSummary.value = h.summary || "";
  reviewEls.editReason.value = h.modelReason || "";
  reviewEls.editSuggestions.value = Array.isArray(h.suggestions) ? h.suggestions.join(", ") : (h.suggestions || "");
  // Switch to editor tab
  document.querySelectorAll(".rv2-tab").forEach(t => t.classList.remove("active"));
  document.querySelector('[data-rv2-tab="editor"]')?.classList.add("active");
  document.querySelectorAll(".rv2-tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelector('[data-rv2-panel="editor"]')?.classList.add("active");
}

function closeInlineEditor() {
  reviewState.editingHighlightId = null;
  reviewEls.editorEmpty.classList.remove("hidden");
  reviewEls.editForm.classList.add("hidden");
}

// ========== Select Episode ==========

async function selectEpisode(episodeId) {
  reviewState.currentEpisodeId = episodeId;
  reviewState.highlights = [];
  reviewState.editingHighlightId = null;
  closeInlineEditor();
  renderEpisodeList();
  const episode = selectedEpisode();
  if (!episode) return;
  if (reviewEls.reviewTitleInline) {
    reviewEls.reviewTitleInline.textContent = `${episode.drama?.title || ""} / ${episode.title}`;
  }
  renderPageSummary(episode);
  const { highlights } = await request(`/api/episodes/${episodeId}/highlights?includeDrafts=true`);
  reviewState.highlights = highlights;
  loadVideo(episode);
  renderHighlightMarks();
  loadVideoGenTasks();
}

function loadVideo(episode) {
  if (!episode || !reviewEls.video) return;
  const videoPath = `/media/${encodeURIComponent(episode.sourceKey || "")}`;
  const source = reviewEls.video.querySelector("source");
  if (source) source.src = videoPath;
  reviewEls.video.load();
}

// ========== Highlight Overview Modal ==========

function closeHighlightOverview() {
  reviewEls.highlightOverviewModal?.classList.add("hidden");
  reviewState.selectedHighlights.clear();
  updateOverviewSelectedInfo();
}

function updateOverviewSelectedInfo() {
  reviewEls.overviewSelectedInfo.textContent = `已选择 ${reviewState.selectedHighlights.size} 项`;
}

function toggleHighlightSelection(highlightId) {
  if (reviewState.selectedHighlights.has(highlightId)) {
    reviewState.selectedHighlights.delete(highlightId);
  } else {
    reviewState.selectedHighlights.add(highlightId);
  }
  updateOverviewSelectedInfo();
  renderHighlightOverview();
}

function selectAllHighlights() {
  if (reviewState.selectedHighlights.size === reviewState.highlights.length) {
    reviewState.selectedHighlights.clear();
  } else {
    reviewState.highlights.forEach((h) => reviewState.selectedHighlights.add(h.id));
  }
  updateOverviewSelectedInfo();
  renderHighlightOverview();
}

function renderHighlightOverview() {
  const episode = selectedEpisode();
  if (!episode || !reviewEls.highlightOverviewModal) return;
  reviewEls.overviewTitle.textContent = `${episode.drama?.title || ""} / ${episode.title}`;
  reviewEls.overviewMeta.textContent = `${reviewState.highlights.length} 条高光，${episode.publishedCount || 0} 条已发布`;
  if (!reviewState.highlights.length) {
    reviewEls.overviewList.innerHTML = `<div class="overview-empty"><strong>暂无高光</strong><span>先点击"解析高光"或手动新建。</span></div>`;
  } else {
    const sorted = [...reviewState.highlights].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    reviewEls.overviewList.innerHTML = sorted.map((item, index) => {
      const published = item.status === "published";
      const selected = reviewState.selectedHighlights.has(item.id);
      const color = HIGHLIGHT_COLORS[item.type] || "#6b7280";
      const suggestions = Array.isArray(item.suggestions) ? item.suggestions.slice(0, 3) : [];
      return `<article class="overview-highlight-row" data-highlight-id="${escapeHtml(item.id)}">
        <input type="checkbox" class="overview-checkbox" ${selected ? "checked" : ""} onchange="toggleHighlightSelection('${escapeHtml(item.id)}')" />
        <div class="overview-content">
          <div class="overview-header">
            <div class="overview-header-left">
              <span class="type-indicator" style="background-color:${color}"></span>
              <strong>${String(index + 1).padStart(2, "0")} · ${escapeHtml(item.type || "高光")}</strong>
              <span class="confidence">${Math.round((item.confidence || 0) * 100)}%</span>
            </div>
            <div class="overview-header-right">
              <div class="overview-time">${formatTime(item.startTime)} - ${formatTime(item.endTime)}</div>
              <span class="chip ${published ? "live" : "neutral"}">${published ? "已发布" : "草稿"}</span>
            </div>
          </div>
          <div class="overview-body">
            <div class="overview-summary">
              <p>${escapeHtml(item.summary || item.modelReason || "暂无摘要")}</p>
              <div class="overview-tags">${suggestions.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
            </div>
            <div class="overview-actions">
              <button class="action-btn edit-btn" onclick="openInlineEditor('${escapeHtml(item.id)}')" title="编辑">✏️</button>
              <button class="action-btn delete-btn" onclick="deleteHighlight('${escapeHtml(item.id)}')" title="删除">🗑️</button>
            </div>
          </div>
        </div>
      </article>`;
    }).join("");
  }
  reviewEls.highlightOverviewModal.classList.remove("hidden");
}

function showHighlightOverview() {
  if (!selectedEpisode()) return;
  reviewState.selectedHighlights.clear();
  updateOverviewSelectedInfo();
  renderHighlightOverview();
}

// ========== Highlight CRUD ==========

async function saveHighlight(e) {
  e.preventDefault();
  if (!reviewState.editingHighlightId) return;
  const suggestions = reviewEls.editSuggestions.value.split(",").map((s) => s.trim()).filter(Boolean);
  const payload = {
    type: reviewEls.editType.value,
    status: reviewEls.editStatus.value,
    startTime: Number(reviewEls.editStartTime.value || 0),
    endTime: Number(reviewEls.editEndTime.value || 10),
    confidence: Number(reviewEls.editConfidence.value || 0.8),
    summary: reviewEls.editSummary.value,
    modelReason: reviewEls.editReason.value,
    suggestions,
  };
  await runAction("高光已保存", async () => {
    await request(`/api/highlights/${reviewState.editingHighlightId}`, { method: "PUT", body: JSON.stringify(payload) });
    await refreshCurrentEpisode();
  });
}

async function deleteHighlight(highlightId) {
  if (!confirm("确定删除这条高光？")) return;
  await runAction("高光已删除", async () => {
    await request(`/api/episodes/${reviewState.currentEpisodeId}/highlights/${highlightId}`, { method: "DELETE" });
    if (reviewState.editingHighlightId === highlightId) closeInlineEditor();
    await refreshCurrentEpisode();
    closeHighlightOverview();
  });
}

async function createNewHighlight() {
  const episode = selectedEpisode();
  if (!episode) return;
  const ct = reviewEls.video.currentTime || 0;
  await runAction("高光已创建", async () => {
    const result = await request(`/api/episodes/${episode.id}/highlights`, {
      method: "POST",
      body: JSON.stringify({ startTime: ct, endTime: ct + 10, type: "悬念", status: "draft" }),
    });
    await refreshCurrentEpisode();
    openInlineEditor(result.highlight.id);
  });
}

async function refreshCurrentEpisode() {
  if (!reviewState.currentEpisodeId) return;
  const episode = selectedEpisode();
  const { highlights } = await request(`/api/episodes/${reviewState.currentEpisodeId}/highlights?includeDrafts=true`);
  const { videoBranches } = await request(`/api/episodes/${reviewState.currentEpisodeId}/video-branches`).catch(() => ({ videoBranches: [] }));
  reviewState.highlights = highlights;
  reviewState.videoBranches = videoBranches || [];
  renderHighlightMarks();
  renderPageSummary(episode);
  updateSelectedHighlightForBranch();
  // Re-render episode list to update counts
  const episodesResult = await request("/api/review/episodes");
  reviewState.episodes = episodesResult.episodes;
  renderEpisodeList();
  updateKpis();
}

// ========== Bulk Operations ==========

async function publishSelected() {
  if (!reviewState.selectedHighlights.size) return;
  await runAction(`已发布 ${reviewState.selectedHighlights.size} 条高光`, async () => {
    for (const id of reviewState.selectedHighlights) {
      await request(`/api/highlights/${id}`, { method: "PUT", body: JSON.stringify({ status: "published" }) });
    }
    reviewState.selectedHighlights.clear();
    await refreshCurrentEpisode();
    renderHighlightOverview();
  });
}

async function deleteSelected() {
  if (!reviewState.selectedHighlights.size) return;
  if (!confirm(`确定删除选中的 ${reviewState.selectedHighlights.size} 条高光？`)) return;
  await runAction("已删除", async () => {
    for (const id of reviewState.selectedHighlights) {
      await request(`/api/episodes/${reviewState.currentEpisodeId}/highlights/${id}`, { method: "DELETE" });
    }
    reviewState.selectedHighlights.clear();
    await refreshCurrentEpisode();
    renderHighlightOverview();
  });
}

// ========== Video Generation Tasks ==========

async function loadVideoGenTasks() {
  try {
    const result = await request("/api/video-gen/tasks");
    reviewState.videoGenTasks = result.tasks || [];
    renderVideoGenTasks();
  } catch (e) {
    // silent
  }
}

async function loadGeneratedVideos() {
  try {
    const result = await request("/api/video-gen/downloads");
    renderGeneratedVideos(result.files || []);
  } catch (e) {
    // silent
  }
}

function renderGeneratedVideos(files) {
  if (!reviewEls.generatedVideos) return;
  if (!files.length) {
    reviewEls.generatedVideos.innerHTML = `<p class="rv2-muted">暂无已生成的视频。提交视频生成任务后，完成会自动下载到本地。</p>`;
    return;
  }
  reviewEls.generatedVideos.innerHTML = files.map((f) => {
    const sizeMB = (f.sizeBytes / 1024 / 1024).toFixed(1);
    const time = f.createdAt ? new Date(f.createdAt).toLocaleString("zh-CN") : "";
    return `<div class="rv2-gen-video-card">
      <div class="rv2-gen-video-preview">
        <video src="${escapeHtml(f.url)}" preload="metadata" controls class="rv2-gen-video-player"></video>
      </div>
      <div class="rv2-gen-video-info">
        <strong>${escapeHtml(f.title)}</strong>
        <span class="rv2-gen-video-meta">${sizeMB} MB · ${time}</span>
        ${f.videoPrompt ? `<p class="rv2-gen-video-prompt">${escapeHtml(f.videoPrompt.slice(0, 80))}...</p>` : ""}
        <a href="${escapeHtml(f.url)}" download class="rv2-action-btn" style="display:inline-block;margin-top:4px;font-size:11px">⬇ 下载</a>
      </div>
    </div>`;
  }).join("");
}

async function refreshVideoGenTasks() {
  reviewEls.videoGenTasks.innerHTML = `<p class="rv2-muted">⏳ 正在刷新任务状态...</p>`;
  try {
    await request("/api/video-gen/refresh", { method: "POST" });
    await loadVideoGenTasks();
    await loadGeneratedVideos(); // 同时刷新已生成视频
  } catch (e) {
    await loadVideoGenTasks();
  }
}

function renderVideoGenTasks() {
  if (!reviewEls.videoGenTasks) return;
  const tasks = reviewState.videoGenTasks;
  if (!tasks.length) {
    reviewEls.videoGenTasks.innerHTML = `<p class="rv2-muted">暂无任务。先生成视频分支，再将分支 prompt 提交生成。</p>`;
    return;
  }
  reviewEls.videoGenTasks.innerHTML = tasks.map((task) => {
    const statusClass = task.status === "completed" ? "completed" : task.status === "processing" ? "processing" : task.status === "failed" ? "failed" : "pending";
    const statusLabel = { pending: "等待生成", processing: "生成中...", completed: "已完成", failed: "失败" }[task.status] || task.status;
    const progressBar = task.status === "processing" ? `<div style="height:3px;background:rgba(255,255,255,.1);border-radius:2px;margin:6px 0"><div style="height:100%;width:${task.progress || 10}%;background:#61d7ff;border-radius:2px;transition:width .5s"></div></div>` : "";
    const localUrl = task.localFile
      ? `/media/${task.localFile.split("/").map((part) => encodeURIComponent(part)).join("/")}`
      : "";
    const playableUrl = task.playableUrl || localUrl || task.videoUrl || "";
    const resultPanel = playableUrl ? `
      <div class="rv2-vg-preview">
        ${localUrl ? `<video src="${escapeHtml(localUrl)}" controls preload="metadata"></video>` : `<p class="rv2-muted">本地视频尚未下载，外部链接可能会过期。</p>`}
        <div class="rv2-vg-links">
          <a href="${escapeHtml(playableUrl)}" target="_blank" rel="noopener">打开视频</a>
          ${localUrl ? `<a href="${escapeHtml(localUrl)}" download>下载本地视频</a>` : ""}
          ${task.videoUrl && localUrl ? `<a href="${escapeHtml(task.videoUrl)}" target="_blank" rel="noopener">外部原始链接</a>` : ""}
        </div>
      </div>` : "";
    const errorMsg = task.errorMessage ? `<div style="font-size:11px;color:#f05f75;margin-top:4px">❌ ${escapeHtml(task.errorMessage)}</div>` : "";
    const modelTag = task.model ? `<span class="rv2-vg-model">${escapeHtml(task.model)}</span>` : "";
    const branchLabel = task.config?.branchLabel || task.branchLabel || "";
    const promptText = task.promptSummary || (task.videoPrompt || "").slice(0, 60);
    return `<div class="rv2-vg-task">
      <div class="vg-title">
        <span>${escapeHtml(task.title || branchLabel || "AIGC 分支视频任务")}</span>
        ${modelTag}
      </div>
      ${promptText ? `<p class="rv2-vg-prompt">${escapeHtml(promptText)}</p>` : ""}
      ${progressBar}
      <div class="vg-meta">
        <span class="vg-status ${statusClass}">${statusLabel}</span>
        <span>${task.createdAt ? new Date(task.createdAt).toLocaleString("zh-CN") : ""}</span>
      </div>
      ${resultPanel}
      ${errorMsg}
    </div>`;
  }).join("");
}

async function submitVideoGenTask(branchPrompt, branchTitle, branchLabel, triggerTime, highlightId) {
  const episode = selectedEpisode();
  await runAction("已提交视频生成任务", async () => {
    const result = await request("/api/video-gen/submit", {
      method: "POST",
      body: JSON.stringify({
        videoPrompt: branchPrompt,
        title: branchTitle || "视频分支",
        episodeId: episode?.id || null,
        episodeKey: episode?.sourceKey || null,
        triggerTime: Number(triggerTime || 0),
        highlightId: String(highlightId || ""),
        config: { highlightType: "分支剧情", branchLabel: branchLabel || "" },
      }),
    });
    reviewState.videoGenTasks.unshift(result.task);
    renderVideoGenTasks();
  });
}

async function deleteVideoBranchPackage(packageId) {
  if (!packageId) return;
  if (!confirm("确定删除当前高光的这个 AIGC 分支包？")) return;
  await runAction("分支包已删除", async () => {
    await request(`/api/video-branches/${packageId}`, { method: "DELETE" });
    reviewState.videoBranches = (reviewState.videoBranches || []).filter((pack) => pack.id !== packageId);
    renderSelectedHighlightBranches();
    reviewEls.videoBranchResult.innerHTML = "";
  });
}

// ========== AI Branch Generation ==========

async function generateVideoBranches() {
  const episode = selectedEpisode();
  if (!episode) { alert("请先选择剧集"); return; }
  const highlight = selectedHighlight();
  if (!highlight) {
    reviewEls.videoBranchResult.innerHTML = `<p class="rv2-muted">请先在时间轴上点击一个高光点，或在高光编辑器中选中一条高光，再生成 AIGC 分支。</p>`;
    document.querySelector('[data-rv2-tab="editor"]')?.click();
    return;
  }
  reviewEls.videoBranchResult.innerHTML = `⏳ 正在基于「${escapeHtml(highlight.type || "高光")} · ${formatTime(highlight.startTime || 0)}」生成 AIGC 视频分支...`;
  await runAction("视频分支已生成", async () => {
    const result = await request(`/api/episodes/${episode.id}/video-branches/generate`, {
      method: "POST",
      body: JSON.stringify({ highlightId: highlight.id }),
    });
    if (result.videoBranchPackage) {
      const pkg = result.videoBranchPackage;
      reviewState.videoBranches = [
        pkg,
        ...(reviewState.videoBranches || []).filter((pack) => pack.id !== pkg.id),
      ];
      renderSelectedHighlightBranches();
      const nodes = pkg.interaction_nodes || [];
      let html = `<p style="font-size:12px;color:var(--rv2-accent);margin-top:8px">✅ 已基于选中高光生成 ${nodes.length} 个分支节点</p>`;
      nodes.forEach((node) => {
        const branches = node.video_branches || [];
        branches.forEach((branch) => {
          html += `<div class="rv2-vg-task" style="margin-top:6px">
            <div class="vg-title">🎬 ${escapeHtml(branch.title || "分支")} (${Number(branch.duration || 12)}s)</div>
            <div class="vg-meta">${escapeHtml((branch.video_prompt || "").slice(0, 80))}...</div>
            <button class="vg-submit-btn" data-prompt="${escapeHtml(branch.video_prompt || "")}" data-title="${escapeHtml(branch.title || "")}" data-label="${escapeHtml(branch.user_choice_label || branch.title || "")}" data-trigger="${escapeHtml(String(node.trigger_time || 0))}" data-hlid="${escapeHtml(String(node.trigger_highlight_id || ""))}">🎥 提交视频生成</button>
          </div>`;
        });
      });
      reviewEls.videoBranchResult.innerHTML = html;
      // Bind submit buttons
      reviewEls.videoBranchResult.querySelectorAll(".vg-submit-btn").forEach((btn) => {
        btn.addEventListener("click", () => submitVideoGenTask(
          btn.dataset.prompt, btn.dataset.title, btn.dataset.label || "",
          btn.dataset.trigger, btn.dataset.hlid
        ));
      });
    }
  });
}

// ========== JSON Import ==========

async function importJson() {
  const episode = selectedEpisode();
  if (!episode) { alert("请先选择剧集"); return; }
  const raw = reviewEls.importJson.value.trim();
  if (!raw) { alert("请粘贴 JSON"); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { alert("JSON 格式错误"); return; }
  await runAction("导入完成", async () => {
    await request("/api/model/import", {
      method: "POST",
      body: JSON.stringify({
        episodeId: episode.id,
        modelOutput: parsed,
        replaceExisting: reviewEls.replaceExisting.checked,
        defaultStatus: reviewEls.defaultStatus.value,
      }),
    });
    await refreshCurrentEpisode();
    reviewEls.importJson.value = "";
  });
}

// ========== Event Bindings ==========

function setupEvents() {
  // Video controls
  reviewEls.videoPlay.addEventListener("click", () => {
    if (reviewEls.video.paused) reviewEls.video.play();
    else reviewEls.video.pause();
  });
  reviewEls.video.addEventListener("play", () => { reviewEls.videoPlay.textContent = "⏸"; });
  reviewEls.video.addEventListener("pause", () => { reviewEls.videoPlay.textContent = "▶"; });
  reviewEls.video.addEventListener("timeupdate", () => {
    const ct = reviewEls.video.currentTime;
    const dur = reviewEls.video.duration || 100;
    if (reviewEls.videoTime) {
      reviewEls.videoTime.textContent = `${formatTime(ct)} / ${formatTime(dur)}`;
    }
    updateActiveMark();
  });
  reviewEls.video.addEventListener("loadedmetadata", () => {
    renderHighlightMarks();
  });
  reviewEls.videoMute.addEventListener("click", () => {
    reviewEls.video.muted = !reviewEls.video.muted;
    reviewEls.videoMute.textContent = reviewEls.video.muted ? "🔇" : "🔊";
  });
  reviewEls.videoFullscreen.addEventListener("click", () => reviewEls.video.requestFullscreen?.());

  // Navigation
  reviewEls.jumpToPrev.addEventListener("click", () => {
    const sorted = [...reviewState.highlights].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const ct = reviewEls.video.currentTime;
    const prev = [...sorted].reverse().find((h) => (h.startTime || 0) < ct - 1);
    if (prev) reviewEls.video.currentTime = prev.startTime || 0;
  });
  reviewEls.jumpToNext.addEventListener("click", () => {
    const sorted = [...reviewState.highlights].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    const ct = reviewEls.video.currentTime;
    const next = sorted.find((h) => (h.startTime || 0) > ct + 0.5);
    if (next) reviewEls.video.currentTime = next.startTime || 0;
  });

  // Tab switching
  document.querySelectorAll(".rv2-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".rv2-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".rv2-tab-panel").forEach((p) => p.classList.remove("active"));
      const panel = document.querySelector(`[data-rv2-panel="${tab.dataset.rv2Tab}"]`);
      if (panel) panel.classList.add("active");
    });
  });

  // Episode search & filter
  reviewEls.episodeSearch.addEventListener("input", (e) => {
    reviewState.query = e.target.value;
    renderEpisodeList();
  });
  document.querySelectorAll(".rv2-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rv2-filter").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      reviewState.filter = btn.dataset.reviewFilter;
      renderEpisodeList();
    });
  });

  // Actions
  reviewEls.runAnalyze.addEventListener("click", () => runAction("解析完成", () => analyzeEpisode()));
  reviewEls.createHighlight.addEventListener("click", createNewHighlight);
  reviewEls.showOverview.addEventListener("click", showHighlightOverview);
  reviewEls.generateContinuation.addEventListener("click", generateVideoBranches);
  reviewEls.runImport.addEventListener("click", importJson);

  // Editor
  reviewEls.editConfidence.addEventListener("input", () => {
    reviewEls.editConfidenceValue.textContent = `${Math.round(Number(reviewEls.editConfidence.value) * 100)}%`;
  });
  reviewEls.editForm.addEventListener("submit", saveHighlight);
  reviewEls.editCancel.addEventListener("click", closeInlineEditor);
  reviewEls.editDelete.addEventListener("click", () => {
    if (reviewState.editingHighlightId) deleteHighlight(reviewState.editingHighlightId);
  });

  // Overview modal
  reviewEls.overviewCloseBtn?.addEventListener("click", closeHighlightOverview);
  document.getElementById("close-overview")?.addEventListener("click", closeHighlightOverview);
  reviewEls.highlightOverviewModal?.addEventListener("click", (e) => {
    if (e.target.dataset.overviewClose) closeHighlightOverview();
  });
  reviewEls.overviewSelectAll?.addEventListener("click", selectAllHighlights);
  reviewEls.overviewPublishSelected?.addEventListener("click", publishSelected);
  reviewEls.overviewDeleteSelected?.addEventListener("click", deleteSelected);

  // AI tools
  reviewEls.fillExample?.addEventListener("click", () => {
    reviewEls.importJson.value = JSON.stringify({ highlights: [{ start_time: 10, end_time: 20, highlight_type: "悬念", emotion: "压迫感", intensity: 0.7, confidence: 0.85, summary: "示例高光摘要", interaction_suggestions: ["不对劲", "继续看"], reason: "模型判断理由", status: "draft" }] }, null, 2);
  });
  reviewEls.copyPrompt?.addEventListener("click", () => {
    navigator.clipboard?.writeText(reviewEls.promptMarkdown.value || "");
    setStatus("已复制 Prompt", "success");
  });
  reviewEls.refreshVgTasks?.addEventListener("click", refreshVideoGenTasks);

  // 初始加载已生成视频
  loadGeneratedVideos();

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === " ") { e.preventDefault(); reviewEls.video.paused ? reviewEls.video.play() : reviewEls.video.pause(); }
    if (e.key === "ArrowLeft") reviewEls.video.currentTime = Math.max(0, reviewEls.video.currentTime - 5);
    if (e.key === "ArrowRight") reviewEls.video.currentTime = Math.min(reviewEls.video.duration || 100, reviewEls.video.currentTime + 5);
    if (e.key === "j" || e.key === "J") reviewEls.jumpToPrev.click();
    if (e.key === "k" || e.key === "K") reviewEls.jumpToNext.click();
    if (e.key === "o" || e.key === "O") showHighlightOverview();
    if (e.key === "?") reviewEls.shortcutsHelpModal?.classList.toggle("hidden");
    if (e.key === "Escape") {
      closeHighlightOverview();
      reviewEls.shortcutsHelpModal?.classList.add("hidden");
    }
  });
}

// ========== Analyze Episode ==========

async function analyzeEpisode() {
  const episode = selectedEpisode();
  if (!episode) throw new Error("请先选择剧集");
  const startedAt = performance.now();
  const episodeName = `${episode.drama?.title || ""} ${episode.title || ""}`.trim();
  reviewEls.runAnalyze.disabled = true;
  reviewEls.runAnalyze.textContent = "解析中...";
  setAnalyzeProgress({
    title: "正在解析高光",
    detail: `正在将 ${episodeName || "当前剧集"} 发送给模型分析，请等待模型返回时间戳、类型、摘要和互动建议。`,
    meta: "阶段 1/3 · 调用模型",
    tone: "busy",
  });
  try {
    const result = await request("/api/model/analyze", {
      method: "POST",
      body: JSON.stringify({ episodeId: episode.id, replaceExisting: false }),
    });

    setAnalyzeProgress({
      title: "模型解析完成",
      detail: `模型已返回结果，正在写入高光数据并刷新审核时间轴。`,
      meta: `阶段 2/3 · 识别到 ${result.importedCount || 0} 条高光`,
      tone: "busy",
    });

    if (result.modelOutput) {
      reviewEls.importJson.value = JSON.stringify(result.modelOutput, null, 2);
    }
    await refreshCurrentEpisode();

    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    const count = result.importedCount || 0;
    setStatus(`已导入 ${count} 条高光`, count > 0 ? "success" : "idle");
    setAnalyzeProgress({
      title: count > 0 ? "解析成功" : "解析完成，但没有新增高光",
      detail: count > 0
        ? `已写入 ${count} 条高光。你可以在时间轴点击高光点预览并审核。`
        : "模型调用已完成，但本次没有导入新的高光。可检查 Prompt、模型返回或选择其他剧集重试。",
      meta: `阶段 3/3 · 耗时 ${elapsed}s · 剧集 ${episodeName || episode.id}`,
      tone: count > 0 ? "success" : "idle",
    });
  } catch (error) {
    setAnalyzeProgress({
      title: "解析失败",
      detail: error.message || "模型调用或结果写入失败，请检查模型配置、API Key、视频文件路径和后端日志。",
      meta: `剧集 ${episodeName || episode.id}`,
      tone: "error",
    });
    throw error;
  } finally {
    reviewEls.runAnalyze.disabled = false;
    reviewEls.runAnalyze.textContent = "解析高光";
  }
}

// ========== Bootstrap ==========

async function bootstrap() {
  setupEvents();
  setupTimelineClick();
  try {
    const [episodesResult, settingsResult, promptResult] = await Promise.all([
      request("/api/review/episodes"),
      request("/api/model/settings"),
      request("/api/model/prompt"),
    ]);
    reviewState.episodes = episodesResult.episodes;
    reviewState.hasApiKey = settingsResult.settings?.hasApiKey;
    reviewState.outputExample = promptResult.outputExample;
    reviewEls.promptMarkdown.value = promptResult.markdown || "";
    updateKpis();
    renderEpisodeList();
    const first = reviewState.episodes[0];
    if (first) await selectEpisode(first.id);
  } catch (e) {
    console.error("Bootstrap error:", e);
  }
}

// Expose functions for inline onclick handlers
window.toggleHighlightSelection = toggleHighlightSelection;
window.openInlineEditor = openInlineEditor;
window.deleteHighlight = deleteHighlight;

bootstrap();
