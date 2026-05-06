import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

import { query } from "../database/pool.js";
import { AppError } from "./app-error.js";

type AdminCredentialRow = {
  admin_id: string;
  password_hash: string;
  password_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminPasswordResetTokenRow = {
  token_hash: string;
  admin_id: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_SALT_SIZE = 16;
const PASSWORD_KEY_SIZE = 64;

const ensureAdminCredentialsTableSql = `
  CREATE TABLE IF NOT EXISTS admin_credentials (
    admin_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    password_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const ensureAdminPasswordResetTokensTableSql = `
  CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

let ensureAdminCredentialsTablePromise: Promise<void> | null = null;
let ensureAdminPasswordResetTokensTablePromise: Promise<void> | null = null;

async function ensureAdminCredentialsTable() {
  if (!ensureAdminCredentialsTablePromise) {
    ensureAdminCredentialsTablePromise = query(ensureAdminCredentialsTableSql)
      .then(() => undefined)
      .catch((error) => {
        ensureAdminCredentialsTablePromise = null;
        throw error;
      });
  }

  return ensureAdminCredentialsTablePromise;
}

async function ensureAdminPasswordResetTokensTable() {
  if (!ensureAdminPasswordResetTokensTablePromise) {
    ensureAdminPasswordResetTokensTablePromise = query(ensureAdminPasswordResetTokensTableSql)
      .then(() => undefined)
      .catch((error) => {
        ensureAdminPasswordResetTokensTablePromise = null;
        throw error;
      });
  }

  return ensureAdminPasswordResetTokensTablePromise;
}

function encodePasswordHash(salt: Buffer, hash: Buffer) {
  return `${PASSWORD_HASH_PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function decodePasswordHash(value: string) {
  const [prefix, saltHex, hashHex] = value.split("$");

  if (prefix !== PASSWORD_HASH_PREFIX || !saltHex || !hashHex) {
    throw new AppError(500, "Stored admin password format is invalid.");
  }

  return {
    salt: Buffer.from(saltHex, "hex"),
    hash: Buffer.from(hashHex, "hex"),
  };
}

async function readAdminCredentialRow(adminId: string) {
  await ensureAdminCredentialsTable();

  const result = await query<AdminCredentialRow>(
    `
      SELECT admin_id, password_hash, password_updated_at, created_at, updated_at
      FROM admin_credentials
      WHERE admin_id = $1
      LIMIT 1
    `,
    [adminId],
  );

  return result.rows[0] ?? null;
}

async function upsertAdminCredentialRow(adminId: string, passwordHash: string) {
  await ensureAdminCredentialsTable();

  const result = await query<AdminCredentialRow>(
    `
      INSERT INTO admin_credentials (admin_id, password_hash, password_updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (admin_id)
      DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            password_updated_at = NOW(),
            updated_at = NOW()
      RETURNING admin_id, password_hash, password_updated_at, created_at, updated_at
    `,
    [adminId, passwordHash],
  );

  return result.rows[0] ?? null;
}

async function markPasswordResetTokenConsumed(tokenHash: string) {
  await ensureAdminPasswordResetTokensTable();
  await query(
    `
      UPDATE admin_password_reset_tokens
      SET consumed_at = NOW()
      WHERE token_hash = $1
    `,
    [tokenHash],
  );
}

async function deleteExpiredPasswordResetTokens(adminId: string) {
  await ensureAdminPasswordResetTokensTable();
  await query(
    `
      DELETE FROM admin_password_reset_tokens
      WHERE admin_id = $1
        AND (consumed_at IS NOT NULL OR expires_at <= NOW())
    `,
    [adminId],
  );
}

async function storePasswordResetToken(adminId: string, tokenHash: string, expiresAt: string) {
  await ensureAdminPasswordResetTokensTable();
  await deleteExpiredPasswordResetTokens(adminId);
  await query(
    `
      INSERT INTO admin_password_reset_tokens (token_hash, admin_id, expires_at)
      VALUES ($1, $2, $3)
    `,
    [tokenHash, adminId, expiresAt],
  );
}

async function readPasswordResetToken(token: string) {
  await ensureAdminPasswordResetTokensTable();
  const tokenHash = hashResetToken(token);
  const result = await query<AdminPasswordResetTokenRow>(
    `
      SELECT token_hash, admin_id, expires_at, consumed_at, created_at
      FROM admin_password_reset_tokens
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

async function hashPassword(password: string) {
  const salt = randomBytes(PASSWORD_SALT_SIZE);
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_SIZE)) as Buffer;
  return encodePasswordHash(salt, derivedKey);
}

async function verifyPasswordHash(password: string, storedHash: string) {
  const decoded = decodePasswordHash(storedHash);
  const derivedKey = (await scrypt(password, decoded.salt, decoded.hash.length)) as Buffer;

  if (derivedKey.length !== decoded.hash.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, decoded.hash);
}

export async function verifyConfiguredAdminPassword(
  adminId: string,
  submittedPassword: string,
  fallbackPassword: string,
) {
  try {
    const row = await readAdminCredentialRow(adminId);

    if (!row) {
      return submittedPassword === fallbackPassword;
    }

    return verifyPasswordHash(submittedPassword, row.password_hash);
  } catch (error) {
    throw new AppError(
      503,
      error instanceof Error
        ? "Admin password store is unavailable right now. Please try again."
        : "Admin password verification is temporarily unavailable.",
    );
  }
}

export async function changeStoredAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
  fallbackPassword: string,
) {
  const row = await readAdminCredentialRow(adminId);
  const isCurrentPasswordValid = row
    ? await verifyPasswordHash(currentPassword, row.password_hash)
    : currentPassword === fallbackPassword;

  if (!isCurrentPasswordValid) {
    throw new AppError(401, "Current password is incorrect.");
  }

  const nextHash = await hashPassword(newPassword);
  const updated = await upsertAdminCredentialRow(adminId, nextHash);

  if (!updated) {
    throw new AppError(500, "Unable to update password right now.");
  }

  return {
    passwordUpdatedAt: updated.password_updated_at,
  };
}

export async function setStoredAdminPassword(adminId: string, newPassword: string) {
  const nextHash = await hashPassword(newPassword);
  const updated = await upsertAdminCredentialRow(adminId, nextHash);

  if (!updated) {
    throw new AppError(500, "Unable to update password right now.");
  }

  return {
    passwordUpdatedAt: updated.password_updated_at,
  };
}

export async function getAdminPasswordMetadata(adminId: string) {
  try {
    const row = await readAdminCredentialRow(adminId);

    return {
      passwordUpdatedAt: row?.password_updated_at ?? null,
    };
  } catch {
    return {
      passwordUpdatedAt: null,
    };
  }
}

export async function createAdminPasswordResetToken(adminId: string, ttlMinutes = 30) {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await storePasswordResetToken(adminId, hashResetToken(rawToken), expiresAt);

  return {
    token: rawToken,
    expiresAt,
  };
}

export async function resetStoredAdminPasswordWithToken(token: string, newPassword: string) {
  const row = await readPasswordResetToken(token);

  if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AppError(400, "Password reset token is invalid or expired.");
  }

  const updated = await setStoredAdminPassword(row.admin_id, newPassword);
  await markPasswordResetTokenConsumed(row.token_hash);

  return updated;
}
