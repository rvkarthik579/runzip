import { createServer } from 'http';
import { Server } from 'socket.io';
import path from "node:path";
import fs from "node:fs";
import express from "express";
import QRCode from "qrcode";
import projectsRouter from "./routes/projects.js";
import uploadsRouter from "./routes/uploads.js";
import { getProjectById } from "./db/projectsRepo.js";
import { getHostedProjectById, removeHostedProjectsByIds } from "./db/hostedProjectsRepo.js";
import { getBaseUrl } from "./utils/requestUtils.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = "0.0.0.0";
const projectsRoot = path.join(process.cwd(), "projects");
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const PROJECT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(projectsRoot, { recursive: true });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "runzip" });
});

app.use("/api/projects", projectsRouter);
app.use("/api/uploads", uploadsRouter);

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

app.use("/p/:projectId", (req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  next();
});

app.get("/p/:projectId/:shareToken([A-Za-z0-9_-]{20,})", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

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

function listHtmlFiles(rootDir) {
  const results = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function detectEntryFromFilesystem(projectDir) {
  const htmlFiles = listHtmlFiles(projectDir);
  if (htmlFiles.length === 0) {
    return null;
  }

  const relPaths = htmlFiles.map((filePath) => path.relative(projectDir, filePath).replace(/\\/g, "/"));
  const relSet = new Set(relPaths.map((item) => item.toLowerCase()));
  const priority = [
    "index.html",
    "dist/index.html",
    "build/index.html",
    "public/index.html",
    "src/index.html"
  ];

  for (const candidate of priority) {
    if (relSet.has(candidate)) {
      return path.join(projectDir, candidate);
    }
  }

  // Fallback: first discovered HTML file.
  return htmlFiles.sort((a, b) => a.localeCompare(b))[0];
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
      return {
        projectDir,
        hostedRoot,
        indexPath
      };
    }
  }

  const detectedEntry = detectEntryFromFilesystem(projectDir);
  if (!detectedEntry) {
    return null;
  }

  return {
    projectDir,
    hostedRoot: path.dirname(detectedEntry),
    indexPath: detectedEntry
  };
}

