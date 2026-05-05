import type { RequestHandler } from "express";

import { sendError } from "../lib/api-response.js";

export const notFoundMiddleware: RequestHandler = (_request, response) => {
  sendError(response, {
    status: 404,
    message: "Route not found.",
  });
};
