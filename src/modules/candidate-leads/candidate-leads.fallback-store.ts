import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { access, mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import type { Readable } from "node:stream";

import { AppError } from "../../lib/app-error.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "../../lib/shared-admin-files.js";
import {
  candidateLeadResumeMaxSizeInBytes,
  candidateLeadSourcePageValues,
  candidateLeadSubmissionTypeValues,
  inferCandidateLeadResumeContentType,
  parseCandidateLeadResumeObjectKey,
  type CandidateLeadRecord,
  type CandidateLeadResumeRecord,
  type CandidateLeadSourcePage,
  type CandidateLeadSubmissionType,
  type CreateCandidateLeadRepositoryInput,
} from "./candidate-leads.types.js";

const storageFileName = "candidate-leads.json";
const candidateLeadResumeDir = path.resolve(process.cwd(), "..", "..", "frontend", "data", "candidate-lead-resumes");
const validSubmissionTypes = new Set<string>(candidateLeadSubmissionTypeValues);
const validSourcePages = new Set<string>(candidateLeadSourcePageValues);

export type CandidateLeadStoredResumeObject = {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
};

function normalizeSubmissionType(value: unknown): CandidateLeadSubmissionType {
  if (typeof value === "string" && validSubmissionTypes.has(value)) {
    return value as CandidateLeadSubmissionType;
  }

  return "contact-candidate";
}

function normalizeSourcePage(value: unknown): CandidateLeadSourcePage {
  if (typeof value === "string" && validSourcePages.has(value)) {
    return value as CandidateLeadSourcePage;
  }

  return "unknown";
}

function sortByCreatedAtDesc(items: CandidateLeadRecord[]) {
  return [...items].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

function normalizeResume(value: unknown): CandidateLeadResumeRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<CandidateLeadResumeRecord>;
  const objectKey = trimToString(item.objectKey);
  const fileName = trimToString(item.fileName);
  const contentType = inferCandidateLeadResumeContentType(fileName, item.contentType ?? null);

  if (!objectKey || !fileName || !contentType) {
    return null;
  }

  return {
    objectKey,
    fileName,
    contentType,
  };
}

function normalizeRecord(value: unknown): CandidateLeadRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<CandidateLeadRecord>;
  const id = trimToString(item.id);
  const fullName = trimToString(item.fullName);
  const email = trimToString(item.email);
  const phone = trimToString(item.phone);
  const role = trimToString(item.role);

  if (!id || !fullName || !email || !phone || !role) {
    return null;
  }

  return {
    id,
    fullName,
    email,
    phone,
    role,
    experience: trimToString(item.experience),
    linkedInUrl: trimToString(item.linkedInUrl) || null,
    desiredLocation: trimToString(item.desiredLocation) || null,
    desiredSalaryRange: trimToString(item.desiredSalaryRange) || null,
    skills: trimToString(item.skills) || null,
    submissionType: normalizeSubmissionType(item.submissionType),
    sourcePage: normalizeSourcePage(item.sourcePage),
    status: trimToString(item.status) || "new",
    isRead: Boolean(item.isRead),
    resume: normalizeResume(item.resume),
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
  };
}

function resolveCandidateLeadResumeFilePath(objectKey: string, strict = false) {
  const normalizedObjectKey = objectKey.trim().replace(/\\/g, "/").replace(/^\/+/, "");

  if (!normalizedObjectKey) {
    if (strict) {
      throw new AppError(400, "Candidate resume object key is required.");
    }

    return null;
  }

  const filePath = path.resolve(candidateLeadResumeDir, normalizedObjectKey);
  const relativePath = path.relative(candidateLeadResumeDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    if (strict) {
      throw new AppError(400, "Candidate resume object key is invalid.");
    }

    return null;
  }

  return filePath;
}

async function readCandidateLeadsFile() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, []);

  return sortByCreatedAtDesc(
    parsed.map((item) => normalizeRecord(item)).filter((item): item is CandidateLeadRecord => Boolean(item)),
  );
}

