import { query } from "../database/pool.js";
import { getAdminPasswordMetadata } from "./admin-credentials-store.js";
import { AppError } from "./app-error.js";
import { getConfiguredAdminCredentials } from "../services/jwt.service.js";

type AdminRoleRow = {
  id: string;
  name: string;
  description: string;
  permissions: unknown;
  is_system: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  user_count: string;
};

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role_name: string;
  role_description: string;
  permissions: unknown;
  status: string;
  last_sign_in_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type AdminRoleRecord = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserRecord = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  roleDescription: string;
  permissions: string[];
  status: "active";
  lastSignInAt: string | null;
  passwordUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_ROLE_ID = "role-admin";
const DEFAULT_ROLE_NAME = "Admin";
const DEFAULT_ROLE_DESCRIPTION =
  "Full access to the Tekorix admin workspace, including jobs, applications, settings, notifications, and system logs.";
const DEFAULT_ROLE_PERMISSIONS = [
  "dashboard:read",
  "jobs:write",
  "applications:write",
  "blog:write",
  "leads:read",
  "candidates:read",
  "notifications:write",
  "settings:write",
  "logs:read",
];

const ensureAdminRolesTableSql = `
  CREATE TABLE IF NOT EXISTS admin_roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const ensureAdminUsersTableSql = `
  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active',
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT admin_users_status_check CHECK (status IN ('active'))
  )
`;

let ensureAdminAccessTablesPromise: Promise<void> | null = null;

function toIsoString(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function normalizePermissions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

async function ensureAdminAccessTables() {
  if (!ensureAdminAccessTablesPromise) {
    ensureAdminAccessTablesPromise = (async () => {
      await query(ensureAdminRolesTableSql);
      await query(ensureAdminUsersTableSql);
    })().catch((error) => {
      ensureAdminAccessTablesPromise = null;
      throw error;
    });
  }

  return ensureAdminAccessTablesPromise;
}

async function ensureConfiguredAdminSeeded() {
  await ensureAdminAccessTables();

  const adminCredentials = getConfiguredAdminCredentials();

  await query(
    `
      INSERT INTO admin_roles (id, name, description, permissions, is_system)
      VALUES ($1, $2, $3, $4::jsonb, TRUE)
      ON CONFLICT (id)
      DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            permissions = EXCLUDED.permissions,
            is_system = TRUE,
            updated_at = NOW()
    `,
    [DEFAULT_ROLE_ID, DEFAULT_ROLE_NAME, DEFAULT_ROLE_DESCRIPTION, JSON.stringify(DEFAULT_ROLE_PERMISSIONS)],
  );

  await query(
    `
      INSERT INTO admin_users (id, name, email, role_id, status)
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT (id)
      DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            role_id = EXCLUDED.role_id,
            status = 'active',
            updated_at = NOW()
    `,
    [adminCredentials.id, adminCredentials.name, adminCredentials.email, DEFAULT_ROLE_ID],
  );
}

function mapRoleRow(row: AdminRoleRow): AdminRoleRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: normalizePermissions(row.permissions),
    isSystem: row.is_system,
    userCount: Number.parseInt(row.user_count, 10) || 0,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

async function mapUserRow(row: AdminUserRow): Promise<AdminUserRecord> {
  const passwordMetadata = await getAdminPasswordMetadata(row.id);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roleId: row.role_id,
    roleName: row.role_name,
    roleDescription: row.role_description,
    permissions: normalizePermissions(row.permissions),
    status: "active",
    lastSignInAt: toIsoString(row.last_sign_in_at),
    passwordUpdatedAt: passwordMetadata.passwordUpdatedAt,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

export async function listAdminRoles() {
  await ensureConfiguredAdminSeeded();

  const result = await query<AdminRoleRow>(
    `
      SELECT
        roles.id,
        roles.name,
        roles.description,
        roles.permissions,
        roles.is_system,
        roles.created_at,
        roles.updated_at,
        COUNT(users.id)::text AS user_count
      FROM admin_roles AS roles
      LEFT JOIN admin_users AS users
        ON users.role_id = roles.id
      GROUP BY roles.id
      ORDER BY roles.is_system DESC, roles.name ASC
    `,
  );

  return result.rows.map((row) => mapRoleRow(row));
}

export async function listAdminUsers() {
  await ensureConfiguredAdminSeeded();

  const result = await query<AdminUserRow>(
    `
      SELECT
        users.id,
        users.name,
        users.email,
        users.role_id,
        roles.name AS role_name,
        roles.description AS role_description,
        roles.permissions,
        users.status,
        users.last_sign_in_at,
        users.created_at,
        users.updated_at
      FROM admin_users AS users
      INNER JOIN admin_roles AS roles
        ON roles.id = users.role_id
      ORDER BY users.created_at ASC
    `,
  );

  return Promise.all(result.rows.map((row) => mapUserRow(row)));
}

export async function markAdminUserSignedIn(adminId: string) {
  await ensureConfiguredAdminSeeded();

  const result = await query<{ id: string }>(
    `
      UPDATE admin_users
      SET last_sign_in_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [adminId],
  );

  if (!result.rows[0]) {
    throw new AppError(404, "Admin user not found.");
  }
}
