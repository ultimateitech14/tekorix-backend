import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import dotenv from "dotenv";
import pg from "pg";

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

type AdminImageResponse = {
  path: string;
};

type AuthLoginResponse = {
  token: string;
  admin: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

type AuthResetResponse = {
  resetUrl?: string;
  expiresAt?: string;
};

type SiteSettingsResponse = {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  companyGoogleMapLink: string;
  careersDomain: string;
  careersHeadline: string;
  careersSubtitle: string;
  careersPublished: boolean;
  careersShowTeamPhotos: boolean;
  careersAutoPublishJobs: boolean;
  careersTeamMembers: Array<{
    id: string;
    name: string;
    role: string;
    photo: string;
    blurb: string;
  }>;
  talentProfilesEyebrow: string;
  talentProfilesHeadline: string;
  talentProfilesDescription: string;
  talentProfiles: Array<{
    id: string;
    name: string;
    role: string;
    yearsOfExperience: number;
    rating: number;
    summary: string;
    detailedSummary: string;
    expertise: string[];
    avatar: string;
    resumeCtaLabel: string;
  }>;
  notificationEmailProvider?: string;
  notificationEmailApiKey?: string;
  notificationFromEmail?: string;
};

type BlogPostRecord = {
  id: string;
  slug: string;
  category: string;
  date: string;
  readTime: string;
  title: string;
  description: string;
  coverImage: string;
  coverAlt: string;
  intro: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  isPublished: boolean;
};

type JobsListResponse = {
  items: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    isActive: boolean;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type JobRecord = {
  id: string;
  slug: string;
  title: string;
  status: string;
  isActive: boolean;
  department: string;
  location: string;
};

type JobMetadataResponse = {
  totalJobs: number;
  publishedJobs: number;
  draftJobs: number;
  closedJobs: number;
};

type DashboardResponse = {
  kpis: {
    totalJobs: number;
    publishedJobs: number;
    draftJobs: number;
    closedJobs: number;
    totalApplications: number;
  };
};

type JobApplicationRecord = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  isRead: boolean;
  adminNotes: string;
  resume: {
    originalName: string;
    storedName: string;
    contentType: string;
    size: number;
  };
};

type ContactSubmissionRecord = {
  id: string;
  email: string;
  isRead: boolean;
  replies: Array<{
    id: string;
    message: string;
    deliveryStatus: string;
  }>;
};

type EmailTemplateRecord = {
  id: string;
  name: string;
  subject: string;
  body: string;
  isActive: boolean;
};

type CompanyLeadRecord = {
  id: string;
  companyName: string;
  isRead: boolean;
};

type CandidateLeadRecord = {
  id: string;
  fullName: string;
  isRead: boolean;
  resume: {
    objectKey: string;
    fileName: string;
    contentType: string;
  } | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..", "..");
const migrationsDir = path.join(backendDir, "migrations");
const appModuleUrl = pathToFileURL(path.join(backendDir, "src", "app.ts")).href;
const dbModuleUrl = pathToFileURL(path.join(backendDir, "src", "config", "db.ts")).href;
const repoEnvPath = path.join(backendDir, ".env");
const routeCoverage = new Set<string>();

const expectedRouteCoverage = new Set([
  "GET /health",
  "POST /api/auth/admin/login",
  "GET /api/admin/me",
  "POST /api/auth/admin/change-password",
  "POST /api/auth/admin/forgot-password",
  "POST /api/auth/admin/reset-password",
  "GET /api/admin/users",
  "GET /api/admin/roles",
  "POST /api/admin/media/images",
  "GET /uploads/*",
  "GET /api/v1/site-settings",
  "GET /api/admin/site-settings",
  "PUT /api/admin/site-settings",
  "POST /api/admin/notification-settings/test",
  "GET /api/v1/admin/blog-posts",
  "POST /api/v1/admin/blog-posts",
  "GET /api/v1/admin/blog-posts/:id",
  "PUT /api/v1/admin/blog-posts/:id",
  "PATCH /api/v1/admin/blog-posts/:id/publish",
  "GET /api/v1/blog-posts",
  "GET /api/v1/blog-posts/:slug",
  "DELETE /api/v1/admin/blog-posts/:id",
  "GET /api/v1/admin/jobs",
  "GET /api/v1/admin/jobs/meta",
  "POST /api/v1/admin/jobs",
  "GET /api/v1/admin/jobs/:id",
  "PUT /api/v1/admin/jobs/:id",
  "PATCH /api/v1/admin/jobs/:id/publish",
  "GET /api/v1/jobs",
  "GET /api/v1/jobs/:slug",
  "DELETE /api/v1/admin/jobs/:id",
  "GET /api/admin/dashboard",
  "POST /api/v1/job-applications",
  "GET /api/admin/job-applications",
  "GET /api/admin/job-applications/:id",
  "PATCH /api/admin/job-applications",
  "PATCH /api/admin/job-applications/:id",
  "GET /api/admin/job-applications/:id/resume",
  "GET /api/admin/resume-bank",
  "DELETE /api/admin/resume-bank",
  "DELETE /api/admin/job-applications",
  "POST /api/v1/contact-submissions",
  "GET /api/admin/contact-submissions",
  "PATCH /api/admin/contact-submissions",
  "DELETE /api/admin/contact-submissions",
  "GET /api/admin/email-templates",
  "POST /api/admin/email-templates",
  "PATCH /api/admin/email-templates",
  "POST /api/admin/email-templates/send",
  "DELETE /api/admin/email-templates",
  "GET /api/admin/logs",
  "DELETE /api/admin/logs",
  "POST /api/v1/company-leads",
  "GET /api/v1/admin/company-leads",
  "GET /api/v1/admin/company-leads/:id",
  "PATCH /api/v1/admin/company-leads/:id/read",
  "POST /api/v1/candidate-leads/upload-url",
  "PUT /api/v1/candidate-leads/upload",
  "POST /api/v1/candidate-leads",
  "GET /api/v1/admin/candidate-leads",
  "GET /api/v1/admin/candidate-leads/:id",
  "PATCH /api/v1/admin/candidate-leads/:id/read",
  "GET /api/v1/admin/candidate-leads/:id/resume",
]);

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l7l8AAAAASUVORK5CYII=";
const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");

let originalCwd = process.cwd();
let temporaryRootDir = "";
let temporaryBackendDir = "";
let temporaryFrontendDir = "";
let temporaryDatabaseUrl = "";
let temporaryDatabaseName = "";
let temporarySchemaName = "";
let isolationMode: "database" | "schema" = "database";
let server: Server | null = null;
let baseUrl = "";
let closePool: (() => Promise<void>) | null = null;
let currentPassword = "Admin12345!";
let authToken = "";
let adminUserId = "";
let createdBlogId = "";
let createdBlogSlug = "";
let createdJobId = "";
let createdJobSlug = "";
let createdApplicationId = "";
let createdContactSubmissionId = "";
let createdTemplateId = "";
let createdCompanyLeadId = "";
let createdCandidateLeadId = "";
let createdCandidateLeadObjectKey = "";
let uploadedAdminImagePath = "";

function getBootstrapEnv() {
  const fileEnv = existsSync(repoEnvPath) ? dotenv.parse(readFileSync(repoEnvPath, "utf8")) : {};
  const databaseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to prepare the E2E database.");
  }

  return {
    databaseUrl,
  };
}

function buildTestDatabaseName() {
  return `startupwork_e2e_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function buildDatabaseUrl(baseDatabaseUrl: string, databaseName: string) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function buildSchemaScopedDatabaseUrl(baseDatabaseUrl: string, schemaName: string) {
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set("options", `-c search_path=${schemaName},public`);
  return url.toString();
}

function buildAdminConnectionUrl(baseDatabaseUrl: string) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = "/postgres";
  return url.toString();
}

async function recreateDatabase(baseDatabaseUrl: string, databaseName: string) {
  const client = new pg.Client({
    connectionString: buildAdminConnectionUrl(baseDatabaseUrl),
    ssl: false,
  });

  await client.connect();

  try {
    await client.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
}

async function createSchema(baseDatabaseUrl: string, schemaName: string) {
  const client = new pg.Client({
    connectionString: baseDatabaseUrl,
    ssl: false,
  });

  await client.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(baseDatabaseUrl: string, databaseName: string) {
  const client = new pg.Client({
    connectionString: buildAdminConnectionUrl(baseDatabaseUrl),
    ssl: false,
  });

  await client.connect();

  try {
    await client.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await client.end();
  }
}

async function dropSchema(baseDatabaseUrl: string, schemaName: string) {
  const client = new pg.Client({
    connectionString: baseDatabaseUrl,
    ssl: false,
  });

  await client.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await client.end();
  }
}

async function runMigrations(connectionString: string) {
  const client = new pg.Client({
    connectionString,
    ssl: false,
  });

  await client.connect();

  try {
    const files = (await readdir(migrationsDir)).filter((fileName) => fileName.endsWith(".sql")).sort();

    for (const fileName of files) {
      const sql = await readFile(path.join(migrationsDir, fileName), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

async function createTemporaryWorkspace() {
  temporaryRootDir = await mkdtemp(path.join(os.tmpdir(), "startupwork-e2e-"));
  temporaryBackendDir = path.join(temporaryRootDir, "backend", "express-api");
  temporaryFrontendDir = path.join(temporaryRootDir, "frontend", "data");

  await mkdir(path.join(temporaryBackendDir, "public"), { recursive: true });
  await mkdir(temporaryFrontendDir, { recursive: true });
}

function setRuntimeEnv(databaseUrl: string) {
  process.env.NODE_ENV = "test";
  process.env.PORT = "4001";
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.ADMIN_EMAIL = "admin@tekorix.test";
  process.env.ADMIN_NAME = "Tekorix Admin";
  process.env.ADMIN_PASSWORD = currentPassword;
  process.env.R2_ACCOUNT_ID = "";
  process.env.R2_ACCESS_KEY_ID = "";
  process.env.R2_SECRET_ACCESS_KEY = "";
  process.env.R2_BUCKET_NAME = "";
  process.env.R2_PUBLIC_BASE_URL = "";
  process.env.SMTP_HOST = "";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.SMTP_PORT = "";
  process.env.SMTP_SECURE = "";
}

async function startAppServer() {
  const appModule = await import(`${appModuleUrl}?e2e=${Date.now()}`);
  const dbModule = (await import(`${dbModuleUrl}?e2e=${Date.now()}`)) as {
    closePool: () => Promise<void>;
  };

  closePool = dbModule.closePool;

  server = await new Promise<Server>((resolve) => {
    const started = createServer(appModule.app);
    started.listen(0, "127.0.0.1", () => resolve(started));
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine E2E server address.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
}

function markRouteCovered(routeKey: string) {
  routeCoverage.add(routeKey);
}

async function requestJson<T>(routeKey: string, method: string, requestPath: string, options: {
  auth?: boolean;
  expectedStatus?: number;
  body?: unknown;
} = {}) {
  markRouteCovered(routeKey);

  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options.auth) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body),
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  assert.equal(response.status, options.expectedStatus ?? 200, `${routeKey} returned unexpected status.`);
  return payload;
}

async function requestBinary(routeKey: string, method: string, requestPath: string, options: {
  auth?: boolean;
  expectedStatus?: number;
} = {}) {
  markRouteCovered(routeKey);

  const headers = new Headers();

  if (options.auth) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
  });

  assert.equal(response.status, options.expectedStatus ?? 200, `${routeKey} returned unexpected status.`);
  return response;
}

async function requestFormData<T>(routeKey: string, method: string, requestPath: string, formData: FormData, options: {
  auth?: boolean;
  expectedStatus?: number;
} = {}) {
  markRouteCovered(routeKey);

  const headers = new Headers();

  if (options.auth) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: formData,
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  assert.equal(response.status, options.expectedStatus ?? 200, `${routeKey} returned unexpected status.`);
  return payload;
}

async function requestRaw(routeKey: string, method: string, requestPath: string, options: {
  expectedStatus?: number;
  body: Buffer;
  contentType: string;
}) {
  markRouteCovered(routeKey);

  const response = await fetch(requestPath.startsWith("http") ? requestPath : `${baseUrl}${requestPath}`, {
    method,
    headers: {
      "Content-Type": options.contentType,
    },
    body: options.body,
  });

  assert.equal(response.status, options.expectedStatus ?? 204, `${routeKey} returned unexpected status.`);
  return response;
}

async function loginWithPassword(password: string) {
  const payload = await requestJson<AuthLoginResponse>("POST /api/auth/admin/login", "POST", "/api/auth/admin/login", {
    expectedStatus: 200,
    body: {
      email: "admin@tekorix.test",
      password,
    },
  });

  assert.equal(payload.success, true);
  assert.ok(payload.data.token);
  authToken = payload.data.token;
  adminUserId = payload.data.admin.id;
}

before(async () => {
  originalCwd = process.cwd();
  const bootstrapEnv = getBootstrapEnv();

  temporaryDatabaseName = buildTestDatabaseName();
  temporarySchemaName = `e2e_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    temporaryDatabaseUrl = buildDatabaseUrl(bootstrapEnv.databaseUrl, temporaryDatabaseName);
    await recreateDatabase(bootstrapEnv.databaseUrl, temporaryDatabaseName);
    isolationMode = "database";
  } catch (error) {
    const pgError = error as { code?: string } | undefined;

    if (pgError?.code !== "42501") {
      throw error;
    }

    isolationMode = "schema";
    temporaryDatabaseUrl = buildSchemaScopedDatabaseUrl(bootstrapEnv.databaseUrl, temporarySchemaName);
    await createSchema(bootstrapEnv.databaseUrl, temporarySchemaName);
  }

  await runMigrations(temporaryDatabaseUrl);
  await createTemporaryWorkspace();

  setRuntimeEnv(temporaryDatabaseUrl);
  process.chdir(temporaryBackendDir);
  await startAppServer();
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  if (closePool) {
    await closePool();
  }

  process.chdir(originalCwd);

  if (temporaryRootDir) {
    await rm(temporaryRootDir, {
      recursive: true,
      force: true,
    });
  }

  if (temporaryDatabaseUrl) {
    if (isolationMode === "database" && temporaryDatabaseName) {
      await dropDatabase(getBootstrapEnv().databaseUrl, temporaryDatabaseName);
    }

    if (isolationMode === "schema" && temporarySchemaName) {
      await dropSchema(getBootstrapEnv().databaseUrl, temporarySchemaName);
    }
  }
});

