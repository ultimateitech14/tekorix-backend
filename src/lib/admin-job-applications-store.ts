import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

import { getPool } from "../database/pool.js";
import { deleteR2Object, getR2Object, putR2Object } from "../services/r2-storage.service.js";
import {
  ensureFrontendDataDir,
  getFrontendDataFilePath,
  normalizeTimestamp,
  readJsonFile,
  trimToString,
} from "./shared-admin-files.js";

export type JobApplicationStatus = "pending review" | "shortlisted" | "rejected" | "interview";

export type JobApplicationResume = {
  originalName: string;
  storedName: string;
  contentType: string;
  size: number;
};

export type JobApplicationRecord = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobLocation: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  experience: string;
  coverLetter: string;
  adminNotes: string;
  status: JobApplicationStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  isRead: boolean;
  resume: JobApplicationResume;
};

export type CreateJobApplicationInput = Omit<
  JobApplicationRecord,
  "id" | "adminNotes" | "status" | "createdAt" | "updatedAt" | "reviewedAt" | "isRead"
>;

type JobApplicationRow = {
  id: string;
  job_id: string;
  job_title: string;
  job_location: string;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  experience: string;
  cover_letter: string;
  admin_notes: string;
  status: string;
  reviewed_at: Date | string | null;
  is_read: boolean;
  resume_original_name: string;
  resume_stored_name: string;
  resume_content_type: string;
  resume_size: number;
  created_at: Date | string;
  updated_at: Date | string;
};

const storageFileName = "job-applications.json";
const storageFilePath = getFrontendDataFilePath(storageFileName);
let jobApplicationsSeedAttempted = false;

function normalizeStatus(value: unknown): JobApplicationStatus {
  if (
    value === "pending review" ||
    value === "shortlisted" ||
    value === "rejected" ||
    value === "interview"
  ) {
    return value;
  }

  return "pending review";
}

function toIsoString(value: Date | string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback;
  }

  return typeof value === "string" ? value : value.toISOString();
}

function slugifyFileStem(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

function normalizeResume(value: unknown): JobApplicationResume | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<JobApplicationResume>;
  const originalName = trimToString(item.originalName);
  const storedName = trimToString(item.storedName);
  const contentType = trimToString(item.contentType) || "application/octet-stream";
  const size = typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0;

  if (!originalName || !storedName || size <= 0) {
    return null;
  }

  return {
    originalName,
    storedName,
    contentType,
    size,
  };
}

function normalizeRecord(value: unknown): JobApplicationRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<JobApplicationRecord>;
  const id = trimToString(item.id);
  const jobId = trimToString(item.jobId);
  const jobTitle = trimToString(item.jobTitle);
  const jobLocation = trimToString(item.jobLocation);
  const fullName = trimToString(item.fullName);
  const email = trimToString(item.email);
  const phone = trimToString(item.phone);
  const location = trimToString(item.location);
  const experience = trimToString(item.experience);
  const coverLetter = trimToString(item.coverLetter);
  const adminNotes = trimToString(item.adminNotes);
  const resume = normalizeResume(item.resume);

  if (
    !id ||
    !jobId ||
    !jobTitle ||
    !jobLocation ||
    !fullName ||
    !email ||
    !phone ||
    !location ||
    !experience ||
    !coverLetter ||
    !resume
  ) {
    return null;
  }

  return {
    id,
    jobId,
    jobTitle,
    jobLocation,
    fullName,
    email,
    phone,
    location,
    experience,
    coverLetter,
    adminNotes,
    status: normalizeStatus(item.status),
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
    reviewedAt:
      typeof item.reviewedAt === "string" && !Number.isNaN(new Date(item.reviewedAt).getTime())
        ? item.reviewedAt
        : null,
    isRead: Boolean(item.isRead),
    resume,
  };
}

function mapRow(row: JobApplicationRow): JobApplicationRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    jobLocation: row.job_location,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    experience: row.experience,
    coverLetter: row.cover_letter,
    adminNotes: row.admin_notes,
    status: normalizeStatus(row.status),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
    isRead: row.is_read,
    resume: {
      originalName: row.resume_original_name,
      storedName: row.resume_stored_name,
      contentType: row.resume_content_type || "application/octet-stream",
      size: row.resume_size,
    },
  };
}

async function deleteResumeFile(storedName: string) {
  try {
    await deleteR2Object(storedName);
  } catch {
    // Ignore storage cleanup issues while removing application metadata.
  }
}

function buildJobApplicationResumeObjectKey(originalName: string) {
  const normalizedName = trimToString(originalName);
  const extension = path.extname(normalizedName).toLowerCase();
  const baseName = extension ? normalizedName.slice(0, -extension.length) : normalizedName;
  const safeBaseName = slugifyFileStem(baseName) || "resume";
  const yearMonth = new Date().toISOString().slice(0, 7);

  return path.posix.join(
    "job-applications",
    yearMonth,
    `${Date.now()}-${safeBaseName}-${randomUUID().slice(0, 8)}${extension}`,
  );
}

