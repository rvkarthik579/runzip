import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

const dataDir = path.join(process.cwd(), "data");
const dataPath = path.join(dataDir, "projects.json");

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({ projects: [] }, null, 2), "utf8");
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(dataPath, "utf8");
  const parsed = JSON.parse(raw || "{\"projects\":[]}");

  if (!Array.isArray(parsed.projects)) {
    return { projects: [] };
  }

  return parsed;
}

function writeStore(store) {
  fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), "utf8");
}

export function createProject(payload) {
  const store = readStore();
  const now = new Date().toISOString();
  const project = {
    id: nanoid(12),
    shareToken: nanoid(28),
    name: payload.name,
    summary: payload.summary,
    content: payload.content,
    metadata: payload.metadata || {},
    createdAt: now,
    updatedAt: now
  };

  store.projects.push(project);
  writeStore(store);
  return project;
}

export function getProjectById(id) {
  const store = readStore();
  return store.projects.find((item) => item.id === id) || null;
}

export function updateProjectById(id, payload) {
  const store = readStore();
  const index = store.projects.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const existing = store.projects[index];
  const updated = {
    ...existing,
    name: payload.name,
    summary: payload.summary,
    content: payload.content,
    metadata: payload.metadata || {},
    updatedAt: new Date().toISOString()
  };

  store.projects[index] = updated;
  writeStore(store);
  return updated;
}

export function listRecentProjects(limit = 12) {
  const store = readStore();
  return [...store.projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
    .map((project) => ({
      id: project.id,
      shareToken: project.shareToken,
      name: project.name,
      summary: project.summary,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }));
}