test("E2E: health and auth routes", { concurrency: false }, async () => {
  const health = await requestJson<{ environment: string; timestamp: string }>("GET /health", "GET", "/health");
  assert.equal(health.success, true);
  assert.equal(health.data.environment, "test");
  assert.ok(health.data.timestamp);

  await loginWithPassword(currentPassword);

  const me = await requestJson<{
    id: string;
    name: string;
    email: string;
    role: string;
    passwordUpdatedAt: string | null;
  }>("GET /api/admin/me", "GET", "/api/admin/me", { auth: true });
  assert.equal(me.data.email, "admin@tekorix.test");

  const changedPassword = "AdminChanged123!";
  const changed = await requestJson<{ passwordUpdatedAt: string }>(
    "POST /api/auth/admin/change-password",
    "POST",
    "/api/auth/admin/change-password",
    {
      auth: true,
      body: {
        currentPassword,
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      },
    },
  );
  assert.ok(changed.data.passwordUpdatedAt);
  currentPassword = changedPassword;
  process.env.ADMIN_PASSWORD = currentPassword;

  await loginWithPassword(currentPassword);

  const forgot = await requestJson<AuthResetResponse>(
    "POST /api/auth/admin/forgot-password",
    "POST",
    "/api/auth/admin/forgot-password",
    {
      body: {
        email: "admin@tekorix.test",
      },
    },
  );
  assert.ok(forgot.data.resetUrl);

  const resetUrl = new URL(forgot.data.resetUrl!);
  const resetToken = resetUrl.searchParams.get("token");
  assert.ok(resetToken);

  const resetPassword = "AdminReset123!";
  const reset = await requestJson<{ passwordUpdatedAt: string }>(
    "POST /api/auth/admin/reset-password",
    "POST",
    "/api/auth/admin/reset-password",
    {
      body: {
        token: resetToken,
        password: resetPassword,
        confirmPassword: resetPassword,
      },
    },
  );
  assert.ok(reset.data.passwordUpdatedAt);
  currentPassword = resetPassword;
  process.env.ADMIN_PASSWORD = currentPassword;

  await loginWithPassword(currentPassword);

  const users = await requestJson<
    Array<{
      id: string;
      email: string;
      roleName: string;
      passwordUpdatedAt: string | null;
    }>
  >("GET /api/admin/users", "GET", "/api/admin/users", { auth: true });
  assert.ok(users.data.some((item) => item.id === adminUserId && item.passwordUpdatedAt));

  const roles = await requestJson<
    Array<{
      id: string;
      name: string;
      userCount: number;
      permissions: string[];
    }>
  >("GET /api/admin/roles", "GET", "/api/admin/roles", { auth: true });
  assert.ok(roles.data.some((item) => item.name === "Admin" && item.userCount >= 1 && item.permissions.length > 0));
});

