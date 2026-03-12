const state = {
  selectedFile: null,
  projectId: null,
  shareUrl: "",
  previewUrl: "",
  qrCodeDataUrl: "",
  uploading: false,
  mode: "desktop",
  previewKeyboardArmed: false
};

const els = {
  saveStatus:     document.getElementById("saveStatus"),
  dropzone:       document.getElementById("dropzone"),
  zipInput:       document.getElementById("zipInput"),
  uploadBtn:      document.getElementById("uploadBtn"),
  copyLinkBtn:    document.getElementById("copyLinkBtn"),
  openFullBtn:    document.getElementById("openFullBtn"),
  playBtn:        document.getElementById("playBtn"),
  shareUrlInput:  document.getElementById("shareUrlInput"),
  projectIdValue: document.getElementById("projectIdValue"),
  metaStatus:     document.getElementById("metaStatus"),
  qrImage:        document.getElementById("qrImage"),
  qrBlock:        document.getElementById("qrBlock"),
  previewFrame:   document.getElementById("previewFrame"),
  previewStage:   document.getElementById("previewStage"),
  previewEmpty:   document.getElementById("previewEmpty"),
  frameLoading:   document.getElementById("frameLoading"),
  iframeWrap:     document.getElementById("iframeWrap"),
  iframeOuter:    document.getElementById("iframeOuter"),
  modeToggle:     document.getElementById("modeToggle"),
  metaHint:       document.getElementById("metaHint"),
  resultSection:  document.getElementById("resultSection"),
  fileBadge:      document.getElementById("fileBadge"),
  fileBadgeName:  document.getElementById("fileBadgeName"),
  fileBadgeSize:  document.getElementById("fileBadgeSize"),
  toast:          document.getElementById("toast")
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function setStatus(text, active = false) {
  els.saveStatus.innerHTML = `<div class="status-dot"></div>${text}`;
  els.saveStatus.classList.toggle("active", active);
}

function setSelectedFile(file) {
  state.selectedFile = file;
  if (!file) {
    document.querySelector('.upload-card')?.classList.remove('file-ready');
    els.fileBadge.classList.remove("visible");
    return;
  }
  document.querySelector('.upload-card')?.classList.add('file-ready');
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  els.fileBadgeName.textContent = file.name;
  els.fileBadgeSize.textContent = `${sizeMb} MB`;
  els.fileBadge.classList.add("visible");
}

function isValidZip(file) {
  if (!file) return "Select a ZIP file first.";
  if (!(file.name || "").toLowerCase().endsWith(".zip")) return "Only .zip files are accepted.";
  if (file.size > 10 * 1024 * 1024) return "ZIP exceeds 10MB size limit.";
  return null;
}

function applyMode(mode) {
  if (!["desktop", "tablet", "phone"].includes(mode)) return;
  state.mode = mode;
  els.iframeWrap.classList.remove("desktop", "tablet", "phone");
  els.iframeWrap.classList.add(mode);
  if (mode === "tablet") {
    els.previewFrame.style.minHeight = "580px";
  } else if (mode === "phone") {
    els.previewFrame.style.minHeight = "560px";
  } else {
    els.previewFrame.style.minHeight = "460px";
  }
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  if (socket && state.projectId) {
    socket.emit('change-mode', { projectId: state.projectId, mode });
  }
}

function focusPreviewFrame() {
  try { els.previewFrame.focus(); } catch { /* ignore */ }
}

function proxyKeyboardEvent(type, event) {
  if (!state.previewKeyboardArmed || !state.previewUrl) return;
  const activeTag = (document.activeElement?.tagName || "").toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(activeTag)) return;
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
  if (!state.previewUrl) {
    return "";
  }

  const base = state.previewUrl.endsWith("/") ? state.previewUrl.slice(0, -1) : state.previewUrl;
  return `${base}/__runzip_project`;
}

function showPreview() {
  els.previewEmpty.style.display = "none";
  els.iframeOuter.style.display = "flex";
  els.frameLoading.classList.add("visible");
}

function showUploadPreview() {
  els.resultSection.classList.add("show");
  els.projectIdValue.classList.add("loading");
  els.projectIdValue.textContent = "Loading…";
  els.metaStatus.textContent = "Uploading…";
  els.metaStatus.classList.add("loading");
  els.qrBlock.style.display = "flex";
  els.qrImage.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23f3f4f6' width='100' height='100'/%3E%3C/svg%3E";
  showPreview();
}

function paintUploadResult(payload) {
  state.projectId = payload.project.id;
  state.shareUrl = payload.project.shareUrl;
  state.previewUrl = payload.project.previewUrl;
  state.qrCodeDataUrl = payload.qrCodeDataUrl;

  // Update UI with fade-in effect
  els.projectIdValue.classList.remove("loading");
  els.projectIdValue.textContent = state.projectId;
  els.metaStatus.classList.remove("loading");
  els.metaStatus.textContent = "Hosted ✓";
  els.shareUrlInput.value = state.shareUrl;
  els.qrImage.src = state.qrCodeDataUrl;

  // Enable buttons
  els.copyLinkBtn.disabled = false;
  els.openFullBtn.disabled = false;
  els.playBtn.disabled = false;

  // Load preview
  loadPreviewFrame(`${runtimeProjectUrl()}?t=${Date.now()}`);

  setStatus("Hosted", true);
  initRoom(state.projectId);
}