async function writeCandidateLeadsFile(items: CandidateLeadRecord[]) {
  await writeJsonFile(storageFileName, sortByCreatedAtDesc(items));
}

export async function createCandidateLeadFallbackRecord(input: CreateCandidateLeadRepositoryInput) {
  const items = await readCandidateLeadsFile();
  const timestamp = new Date().toISOString();
  const record: CandidateLeadRecord = {
    id: input.id || randomUUID(),
    fullName: input.fullName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    role: input.role.trim(),
    experience: input.experience.trim(),
    linkedInUrl: trimToString(input.linkedInUrl) || null,
    desiredLocation: trimToString(input.desiredLocation) || null,
    desiredSalaryRange: trimToString(input.desiredSalaryRange) || null,
    skills: trimToString(input.skills) || null,
    submissionType: input.submissionType,
    sourcePage: input.sourcePage,
    status: "new",
    isRead: false,
    resume: input.resume
      ? {
          objectKey: input.resume.objectKey,
          fileName: input.resume.fileName,
          contentType: input.resume.contentType,
        }
      : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  items.unshift(record);
  await writeCandidateLeadsFile(items);
  return record;
}

export async function listCandidateLeadFallbackRecords() {
  return readCandidateLeadsFile();
}

export async function getCandidateLeadFallbackRecordById(id: string) {
  const items = await readCandidateLeadsFile();
  return items.find((item) => item.id === id) ?? null;
}

export async function markCandidateLeadFallbackRecordAsRead(id: string) {
  const items = await readCandidateLeadsFile();
  let updated: CandidateLeadRecord | null = null;

  const next = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    updated = {
      ...item,
      isRead: true,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  });

  if (!updated) {
    return null;
  }

  await writeCandidateLeadsFile(next);
  return updated;
}

export async function saveCandidateLeadLocalResumeUpload(input: {
  objectKey: string;
  contentType: string;
  body: Buffer;
}) {
  const parsedObjectKey = parseCandidateLeadResumeObjectKey(input.objectKey);

  if (!parsedObjectKey) {
    throw new AppError(400, "Resume object key must match the candidate lead upload path pattern.");
  }

  const contentType = inferCandidateLeadResumeContentType(parsedObjectKey.storedFileName, input.contentType);

  if (!contentType) {
    throw new AppError(400, "Resume file type is not supported. Please upload a PDF, DOC, or DOCX file.");
  }

  if (!Buffer.isBuffer(input.body) || input.body.byteLength === 0) {
    throw new AppError(400, "Resume file body is required.");
  }

  if (input.body.byteLength > candidateLeadResumeMaxSizeInBytes) {
    throw new AppError(400, "Resume file exceeds the maximum allowed size.");
  }

  const filePath = resolveCandidateLeadResumeFilePath(parsedObjectKey.objectKey, true);

  if (!filePath) {
    throw new AppError(400, "Candidate resume object key is invalid.");
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.body);

  return {
    objectKey: parsedObjectKey.objectKey,
    contentType,
  };
}

export async function candidateLeadLocalResumeExists(objectKey: string) {
  const filePath = resolveCandidateLeadResumeFilePath(objectKey);

  if (!filePath) {
    return false;
  }

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getCandidateLeadLocalResumeObject(objectKey: string): Promise<CandidateLeadStoredResumeObject | null> {
  const filePath = resolveCandidateLeadResumeFilePath(objectKey);

  if (!filePath) {
    return null;
  }

  try {
    const fileInfo = await stat(filePath);
    const parsedObjectKey = parseCandidateLeadResumeObjectKey(objectKey);
    const contentType = parsedObjectKey
      ? inferCandidateLeadResumeContentType(parsedObjectKey.storedFileName)
      : null;

    return {
      body: createReadStream(filePath),
      contentType,
      contentLength: fileInfo.size,
    };
  } catch {
    return null;
  }
}
