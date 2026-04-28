import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listHtmlFiles, inferSearchRoot, detectEntryHtml } from "./fileUtils.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "runzip-test-"));
}

function writeFile(dir, relativePath, content = "") {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

describe("listHtmlFiles", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns empty array for empty directory", () => {
    expect(listHtmlFiles(tmpDir)).toEqual([]);
  });

  it("finds .html files in root", () => {
    writeFile(tmpDir, "index.html", "<html></html>");
    writeFile(tmpDir, "style.css", "body {}");
    const result = listHtmlFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/index\.html$/);
  });

  it("finds .html files in nested directories", () => {
    writeFile(tmpDir, "pages/about.html");
    writeFile(tmpDir, "pages/sub/contact.html");
    writeFile(tmpDir, "index.html");
    const result = listHtmlFiles(tmpDir);
    expect(result).toHaveLength(3);
  });

  it("is case-insensitive for .HTML extension", () => {
    writeFile(tmpDir, "page.HTML");
    expect(listHtmlFiles(tmpDir)).toHaveLength(1);
  });
});

describe("inferSearchRoot", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns root if files exist at root", () => {
    writeFile(tmpDir, "index.html");
    expect(inferSearchRoot(tmpDir)).toBe(tmpDir);
  });

  it("unwraps single wrapper directory", () => {
    writeFile(tmpDir, "wrapper/index.html");
    const result = inferSearchRoot(tmpDir);
    expect(result).toBe(path.join(tmpDir, "wrapper"));
  });

  it("unwraps nested wrapper directories", () => {
    writeFile(tmpDir, "a/b/index.html");
    const result = inferSearchRoot(tmpDir);
    expect(result).toBe(path.join(tmpDir, "a", "b"));
  });

  it("stops at directory with multiple subdirs", () => {
    writeFile(tmpDir, "wrapper/dir1/index.html");
    writeFile(tmpDir, "wrapper/dir2/page.html");
    const result = inferSearchRoot(tmpDir);
    expect(result).toBe(path.join(tmpDir, "wrapper"));
  });
});

describe("detectEntryHtml", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns null for project with no HTML files", () => {
    writeFile(tmpDir, "readme.txt", "hello");
    expect(detectEntryHtml(tmpDir)).toBeNull();
  });

  it("returns null for empty directory", () => {
    expect(detectEntryHtml(tmpDir)).toBeNull();
  });

  it("finds index.html at root", () => {
    writeFile(tmpDir, "index.html", "<html></html>");
    writeFile(tmpDir, "about.html");
    const result = detectEntryHtml(tmpDir);
    expect(result).toMatch(/index\.html$/);
  });

  it("finds index.html inside wrapper folder", () => {
    writeFile(tmpDir, "my-project/index.html");
    const result = detectEntryHtml(tmpDir);
    expect(result).toMatch(/index\.html$/);
  });

  it("prioritizes index.html over other HTML files", () => {
    writeFile(tmpDir, "about.html");
    writeFile(tmpDir, "index.html");
    writeFile(tmpDir, "contact.html");
    const result = detectEntryHtml(tmpDir);
    expect(path.basename(result)).toBe("index.html");
  });

  it("finds dist/index.html as a priority candidate", () => {
    writeFile(tmpDir, "dist/index.html");
    writeFile(tmpDir, "src/app.html");
    const result = detectEntryHtml(tmpDir);
    expect(result).toContain(path.join("dist", "index.html"));
  });

  it("falls back to first HTML file when no priority matches", () => {
    writeFile(tmpDir, "page.html");
    const result = detectEntryHtml(tmpDir);
    expect(result).toMatch(/page\.html$/);
  });
});
