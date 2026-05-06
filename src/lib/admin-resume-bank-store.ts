import { getPool } from "../database/pool.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";
import type { JobApplicationRecord } from "./admin-job-applications-store.js";

export type ResumeBankEntry = {
  applicationId: string;
  fullName: string;
  jobTitle: string;
  jobLocation: string;
  createdAt: string;
  updatedAt: string;
};

type ResumeBankRow = {
  application_id: string;
  full_name: string;
  job_title: string;
  job_location: string;
  created_at: Date | string;
  updated_at: Date | string;
};

const storageFileName = "resume-bank.json";
let resumeBankSeedAttempted = false;

function toIsoString(value: Date | string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback;
  }

  return typeof value === "string" ? value : value.toISOString();
}

function normalizeRecord(value: unknown): ResumeBankEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<ResumeBankEntry>;
  const applicationId = trimToString(item.applicationId);
  const fullName = trimToString(item.fullName);
  const jobTitle = trimToString(item.jobTitle);
  const jobLocation = trimToString(item.jobLocation);

  if (!applicationId || !fullName || !jobTitle || !jobLocation) {
    return null;
  }

  return {
    applicationId,
    fullName,
    jobTitle,
    jobLocation,
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
  };
}

function mapRow(row: ResumeBankRow): ResumeBankEntry {
  return {
    applicationId: row.application_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    jobLocation: row.job_location,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function readResumeBankFile() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, []);

  return parsed
    .map((item) => normalizeRecord(item))
    .filter((item): item is ResumeBankEntry => Boolean(item))
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
}

async function writeResumeBankFile(items: ResumeBankEntry[]) {
  await writeJsonFile(storageFileName, items);
}

async function ensureResumeBankSeeded() {
  if (resumeBankSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM resume_bank");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    resumeBankSeedAttempted = true;
    return;
  }

  const seedItems = await readResumeBankFile();

  if (!seedItems.length) {
    resumeBankSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of seedItems) {
      await client.query(
        `
          INSERT INTO resume_bank (application_id, full_name, job_title, job_location, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (application_id) DO NOTHING
        `,
        [item.applicationId, item.fullName, item.jobTitle, item.jobLocation, item.createdAt, item.updatedAt],
      );
    }

    await client.query("COMMIT");
    resumeBankSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readPersistedResumeBank() {
  await ensureResumeBankSeeded();
  const result = await getPool().query<ResumeBankRow>(
    `
      SELECT application_id, full_name, job_title, job_location, created_at, updated_at
      FROM resume_bank
      ORDER BY updated_at DESC
    `,
  );

  return result.rows.map((row) => mapRow(row));
}

export async function getResumeBankEntries() {
  try {
    return await readPersistedResumeBank();
  } catch {
    return readResumeBankFile();
  }
}

export async function upsertResumeBankEntryFromApplication(application: JobApplicationRecord) {
  try {
    await ensureResumeBankSeeded();
    const result = await getPool().query<ResumeBankRow>(
      `
        INSERT INTO resume_bank (application_id, full_name, job_title, job_location, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (application_id)
        DO UPDATE
          SET full_name = EXCLUDED.full_name,
              job_title = EXCLUDED.job_title,
              job_location = EXCLUDED.job_location,
              updated_at = NOW()
        RETURNING application_id, full_name, job_title, job_location, created_at, updated_at
      `,
      [application.id, application.fullName, application.jobTitle, application.jobLocation],
    );

    return mapRow(result.rows[0]);
  } catch {
    const items = await readResumeBankFile();
    const existing = items.find((item) => item.applicationId === application.id);
    const now = new Date().toISOString();
    const next: ResumeBankEntry = {
      applicationId: application.id,
      fullName: application.fullName,
      jobTitle: application.jobTitle,
      jobLocation: application.jobLocation,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const filtered = items.filter((item) => item.applicationId !== application.id);
    filtered.unshift(next);
    await writeResumeBankFile(filtered);
    return next;
  }
}

export async function removeResumeBankEntryByApplicationId(applicationId: string) {
  try {
    await ensureResumeBankSeeded();
    const result = await getPool().query("DELETE FROM resume_bank WHERE application_id = $1", [applicationId]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    const items = await readResumeBankFile();
    const next = items.filter((item) => item.applicationId !== applicationId);
    const removed = next.length !== items.length;

    if (removed) {
      await writeResumeBankFile(next);
    }

    return removed;
  }
}

export async function removeResumeBankEntriesByApplicationIds(applicationIds: string[]) {
  if (!applicationIds.length) {
    return 0;
  }

  try {
    await ensureResumeBankSeeded();
    const result = await getPool().query(
      "DELETE FROM resume_bank WHERE application_id = ANY($1::text[]) RETURNING application_id",
      [applicationIds],
    );
    return result.rowCount ?? 0;
  } catch {
    const blocked = new Set(applicationIds.map((item) => item.trim()).filter(Boolean));

    if (!blocked.size) {
      return 0;
    }

    const items = await readResumeBankFile();
    const next = items.filter((item) => !blocked.has(item.applicationId));
    const removed = items.length - next.length;

    if (removed > 0) {
      await writeResumeBankFile(next);
    }

    return removed;
  }
}

export async function clearResumeBankEntries() {
  try {
    await ensureResumeBankSeeded();
    await getPool().query("DELETE FROM resume_bank");
  } catch {
    await writeResumeBankFile([]);
  }
}