test("E2E: media uploads and site settings", { concurrency: false }, async () => {
  const upload = await requestJson<AdminImageResponse>(
    "POST /api/admin/media/images",
    "POST",
    "/api/admin/media/images",
    {
      auth: true,
      expectedStatus: 201,
      body: {
        folder: "blog",
        fileName: "tekorix-e2e-cover.png",
        dataUrl: tinyPngDataUrl,
      },
    },
  );
  uploadedAdminImagePath = upload.data.path;
  assert.match(uploadedAdminImagePath, /^\/uploads\/admin\/blog\/.+\.png$/);

  const uploadDownload = await requestBinary("GET /uploads/*", "GET", uploadedAdminImagePath);
  const uploadedImageBuffer = Buffer.from(await uploadDownload.arrayBuffer());
  assert.ok(uploadedImageBuffer.byteLength > 0);

  const publicSettings = await requestJson<SiteSettingsResponse>("GET /api/v1/site-settings", "GET", "/api/v1/site-settings");
  assert.equal(publicSettings.success, true);

  const adminSettings = await requestJson<SiteSettingsResponse>(
    "GET /api/admin/site-settings",
    "GET",
    "/api/admin/site-settings",
    { auth: true },
  );
  assert.equal(adminSettings.success, true);

  const updatedSettings = await requestJson<SiteSettingsResponse>(
    "PUT /api/admin/site-settings",
    "PUT",
    "/api/admin/site-settings",
    {
      auth: true,
      body: {
        companyName: "Tekorix E2E",
        companyEmail: "contact@tekorix.test",
        companyPhone: "+91 98765 43210",
        companyAddress: "Bengaluru, India",
        companyGoogleMapLink: "https://maps.google.com/?q=Bengaluru",
        careersDomain: "careers.tekorix.test",
        careersHeadline: "Build delivery-ready teams with Tekorix.",
        careersSubtitle: "Automated end-to-end validation for admin and public routes.",
        careersPublished: true,
        careersShowTeamPhotos: true,
        careersAutoPublishJobs: false,
        careersTeamMembers: [
          {
            id: "team-e2e-1",
            name: "Aditi Rao",
            role: "Talent Lead",
            photo: uploadedAdminImagePath,
            blurb: "Coordinates hiring and delivery planning.",
          },
        ],
        talentProfilesEyebrow: "Representative profiles",
        talentProfilesHeadline: "Validated through automated route coverage",
        talentProfilesDescription: "This copy is persisted through the Express API during E2E verification.",
        talentProfiles: [
          {
            id: "profile-e2e-1",
            name: "Aarav Menon",
            role: "Platform Engineer",
            yearsOfExperience: 7,
            rating: 5,
            summary: "Strong backend and systems coverage.",
            detailedSummary: "Focused on automated delivery, integration testing, and operational reliability.",
            expertise: ["Node.js", "PostgreSQL", "Automation"],
            avatar: uploadedAdminImagePath,
            resumeCtaLabel: "View Resume",
          },
        ],
        notificationEmailProvider: "custom-provider",
        notificationEmailApiKey: "placeholder-credential",
        notificationFromEmail: "alerts@tekorix.test",
      },
    },
  );
  assert.equal(updatedSettings.data.companyName, "Tekorix E2E");
  assert.equal(updatedSettings.data.notificationFromEmail, "alerts@tekorix.test");

  const refreshedPublicSettings = await requestJson<SiteSettingsResponse>(
    "GET /api/v1/site-settings",
    "GET",
    "/api/v1/site-settings",
  );
  assert.equal(refreshedPublicSettings.data.companyName, "Tekorix E2E");
  assert.equal(
    Object.prototype.hasOwnProperty.call(refreshedPublicSettings.data, "notificationEmailProvider"),
    false,
  );

  const notificationTest = await requestJson<{ emailSent: boolean; emailError: string | null }>(
    "POST /api/admin/notification-settings/test",
    "POST",
    "/api/admin/notification-settings/test",
    {
      auth: true,
      expectedStatus: 502,
      body: {},
    },
  );
  assert.equal(notificationTest.success, false);
});

