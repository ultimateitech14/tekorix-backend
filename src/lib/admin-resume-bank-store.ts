import type { JobApplicationRecord } from "./admin-job-applications-store.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";

export type ResumeBankEntry = {
  applicationId: string;
  fullName: string;
  jobTitle: string;
  jobLocation: string;
  createdAt: string;
  updatedAt: string;
};

const storageFileName = "resume-bank.json";

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

export async function getResumeBankEntries() {
  return readResumeBankFile();
}

export async function upsertResumeBankEntryFromApplication(application: JobApplicationRecord) {
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

export async function removeResumeBankEntryByApplicationId(applicationId: string) {
  const items = await readResumeBankFile();
  const next = items.filter((item) => item.applicationId !== applicationId);
  const removed = next.length !== items.length;

  if (removed) {
    await writeResumeBankFile(next);
  }

  return removed;
}

export async function removeResumeBankEntriesByApplicationIds(applicationIds: string[]) {
  if (!applicationIds.length) {
    return 0;
  }

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

export async function clearResumeBankEntries() {
  await writeResumeBankFile([]);
}
