import { randomUUID } from "crypto";

import { env } from "../config/env.js";
import { getPool } from "../database/pool.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";

export type ContactSubmissionReplyStatus = "saved" | "sent" | "failed";

export type ContactSubmissionReply = {
  id: string;
  message: string;
  sentAt: string;
  fromEmail: string;
  toEmail: string;
  deliveryStatus: ContactSubmissionReplyStatus;
  deliveryError: string | null;
};

export type ContactSubmissionRecord = {
  id: string;
  inquiryType: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  industry: string;
  company: string;
  position: string;
  phonePrefix: string;
  phoneNumber: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  replies: ContactSubmissionReply[];
};

type ContactSubmissionRow = {
  id: string;
  inquiry_type: string;
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  industry: string;
  company: string;
  position: string;
  phone_prefix: string;
  phone_number: string;
  message: string;
  is_read: boolean;
  replies: unknown;
  created_at: Date | string;
};

type CreateContactSubmissionInput = Omit<ContactSubmissionRecord, "id" | "createdAt" | "isRead" | "replies">;

const storageFileName = "contact-submissions.json";
const defaultFromEmail = env.ADMIN_EMAIL;
let contactSubmissionsSeedAttempted = false;

function toIsoString(value: Date | string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback;
  }

  return typeof value === "string" ? value : value.toISOString();
}

function normalizeReplyStatus(value: unknown): ContactSubmissionReplyStatus {
  if (value === "saved" || value === "sent" || value === "failed") {
    return value;
  }

  return "saved";
}

function normalizeReply(value: unknown, fallbackToEmail: string): ContactSubmissionReply | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<ContactSubmissionReply>;
  const id = trimToString(item.id) || randomUUID();
  const message = trimToString(item.message);
  const fromEmail = trimToString(item.fromEmail) || defaultFromEmail;
  const toEmail = trimToString(item.toEmail) || fallbackToEmail;
  const deliveryError = trimToString(item.deliveryError) || null;

  if (!message || !toEmail) {
    return null;
  }

  return {
    id,
    message,
    sentAt: normalizeTimestamp(item.sentAt),
    fromEmail,
    toEmail,
    deliveryStatus: normalizeReplyStatus(item.deliveryStatus),
    deliveryError,
  };
}

function normalizeRecord(value: unknown): ContactSubmissionRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<ContactSubmissionRecord>;
  const id = trimToString(item.id);
  const firstName = trimToString(item.firstName);
  const lastName = trimToString(item.lastName);
  const email = trimToString(item.email);
  const message = trimToString(item.message);

  if (!id || !firstName || !lastName || !email || !message) {
    return null;
  }

  return {
    id,
    inquiryType: trimToString(item.inquiryType),
    firstName,
    lastName,
    email,
    country: trimToString(item.country),
    industry: trimToString(item.industry),
    company: trimToString(item.company),
    position: trimToString(item.position),
    phonePrefix: trimToString(item.phonePrefix),
    phoneNumber: trimToString(item.phoneNumber),
    message,
    createdAt: normalizeTimestamp(item.createdAt),
    isRead: Boolean(item.isRead),
    replies: Array.isArray(item.replies)
      ? item.replies
          .map((reply) => normalizeReply(reply, email))
          .filter((reply): reply is ContactSubmissionReply => Boolean(reply))
      : [],
  };
}

function mapRow(row: ContactSubmissionRow): ContactSubmissionRecord {
  return {
    id: row.id,
    inquiryType: trimToString(row.inquiry_type),
    firstName: trimToString(row.first_name),
    lastName: trimToString(row.last_name),
    email: trimToString(row.email),
    country: trimToString(row.country),
    industry: trimToString(row.industry),
    company: trimToString(row.company),
    position: trimToString(row.position),
    phonePrefix: trimToString(row.phone_prefix),
    phoneNumber: trimToString(row.phone_number),
    message: trimToString(row.message),
    createdAt: toIsoString(row.created_at),
    isRead: row.is_read,
    replies: Array.isArray(row.replies)
      ? row.replies
          .map((reply) => normalizeReply(reply, row.email))
          .filter((reply): reply is ContactSubmissionReply => Boolean(reply))
      : [],
  };
}

async function readSubmissionsFile() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, []);

  return parsed
    .map((item) => normalizeRecord(item))
    .filter((item): item is ContactSubmissionRecord => Boolean(item))
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

async function writeSubmissionsFile(items: ContactSubmissionRecord[]) {
  await writeJsonFile(storageFileName, items);
}

