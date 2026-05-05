import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { sendError } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    sendError(response, {
      status: 400,
      message: "Invalid request payload.",
    });
    return;
  }

  if (error instanceof ZodError) {
    sendError(response, {
      status: 400,
      message: error.issues[0]?.message ?? "Validation failed.",
      data: {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    sendError(response, {
      status: error.statusCode,
      message: error.message,
      data: error.data,
    });
    return;
  }

  console.error("Unhandled Express API error", error);

  sendError(response, {
    status: 500,
    message: "Internal server error.",
  });
};
