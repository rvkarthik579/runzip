import fs from "node:fs";
import path from "node:path";
import { removeHostedProjectsByIds } from "../db/hostedProjectsRepo.js";

const CLEANUP_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const PROJECT_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function cleanupOldHostedProjects(projectsRoot) {
  let entries;
  try {
    entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
  } catch (err) {
    console.error(`Cleanup: failed to read projects directory: ${err.message}`);
    return;
  }

  const now = Date.now();
  const removedIds = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectId = entry.name;
    const projectPath = path.join(projectsRoot, projectId);

    try {
      const stat = fs.statSync(projectPath);
      const ageMs = now - stat.mtimeMs;

      if (ageMs > PROJECT_MAX_AGE_MS) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        removedIds.push(projectId);
      }
    } catch (err) {
      console.error(`Cleanup: failed to process project ${projectId}: ${err.message}`);
    }
  }

  if (removedIds.length > 0) {
    try {
      const metadataRemoved = removeHostedProjectsByIds(removedIds);
      console.log(
        `Cleanup: removed ${removedIds.length} project folders and ${metadataRemoved} metadata records.`
      );
    } catch (err) {
      console.error(`Cleanup: removed folders but failed to update metadata: ${err.message}`);
    }
  }
}

export function startCronJobs(projectsRoot) {
  cleanupOldHostedProjects(projectsRoot);
  setInterval(() => cleanupOldHostedProjects(projectsRoot), CLEANUP_INTERVAL_MS);
}
