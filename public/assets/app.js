const state = {
  selectedFile: null,
  projectId: null,
  shareUrl: "",
  previewUrl: "",
  qrCodeDataUrl: "",
  uploading: false,
  mode: "desktop",
  previewKeyboardArmed: false,
  uploadProgress: 0,
  uploadProgressTimer: null
};

const els = {
  saveStatus: document.getElementById("saveStatus"),
  dropzone: document.getElementById("dropzone"),
  zipInput: document.getElementById("zipInput"),
  uploadBtn: document.getElementById("uploadBtn"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  expirationTimer: document.getElementById("expirationTimer"),
  openFullBtn: document.getElementById("openFullBtn"),
  playBtn: document.getElementById("playBtn"),
  shareUrlInput: document.getElementById("shareUrlInput"),
  qrImage: document.getElementById("qrImage"),
  qrBlock: document.getElementById("qrBlock"),
  previewFrame: document.getElementById("previewFrame"),
  previewEmpty: document.getElementById("previewEmpty"),
  frameLoading: document.getElementById("frameLoading"),
  iframeWrap: document.getElementById("iframeWrap"),
  iframeOuter: document.getElementById("iframeOuter"),
  modeToggle: document.getElementById("modeToggle"),
  resultSection: document.getElementById("resultSection"),
  fileBadge: document.getElementById("fileBadge"),
  fileBadgeName: document.getElementById("fileBadgeName"),
  fileBadgeSize: document.getElementById("fileBadgeSize"),
  toast: document.getElementById("toast"),
  uploadCard: document.getElementById("uploadCard"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadProgressFill: document.getElementById("uploadProgressFill"),
  uploadProgressPercent: document.getElementById("uploadProgressPercent"),
  uploadProgressText: document.getElementById("uploadProgressText")
};

// ── Helpers ──

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function setStatus(text, active = false) {
  if (!els.saveStatus) return;
  const dot = els.saveStatus.querySelector(".status-dot");
  const label = els.saveStatus.querySelector("#statusText");
  if (label) label.textContent = text;
  els.saveStatus.classList.toggle("active", active);
}

function setSelectedFile(file) {
  state.selectedFile = file;
  if (!file) {
    els.fileBadge?.classList.remove("visible");
    return;
  }
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  els.fileBadgeName.textContent = file.name;
  els.fileBadgeSize.textContent = `${sizeMb} MB`;
  els.fileBadge.classList.add("visible");
}

function isValidZip(file) {
  if (!file) return "Select a ZIP file first.";
  if (!(file.name || "").toLowerCase().endsWith(".zip")) return "Only .zip files are accepted.";
  if (file.size > 10 * 1024 * 1024) return "ZIP exceeds 10 MB limit.";
  return null;
}

// ── Preview Mode ──

function applyMode(mode) {
  if (!["desktop", "tablet", "phone"].includes(mode)) return;
  state.mode = mode;

  els.iframeWrap.classList.remove("desktop", "tablet", "phone");
  els.iframeWrap.classList.add(mode);

  const heights = { desktop: "460px", tablet: "580px", phone: "560px" };
  els.previewFrame.style.minHeight = heights[mode];

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  if (socket && state.projectId) {
    socket.emit("change-mode", { projectId: state.projectId, mode });
  }
}

function focusPreviewFrame() {
  try { els.previewFrame.focus(); } catch { /* ignore */ }
}

function handleKeyboardProxy(event) {
  if (!state.previewKeyboardArmed || !state.previewUrl) return;
  const tag = (document.activeElement?.tagName || "").toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
  focusPreviewFrame();
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
}

function loadPreviewFrame(url) {
  els.previewFrame.src = "about:blank";
  requestAnimationFrame(() => { els.previewFrame.src = url; });
}

function runtimeProjectUrl() {
  if (!state.previewUrl) return "";
  const base = state.previewUrl.replace(/\/$/, "");
  return `${base}/__runzip_project`;
}

// ── Upload Progress ──

function setUploadProgress(value, text = "Uploading…") {
  if (!els.uploadProgress) return;
  const v = Math.max(0, Math.min(100, value));
  state.uploadProgress = v;
  els.uploadProgress.classList.add("visible");
  els.uploadProgressFill.style.width = `${v}%`;
  els.uploadProgressPercent.textContent = `${Math.floor(v)}%`;
  els.uploadProgressText.textContent = text;
}

function clearUploadProgress() {
  clearInterval(state.uploadProgressTimer);
  state.uploadProgressTimer = null;
  state.uploadProgress = 0;
  if (!els.uploadProgress) return;
  els.uploadProgress.classList.remove("visible");
  els.uploadProgressFill.style.width = "0%";
  els.uploadProgressPercent.textContent = "0%";
}

function startFakeProgress() {
  clearInterval(state.uploadProgressTimer);
  state.uploadProgress = 0;
  setUploadProgress(3);
  state.uploadProgressTimer = setInterval(() => {
    if (!state.uploading) return;
    const p = state.uploadProgress;
    const step = p < 70 ? 6 : p < 90 ? 2 : 0.6;
    setUploadProgress(Math.min(94, p + step));
  }, 220);
}

// ── Upload Flow ──

function showPreview() {
  els.previewEmpty.style.display = "none";
  els.iframeOuter.classList.add("show");
  els.frameLoading.classList.add("visible");
}

function showResult(payload) {
  state.projectId = payload.project.id;
  state.shareUrl = payload.project.shareUrl;
  state.previewUrl = payload.project.previewUrl;
  state.qrCodeDataUrl = payload.qrCodeDataUrl;

  const step2 = document.getElementById("step2Section");
  const step3 = document.getElementById("step3Section");
  if (step2) step2.style.display = "block";
  if (step3) step3.style.display = "block";

  els.resultSection.classList.add("show");
  els.shareUrlInput.value = state.shareUrl;
  els.qrBlock.style.display = "flex";
  els.qrImage.src = state.qrCodeDataUrl;
  els.copyLinkBtn.disabled = false;
  els.openFullBtn.disabled = false;
  els.playBtn.disabled = false;

  loadPreviewFrame(`${runtimeProjectUrl()}?t=${Date.now()}`);
  setStatus("Hosted", true);
  initRoom(state.projectId);

  if (payload.project.expiresAt) {
    const expiresAt = new Date(payload.project.expiresAt).getTime();
    els.expirationTimer.style.display = "inline-block";
    
    // Clear any existing timer
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    
    state.countdownTimer = setInterval(() => {
      const now = Date.now();
      const diff = expiresAt - now;
      if (diff <= 0) {
        clearInterval(state.countdownTimer);
        els.expirationTimer.textContent = "Expired";
        els.expirationTimer.style.color = "#dc2626";
        els.expirationTimer.style.background = "#fee2e2";
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        els.expirationTimer.textContent = `${m}:${s.toString().padStart(2, "0")} remaining`;
      }
    }, 1000);
  }
}

async function uploadZip() {
  const err = isValidZip(state.selectedFile);
  if (err) { showToast(err); return; }
  if (state.uploading) return;

  let success = false;
  state.uploading = true;
  els.uploadBtn.disabled = true;
  els.uploadBtn.textContent = "Uploading…";
  els.copyLinkBtn.disabled = true;
  els.openFullBtn.disabled = true;
  els.playBtn.disabled = true;
  setStatus("Uploading…");

  showPreview();
  startFakeProgress();

  const formData = new FormData();
  formData.append("projectZip", state.selectedFile);

  try {
    const res = await fetch("/api/uploads/zip", { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Upload failed");

    setUploadProgress(100, "Done");
    showResult(body);
    success = true;
    showToast("Uploaded — share link is ready.");
    history.replaceState(null, "", `/preview/${state.projectId}`);
    setTimeout(() => clearUploadProgress(), 500);
  } catch (error) {
    setStatus("Upload failed");
    els.resultSection.classList.remove("show");
    clearUploadProgress();
    showToast(error.message || "Upload failed");
  } finally {
    state.uploading = false;
    clearInterval(state.uploadProgressTimer);
    els.uploadBtn.disabled = false;
    els.uploadBtn.textContent = success ? "Upload another" : "Upload ZIP";
  }
}

async function copyShareLink() {
  if (!state.shareUrl) { showToast("No link yet."); return; }
  try {
    await navigator.clipboard.writeText(state.shareUrl);
    showToast("Link copied!");
  } catch { showToast("Clipboard access denied."); }
}

function openFullProject() {
  const url = runtimeProjectUrl();
  if (!url) { showToast("No project available."); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

function playInNewTab() {
  const url = runtimeProjectUrl();
  if (!url) { showToast("No project uploaded."); return; }
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) showToast("Popup blocked — allow popups for this site.");
}

// ── Boot from URL ──

function bootFromPreviewUrl() {
  const match = window.location.pathname.match(/^\/preview\/([A-Za-z0-9_-]+)$/);
  if (!match) return;

  const projectId = match[1];
  state.projectId = projectId;
  state.previewUrl = `/p/${projectId}/`;
  state.shareUrl = `${window.location.origin}/p/${projectId}/`;

  const step2 = document.getElementById("step2Section");
  const step3 = document.getElementById("step3Section");
  if (step2) step2.style.display = "block";
  if (step3) step3.style.display = "block";

  els.resultSection.classList.add("show");
  els.shareUrlInput.value = state.shareUrl;
  els.qrBlock.style.display = "flex";
  els.copyLinkBtn.disabled = false;
  els.openFullBtn.disabled = false;
  els.playBtn.disabled = false;
  els.uploadBtn.textContent = "Upload another";

  showPreview();
  loadPreviewFrame(`${runtimeProjectUrl()}?t=${Date.now()}`);
  setStatus("Preview loaded", true);
  initRoom(state.projectId);
}

// ── Event Wiring ──

function wireDropzone() {
  const dz = els.dropzone;
  dz.addEventListener("dragenter", (e) => { e.preventDefault(); dz.classList.add("drag-over"); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag-over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag-over");
    const [f] = e.dataTransfer?.files || [];
    if (f) { setSelectedFile(f); uploadZip(); }
  });
}

function wireEvents() {
  els.zipInput.addEventListener("change", (e) => {
    const [f] = e.target.files || [];
    if (f) { setSelectedFile(f); uploadZip(); }
  });

  els.uploadBtn.addEventListener("click", () => uploadZip());
  els.copyLinkBtn.addEventListener("click", () => copyShareLink());
  els.openFullBtn.addEventListener("click", openFullProject);
  els.playBtn.addEventListener("click", playInNewTab);

  els.modeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (btn) applyMode(btn.dataset.mode);
  });

  els.previewFrame.addEventListener("pointerdown", () => {
    state.previewKeyboardArmed = true;
    focusPreviewFrame();
  });
  els.previewFrame.addEventListener("load", () => {
    els.frameLoading.classList.remove("visible");
    state.previewKeyboardArmed = true;
    focusPreviewFrame();
  });
  els.previewFrame.addEventListener("error", () => {
    els.frameLoading.classList.remove("visible");
  });

  document.addEventListener("keydown", handleKeyboardProxy);
  document.addEventListener("keyup", handleKeyboardProxy);

  wireDropzone();
}

// ── Socket.IO ──

let socket = null;

function updateViewerCount(count) {
  const el = document.getElementById("viewerCount");
  const txt = document.getElementById("viewerText");
  if (!el || !txt) return;
  txt.textContent = count === 1 ? "1 viewer" : `${count} viewers`;
  el.style.display = "flex";
}

function initRoom(projectId) {
  if (socket) socket.disconnect();
  socket = io();
  socket.emit("join-room", { projectId });

  socket.on("room-state", ({ mode, viewers }) => {
    applyMode(mode);
    updateViewerCount(viewers);
  });
  socket.on("mode-changed", ({ mode }) => applyMode(mode));
  socket.on("viewer-count", ({ viewers }) => updateViewerCount(viewers));
}

// ── Init ──

applyMode("desktop");
wireEvents();
bootFromPreviewUrl();
