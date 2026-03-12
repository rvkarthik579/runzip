import { Router } from "express";
import {
  createProject,
  getProjectById,
  listRecentProjects,
  updateProjectById
} from "../db/projectsRepo.js";
import { sanitizeProjectPayload } from "../utils/projectMapper.js";
import { getBaseUrl, readShareToken } from "../utils/requestUtils.js";

const projectsRouter = Router();

function serialize(project, req) {
  const baseUrl = getBaseUrl(req);
  return {
    ...project,
    shareUrl: `${baseUrl}/p/${project.id}/${project.shareToken}`
  };
}

projectsRouter.get("/recent", (req, res) => {
  const projects = listRecentProjects(20).map((project) => ({
    ...project,
    shareUrl: `${getBaseUrl(req)}/p/${project.id}/${project.shareToken}`
  }));

  res.json({ projects });
});

projectsRouter.post("/", (req, res) => {
  const payload = sanitizeProjectPayload(req.body);
  const project = createProject(payload);
  res.status(201).json({ project: serialize(project, req) });
});

projectsRouter.get("/:projectId", (req, res) => {
  const project = getProjectById(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const token = readShareToken(req);
  if (token !== project.shareToken) {
    return res.status(403).json({ error: "Invalid share token" });
  }

  return res.json({ project: serialize(project, req) });
});

projectsRouter.put("/:projectId", (req, res) => {
  const existing = getProjectById(req.params.projectId);
  if (!existing) {
    return res.status(404).json({ error: "Project not found" });
  }

  const token = readShareToken(req);
  if (token !== existing.shareToken) {
    return res.status(403).json({ error: "Invalid share token" });
  }

  const payload = sanitizeProjectPayload(req.body);
  const updated = updateProjectById(req.params.projectId, payload);
  return res.json({ project: serialize(updated, req) });
});

export default projectsRouter;
