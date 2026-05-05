import { access, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import {
  ensureFrontendDataDir,
  ensureFrontendResumeDir,
  getFrontendDataFilePath,
  getFrontendResumeDirPath,
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

const storageFileName = "job-applications.json";
const storageFilePath = getFrontendDataFilePath(storageFileName);

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

  if (!id || !jobId || !jobTitle || !jobLocation || !fullName || !email || !phone || !location || !experience || !coverLetter || !resume) {
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

function getResumeAbsolutePath(storedName: string) {
  return path.join(getFrontendResumeDirPath(), storedName);
}

async function deleteResumeFile(storedName: string) {
  try {
    await unlink(getResumeAbsolutePath(storedName));
  } catch {
    // Ignore missing files during cleanup.
  }
}

export async function readJobApplications() {
  return readApplicationsFile();
}

export async function getJobApplicationById(id: string) {
  const items = await readApplicationsFile();
  return items.find((item) => item.id === id) ?? null;
}

export async function markJobApplicationAsRead(id: string) {
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

export async function markAllJobApplicationsAsRead() {
  const items = await readApplicationsFile();
  const now = new Date().toISOString();
  const next = items.map((item) => ({
    ...item,
    isRead: true,
    updatedAt: now,
  }));

  await writeApplicationsFile(next);
}

export async function updateJobApplicationStatus(id: string, status: JobApplicationStatus) {
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

export async function updateJobApplicationAdminNotes(id: string, adminNotes: string) {
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

export async function deleteJobApplicationById(id: string) {
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

export async function deleteAllJobApplications() {
  const items = await readApplicationsFile();

  if (!items.length) {
    return 0;
  }

  await writeApplicationsFile([]);
  await Promise.all(items.map((item) => deleteResumeFile(item.resume.storedName)));
  return items.length;
}

export async function getJobApplicationResumeById(id: string) {
  const application = await getJobApplicationById(id);

  if (!application) {
    return null;
  }

  await ensureFrontendResumeDir();
  const absolutePath = getResumeAbsolutePath(application.resume.storedName);

  try {
    await access(absolutePath);
    return {
      absolutePath,
      application,
    };
  } catch {
    return null;
  }
}

export async function readJobApplicationResumeFile(id: string) {
  const result = await getJobApplicationResumeById(id);

  if (!result) {
    return null;
  }

  const file = await readFile(result.absolutePath);

  return {
    file,
    application: result.application,
  };
}
