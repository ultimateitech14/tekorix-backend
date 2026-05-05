import { randomUUID } from "crypto";

import { env } from "../config/env.js";
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

const storageFileName = "contact-submissions.json";
const defaultFromEmail = env.ADMIN_EMAIL;

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

export async function readContactSubmissions() {
  return readSubmissionsFile();
}

export async function getContactSubmissionById(id: string) {
  const items = await readSubmissionsFile();
  return items.find((item) => item.id === id) ?? null;
}

export async function markContactSubmissionAsRead(id: string) {
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

export async function markAllContactSubmissionsAsRead() {
  const items = await readSubmissionsFile();
  const next = items.map((item) => ({
    ...item,
    isRead: true,
  }));

  await writeSubmissionsFile(next);
}

type AddContactReplyOptions = {
  fromEmail?: string;
  toEmail?: string;
  deliveryStatus?: ContactSubmissionReplyStatus;
  deliveryError?: string | null;
};

export async function addContactSubmissionReply(id: string, message: string, options: AddContactReplyOptions = {}) {
  const items = await readSubmissionsFile();
  let updated: ContactSubmissionRecord | null = null;

  const next = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    const reply: ContactSubmissionReply = {
      id: randomUUID(),
      message,
      sentAt: new Date().toISOString(),
      fromEmail: options.fromEmail?.trim() || defaultFromEmail,
      toEmail: options.toEmail?.trim() || item.email,
      deliveryStatus: options.deliveryStatus ?? "saved",
      deliveryError: options.deliveryError ?? null,
    };

    updated = {
      ...item,
      isRead: true,
      replies: [...item.replies, reply],
    };

    return updated;
  });

  if (!updated) {
    return null;
  }

  await writeSubmissionsFile(next);
  return updated;
}

export async function deleteContactSubmission(id: string) {
  const items = await readSubmissionsFile();
  const next = items.filter((item) => item.id !== id);
  const deleted = next.length !== items.length;

  if (deleted) {
    await writeSubmissionsFile(next);
  }

  return deleted;
}

export async function deleteAllContactSubmissions() {
  await writeSubmissionsFile([]);
}