function bootFromPreviewUrl() {
  const match = window.location.pathname.match(/^\/preview\/([A-Za-z0-9_-]+)$/);
  if (!match) return;

  const projectId = match[1];
  state.projectId = projectId;
  state.previewUrl = `/p/${projectId}/`;
  state.shareUrl = `${window.location.origin}/p/${projectId}/`;

  els.projectIdValue.textContent = projectId;
  els.metaStatus.textContent = "Loaded";
  els.shareUrlInput.value = state.shareUrl;
  els.qrBlock.style.display = "flex";
  els.resultSection.classList.add("show");
  els.copyLinkBtn.disabled = false;
  els.openFullBtn.disabled = false;
  els.playBtn.disabled = false;

  showPreview();
  loadPreviewFrame(`${runtimeProjectUrl()}?t=${Date.now()}`);
  setStatus("Preview loaded", true);
  if (state.projectId) initRoom(state.projectId);
}

function openFullProject() {
  const runtimeUrl = runtimeProjectUrl();
  if (!runtimeUrl) { showToast("No hosted project available yet."); return; }
  window.open(runtimeUrl, "_blank", "noopener,noreferrer");
}

function playInNewTab() {
  const runtimeUrl = runtimeProjectUrl();
  if (!runtimeUrl) { showToast("No project uploaded yet."); return; }
  const win = window.open(runtimeUrl, "_blank", "noopener,noreferrer");
  if (!win) {
    showToast("Popup blocked — allow popups for this site.");
  }
}

async function uploadZip() {
  const err = isValidZip(state.selectedFile);
  if (err) { showToast(err); return; }
  if (state.uploading) return;

  state.uploading = true;
  els.uploadBtn.disabled = true;
  els.uploadBtn.classList.add("loading");
  els.uploadBtn.textContent = "Uploading…";
  els.copyLinkBtn.disabled = true;
  els.openFullBtn.disabled = true;
  els.playBtn.disabled = true;
  setStatus("Uploading…");

  // Show preview immediately for instant feel
  showUploadPreview();

  const formData = new FormData();
  formData.append("projectZip", state.selectedFile);

  try {
    const response = await fetch("/api/uploads/zip", { method: "POST", body: formData });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Upload failed");
    paintUploadResult(body);
    showToast("Uploaded! Share link is ready.");
    history.replaceState(null, "", `/preview/${state.projectId}`);
  } catch (error) {
    setStatus("Upload failed");
    els.resultSection.classList.remove("show");
    showToast(error.message || "Upload failed");
  } finally {
    state.uploading = false;
    els.uploadBtn.disabled = false;
    els.uploadBtn.classList.remove("loading");
    els.uploadBtn.textContent = "Upload ZIP";
  }
}

async function copyShareLink() {
  if (!state.shareUrl) { showToast("No share link yet."); return; }
  try {
    await navigator.clipboard.writeText(state.shareUrl);
    showToast("Link copied!");
  } catch {
    showToast("Clipboard access denied.");
  }
}

function wireDropzone() {
  const on = () => els.dropzone.classList.add("drag-over");
  const off = () => els.dropzone.classList.remove("drag-over");

  els.dropzone.addEventListener("dragenter", (e) => { e.preventDefault(); on(); });
  els.dropzone.addEventListener("dragover",  (e) => { e.preventDefault(); on(); });
  els.dropzone.addEventListener("dragleave", off);
  els.dropzone.addEventListener("drop", (e) => {
    e.preventDefault(); off();
    const [file] = e.dataTransfer?.files || [];
    setSelectedFile(file || null);
  });
}

function wireEvents() {
  els.zipInput.addEventListener("change", (e) => {
    const [file] = e.target.files || [];
    setSelectedFile(file || null);
  });

  els.uploadBtn.addEventListener("click", () => uploadZip().catch((e) => showToast(e.message)));
  els.copyLinkBtn.addEventListener("click", () => copyShareLink().catch(() => showToast("Copy failed")));
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

  document.addEventListener("keydown", (e) => proxyKeyboardEvent("keydown", e));
  document.addEventListener("keyup",   (e) => proxyKeyboardEvent("keyup", e));

  wireDropzone();
}

function boot() {
  applyMode("desktop");
  wireEvents();
  bootFromPreviewUrl();
}

// ── ROOMS ──
let socket = null;

function updateViewerCount(count) {
  const el = document.getElementById('viewerCount');
  const txt = document.getElementById('viewerText');
  if (!el || !txt) return;
  txt.textContent = count === 1 ? '1 viewer' : `${count} viewers`;
  el.style.display = 'flex';
}

function initRoom(projectId) {
  if (socket) socket.disconnect();
  socket = io();
  socket.emit('join-room', { projectId });
  socket.on('room-state', ({ mode, viewers }) => {
    applyMode(mode);
    updateViewerCount(viewers);
  });
  socket.on('mode-changed', ({ mode }) => {
    applyMode(mode);
  });
  socket.on('viewer-count', ({ viewers }) => {
    updateViewerCount(viewers);
  });
}

boot();
