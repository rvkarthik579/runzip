import fs from "node:fs";
import path from "node:path";

/**
 * Recursively finds all .html files under `rootDir`.
 * Returns an array of absolute paths, sorted alphabetically.
 */
export function listHtmlFiles(rootDir) {
  const results = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

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

/**
 * Many ZIP archives contain a single wrapper folder around the actual
 * project files. This function walks down single-directory chains
 * until it finds a level with files or multiple directories.
 */
export function inferSearchRoot(projectDir) {
  let current = projectDir;

  while (true) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return current;
    }

    const files = entries.filter((e) => e.isFile());
    const dirs = entries.filter((e) => e.isDirectory());

    if (files.length > 0 || dirs.length !== 1) {
      return current;
    }

    current = path.join(current, dirs[0].name);
  }
}

const ENTRY_PRIORITY = [
  "index.html",
  "dist/index.html",
  "build/index.html",
  "public/index.html",
  "src/index.html"
];

/**
 * Detects the entry HTML file for a project by:
 * 1. Unwrapping any single-folder wrapper directories
 * 2. Checking a priority list of common entry paths
 * 3. Falling back to the first discovered HTML file
 *
 * Returns the absolute path to the entry file, or null if none found.
 */
export function detectEntryHtml(projectDir) {
  const searchRoot = inferSearchRoot(projectDir);
  const allHtmlFiles = listHtmlFiles(searchRoot);

  if (allHtmlFiles.length === 0) {
    return null;
  }

  const relSet = new Set(
    allHtmlFiles.map((absPath) =>
      path.relative(searchRoot, absPath).replace(/\\/g, "/").toLowerCase()
    )
  );

  for (const candidate of ENTRY_PRIORITY) {
    if (relSet.has(candidate)) {
      return path.join(searchRoot, candidate);
    }
  }

  return allHtmlFiles[0];
}
