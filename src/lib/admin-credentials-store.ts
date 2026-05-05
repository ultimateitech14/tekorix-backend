import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
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

let ensureAdminCredentialsTablePromise: Promise<void> | null = null;

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

function encodePasswordHash(salt: Buffer, hash: Buffer) {
  return `${PASSWORD_HASH_PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
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

    if (!row?.password_updated_at) {
      return submittedPassword === fallbackPassword;
    }

    return verifyPasswordHash(submittedPassword, row.password_hash);
  } catch {
    return submittedPassword === fallbackPassword;
  }
}

export async function changeStoredAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
  fallbackPassword: string,
) {
  const row = await readAdminCredentialRow(adminId);
  const hasCustomPassword = Boolean(row?.password_updated_at);

  const isCurrentPasswordValid = hasCustomPassword
    ? await verifyPasswordHash(currentPassword, row!.password_hash)
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
