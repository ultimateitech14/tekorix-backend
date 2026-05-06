import { getPool } from "../database/pool.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";

export type EmailTemplateRecord = {
  id: string;
  name: string;
  subject: string;
  body: string;
  channel: "Email";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateEmailTemplateInput = {
  name: string;
  subject: string;
  body: string;
  isActive?: boolean;
};

type UpdateEmailTemplateInput = Partial<CreateEmailTemplateInput>;

type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

const storageFileName = "email-templates.json";
const idPattern = /^TPL-(\d+)$/;
let emailTemplatesSeedAttempted = false;

function toIsoString(value: Date | string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback;
  }

  return typeof value === "string" ? value : value.toISOString();
}

function getDefaultTemplates(): EmailTemplateRecord[] {
  return [
    {
      id: "TPL-1001",
      name: "Application Received",
      subject: "We received your application",
      body: "Hi {{candidate_name}},\n\nThank you for applying for {{job_title}}. Our team will review your profile and get back to you soon.\n\nRegards,\n{{recruiter_name}}",
      channel: "Email",
      isActive: true,
      createdAt: "2026-02-14T00:00:00.000Z",
      updatedAt: "2026-02-14T00:00:00.000Z",
    },
    {
      id: "TPL-1002",
      name: "Interview Invitation",
      subject: "Interview scheduled for your role",
      body: "Hi {{candidate_name}},\n\nYou are shortlisted for {{job_title}}. Please confirm your availability for the interview.\n\nRegards,\n{{recruiter_name}}",
      channel: "Email",
      isActive: true,
      createdAt: "2026-02-13T00:00:00.000Z",
      updatedAt: "2026-02-13T00:00:00.000Z",
    },
    {
      id: "TPL-1003",
      name: "Rejection Notice",
      subject: "Update on your application",
      body: "Hi {{candidate_name}},\n\nThank you for your interest in {{job_title}}. At this time, we are moving forward with other candidates.\n\nRegards,\n{{recruiter_name}}",
      channel: "Email",
      isActive: true,
      createdAt: "2026-02-12T00:00:00.000Z",
      updatedAt: "2026-02-12T00:00:00.000Z",
    },
    {
      id: "TPL-1004",
      name: "Offer Letter",
      subject: "Official offer for {{job_title}}",
      body: "Hi {{candidate_name}},\n\nWe are excited to extend an offer for the {{job_title}} role. Please review the attached details and respond.\n\nRegards,\n{{recruiter_name}}",
      channel: "Email",
      isActive: true,
      createdAt: "2026-02-11T00:00:00.000Z",
      updatedAt: "2026-02-11T00:00:00.000Z",
    },
  ];
}

function normalizeRecord(value: unknown): EmailTemplateRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<EmailTemplateRecord>;
  const id = trimToString(item.id);
  const name = trimToString(item.name);
  const subject = trimToString(item.subject);
  const body = trimToString(item.body);

  if (!id || !name || !subject || !body) {
    return null;
  }

  return {
    id,
    name,
    subject,
    body,
    channel: "Email",
    isActive: item.isActive !== false,
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
  };
}

function mapRow(row: EmailTemplateRow): EmailTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    channel: "Email",
    isActive: row.is_active,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function readTemplatesFile() {
  const parsed = await readJsonFile<unknown[] | null>(storageFileName, null);

  if (!Array.isArray(parsed)) {
    return getDefaultTemplates();
  }

  return parsed
    .map((item) => normalizeRecord(item))
    .filter((item): item is EmailTemplateRecord => Boolean(item))
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
}

async function writeTemplatesFile(items: EmailTemplateRecord[]) {
  await writeJsonFile(storageFileName, items);
}

