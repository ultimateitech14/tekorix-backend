import jwtPackage from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";

const { JsonWebTokenError, TokenExpiredError } = jwtPackage;

const DEFAULT_ADMIN_PROFILE = {
  id: "admin-1",
  role: "admin",
} as const;

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

export type AdminProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AuthenticatedAdmin = {
  userId: string;
  name: string;
  email: string;
  role: string;
  exp: number;
  raw: JwtPayload;
};

type AdminCredentials = AdminProfile & {
  password: string;
};

function resolveJwtSecret() {
  const secret = env.JWT_SECRET.trim();

  if (!secret) {
    throw new AppError(500, "JWT secret is not configured.");
  }

  if (secret.length < 16) {
    throw new AppError(500, "JWT secret is too short.");
  }

  return secret;
}

function toDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`);

  return normalized.join(" ") || "Admin User";
}

export function getConfiguredAdminCredentials(): AdminCredentials {
  return {
    id: DEFAULT_ADMIN_PROFILE.id,
    name: env.ADMIN_NAME?.trim() || toDisplayNameFromEmail(env.ADMIN_EMAIL),
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    role: DEFAULT_ADMIN_PROFILE.role,
  };
}

export function signAdminToken(admin: AdminProfile) {
  return jwtPackage.sign(
    {
      sub: admin.id,
      userId: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
    resolveJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyAdminToken(token: string): AuthenticatedAdmin {
  try {
    const decoded = jwtPackage.verify(token, resolveJwtSecret(), {
      algorithms: ["HS256"],
    });

    if (typeof decoded === "string") {
      throw new AppError(401, "Invalid token.");
    }

    const userId = typeof decoded.userId === "string" ? decoded.userId : decoded.sub;
    const name = typeof decoded.name === "string" ? decoded.name : null;
    const email = typeof decoded.email === "string" ? decoded.email : null;
    const role = typeof decoded.role === "string" ? decoded.role : null;
    const exp = typeof decoded.exp === "number" ? decoded.exp : null;

    if (!userId || !name || !email || !role || !exp) {
      throw new AppError(401, "Invalid token.");
    }

    return {
      userId,
      name,
      email,
      role,
      exp,
      raw: decoded,
    };
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new AppError(401, "Expired token.");
    }

    if (error instanceof JsonWebTokenError) {
      throw new AppError(401, "Invalid token.");
    }

    throw error;
  }
}
