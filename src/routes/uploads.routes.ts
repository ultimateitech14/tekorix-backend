import { pipeline } from "node:stream/promises";

import { Router } from "express";

import { asyncHandler } from "../lib/async-handler.js";
import { sendError } from "../lib/api-response.js";
import { getR2Object } from "../services/r2-storage.service.js";

const uploadsRoutes = Router();

uploadsRoutes.get(
  "/uploads/*",
  asyncHandler(async (request, response) => {
    const objectSuffix = typeof request.params[0] === "string" ? request.params[0].trim() : "";
    const objectKey = objectSuffix ? `uploads/${objectSuffix.replace(/^\/+/, "")}` : "";

    if (!objectKey) {
      return sendError(response, {
        status: 404,
        message: "Media object not found.",
      });
    }

    const object = await getR2Object(objectKey);

    if (!object) {
      return sendError(response, {
        status: 404,
        message: "Media object not found.",
      });
    }

    response.status(200);
    response.setHeader("Content-Type", object.contentType ?? "application/octet-stream");
    response.setHeader("Cache-Control", object.cacheControl ?? "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");

    if (typeof object.contentLength === "number" && Number.isFinite(object.contentLength)) {
      response.setHeader("Content-Length", String(object.contentLength));
    }

    await pipeline(object.body, response);
  }),
);

export { uploadsRoutes };