test("E2E: blog routes", { concurrency: false }, async () => {
  const adminListBefore = await requestJson<BlogPostRecord[]>(
    "GET /api/v1/admin/blog-posts",
    "GET",
    "/api/v1/admin/blog-posts",
    { auth: true },
  );
  assert.ok(Array.isArray(adminListBefore.data));

  const created = await requestJson<BlogPostRecord>(
    "POST /api/v1/admin/blog-posts",
    "POST",
    "/api/v1/admin/blog-posts",
    {
      auth: true,
      expectedStatus: 201,
      body: {
        slug: "tekorix-e2e-blog-post",
        category: "Technology",
        date: "May 2026",
        readTime: "4 min read",
        title: "Tekorix E2E blog coverage validates every route end to end.",
        description: "An automated article created only to validate the admin and public blog APIs.",
        coverImage: uploadedAdminImagePath,
        coverAlt: "Automated route validation",
        intro: "This temporary article exists to prove that blog CRUD, publishing, and public rendering routes work through the Express API.",
        sections: [
          {
            heading: "Coverage scope",
            paragraphs: [
              "The E2E suite verifies create, read, update, publish, and delete operations.",
            ],
            bullets: ["Admin CRUD", "Public fetch", "Publish state"],
          },
        ],
        isPublished: false,
      },
    },
  );
  createdBlogId = created.data.id;
  createdBlogSlug = created.data.slug;

  const fetchedById = await requestJson<BlogPostRecord>(
    "GET /api/v1/admin/blog-posts/:id",
    "GET",
    `/api/v1/admin/blog-posts/${createdBlogId}`,
    { auth: true },
  );
  assert.equal(fetchedById.data.id, createdBlogId);

  const updated = await requestJson<BlogPostRecord>(
    "PUT /api/v1/admin/blog-posts/:id",
    "PUT",
    `/api/v1/admin/blog-posts/${createdBlogId}`,
    {
      auth: true,
      body: {
        slug: createdBlogSlug,
        category: "Engineering",
        date: "May 2026",
        readTime: "5 min read",
        title: "Tekorix E2E blog coverage validates every route end to end.",
        description: "Updated description used to verify blog mutation through the Express API.",
        coverImage: uploadedAdminImagePath,
        coverAlt: "Updated route coverage graphic",
        intro: "This updated article confirms that blog edits persist correctly before publishing.",
        sections: [
          {
            heading: "Updated coverage scope",
            paragraphs: ["The blog post was edited during the E2E run before being published."],
            bullets: ["Edit path", "Publish path"],
          },
        ],
        isPublished: false,
      },
    },
  );
  assert.equal(updated.data.category, "Engineering");

  const published = await requestJson<BlogPostRecord>(
    "PATCH /api/v1/admin/blog-posts/:id/publish",
    "PATCH",
    `/api/v1/admin/blog-posts/${createdBlogId}/publish`,
    {
      auth: true,
      body: {
        isPublished: true,
      },
    },
  );
  assert.equal(published.data.isPublished, true);

  const publicList = await requestJson<BlogPostRecord[]>("GET /api/v1/blog-posts", "GET", "/api/v1/blog-posts");
  assert.ok(publicList.data.some((item) => item.id === createdBlogId));

  const publicDetail = await requestJson<BlogPostRecord>(
    "GET /api/v1/blog-posts/:slug",
    "GET",
    `/api/v1/blog-posts/${createdBlogSlug}`,
  );
  assert.equal(publicDetail.data.id, createdBlogId);
});

