import type { Request, RequestHandler } from "express";

import { AppError } from "../lib/app-error.js";
import type { AuthenticatedAdmin } from "../services/jwt.service.js";
import { verifyAdminToken } from "../services/jwt.service.js";

const DEFAULT_ALLOWED_ADMIN_ROLES = new Set(["admin", "super-admin", "superadmin"]);

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
    }
  }
}

function extractBearerToken(request: Request) {
  const authorizationHeader = request.header("Authorization");

  if (!authorizationHeader) {
    throw new AppError(401, "Missing Bearer token.");
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError(401, "Missing Bearer token.");
  }

  return token;
}

export function requireAdminAuth(allowedRoles: Iterable<string> = DEFAULT_ALLOWED_ADMIN_ROLES): RequestHandler {
  const normalizedAllowedRoles = new Set(Array.from(allowedRoles, (role) => role.toLowerCase()));

  return (request, response, next) => {
    try {
      const token = extractBearerToken(request);
      const admin = verifyAdminToken(token);

      if (!normalizedAllowedRoles.has(admin.role.toLowerCase())) {
        throw new AppError(403, "Insufficient role.");
      }

      request.admin = admin;
      response.setHeader("Vary", "Authorization");
      next();
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        response.setHeader("WWW-Authenticate", 'Bearer realm="admin", error="invalid_token"');
      }

      next(error);
    }
  };
}

export function getAuthenticatedAdmin(request: Request) {
  if (!request.admin) {
    throw new AppError(401, "Missing Bearer token.");
  }

  return request.admin;
}