async function readApplicationsFile() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, []);

  return parsed
    .map((item) => normalizeRecord(item))
    .filter((item): item is JobApplicationRecord => Boolean(item))
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

async function writeApplicationsFile(items: JobApplicationRecord[]) {
  await ensureFrontendDataDir();
  await writeFile(storageFilePath, JSON.stringify(items, null, 2), "utf8");
}

async function ensureJobApplicationsSeeded() {
  if (jobApplicationsSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM job_applications");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    jobApplicationsSeedAttempted = true;
    return;
  }

  const seedItems = await readApplicationsFile();

  if (!seedItems.length) {
    jobApplicationsSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of seedItems) {
      await client.query(
        `
          INSERT INTO job_applications (
            id,
            job_id,
            job_title,
            job_location,
            full_name,
            email,
            phone,
            location,
            experience,
            cover_letter,
            admin_notes,
            status,
            reviewed_at,
            is_read,
            resume_original_name,
            resume_stored_name,
            resume_content_type,
            resume_size,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          item.id,
          item.jobId,
          item.jobTitle,
          item.jobLocation,
          item.fullName,
          item.email,
          item.phone,
          item.location,
          item.experience,
          item.coverLetter,
          item.adminNotes,
          item.status,
          item.reviewedAt,
          item.isRead,
          item.resume.originalName,
          item.resume.storedName,
          item.resume.contentType,
          item.resume.size,
          item.createdAt,
          item.updatedAt,
        ],
      );
    }

    await client.query("COMMIT");
    jobApplicationsSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readPersistedApplications() {
  await ensureJobApplicationsSeeded();
  const result = await getPool().query<JobApplicationRow>(
    `
      SELECT
        id,
        job_id,
        job_title,
        job_location,
        full_name,
        email,
        phone,
        location,
        experience,
        cover_letter,
        admin_notes,
        status,
        reviewed_at,
        is_read,
        resume_original_name,
        resume_stored_name,
        resume_content_type,
        resume_size,
        created_at,
        updated_at
      FROM job_applications
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapRow(row));
}

async function getNextApplicationIdFromDb() {
  const result = await getPool().query<{ max_id: string | null }>(
    `
      SELECT MAX((regexp_match(id, '^APP-(\\d+)$'))[1]::int)::text AS max_id
      FROM job_applications
    `,
  );

  const max = Number(result.rows[0]?.max_id ?? "9000");
  return `APP-${String((Number.isFinite(max) ? max : 9000) + 1).padStart(4, "0")}`;
}

function getNextApplicationId(items: JobApplicationRecord[]) {
  const max = items.reduce((currentMax, item) => {
    const match = item.id.match(/^APP-(\d+)$/);

    if (!match) {
      return currentMax;
    }

    const value = Number(match[1]);
    return Number.isInteger(value) ? Math.max(currentMax, value) : currentMax;
  }, 9000);

  return `APP-${String(max + 1).padStart(4, "0")}`;
}

export async function saveJobApplicationResumeUpload(input: {
  originalName: string;
  contentType: string;
  buffer: Buffer;
}) {
  const storedName = buildJobApplicationResumeObjectKey(input.originalName);
  const contentType = trimToString(input.contentType) || "application/octet-stream";

  await putR2Object({
    objectKey: storedName,
    contentType,
    body: input.buffer,
    cacheControl: "private, max-age=0, no-store",
  });

  return {
    originalName: trimToString(input.originalName),
    storedName,
    contentType,
    size: input.buffer.byteLength,
  } satisfies JobApplicationResume;
}

export async function createJobApplication(input: CreateJobApplicationInput) {
  const now = new Date().toISOString();

  try {
    await ensureJobApplicationsSeeded();
    const id = await getNextApplicationIdFromDb();
    const result = await getPool().query<JobApplicationRow>(
      `
        INSERT INTO job_applications (
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', 'pending review', NULL, false, $11, $12, $13, $14, NOW(), NOW()
        )
        RETURNING
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
      `,
      [
        id,
        input.jobId,
        input.jobTitle,
        input.jobLocation,
        input.fullName,
        input.email,
        input.phone,
        input.location,
        input.experience,
        input.coverLetter,
        input.resume.originalName,
        input.resume.storedName,
        input.resume.contentType,
        input.resume.size,
      ],
    );

    return mapRow(result.rows[0]);
  } catch {
    const items = await readApplicationsFile();
    const next: JobApplicationRecord = {
      ...input,
      id: getNextApplicationId(items),
      adminNotes: "",
      status: "pending review",
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      isRead: false,
    };

    items.unshift(next);
    await writeApplicationsFile(items);
    return next;
  }
}

export async function readJobApplications() {
  try {
    return await readPersistedApplications();
  } catch {
    return readApplicationsFile();
  }
}

export async function getJobApplicationById(id: string) {
  try {
    await ensureJobApplicationsSeeded();
    const result = await getPool().query<JobApplicationRow>(
      `
        SELECT
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
        FROM job_applications
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readApplicationsFile();
    return items.find((item) => item.id === id) ?? null;
  }
}

export async function markJobApplicationAsRead(id: string) {
  try {
    await ensureJobApplicationsSeeded();
    const result = await getPool().query<JobApplicationRow>(
      `
        UPDATE job_applications
        SET is_read = true, updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
      `,
      [id],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readApplicationsFile();
    let updated: JobApplicationRecord | null = null;
    const now = new Date().toISOString();

    const next = items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      updated = {
        ...item,
        isRead: true,
        updatedAt: now,
      };

      return updated;
    });

    if (!updated) {
      return null;
    }

    await writeApplicationsFile(next);
    return updated;
  }
}

export async function markAllJobApplicationsAsRead() {
  try {
    await ensureJobApplicationsSeeded();
    await getPool().query("UPDATE job_applications SET is_read = true, updated_at = NOW() WHERE is_read = false");
  } catch {
    const items = await readApplicationsFile();
    const now = new Date().toISOString();
    const next = items.map((item) => ({
      ...item,
      isRead: true,
      updatedAt: now,
    }));

    await writeApplicationsFile(next);
  }
}

export async function updateJobApplicationStatus(id: string, status: JobApplicationStatus) {
  try {
    await ensureJobApplicationsSeeded();
    const result = await getPool().query<JobApplicationRow>(
      `
        UPDATE job_applications
        SET
          status = $2,
          is_read = true,
          reviewed_at = CASE WHEN $2 = 'pending review' THEN reviewed_at ELSE NOW() END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
      `,
      [id, status],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readApplicationsFile();
    let updated: JobApplicationRecord | null = null;
    const now = new Date().toISOString();

    const next = items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      updated = {
        ...item,
        status,
        isRead: true,
        updatedAt: now,
        reviewedAt: status === "pending review" ? item.reviewedAt : now,
      };

      return updated;
    });

    if (!updated) {
      return null;
    }

    await writeApplicationsFile(next);
    return updated;
  }
}

export async function updateJobApplicationAdminNotes(id: string, adminNotes: string) {
  try {
    await ensureJobApplicationsSeeded();
    const result = await getPool().query<JobApplicationRow>(
      `
        UPDATE job_applications
        SET admin_notes = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
      `,
      [id, adminNotes],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readApplicationsFile();
    let updated: JobApplicationRecord | null = null;
    const now = new Date().toISOString();

    const next = items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      updated = {
        ...item,
        adminNotes,
        updatedAt: now,
      };

      return updated;
    });

    if (!updated) {
      return null;
    }

    await writeApplicationsFile(next);
    return updated;
  }
}

export async function deleteJobApplicationById(id: string) {
  try {
    await ensureJobApplicationsSeeded();
    const result = await getPool().query<JobApplicationRow>(
      `
        DELETE FROM job_applications
        WHERE id = $1
        RETURNING
          id,
          job_id,
          job_title,
          job_location,
          full_name,
          email,
          phone,
          location,
          experience,
          cover_letter,
          admin_notes,
          status,
          reviewed_at,
          is_read,
          resume_original_name,
          resume_stored_name,
          resume_content_type,
          resume_size,
          created_at,
          updated_at
      `,
      [id],
    );

    const deleted = result.rows[0] ? mapRow(result.rows[0]) : null;

    if (deleted) {
      await deleteResumeFile(deleted.resume.storedName);
    }

    return deleted;
  } catch {
    const items = await readApplicationsFile();
    const existing = items.find((item) => item.id === id) ?? null;

    if (!existing) {
      return null;
    }

    const next = items.filter((item) => item.id !== id);
    await writeApplicationsFile(next);
    await deleteResumeFile(existing.resume.storedName);

    return existing;
  }
}

export async function deleteAllJobApplications() {
  try {
    await ensureJobApplicationsSeeded();
    const result = await getPool().query<{ resume_stored_name: string }>(
      "DELETE FROM job_applications RETURNING resume_stored_name",
    );
    await Promise.all(result.rows.map((item) => deleteResumeFile(item.resume_stored_name)));
    return result.rowCount ?? 0;
  } catch {
    const items = await readApplicationsFile();

    if (!items.length) {
      return 0;
    }

    await writeApplicationsFile([]);
    await Promise.all(items.map((item) => deleteResumeFile(item.resume.storedName)));
    return items.length;
  }
}

export async function getJobApplicationResumeById(id: string) {
  const application = await getJobApplicationById(id);

  if (!application) {
    return null;
  }

  const object = await getR2Object(application.resume.storedName);

  if (!object) {
    return null;
  }

  return {
    application,
    object,
  };
}
