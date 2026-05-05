import { Router } from "express";

import { env } from "../config/env.js";
import { sendSuccess } from "../lib/api-response.js";

const healthRoutes = Router();

healthRoutes.get("/health", (_request, response) => {
  sendSuccess(response, {
    message: "Express API is healthy.",
    data: {
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  });
});

export { healthRoutes };