async function ensureContactSubmissionsSeeded() {
  if (contactSubmissionsSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM contact_submissions");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    contactSubmissionsSeedAttempted = true;
    return;
  }

  const seedItems = await readSubmissionsFile();

  if (!seedItems.length) {
    contactSubmissionsSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of seedItems) {
      await client.query(
        `
          INSERT INTO contact_submissions (
            id,
            inquiry_type,
            first_name,
            last_name,
            email,
            country,
            industry,
            company,
            position,
            phone_prefix,
            phone_number,
            message,
            is_read,
            replies,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          item.id,
          item.inquiryType,
          item.firstName,
          item.lastName,
          item.email,
          item.country,
          item.industry,
          item.company,
          item.position,
          item.phonePrefix,
          item.phoneNumber,
          item.message,
          item.isRead,
          JSON.stringify(item.replies),
          item.createdAt,
        ],
      );
    }

    await client.query("COMMIT");
    contactSubmissionsSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readPersistedSubmissions() {
  await ensureContactSubmissionsSeeded();
  const result = await getPool().query<ContactSubmissionRow>(
    `
      SELECT
        id,
        inquiry_type,
        first_name,
        last_name,
        email,
        country,
        industry,
        company,
        position,
        phone_prefix,
        phone_number,
        message,
        is_read,
        replies,
        created_at
      FROM contact_submissions
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapRow(row));
}

export async function createContactSubmission(input: CreateContactSubmissionInput) {
  const next: ContactSubmissionRecord = {
    id: randomUUID(),
    inquiryType: trimToString(input.inquiryType),
    firstName: trimToString(input.firstName),
    lastName: trimToString(input.lastName),
    email: trimToString(input.email),
    country: trimToString(input.country),
    industry: trimToString(input.industry),
    company: trimToString(input.company),
    position: trimToString(input.position),
    phonePrefix: trimToString(input.phonePrefix),
    phoneNumber: trimToString(input.phoneNumber),
    message: trimToString(input.message),
    createdAt: new Date().toISOString(),
    isRead: false,
    replies: [],
  };

  try {
    await ensureContactSubmissionsSeeded();
    await getPool().query(
      `
        INSERT INTO contact_submissions (
          id,
          inquiry_type,
          first_name,
          last_name,
          email,
          country,
          industry,
          company,
          position,
          phone_prefix,
          phone_number,
          message,
          is_read,
          replies,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, '[]'::jsonb, $13)
      `,
      [
        next.id,
        next.inquiryType,
        next.firstName,
        next.lastName,
        next.email,
        next.country,
        next.industry,
        next.company,
        next.position,
        next.phonePrefix,
        next.phoneNumber,
        next.message,
        next.createdAt,
      ],
    );

    return next;
  } catch {
    const items = await readSubmissionsFile();
    items.unshift(next);
    await writeSubmissionsFile(items);
    return next;
  }
}

export async function readContactSubmissions() {
  try {
    return await readPersistedSubmissions();
  } catch {
    return readSubmissionsFile();
  }
}

export async function getContactSubmissionById(id: string) {
  try {
    await ensureContactSubmissionsSeeded();
    const result = await getPool().query<ContactSubmissionRow>(
      `
        SELECT
          id,
          inquiry_type,
          first_name,
          last_name,
          email,
          country,
          industry,
          company,
          position,
          phone_prefix,
          phone_number,
          message,
          is_read,
          replies,
          created_at
        FROM contact_submissions
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readSubmissionsFile();
    return items.find((item) => item.id === id) ?? null;
  }
}

export async function markContactSubmissionAsRead(id: string) {
  try {
    await ensureContactSubmissionsSeeded();
    const result = await getPool().query<ContactSubmissionRow>(
      `
        UPDATE contact_submissions
        SET is_read = true
        WHERE id = $1
        RETURNING
          id,
          inquiry_type,
          first_name,
          last_name,
          email,
          country,
          industry,
          company,
          position,
          phone_prefix,
          phone_number,
          message,
          is_read,
          replies,
          created_at
      `,
      [id],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch {
    const items = await readSubmissionsFile();
    let updated: ContactSubmissionRecord | null = null;
    const next = items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      updated = {
        ...item,
        isRead: true,
      };

      return updated;
    });

    if (!updated) {
      return null;
    }

    await writeSubmissionsFile(next);
    return updated;
  }
}

export async function markAllContactSubmissionsAsRead() {
  try {
    await ensureContactSubmissionsSeeded();
    await getPool().query("UPDATE contact_submissions SET is_read = true WHERE is_read = false");
  } catch {
    const items = await readSubmissionsFile();
    const next = items.map((item) => ({
      ...item,
      isRead: true,
    }));

    await writeSubmissionsFile(next);
  }
}

type AddContactReplyOptions = {
  fromEmail?: string;
  toEmail?: string;
  deliveryStatus?: ContactSubmissionReplyStatus;
  deliveryError?: string | null;
};

export async function addContactSubmissionReply(id: string, message: string, options: AddContactReplyOptions = {}) {
  const current = await getContactSubmissionById(id);

  if (!current) {
    return null;
  }

  const reply: ContactSubmissionReply = {
    id: randomUUID(),
    message,
    sentAt: new Date().toISOString(),
    fromEmail: options.fromEmail?.trim() || defaultFromEmail,
    toEmail: options.toEmail?.trim() || current.email,
    deliveryStatus: options.deliveryStatus ?? "saved",
    deliveryError: options.deliveryError ?? null,
  };

  const updated: ContactSubmissionRecord = {
    ...current,
    isRead: true,
    replies: [...current.replies, reply],
  };

  try {
    await ensureContactSubmissionsSeeded();
    await getPool().query(
      `
        UPDATE contact_submissions
        SET is_read = true, replies = $2::jsonb
        WHERE id = $1
      `,
      [id, JSON.stringify(updated.replies)],
    );

    return updated;
  } catch {
    const items = await readSubmissionsFile();
    const next = items.map((item) => (item.id === id ? updated : item));
    await writeSubmissionsFile(next);
    return updated;
  }
}

export async function deleteContactSubmission(id: string) {
  try {
    await ensureContactSubmissionsSeeded();
    const result = await getPool().query("DELETE FROM contact_submissions WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    const items = await readSubmissionsFile();
    const next = items.filter((item) => item.id !== id);
    const deleted = next.length !== items.length;

    if (deleted) {
      await writeSubmissionsFile(next);
    }

    return deleted;
  }
}

export async function deleteAllContactSubmissions() {
  try {
    await ensureContactSubmissionsSeeded();
    await getPool().query("DELETE FROM contact_submissions");
  } catch {
    await writeSubmissionsFile([]);
  }
}
