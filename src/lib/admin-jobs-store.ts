import { randomUUID } from "crypto";

import { getPool } from "../database/pool.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";

export type AdminJobType = "full-time" | "part-time" | "contract";
export type AdminJobStatus = "draft" | "published" | "closed";

export type AdminJobRecord = {
  id: string;
  title: string;
  slug: string;
  department: string;
  country: string;
  city: string;
  location: string;
  description: string;
  experience: string;
  type: AdminJobType;
  salaryRange: string;
  skills: string[];
  status: AdminJobStatus;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobsListQuery = {
  search?: string;
  status?: AdminJobStatus;
  type?: AdminJobType;
  country?: string;
  location?: string;
  department?: string;
  remoteOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type AdminJobsMetadataBucket = {
  key: string;
  label: string;
  total: number;
  published: number;
  draft: number;
  closed: number;
};

export type AdminJobsTypeMetadata = {
  type: AdminJobType;
  label: string;
  total: number;
  published: number;
  draft: number;
  closed: number;
};

export type AdminJobsMetadata = {
  totalJobs: number;
  publishedJobs: number;
  draftJobs: number;
  closedJobs: number;
  departments: AdminJobsMetadataBucket[];
  countries: AdminJobsMetadataBucket[];
  locations: AdminJobsMetadataBucket[];
  skills: AdminJobsMetadataBucket[];
  jobTypes: AdminJobsTypeMetadata[];
};

type UpsertJobInput = {
  title: string;
  department: string;
  country: string;
  city: string;
  location: string;
  description: string;
  experience: string;
  type: AdminJobType;
  salaryRange?: string;
  skills?: string[];
  status?: "draft" | "published";
};

type JobRow = {
  id: string;
  title: string;
  slug: string;
  department: string;
  country: string;
  city: string;
  location: string;
  description: string;
  experience: string;
  job_type: string;
  salary_range: string | null;
  skills: unknown;
  status: string;
  is_active: boolean;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const storageFileName = "jobs.json";
let jobsSeedAttempted = false;

function normalizeJobType(value: unknown): AdminJobType {
  if (value === "full-time" || value === "part-time" || value === "contract") {
    return value;
  }

  return "full-time";
}

function normalizeJobStatus(value: unknown): AdminJobStatus {
  if (value === "draft" || value === "published" || value === "closed") {
    return value;
  }

  return "draft";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildSlug(title: string, id: string) {
  const base = slugify(title) || "job";
  const suffix = id.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase().slice(0, 8);
  return suffix ? `${base}-${suffix}` : base;
}

function normalizeSkills(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => trimToString(item)).filter(Boolean).slice(0, 20);
}

function normalizeRecord(value: unknown): AdminJobRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<AdminJobRecord>;
  const id = trimToString(item.id);
  const title = trimToString(item.title);
  const department = trimToString(item.department);
  const country = trimToString(item.country);
  const city = trimToString(item.city);
  const location = trimToString(item.location);
  const description = trimToString(item.description);
  const experience = trimToString(item.experience);

  if (!id || !title || !department || !country || !city || !location || !description || !experience) {
    return null;
  }

  const status = normalizeJobStatus(item.status);
  const createdAt = normalizeTimestamp(item.createdAt);
  const updatedAt = normalizeTimestamp(item.updatedAt, createdAt);
  const publishedAt =
    typeof item.publishedAt === "string" && !Number.isNaN(new Date(item.publishedAt).getTime())
      ? item.publishedAt
      : status === "published"
        ? updatedAt
        : null;

  return {
    id,
    title,
    slug: trimToString(item.slug) || buildSlug(title, id),
    department,
    country,
    city,
    location,
    description,
    experience,
    type: normalizeJobType(item.type),
    salaryRange: trimToString(item.salaryRange),
    skills: normalizeSkills(item.skills),
    status,
    isActive: typeof item.isActive === "boolean" ? item.isActive : status === "published",
    publishedAt,
    createdAt,
    updatedAt,
  };
}

function toIsoString(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function mapJobRow(row: JobRow): AdminJobRecord {
  const status = normalizeJobStatus(row.status);
  const updatedAt = normalizeTimestamp(toIsoString(row.updated_at) ?? undefined);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    department: row.department,
    country: row.country,
    city: row.city,
    location: row.location,
    description: row.description,
    experience: row.experience,
    type: normalizeJobType(row.job_type),
    salaryRange: trimToString(row.salary_range),
    skills: normalizeSkills(row.skills),
    status,
    isActive: row.is_active,
    publishedAt: toIsoString(row.published_at),
    createdAt: normalizeTimestamp(toIsoString(row.created_at) ?? updatedAt),
    updatedAt,
  };
}

async function ensureJobsSeeded() {
  if (jobsSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM jobs");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    jobsSeedAttempted = true;
    return;
  }

  const seedItems = (await readJsonFile<unknown[]>(storageFileName, []))
    .map((item) => normalizeRecord(item))
    .filter((item): item is AdminJobRecord => Boolean(item));

  if (!seedItems.length) {
    jobsSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of seedItems) {
      await client.query(
        `
          INSERT INTO jobs (
            id,
            slug,
            title,
            department,
            country,
            city,
            location,
            description,
            experience,
            job_type,
            salary_range,
            skills,
            status,
            is_active,
            published_at,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          item.id,
          item.slug,
          item.title,
          item.department,
          item.country,
          item.city,
          item.location,
          item.description,
          item.experience,
          item.type,
          item.salaryRange,
          JSON.stringify(item.skills),
          item.status,
          item.isActive,
          item.publishedAt,
          item.createdAt,
          item.updatedAt,
        ],
      );
    }

    await client.query("COMMIT");
    jobsSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readAllJobs() {
  await ensureJobsSeeded();
  const result = await getPool().query<JobRow>(
    `
      SELECT
        id,
        slug,
        title,
        department,
        country,
        city,
        location,
        description,
        experience,
        job_type,
        salary_range,
        skills,
        status,
        is_active,
        published_at,
        created_at,
        updated_at
      FROM jobs
      ORDER BY updated_at DESC
    `,
  );

  return result.rows.map((row) => mapJobRow(row));
}

async function readJobsFileFallback() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, []);

  return parsed
    .map((item) => normalizeRecord(item))
    .filter((item): item is AdminJobRecord => Boolean(item))
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
}

async function writeJobsFileFallback(items: AdminJobRecord[]) {
  await writeJsonFile(storageFileName, items);
}

function createMetadataBucketMap() {
  return new Map<string, AdminJobsMetadataBucket>();
}

function incrementMetadataBucket(
  buckets: Map<string, AdminJobsMetadataBucket>,
  key: string,
  label: string,
  status: AdminJobStatus,
) {
  const existing = buckets.get(key) ?? {
    key,
    label,
    total: 0,
    published: 0,
    draft: 0,
    closed: 0,
  };

  existing.total += 1;
  existing[status] += 1;
  buckets.set(key, existing);
}

function toSortedMetadataBuckets(buckets: Map<string, AdminJobsMetadataBucket>) {
  return Array.from(buckets.values()).sort((left, right) => {
    if (left.total !== right.total) {
      return right.total - left.total;
    }

    return left.label.localeCompare(right.label);
  });
}

function summarizeJobs(items: AdminJobRecord[]): AdminJobsMetadata {
  const departments = createMetadataBucketMap();
  const countries = createMetadataBucketMap();
  const locations = createMetadataBucketMap();
  const skills = createMetadataBucketMap();
  const jobTypes = new Map<AdminJobType, AdminJobsTypeMetadata>();
  let publishedJobs = 0;
  let draftJobs = 0;
  let closedJobs = 0;

  for (const item of items) {
    if (item.status === "published") {
      publishedJobs += 1;
    } else if (item.status === "closed") {
      closedJobs += 1;
    } else {
      draftJobs += 1;
    }

    incrementMetadataBucket(
      departments,
      item.department.toLowerCase(),
      item.department,
      item.status,
    );
    incrementMetadataBucket(countries, item.country.toLowerCase(), item.country, item.status);
    incrementMetadataBucket(locations, item.location.toLowerCase(), item.location, item.status);

    for (const skill of item.skills) {
      incrementMetadataBucket(skills, skill.toLowerCase(), skill, item.status);
    }

    const currentType = jobTypes.get(item.type) ?? {
      type: item.type,
      label: item.type === "full-time" ? "Full-time" : item.type === "part-time" ? "Part-time" : "Contract",
      total: 0,
      published: 0,
      draft: 0,
      closed: 0,
    };

    currentType.total += 1;
    currentType[item.status] += 1;
    jobTypes.set(item.type, currentType);
  }

  return {
    totalJobs: items.length,
    publishedJobs,
    draftJobs,
    closedJobs,
    departments: toSortedMetadataBuckets(departments),
    countries: toSortedMetadataBuckets(countries),
    locations: toSortedMetadataBuckets(locations),
    skills: toSortedMetadataBuckets(skills),
    jobTypes: Array.from(jobTypes.values()).sort((left, right) => {
      if (left.total !== right.total) {
        return right.total - left.total;
      }

      return left.label.localeCompare(right.label);
    }),
  };
}

function filterJobs(items: AdminJobRecord[], query: JobsListQuery) {
  const search = query.search?.trim().toLowerCase() ?? "";
  const country = query.country?.trim().toLowerCase() ?? "";
  const location = query.location?.trim().toLowerCase() ?? "";
  const department = query.department?.trim().toLowerCase() ?? "";

  return items.filter((item) => {
    const haystack = [
      item.title,
      item.description,
      item.department,
      item.country,
      item.city,
      item.location,
      item.experience,
      ...item.skills,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesStatus = !query.status || item.status === query.status;
    const matchesType = !query.type || item.type === query.type;
    const matchesCountry = !country || item.country.toLowerCase() === country;
    const matchesLocation =
      !location ||
      item.location.toLowerCase().includes(location) ||
      item.city.toLowerCase().includes(location);
    const matchesDepartment = !department || item.department.toLowerCase() === department;
    const matchesRemoteOnly = !query.remoteOnly || item.location.toLowerCase().includes("remote");

    return (
      matchesSearch &&
      matchesStatus &&
      matchesType &&
      matchesCountry &&
      matchesLocation &&
      matchesDepartment &&
      matchesRemoteOnly
    );
  });
}

function paginateJobs(items: AdminJobRecord[], page = 1, pageSize = 10) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 10;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: currentPage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export async function listAdminJobs(query: JobsListQuery = {}) {
  try {
    const items = await readAllJobs();
    return paginateJobs(filterJobs(items, query), query.page, query.pageSize);
  } catch {
    const items = await readJobsFileFallback();
    return paginateJobs(filterJobs(items, query), query.page, query.pageSize);
  }
}

export async function listPublicJobs(query: JobsListQuery = {}) {
  try {
    const items = await readAllJobs();
    const publishedOnly = items.filter((item) => item.status === "published" && item.isActive);
    return paginateJobs(filterJobs(publishedOnly, query), query.page, query.pageSize);
  } catch {
    const items = await readJobsFileFallback();
    const publishedOnly = items.filter((item) => item.status === "published" && item.isActive);
    return paginateJobs(filterJobs(publishedOnly, query), query.page, query.pageSize);
  }
}

export async function getAdminJobById(id: string) {
  try {
    await ensureJobsSeeded();
    const result = await getPool().query<JobRow>(
      `
        SELECT
          id,
          slug,
          title,
          department,
          country,
          city,
          location,
          description,
          experience,
          job_type,
          salary_range,
          skills,
          status,
          is_active,
          published_at,
          created_at,
          updated_at
        FROM jobs
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ? mapJobRow(result.rows[0]) : null;
  } catch {
    const items = await readJobsFileFallback();
    return items.find((item) => item.id === id) ?? null;
  }
}

export async function getPublicJobBySlug(slug: string) {
  try {
    await ensureJobsSeeded();
    const result = await getPool().query<JobRow>(
      `
        SELECT
          id,
          slug,
          title,
          department,
          country,
          city,
          location,
          description,
          experience,
          job_type,
          salary_range,
          skills,
          status,
          is_active,
          published_at,
          created_at,
          updated_at
        FROM jobs
        WHERE slug = $1 AND status = 'published' AND is_active = true
        LIMIT 1
      `,
      [slug],
    );

    return result.rows[0] ? mapJobRow(result.rows[0]) : null;
  } catch {
    const items = await readJobsFileFallback();
    return items.find((item) => item.slug === slug && item.status === "published" && item.isActive) ?? null;
  }
}

export async function getAdminJobsMetadata() {
  try {
    return summarizeJobs(await readAllJobs());
  } catch {
    return summarizeJobs(await readJobsFileFallback());
  }
}

export async function createAdminJob(input: UpsertJobInput) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const status = input.status ?? "draft";
  const slug = buildSlug(input.title, id);

  try {
    await ensureJobsSeeded();
    const result = await getPool().query<JobRow>(
      `
        INSERT INTO jobs (
          id,
          slug,
          title,
          department,
          country,
          city,
          location,
          description,
          experience,
          job_type,
          salary_range,
          skills,
          status,
          is_active,
          published_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17
        )
        RETURNING
          id,
          slug,
          title,
          department,
          country,
          city,
          location,
          description,
          experience,
          job_type,
          salary_range,
          skills,
          status,
          is_active,
          published_at,
          created_at,
          updated_at
      `,
      [
        id,
        slug,
        input.title.trim(),
        input.department.trim(),
        input.country.trim(),
        input.city.trim(),
        input.location.trim(),
        input.description.trim(),
        input.experience.trim(),
        input.type,
        input.salaryRange?.trim() ?? "",
        JSON.stringify(input.skills?.map((item) => item.trim()).filter(Boolean) ?? []),
        status,
        status === "published",
        status === "published" ? now : null,
        now,
        now,
      ],
    );

    return mapJobRow(result.rows[0]);
  } catch {
    const items = await readJobsFileFallback();
    const next: AdminJobRecord = {
      id,
      title: input.title.trim(),
      slug,
      department: input.department.trim(),
      country: input.country.trim(),
      city: input.city.trim(),
      location: input.location.trim(),
      description: input.description.trim(),
      experience: input.experience.trim(),
      type: input.type,
      salaryRange: input.salaryRange?.trim() ?? "",
      skills: input.skills?.map((item) => item.trim()).filter(Boolean) ?? [],
      status,
      isActive: status === "published",
      publishedAt: status === "published" ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    items.unshift(next);
    await writeJobsFileFallback(items);
    return next;
  }
}

export async function updateAdminJob(id: string, input: UpsertJobInput) {
  const current = await getAdminJobById(id);

  if (!current) {
    return null;
  }

  const nextStatus = input.status ?? current.status;
  const updatedAt = new Date().toISOString();
  const publishedAt =
    nextStatus === "published"
      ? current.publishedAt ?? updatedAt
      : nextStatus === "closed"
        ? null
        : current.publishedAt;
  try {
    const result = await getPool().query<JobRow>(
      `
        UPDATE jobs
        SET
          title = $2,
          department = $3,
          country = $4,
          city = $5,
          location = $6,
          description = $7,
          experience = $8,
          job_type = $9,
          salary_range = $10,
          skills = $11::jsonb,
          status = $12,
          is_active = $13,
          published_at = $14,
          updated_at = $15
        WHERE id = $1
        RETURNING
          id,
          slug,
          title,
          department,
          country,
          city,
          location,
          description,
          experience,
          job_type,
          salary_range,
          skills,
          status,
          is_active,
          published_at,
          created_at,
          updated_at
      `,
      [
        id,
        input.title.trim(),
        input.department.trim(),
        input.country.trim(),
        input.city.trim(),
        input.location.trim(),
        input.description.trim(),
        input.experience.trim(),
        input.type,
        input.salaryRange?.trim() ?? "",
        JSON.stringify(input.skills?.map((item) => item.trim()).filter(Boolean) ?? []),
        nextStatus,
        nextStatus === "published",
        publishedAt,
        updatedAt,
      ],
    );

    return result.rows[0] ? mapJobRow(result.rows[0]) : null;
  } catch {
    const items = await readJobsFileFallback();
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) {
      return null;
    }

    const updated: AdminJobRecord = {
      ...current,
      title: input.title.trim(),
      department: input.department.trim(),
      country: input.country.trim(),
      city: input.city.trim(),
      location: input.location.trim(),
      description: input.description.trim(),
      experience: input.experience.trim(),
      type: input.type,
      salaryRange: input.salaryRange?.trim() ?? "",
      skills: input.skills?.map((item) => item.trim()).filter(Boolean) ?? [],
      status: nextStatus,
      isActive: nextStatus === "published",
      publishedAt,
      updatedAt,
    };

    const next = [...items];
    next[index] = updated;
    await writeJobsFileFallback(next);
    return updated;
  }
}

export async function deleteAdminJob(id: string) {
  try {
    const result = await getPool().query("DELETE FROM jobs WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    const items = await readJobsFileFallback();
    const next = items.filter((item) => item.id !== id);
    const deleted = next.length !== items.length;

    if (deleted) {
      await writeJobsFileFallback(next);
    }

    return deleted;
  }
}

export async function publishAdminJob(id: string, status: AdminJobStatus) {
  const current = await getAdminJobById(id);

  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  try {
    const result = await getPool().query<JobRow>(
      `
        UPDATE jobs
        SET
          status = $2,
          is_active = $3,
          published_at = $4,
          updated_at = $5
        WHERE id = $1
        RETURNING
          id,
          slug,
          title,
          department,
          country,
          city,
          location,
          description,
          experience,
          job_type,
          salary_range,
          skills,
          status,
          is_active,
          published_at,
          created_at,
          updated_at
      `,
      [
        id,
        status,
        status === "published",
        status === "published" ? current.publishedAt ?? now : null,
        now,
      ],
    );

    return result.rows[0] ? mapJobRow(result.rows[0]) : null;
  } catch {
    const items = await readJobsFileFallback();
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) {
      return null;
    }

    const updated: AdminJobRecord = {
      ...current,
      status,
      isActive: status === "published",
      publishedAt: status === "published" ? current.publishedAt ?? now : null,
      updatedAt: now,
    };

    const next = [...items];
    next[index] = updated;
    await writeJobsFileFallback(next);
    return updated;
  }
}