test("E2E: jobs and dashboard routes", { concurrency: false }, async () => {
  const jobsBefore = await requestJson<JobsListResponse>(
    "GET /api/v1/admin/jobs",
    "GET",
    "/api/v1/admin/jobs?page=1&pageSize=10",
    { auth: true },
  );
  assert.ok(Array.isArray(jobsBefore.data.items));

  const jobsMetaBefore = await requestJson<JobMetadataResponse>(
    "GET /api/v1/admin/jobs/meta",
    "GET",
    "/api/v1/admin/jobs/meta",
    { auth: true },
  );
  assert.ok(typeof jobsMetaBefore.data.totalJobs === "number");

  const created = await requestJson<JobRecord>(
    "POST /api/v1/admin/jobs",
    "POST",
    "/api/v1/admin/jobs",
    {
      auth: true,
      expectedStatus: 201,
      body: {
        title: "Tekorix E2E Platform Engineer",
        department: "Engineering",
        country: "India",
        city: "Bengaluru",
        location: "Bengaluru, India",
        experience: "4+ years",
        type: "full-time",
        salaryRange: "INR 20L - 28L",
        skills: ["Node.js", "PostgreSQL", "Testing"],
        description: "Own route coverage, database validation, and backend integration quality across the Tekorix platform.",
        status: "draft",
      },
    },
  );
  createdJobId = created.data.id;
  createdJobSlug = created.data.slug;

  const fetchedById = await requestJson<JobRecord>(
    "GET /api/v1/admin/jobs/:id",
    "GET",
    `/api/v1/admin/jobs/${createdJobId}`,
    { auth: true },
  );
  assert.equal(fetchedById.data.id, createdJobId);

  const updated = await requestJson<JobRecord>(
    "PUT /api/v1/admin/jobs/:id",
    "PUT",
    `/api/v1/admin/jobs/${createdJobId}`,
    {
      auth: true,
      body: {
        title: "Tekorix E2E Platform Engineer",
        department: "Platform Engineering",
        country: "India",
        city: "Bengaluru",
        location: "Hybrid - Bengaluru, India",
        experience: "5+ years",
        type: "contract",
        salaryRange: "INR 24L - 32L",
        skills: ["Node.js", "PostgreSQL", "E2E"],
        description: "Updated job payload used to verify edit coverage for the admin jobs API.",
        status: "draft",
      },
    },
  );
  assert.equal(updated.data.type, "contract");

  const published = await requestJson<JobRecord>(
    "PATCH /api/v1/admin/jobs/:id/publish",
    "PATCH",
    `/api/v1/admin/jobs/${createdJobId}/publish`,
    {
      auth: true,
      body: {
        status: "published",
      },
    },
  );
  assert.equal(published.data.status, "published");

  const publicJobs = await requestJson<JobsListResponse>("GET /api/v1/jobs", "GET", "/api/v1/jobs?page=1&pageSize=10");
  assert.ok(publicJobs.data.items.some((item) => item.id === createdJobId));

  const publicJob = await requestJson<JobRecord>(
    "GET /api/v1/jobs/:slug",
    "GET",
    `/api/v1/jobs/${createdJobSlug}`,
  );
  assert.equal(publicJob.data.id, createdJobId);

  const dashboard = await requestJson<DashboardResponse>(
    "GET /api/admin/dashboard",
    "GET",
    "/api/admin/dashboard",
    { auth: true },
  );
  assert.ok(dashboard.data.kpis.totalJobs >= 1);
});