function renderHostedErrorPage(message) {
  const safeMessage = String(message || "Project not found.").replace(/[<>]/g, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RunZip - Project Unavailable</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 2rem; background: #f8fafc; color: #111827; }
      .card { max-width: 720px; margin: 3rem auto; background: #fff; border: 1px solid #d1d5db; border-radius: 12px; padding: 1.25rem 1.4rem; box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 0.7rem; font-size: 1.25rem; }
      p { margin: 0.2rem 0; line-height: 1.5; }
      a { color: #0e7490; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Project not found</h1>
      <p>${safeMessage}</p>
      <p>The project may have expired or been deleted. Please upload the ZIP again.</p>
      <p><a href="/">Go back to RunZip</a></p>
    </div>
  </body>
</html>`;
}

function isAllowedAssetPath(assetPath) {
  const normalized = path.posix.normalize((assetPath || "").replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized === "..") {
    return false;
  }

  return !normalized.startsWith("/") && !normalized.startsWith("../") && !normalized.includes("/../");
}

function injectBaseHrefIfNeeded(html, baseHref = "./") {
  if (/<base\s/i.test(html)) {
    return html;
  }

  if (/<head(.*?)>/i.test(html)) {
    return html.replace(/<head(.*?)>/i, `<head$1><base href="${baseHref}">`);
  }

  return `<head><base href="${baseHref}"></head>${html}`;
}

function rewriteRootAssetPaths(html) {
  const assetTags = ["script", "img", "source", "video", "audio", "iframe"];
  const rewrittenSrc = html.replace(
    new RegExp(`<(${assetTags.join("|")})\\b([^>]*?)\\s(src)=("|')\\/(?!\/)([^"']*)(\\4)`, "gi"),
    (_full, tagName, before, attr, quote, value, closingQuote) => {
      return `<${tagName}${before} ${attr}=${quote}./${value}${closingQuote}`;
    }
  );

  const rewrittenLink = rewrittenSrc.replace(
    /<(link)\b([^>]*?)\s(href)=("|')\/(?!\/)([^"']*)(\4)/gi,
    (_full, tagName, before, attr, quote, value, closingQuote) => {
      const rel = /\brel\s*=\s*("|')(stylesheet|icon|preload|modulepreload)\1/i;
      if (!rel.test(before)) {
        return `<${tagName}${before} ${attr}=${quote}/${value}${closingQuote}`;
      }

      return `<${tagName}${before} ${attr}=${quote}./${value}${closingQuote}`;
    }
  );

  return rewrittenLink;
}

function transformHostedHtml(html, baseHref = "./") {
  const withBase = injectBaseHrefIfNeeded(html, baseHref);
  return rewriteRootAssetPaths(withBase);
}

function renderShareLandingPage({ projectId, shareUrl, qrCodeDataUrl }) {
  const runtimeUrl = `/p/${projectId}/__runzip_project`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RunZip Share</title>
    <style>
      :root {
        --bg: #08090d;
        --panel: #0f1118;
        --line: #252938;
        --text: #f3f4f6;
        --muted: #96a1b9;
        --accent: #c8ff00;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Segoe UI, Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 20% 0%, rgba(200, 255, 0, 0.12), transparent 40%),
          radial-gradient(circle at 100% 100%, rgba(100, 200, 255, 0.1), transparent 35%),
          var(--bg);
      }
      .shell {
        max-width: 1100px;
        margin: 0 auto;
        padding: 28px 18px 42px;
        display: grid;
        gap: 16px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .brand-mark {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: var(--accent);
        color: #0a0d00;
        font-weight: 900;
      }
      .card {
        background: rgba(15, 17, 24, 0.9);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 20px 55px rgba(0, 0, 0, 0.4);
      }
      .center {
        display: grid;
        justify-items: center;
        gap: 14px;
      }
      .center h1 {
        margin: 0;
        font-size: 26px;
      }
      .center p {
        margin: 0;
        color: var(--muted);
      }
      .qr {
        width: min(68vw, 300px);
        max-width: 300px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: #fff;
        padding: 8px;
      }
      .share-url {
        width: min(90%, 720px);
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: #0b0d13;
        color: var(--text);
        font-family: Consolas, monospace;
        font-size: 13px;
      }
      .open-btn {
        margin-top: 4px;
        border: 0;
        border-radius: 12px;
        padding: 12px 20px;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        background: var(--accent);
        color: #111827;
      }
      .viewer {
        display: none;
        width: 100%;
        min-height: 70vh;
        border: 1px solid var(--line);
        border-radius: 16px;
        overflow: hidden;
        margin-top: 4px;
      }
      .viewer.show { display: block; }
      .viewer iframe {
        width: 100%;
        height: 70vh;
        border: none;
        background: #fff;
      }
      .badge {
        justify-self: center;
        margin-top: 2px;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="brand">
        <div class="brand-mark">R</div>
        <div>RunZip</div>
      </div>

      <section class="card center">
        <h1>Shared with RunZip</h1>
        <p>Scan the QR code or open the project below.</p>
        <img class="qr" src="${qrCodeDataUrl}" alt="Share QR code" />
        <input class="share-url" type="text" readonly value="${shareUrl}" />
        <button id="openProjectBtn" class="open-btn">Open Project</button>
      </section>

      <section id="viewer" class="viewer">
        <iframe id="projectFrame" title="Hosted project"></iframe>
      </section>

      <div class="badge">Built with RunZip</div>
    </main>

    <script>
      const openBtn = document.getElementById("openProjectBtn");
      const viewer = document.getElementById("viewer");
      const frame = document.getElementById("projectFrame");
      const runtimeUrl = "${runtimeUrl}";

      openBtn.addEventListener("click", () => {
        viewer.classList.add("show");
        frame.src = runtimeUrl + "?t=" + Date.now();
        openBtn.textContent = "Project Opened";
        openBtn.disabled = true;
      });
    </script>
  </body>
</html>`;
}

function cleanupOldHostedProjects() {
  const now = Date.now();
  const removedIds = [];

  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectId = entry.name;
    const projectPath = path.join(projectsRoot, projectId);
    const stat = fs.statSync(projectPath);
    const ageMs = now - stat.mtimeMs;

    if (ageMs > PROJECT_MAX_AGE_MS) {
      fs.rmSync(projectPath, { recursive: true, force: true });
      removedIds.push(projectId);
    }
  }

  if (removedIds.length > 0) {
    const metadataRemoved = removeHostedProjectsByIds(removedIds);
    console.log(
      `Cleanup removed ${removedIds.length} hosted project folders and ${metadataRemoved} metadata records.`
    );
  }
}

app.get("/p/:projectId", (req, res) => {
  const projectId = (req.params.projectId || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const hasTrailingSlash = req.path.endsWith("/");
  if (!hasTrailingSlash) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(308, `/p/${projectId}/${query}`);
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res
      .status(404)
      .type("html")
      .send(
        renderHostedErrorPage(
          "Project not found. The project may have expired or been deleted. Please upload the ZIP again."
        )
      );
  }

  const shareUrl = `${getBaseUrl(req)}/p/${projectId}/`;

  QRCode.toDataURL(shareUrl, { width: 280, margin: 1 })
    .then((qrCodeDataUrl) => {
      const landing = renderShareLandingPage({
        projectId,
        shareUrl,
        qrCodeDataUrl
      });

      res.removeHeader("Content-Security-Policy");
      res.removeHeader("X-Frame-Options");
      res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
      res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");

      res.type("html").send(landing);
    })
    .catch(() => {
      res
        .status(500)
        .type("html")
        .send(renderHostedErrorPage("Unable to generate share preview right now. Please try again."));
    });

  return;
});

app.get("/p/:projectId/__runzip_project", (req, res) => {
  const projectId = (req.params.projectId || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res
      .status(404)
      .type("html")
      .send(
        renderHostedErrorPage(
          "Project not found. The project may have expired or been deleted. Please upload the ZIP again."
        )
      );
  }

  const html = fs.readFileSync(hostedEntry.indexPath, "utf8");
  const withBase = transformHostedHtml(html, `/p/${projectId}/`);

  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");

  return res.type("html").send(withBase);
});

app.use("/p/:projectId", (req, res, next) => {
  const projectId = (req.params.projectId || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res
      .status(404)
      .type("html")
      .send(
        renderHostedErrorPage(
          "Project not found. The project may have expired or been deleted. Please upload the ZIP again."
        )
      );
  }

  const staticMiddleware = express.static(hostedEntry.hostedRoot, {
    index: false,
    fallthrough: true
  });

  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");

  return staticMiddleware(req, res, next);
});

app.get("/p/:projectId/*", (req, res) => {
  const projectId = (req.params.projectId || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid project id."));
  }

  const assetPath = req.params[0] || "";
  if (!isAllowedAssetPath(assetPath)) {
    return res.status(400).type("html").send(renderHostedErrorPage("Invalid asset path."));
  }

  const hostedEntry = resolveHostedEntry(projectId);
  if (!hostedEntry) {
    return res
      .status(404)
      .type("html")
      .send(
        renderHostedErrorPage(
          "Project not found. The project may have expired or been deleted. Please upload the ZIP again."
        )
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
    if (!fs.existsSync(indexPath)) {
      return res.status(404).type("html").send(renderHostedErrorPage("Requested asset not found."));
    }

    const html = fs.readFileSync(indexPath, "utf8");
    return res.type("html").send(transformHostedHtml(html));
  }

  if (resolvedPath.toLowerCase().endsWith(".html")) {
    const html = fs.readFileSync(resolvedPath, "utf8");
    return res.type("html").send(transformHostedHtml(html));
  }

  return res.sendFile(resolvedPath);
});

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

cleanupOldHostedProjects();
setInterval(cleanupOldHostedProjects, CLEANUP_INTERVAL_MS);

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
  console.log("RunZip server started successfully");
  console.log(`RunZip server running at http://localhost:${PORT}`);
  console.log(`RunZip listening on all interfaces at http://0.0.0.0:${PORT}`);
});

server.on("error", (error) => {
  console.error("RunZip failed to start:", error.message);
});
