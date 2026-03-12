import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import unzipper from "unzipper";
import QRCode from "qrcode";
import { getBaseUrl } from "../utils/requestUtils.js";
import { saveHostedProject } from "../db/hostedProjectsRepo.js";

const uploadsRouter = Router();

const workspaceRoot = process.cwd();
const uploadsRoot = path.join(workspaceRoot, "uploads");
const projectsRoot = path.join(workspaceRoot, "projects");

for (const dir of [uploadsRoot, projectsRoot]) {
  fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  dest: uploadsRoot,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const looksZipMime = (file.mimetype || "").toLowerCase().includes("zip");
    if (ext !== ".zip" && !looksZipMime) {
      return callback(new Error("Only ZIP files are allowed."));
    }
    return callback(null, true);
  }
});

function ensureInsideProjectRoot(projectDir, relativePath) {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Unsafe path in ZIP: ${relativePath}`);
  }

  const targetPath = path.resolve(projectDir, normalized);
  const allowedRoot = `${path.resolve(projectDir)}${path.sep}`;
  if (!targetPath.startsWith(allowedRoot) && targetPath !== path.resolve(projectDir)) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }

  return targetPath;
}

async function extractZipSafely(zipPath, projectDir) {
  const directory = await unzipper.Open.file(zipPath);

  for (const entry of directory.files) {
    const destinationPath = ensureInsideProjectRoot(projectDir, entry.path);

    if (entry.type === "Directory") {
      fs.mkdirSync(destinationPath, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    await new Promise((resolve, reject) => {
      entry
        .stream()
        .pipe(fs.createWriteStream(destinationPath))
        .on("finish", resolve)
        .on("error", reject);
    });
  }
}

function listHtmlFiles(projectDir) {
  const htmlFiles = [];
  const queue = [projectDir];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        htmlFiles.push(entryPath);
      }
    }
  }

  return htmlFiles;
}

function inferSearchRoot(projectDir) {
  let current = projectDir;

  // Many ZIPs include one wrapper folder; unwrap directory-only chains.
  while (true) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const dirs = entries.filter((entry) => entry.isDirectory());

    if (files.length > 0 || dirs.length !== 1) {
      return current;
    }

    current = path.join(current, dirs[0].name);
  }
}

function detectEntryHtml(projectDir) {
  const searchRoot = inferSearchRoot(projectDir);
  const allHtmlFiles = listHtmlFiles(searchRoot);
  if (allHtmlFiles.length === 0) {
    return null;
  }

  const relSet = new Set(
    allHtmlFiles.map((absPath) => path.relative(searchRoot, absPath).replace(/\\/g, "/").toLowerCase())
  );

  const priorityCandidates = [
    "index.html",
    "dist/index.html",
    "build/index.html",
    "public/index.html",
    "src/index.html"
  ];

  for (const candidate of priorityCandidates) {
    if (relSet.has(candidate)) {
      return path.join(searchRoot, candidate);
    }
  }

  // Fallback for AI-generated structures: serve the first discovered HTML file.
  return allHtmlFiles[0];
}

uploadsRouter.post("/zip", upload.single("projectZip"), async (req, res) => {
  const uploadedFile = req.file;
  if (!uploadedFile) {
    return res.status(400).json({ error: "ZIP file is required as projectZip." });
  }

  const projectId = nanoid(12);
  const projectDir = path.join(projectsRoot, projectId);
  const tempZipPath = uploadedFile.path;

  try {
    fs.mkdirSync(projectDir, { recursive: true });
    await extractZipSafely(tempZipPath, projectDir);

    const indexPath = detectEntryHtml(projectDir);
    if (!indexPath) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      return res.status(400).json({
        error:
          "We couldn't find an HTML entry file in your project. Please upload a web project containing at least one .html file."
      });
    }

    const entryDirAbsolute = path.dirname(indexPath);
    const entryDirRelative = path.relative(projectDir, entryDirAbsolute).replace(/\\/g, "/") || ".";
    const entryFileRelative = path.relative(projectDir, indexPath).replace(/\\/g, "/");

    saveHostedProject({
      id: projectId,
      entryDir: entryDirRelative,
      entryFile: entryFileRelative
    });

    console.log(`Detected entry file: ${indexPath}`);

    const shareUrl = `${getBaseUrl(req)}/p/${projectId}/`;
    const qrCodeDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 220,
      margin: 1
    });

    return res.status(201).json({
      project: {
        id: projectId,
        shareUrl,
        previewUrl: `/p/${projectId}/`
      },
      qrCodeDataUrl
    });
  } catch (error) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return res.status(400).json({
      error: error.message || "Unable to process ZIP file."
    });
  } finally {
    fs.rmSync(tempZipPath, { force: true });
  }
});

uploadsRouter.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "ZIP file exceeds 10MB limit." });
  }

  if (error) {
    return res.status(400).json({ error: error.message || "Upload failed." });
  }

  return res.status(500).json({ error: "Unknown upload error." });
});

export default uploadsRouter;