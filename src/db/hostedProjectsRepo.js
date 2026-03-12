import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const dataPath = path.join(dataDir, "hostedProjects.json");

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

export function saveHostedProject(project) {
  const store = readStore();
  const index = store.projects.findIndex((item) => item.id === project.id);
  const nextProject = {
    id: project.id,
    entryDir: project.entryDir,
    entryFile: project.entryFile,
    updatedAt: new Date().toISOString()
  };

  if (index === -1) {
    store.projects.push(nextProject);
  } else {
    store.projects[index] = nextProject;
  }

  writeStore(store);
  return nextProject;
}

export function getHostedProjectById(id) {
  const store = readStore();
  return store.projects.find((item) => item.id === id) || null;
}

export function removeHostedProjectsByIds(ids) {
  const idSet = new Set(ids || []);
  if (idSet.size === 0) {
    return 0;
  }

  const store = readStore();
  const before = store.projects.length;
  store.projects = store.projects.filter((item) => !idSet.has(item.id));
  const removed = before - store.projects.length;

  if (removed > 0) {
    writeStore(store);
  }

  return removed;
}