async function ensureEmailTemplatesSeeded() {
  if (emailTemplatesSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM email_templates");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    emailTemplatesSeedAttempted = true;
    return;
  }

  const seedItems = await readTemplatesFile();

  if (!seedItems.length) {
    emailTemplatesSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of seedItems) {
      await client.query(
        `
          INSERT INTO email_templates (id, name, subject, body, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `,
        [item.id, item.name, item.subject, item.body, item.isActive, item.createdAt, item.updatedAt],
      );
    }

    await client.query("COMMIT");
    emailTemplatesSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readPersistedTemplates() {
  await ensureEmailTemplatesSeeded();
  const result = await getPool().query<EmailTemplateRow>(
    `
      SELECT id, name, subject, body, is_active, created_at, updated_at
      FROM email_templates
      ORDER BY updated_at DESC
    `,
  );

  return result.rows.map((row) => mapRow(row));
}

async function getNextTemplateIdFromDb() {
  const result = await getPool().query<{ max_id: string | null }>(
    `
      SELECT MAX((regexp_match(id, '^TPL-(\\d+)$'))[1]::int)::text AS max_id
      FROM email_templates
    `,
  );

  const max = Number(result.rows[0]?.max_id ?? "1000");
  return `TPL-${String((Number.isFinite(max) ? max : 1000) + 1).padStart(4, "0")}`;
}

function getNextTemplateId(items: EmailTemplateRecord[]) {
  const max = items.reduce((currentMax, item) => {
    const match = item.id.match(idPattern);

    if (!match) {
      return currentMax;
    }

    const value = Number(match[1]);
    return Number.isInteger(value) ? Math.max(currentMax, value) : currentMax;
  }, 1000);

  return `TPL-${String(max + 1).padStart(4, "0")}`;
}

export async function listEmailTemplates() {
  try {
    return await readPersistedTemplates();
  } catch {
    return readTemplatesFile();
  }
}

export async function getEmailTemplateById(id: string) {
  try {
    await ensureEmailTemplatesSeeded();
    const result = await getPool().query<EmailTemplateRow>(
      `
        SELECT id, name, subject, body, is_active, created_at, updated_at
        FROM email_templates
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readTemplatesFile();
    return items.find((item) => item.id === id) ?? null;
  }
}

export async function createEmailTemplate(input: CreateEmailTemplateInput) {
  try {
    await ensureEmailTemplatesSeeded();
    const id = await getNextTemplateIdFromDb();
    const result = await getPool().query<EmailTemplateRow>(
      `
        INSERT INTO email_templates (id, name, subject, body, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, name, subject, body, is_active, created_at, updated_at
      `,
      [id, input.name.trim(), input.subject.trim(), input.body.trim(), input.isActive !== false],
    );

    return mapRow(result.rows[0]);
  } catch {
    const items = await readTemplatesFile();
    const now = new Date().toISOString();
    const next: EmailTemplateRecord = {
      id: getNextTemplateId(items),
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      channel: "Email",
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    items.unshift(next);
    await writeTemplatesFile(items);
    return next;
  }
}

export async function updateEmailTemplate(id: string, input: UpdateEmailTemplateInput) {
  try {
    await ensureEmailTemplatesSeeded();
    const current = await getEmailTemplateById(id);

    if (!current) {
      return null;
    }

    const result = await getPool().query<EmailTemplateRow>(
      `
        UPDATE email_templates
        SET
          name = $2,
          subject = $3,
          body = $4,
          is_active = $5,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, subject, body, is_active, created_at, updated_at
      `,
      [
        id,
        typeof input.name === "string" ? input.name.trim() : current.name,
        typeof input.subject === "string" ? input.subject.trim() : current.subject,
        typeof input.body === "string" ? input.body.trim() : current.body,
        typeof input.isActive === "boolean" ? input.isActive : current.isActive,
      ],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readTemplatesFile();
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) {
      return null;
    }

    const current = items[index];
    const updated: EmailTemplateRecord = {
      ...current,
      name: typeof input.name === "string" ? input.name.trim() : current.name,
      subject: typeof input.subject === "string" ? input.subject.trim() : current.subject,
      body: typeof input.body === "string" ? input.body.trim() : current.body,
      isActive: typeof input.isActive === "boolean" ? input.isActive : current.isActive,
      updatedAt: new Date().toISOString(),
    };

    const next = [...items];
    next[index] = updated;
    await writeTemplatesFile(next);
    return updated;
  }
}

export async function deleteEmailTemplate(id: string) {
  try {
    await ensureEmailTemplatesSeeded();
    const result = await getPool().query("DELETE FROM email_templates WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    const items = await readTemplatesFile();
    const next = items.filter((item) => item.id !== id);
    const deleted = next.length !== items.length;

    if (deleted) {
      await writeTemplatesFile(next);
    }

    return deleted;
  }
}

export async function deleteAllEmailTemplates() {
  try {
    await ensureEmailTemplatesSeeded();
    await getPool().query("DELETE FROM email_templates");
  } catch {
    await writeTemplatesFile([]);
  }
}
