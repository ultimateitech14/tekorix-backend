import { Router } from "express";

import { createProjectController, getProjectsController } from "../controllers/projects.controller.js";

const projectsRoutes = Router();

projectsRoutes.get("/api/v1/projects", getProjectsController);
projectsRoutes.post("/api/v1/projects", createProjectController);

export { projectsRoutes };
