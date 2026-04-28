import { createServer } from 'http';
import { Server } from 'socket.io';
import path from "node:path";
import fs from "node:fs";
import express from "express";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import projectsRouter from "./routes/projects.js";
import uploadsRouter from "./routes/uploads.js";
import { getProjectById } from "./db/projectsRepo.js";
import { getHostedProjectById } from "./db/hostedProjectsRepo.js";
import { getBaseUrl } from "./utils/requestUtils.js";
import { renderShareLandingPage, renderHostedErrorPage } from "./utils/templates.js";
import { transformHostedHtml } from "./utils/htmlParser.js";
import { detectEntryHtml } from "./utils/fileUtils.js";
import { startCronJobs } from "./utils/cronTasks.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.ALLOW_LAN_SHARING === 'true' ? "0.0.0.0" : "127.0.0.1";
const projectsRoot = path.join(process.cwd(), "projects");

fs.mkdirSync(projectsRoot, { recursive: true });

// --- Middleware ---

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads. Please wait 15 minutes before trying again." }
});

// --- API Routes ---

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "runzip" });
});

app.use("/api/projects", projectsRouter);
app.use("/api/uploads", uploadLimiter, uploadsRouter);

app.get("/api/share/:projectId/:shareToken", (req, res) => {
  const project = getProjectById(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  if (project.shareToken !== req.params.shareToken) {
    return res.status(403).json({ error: "Invalid share token" });
  }

  return res.json({ project });
});

// --- Hosted Project Helpers ---

function resolveHostedRoot(projectId) {
  const projectDir = path.join(projectsRoot, projectId);
  if (!fs.existsSync(projectDir)) {
    return null;
  }

  const hosted = getHostedProjectById(projectId);

  if (!hosted) {
    const fallback = path.join(projectDir, "index.html");
    if (!fs.existsSync(fallback)) {
      return null;
    }
    return projectDir;
  }

  const root = path.resolve(projectDir, hosted.entryDir || ".");
  const expectedRootPrefix = `${path.resolve(projectDir)}${path.sep}`;
  if (!root.startsWith(expectedRootPrefix) && root !== path.resolve(projectDir)) {
    return null;
  }

  return root;
}

function resolveHostedEntry(projectId) {
  const projectDir = path.join(projectsRoot, projectId);
  if (!fs.existsSync(projectDir)) {
    return null;
  }

  const hostedRoot = resolveHostedRoot(projectId);
  if (hostedRoot) {
    const indexPath = path.join(hostedRoot, "index.html");
    if (fs.existsSync(indexPath)) {
      return { projectDir, hostedRoot, indexPath };
    }
  }

  const detectedEntry = detectEntryHtml(projectDir);
  if (!detectedEntry) {
    return null;
  }

  return {
    projectDir,
    hostedRoot: path.dirname(detectedEntry),
    indexPath: detectedEntry
  };
}

function isAllowedAssetPath(assetPath) {
  const normalized = path.posix.normalize((assetPath || "").replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized === "..") {
    return false;
  }
  return !normalized.startsWith("/") && !normalized.startsWith("../") && !normalized.includes("/../");
}

function isValidProjectId(id) {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// --- Hosted Project CSP headers ---

app.use("/p/:projectId", (_req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  next();
});

// --- Share token route (serves the SPA for authenticated share links) ---

app.get("/p/:projectId/:shareToken([A-Za-z0-9_-]{20,})", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// --- Share landing page (QR + open button) ---

app.get("/p/:projectId", (req, res) => {
  const projectId = (req.params.projectId || "").trim();
  if (!isValidProjectId(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  // Redirect to trailing slash for consistent URL base resolution
  if (!req.path.endsWith("/")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(308, `/p/${projectId}/${query}`);
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res.status(404).type("html").send(
      renderHostedErrorPage("Project not found. It may have expired or been deleted.")
    );
  }

  const shareUrl = `${getBaseUrl(req)}/p/${projectId}/`;

  QRCode.toDataURL(shareUrl, { width: 280, margin: 1 })
    .then((qrCodeDataUrl) => {
      res.type("html").send(renderShareLandingPage({ projectId, shareUrl, qrCodeDataUrl }));
    })
    .catch(() => {
      res.status(500).type("html").send(
        renderHostedErrorPage("Unable to generate share preview right now.")
      );
    });

  return;
});

// --- Hosted project HTML (served inside iframe) ---

app.get("/p/:projectId/__runzip_project", (req, res) => {
  const projectId = (req.params.projectId || "").trim();
  if (!isValidProjectId(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res.status(404).type("html").send(
      renderHostedErrorPage("Project not found. It may have expired or been deleted.")
    );
  }

  const html = readFileSafe(hostedEntry.indexPath);
  if (html === null) {
    return res.status(500).type("html").send(
      renderHostedErrorPage("Failed to read entry file.")
    );
  }

  return res.type("html").send(transformHostedHtml(html, `/p/${projectId}/`));
});

// --- Static assets for hosted projects ---

app.use("/p/:projectId", (req, res, next) => {
  const projectId = (req.params.projectId || "").trim();
  if (!isValidProjectId(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res.status(404).type("html").send(
      renderHostedErrorPage("Project not found. It may have expired or been deleted.")
    );
  }

  const staticMiddleware = express.static(hostedEntry.hostedRoot, {
    index: false,
    fallthrough: true
  });

  return staticMiddleware(req, res, next);
});

// --- Catch-all for hosted project sub-paths ---

app.get("/p/:projectId/*", (req, res) => {
  const projectId = (req.params.projectId || "").trim();
  if (!isValidProjectId(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const assetPath = req.params[0] || "";
  if (!isAllowedAssetPath(assetPath)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid asset path."));
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res.status(404).type("html").send(
      renderHostedErrorPage("Project not found. It may have expired or been deleted.")
    );
  }

  const resolvedPath = path.resolve(hostedEntry.hostedRoot, assetPath);
  const rootPrefix = `${path.resolve(hostedEntry.hostedRoot)}${path.sep}`;
  if (!resolvedPath.startsWith(rootPrefix) && resolvedPath !== path.resolve(hostedEntry.hostedRoot)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid asset path."));
  }

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).type("html").send(renderHostedErrorPage("Requested asset not found."));
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    const indexPath = path.join(resolvedPath, "index.html");
    const html = readFileSafe(indexPath);
    if (html === null) {
      return res.status(404).type("html").send(renderHostedErrorPage("Requested asset not found."));
    }
    return res.type("html").send(transformHostedHtml(html));
  }

  if (resolvedPath.toLowerCase().endsWith(".html")) {
    const html = readFileSafe(resolvedPath);
    if (html === null) {
      return res.status(500).type("html").send(renderHostedErrorPage("Failed to read file."));
    }
    return res.type("html").send(transformHostedHtml(html));
  }

  return res.sendFile(resolvedPath);
});

// --- Page routes ---

app.get("/preview/:projectId", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.get("/about", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "about.html"));
});

app.get("/how-it-works", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "how-it-works.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// --- Global error handler ---

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message || err);
  res.status(500).json({ error: "Internal server error." });
});

// --- Startup ---

startCronJobs(projectsRoot);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ projectId }) => {
    currentRoom = projectId;
    socket.join(projectId);
    if (!rooms.has(projectId)) rooms.set(projectId, { mode: 'desktop', viewers: 0 });
    const room = rooms.get(projectId);
    room.viewers++;
    socket.emit('room-state', { mode: room.mode, viewers: room.viewers });
    socket.to(projectId).emit('viewer-count', { viewers: room.viewers });
  });

  socket.on('change-mode', ({ projectId, mode }) => {
    if (!rooms.has(projectId)) return;
    if (rooms.get(projectId).mode === mode) return;
    rooms.get(projectId).mode = mode;
    io.to(projectId).emit('mode-changed', { mode });
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !rooms.has(currentRoom)) return;
    const room = rooms.get(currentRoom);
    room.viewers = Math.max(0, room.viewers - 1);
    if (room.viewers === 0) rooms.delete(currentRoom);
    else io.to(currentRoom).emit('viewer-count', { viewers: room.viewers });
  });
});

const server = httpServer.listen(PORT, HOST, () => {
  console.log(`RunZip running at http://${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.log("LAN sharing enabled — accessible from other devices on the network.");
  }
});

server.on("error", (error) => {
  console.error("RunZip failed to start:", error.message);
});