test("E2E: company and candidate leads routes", { concurrency: false }, async () => {
  const companyLead = await requestJson<CompanyLeadRecord>(
    "POST /api/v1/company-leads",
    "POST",
    "/api/v1/company-leads",
    {
      expectedStatus: 201,
      body: {
        name: "Riya Sharma",
        companyName: "Tekorix Client Labs",
        email: "riya.sharma@example.com",
        phone: "+91 9876543210",
        need: "contractual-hire",
        message: "We need a delivery-ready backend team to support a platform migration over the next two quarters.",
        sourcePage: "find-talent",
      },
    },
  );
  createdCompanyLeadId = companyLead.data.id;

  const companyLeadList = await requestJson<CompanyLeadRecord[]>(
    "GET /api/v1/admin/company-leads",
    "GET",
    "/api/v1/admin/company-leads",
    { auth: true },
  );
  assert.ok(companyLeadList.data.some((item) => item.id === createdCompanyLeadId));

  const companyLeadDetail = await requestJson<CompanyLeadRecord>(
    "GET /api/v1/admin/company-leads/:id",
    "GET",
    `/api/v1/admin/company-leads/${createdCompanyLeadId}`,
    { auth: true },
  );
  assert.equal(companyLeadDetail.data.companyName, "Tekorix Client Labs");

  const companyLeadRead = await requestJson<CompanyLeadRecord>(
    "PATCH /api/v1/admin/company-leads/:id/read",
    "PATCH",
    `/api/v1/admin/company-leads/${createdCompanyLeadId}/read`,
    { auth: true, body: {} },
  );
  assert.equal(companyLeadRead.data.isRead, true);

  const uploadUrlResponse = await requestJson<{ uploadUrl: string; objectKey: string }>(
    "POST /api/v1/candidate-leads/upload-url",
    "POST",
    "/api/v1/candidate-leads/upload-url",
    {
      expectedStatus: 200,
      body: {
        fileName: "candidate-resume.pdf",
        contentType: "application/pdf",
        submissionType: "resume-submission",
      },
    },
  );
  createdCandidateLeadObjectKey = uploadUrlResponse.data.objectKey;
  assert.match(createdCandidateLeadObjectKey, /^candidate-leads\/resume-submission\/\d{4}-\d{2}\//);

  await requestRaw("PUT /api/v1/candidate-leads/upload", "PUT", uploadUrlResponse.data.uploadUrl, {
    body: pdfBuffer,
    contentType: "application/pdf",
    expectedStatus: 204,
  });

  const candidateLead = await requestJson<CandidateLeadRecord>(
    "POST /api/v1/candidate-leads",
    "POST",
    "/api/v1/candidate-leads",
    {
      expectedStatus: 201,
      body: {
        fullName: "Aarav Menon",
        email: "aarav.menon@example.com",
        phone: "+91 9876543210",
        role: "Platform Engineer",
        experience: "3-5 years",
        linkedInUrl: "https://www.linkedin.com/in/aarav-menon",
        desiredLocation: "Bengaluru",
        desiredSalaryRange: "INR 20L - 28L",
        skills: "Node.js, PostgreSQL, Automation",
        submissionType: "resume-submission",
        sourcePage: "find-job",
        resume_object_key: createdCandidateLeadObjectKey,
        resume_file_name: "candidate-resume.pdf",
        resume_content_type: "application/pdf",
      },
    },
  );
  createdCandidateLeadId = candidateLead.data.id;

  const candidateLeadList = await requestJson<CandidateLeadRecord[]>(
    "GET /api/v1/admin/candidate-leads",
    "GET",
    "/api/v1/admin/candidate-leads",
    { auth: true },
  );
  assert.ok(candidateLeadList.data.some((item) => item.id === createdCandidateLeadId));

  const candidateLeadDetail = await requestJson<CandidateLeadRecord>(
    "GET /api/v1/admin/candidate-leads/:id",
    "GET",
    `/api/v1/admin/candidate-leads/${createdCandidateLeadId}`,
    { auth: true },
  );
  assert.equal(candidateLeadDetail.data.id, createdCandidateLeadId);

  const candidateLeadRead = await requestJson<CandidateLeadRecord>(
    "PATCH /api/v1/admin/candidate-leads/:id/read",
    "PATCH",
    `/api/v1/admin/candidate-leads/${createdCandidateLeadId}/read`,
    { auth: true, body: {} },
  );
  assert.equal(candidateLeadRead.data.isRead, true);

  const candidateResumeDownload = await requestBinary(
    "GET /api/v1/admin/candidate-leads/:id/resume",
    "GET",
    `/api/v1/admin/candidate-leads/${createdCandidateLeadId}/resume`,
    { auth: true },
  );
  const candidateResumeBuffer = Buffer.from(await candidateResumeDownload.arrayBuffer());
  assert.ok(candidateResumeBuffer.byteLength > 0);
});

test("E2E: job applications and resume bank routes", { concurrency: false }, async () => {
  const formData = new FormData();
  formData.set("jobId", createdJobId);
  formData.set("jobTitle", "Tekorix E2E Platform Engineer");
  formData.set("jobLocation", "Hybrid - Bengaluru, India");
  formData.set("fullName", "Dev Singh");
  formData.set("email", "dev.singh@example.com");
  formData.set("phone", "+91 9876543210");
  formData.set("location", "Bengaluru");
  formData.set("experience", "5 years in backend engineering");
  formData.set("coverLetter", "Node.js, PostgreSQL, integration testing");
  formData.set("resume", new Blob([pdfBuffer], { type: "application/pdf" }), "dev-singh-resume.pdf");

  const createdApplication = await requestFormData<{ id: string }>(
    "POST /api/v1/job-applications",
    "POST",
    "/api/v1/job-applications",
    formData,
    {
      expectedStatus: 201,
    },
  );
  createdApplicationId = createdApplication.data.id;

  const applications = await requestJson<{ items: JobApplicationRecord[]; unreadCount: number }>(
    "GET /api/admin/job-applications",
    "GET",
    "/api/admin/job-applications",
    { auth: true },
  );
  assert.ok(applications.data.items.some((item) => item.id === createdApplicationId));

  const applicationDetail = await requestJson<JobApplicationRecord>(
    "GET /api/admin/job-applications/:id",
    "GET",
    `/api/admin/job-applications/${createdApplicationId}`,
    { auth: true },
  );
  const storedResumeObjectKey = applicationDetail.data.resume.storedName;
  assert.match(storedResumeObjectKey, /^job-applications\/\d{4}-\d{2}\//);

  const markedRead = await requestJson<JobApplicationRecord>(
    "PATCH /api/admin/job-applications",
    "PATCH",
    "/api/admin/job-applications",
    {
      auth: true,
      body: {
        id: createdApplicationId,
      },
    },
  );
  assert.equal(markedRead.data.isRead, true);

  const updatedApplication = await requestJson<JobApplicationRecord>(
    "PATCH /api/admin/job-applications/:id",
    "PATCH",
    `/api/admin/job-applications/${createdApplicationId}`,
    {
      auth: true,
      body: {
        status: "shortlisted",
      },
    },
  );
  assert.equal(updatedApplication.data.status, "shortlisted");

  const resumeDownload = await requestBinary(
    "GET /api/admin/job-applications/:id/resume",
    "GET",
    `/api/admin/job-applications/${createdApplicationId}/resume`,
    { auth: true },
  );
  const resumeBuffer = Buffer.from(await resumeDownload.arrayBuffer());
  assert.ok(resumeBuffer.byteLength > 0);

  const resumeBank = await requestJson<{ items: Array<{ applicationId: string }> }>(
    "GET /api/admin/resume-bank",
    "GET",
    "/api/admin/resume-bank",
    { auth: true },
  );
  assert.ok(resumeBank.data.items.some((item) => item.applicationId === createdApplicationId));

  const resumeBankDelete = await requestJson<{ deletedCount: number }>(
    "DELETE /api/admin/resume-bank",
    "DELETE",
    "/api/admin/resume-bank",
    {
      auth: true,
      body: {
        applicationId: createdApplicationId,
      },
    },
  );
  assert.equal(resumeBankDelete.data.deletedCount, 1);

  const deletedApplication = await requestJson<JobApplicationRecord>(
    "DELETE /api/admin/job-applications",
    "DELETE",
    "/api/admin/job-applications",
    {
      auth: true,
      body: {
        id: createdApplicationId,
      },
    },
  );
  assert.equal(deletedApplication.data.id, createdApplicationId);
});

test("E2E: contact submissions, templates, logs, and cleanup routes", { concurrency: false }, async () => {
  const contact = await requestJson<{ id: string }>(
    "POST /api/v1/contact-submissions",
    "POST",
    "/api/v1/contact-submissions",
    {
      expectedStatus: 201,
      body: {
        inquiryType: "client",
        firstName: "Anika",
        lastName: "Shah",
        email: "anika.shah@example.com",
        country: "India",
        industry: "Technology",
        company: "Tekorix Client Labs",
        position: "Hiring Manager",
        phonePrefix: "+91",
        phoneNumber: "9876543210",
        message: "We need help building a backend pod for a product launch in the next quarter.",
      },
    },
  );
  createdContactSubmissionId = contact.data.id;

  const contactList = await requestJson<{ items: ContactSubmissionRecord[]; unreadCount: number }>(
    "GET /api/admin/contact-submissions",
    "GET",
    "/api/admin/contact-submissions",
    { auth: true },
  );
  assert.ok(contactList.data.items.some((item) => item.id === createdContactSubmissionId));

  const contactReply = await requestJson<{
    item: ContactSubmissionRecord;
    emailSent: boolean;
    emailError: string | null;
  }>(
    "PATCH /api/admin/contact-submissions",
    "PATCH",
    "/api/admin/contact-submissions",
    {
      auth: true,
      body: {
        id: createdContactSubmissionId,
        replyMessage: "Thanks for reaching out. Our delivery team will review your requirements and follow up.",
        replyFromEmail: "alerts@tekorix.test",
      },
    },
  );
  assert.equal(contactReply.data.item.isRead, true);
  assert.equal(contactReply.data.emailSent, false);

  const templates = await requestJson<{ items: EmailTemplateRecord[] }>(
    "GET /api/admin/email-templates",
    "GET",
    "/api/admin/email-templates",
    { auth: true },
  );
  assert.ok(templates.data.items.length >= 1);

  const createdTemplate = await requestJson<EmailTemplateRecord>(
    "POST /api/admin/email-templates",
    "POST",
    "/api/admin/email-templates",
    {
      auth: true,
      expectedStatus: 201,
      body: {
        name: "E2E Template",
        subject: "Tekorix automated notification",
        body: "Hello {{candidate_name}}, this is an automated E2E validation email.",
        isActive: true,
      },
    },
  );
  createdTemplateId = createdTemplate.data.id;

  const updatedTemplate = await requestJson<EmailTemplateRecord>(
    "PATCH /api/admin/email-templates",
    "PATCH",
    "/api/admin/email-templates",
    {
      auth: true,
      body: {
        id: createdTemplateId,
        subject: "Tekorix updated automated notification",
      },
    },
  );
  assert.equal(updatedTemplate.data.subject, "Tekorix updated automated notification");

  const sendTemplate = await requestJson<{ emailSent: boolean; emailError: string | null }>(
    "POST /api/admin/email-templates/send",
    "POST",
    "/api/admin/email-templates/send",
    {
      auth: true,
      expectedStatus: 502,
      body: {
        templateId: createdTemplateId,
        toEmail: "candidate@example.com",
        fromEmail: "alerts@tekorix.test",
      },
    },
  );
  assert.equal(sendTemplate.success, false);

  const logs = await requestJson<{
    activity: Array<{ id: string }>;
    audit: Array<{ id: string }>;
    notifications: Array<{ id: string }>;
  }>("GET /api/admin/logs", "GET", "/api/admin/logs", { auth: true });
  assert.ok(logs.data.activity.length > 0 || logs.data.audit.length > 0 || logs.data.notifications.length > 0);

  const clearNotificationLogs = await requestJson<null>(
    "DELETE /api/admin/logs",
    "DELETE",
    "/api/admin/logs",
    {
      auth: true,
      body: {
        tab: "notifications",
      },
    },
  );
  assert.equal(clearNotificationLogs.success, true);

  const deleteTemplate = await requestJson<null>(
    "DELETE /api/admin/email-templates",
    "DELETE",
    "/api/admin/email-templates",
    {
      auth: true,
      body: {
        id: createdTemplateId,
      },
    },
  );
  assert.equal(deleteTemplate.success, true);

  const deleteContact = await requestJson<null>(
    "DELETE /api/admin/contact-submissions",
    "DELETE",
    "/api/admin/contact-submissions",
    {
      auth: true,
      body: {
        id: createdContactSubmissionId,
      },
    },
  );
  assert.equal(deleteContact.success, true);

  const deleteJob = await requestJson<null>(
    "DELETE /api/v1/admin/jobs/:id",
    "DELETE",
    `/api/v1/admin/jobs/${createdJobId}`,
    {
      auth: true,
    },
  );
  assert.equal(deleteJob.success, true);

  const deleteBlog = await requestJson<null>(
    "DELETE /api/v1/admin/blog-posts/:id",
    "DELETE",
    `/api/v1/admin/blog-posts/${createdBlogId}`,
    {
      auth: true,
    },
  );
  assert.equal(deleteBlog.success, true);
});

test("E2E: all expected routes were covered", { concurrency: false }, async () => {
  const missingRoutes = [...expectedRouteCoverage].filter((routeKey) => !routeCoverage.has(routeKey));
  assert.deepEqual(missingRoutes, []);
});
