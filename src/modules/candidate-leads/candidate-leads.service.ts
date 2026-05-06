import {
  assertManagedMediaStorageConfigured,
  createPresignedR2UploadUrl,
  getR2Object,
  isR2Configured,
  putR2Object,
  r2ObjectExists,
  type R2ObjectResult,
} from "../../services/r2-storage.service.js";
import { AppError } from "../../lib/app-error.js";

import {
  createCandidateLeadRepository,
  getCandidateLeadByIdRepository,
  listCandidateLeadsRepository,
  markCandidateLeadAsReadRepository,
} from "./candidate-leads.repository.js";
import {
  createCandidateLeadFallbackRecord,
  getCandidateLeadFallbackRecordById,
  listCandidateLeadFallbackRecords,
  markCandidateLeadFallbackRecordAsRead,
} from "./candidate-leads.fallback-store.js";
import {
  buildCandidateLeadResumeObjectKey,
  candidateLeadResumeMaxSizeInBytes,
  inferCandidateLeadResumeContentType,
  parseCandidateLeadResumeObjectKey,
  type CandidateLeadRecord,
  type CandidateLeadResumeUploadInput,
  type CreateCandidateLeadRepositoryInput,
  type CreateCandidateLeadInput,
} from "./candidate-leads.types.js";

function nowIsoString() {
  return new Date().toISOString();
}

function toNullableText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export type CandidateLeadResumeAccessResult = {
  lead: CandidateLeadRecord;
  object: R2ObjectResult;
};

function isFallbackablePersistenceError(error: unknown) {
  if (error instanceof AppError && error.statusCode < 500) {
    return false;
  }

  return true;
}

function mergeCandidateLeads(
  primaryItems: Awaited<ReturnType<typeof listCandidateLeadsRepository>>,
  fallbackItems: Awaited<ReturnType<typeof listCandidateLeadFallbackRecords>>,
) {
  const seen = new Set<string>();

  return [...primaryItems, ...fallbackItems]
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    })
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

function buildCandidateLeadPersistenceInput(
  input: CreateCandidateLeadInput,
  parsedObjectKey: ReturnType<typeof parseCandidateLeadResumeObjectKey>,
): CreateCandidateLeadRepositoryInput {
  return {
    id: parsedObjectKey?.leadId ?? crypto.randomUUID(),
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    experience: input.experience,
    linkedInUrl: toNullableText(input.linkedInUrl),
    desiredLocation: toNullableText(input.desiredLocation),
    desiredSalaryRange: toNullableText(input.desiredSalaryRange),
    skills: toNullableText(input.skills),
    submissionType: input.submissionType,
    sourcePage: input.sourcePage,
    resume: input.resume
      ? {
          objectKey: input.resume.objectKey,
          fileName: input.resume.fileName,
          contentType: input.resume.contentType,
        }
      : null,
  };
}

async function getPersistedCandidateLeadById(id: string) {
  try {
    const primaryItem = await getCandidateLeadByIdRepository(id);

    if (primaryItem) {
      return primaryItem;
    }
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }
  }

  return getCandidateLeadFallbackRecordById(id);
}

export async function createCandidateLeadUploadUrlService(input: CandidateLeadResumeUploadInput) {
  const leadId = crypto.randomUUID();
  const createdAt = nowIsoString();
  const objectKey = buildCandidateLeadResumeObjectKey({
    leadId,
    submissionType: input.submissionType,
    createdAt,
    fileName: input.fileName,
  });

  if (!isR2Configured()) {
    if (process.env.NODE_ENV !== "test") {
      throw new AppError(500, "Cloudflare R2 is not configured for candidate resume uploads.");
    }

    return {
      uploadUrl: `/api/v1/candidate-leads/upload?objectKey=${encodeURIComponent(objectKey)}`,
      objectKey,
    };
  }

  const uploadUrl = await createPresignedR2UploadUrl({
    objectKey,
    contentType: input.contentType,
  });

  return {
    uploadUrl,
    objectKey,
  };
}

export async function uploadCandidateLeadResumeService(input: {
  objectKey: string;
  contentType: string;
  body: Buffer;
}) {
  assertManagedMediaStorageConfigured("Cloudflare R2 is not configured for candidate resume uploads.");

  const parsedObjectKey = parseCandidateLeadResumeObjectKey(input.objectKey);

  if (!parsedObjectKey) {
    throw new AppError(400, "Resume object key must match the candidate lead upload path pattern.");
  }

  if (!Buffer.isBuffer(input.body) || input.body.byteLength === 0) {
    throw new AppError(400, "Resume file body is required.");
  }

  if (input.body.byteLength > candidateLeadResumeMaxSizeInBytes) {
    throw new AppError(400, "Resume file exceeds the maximum allowed size.");
  }

  const contentType = inferCandidateLeadResumeContentType(parsedObjectKey.storedFileName, input.contentType);

  if (!contentType) {
    throw new AppError(400, "Resume file type is not supported. Please upload a PDF, DOC, or DOCX file.");
  }

  await putR2Object({
    objectKey: parsedObjectKey.objectKey,
    contentType,
    body: input.body,
    cacheControl: "private, max-age=0, no-store",
  });

  return {
    objectKey: parsedObjectKey.objectKey,
  };
}

export async function createCandidateLeadService(input: CreateCandidateLeadInput) {
  const parsedObjectKey = input.resume ? parseCandidateLeadResumeObjectKey(input.resume.objectKey) : null;

  if (input.resume && !parsedObjectKey) {
    throw new AppError(400, "Resume object key must match the candidate lead upload path pattern.");
  }

  if (input.resume) {
    const hasStoredResume = await r2ObjectExists(input.resume.objectKey);

    if (!hasStoredResume) {
      throw new AppError(400, "Uploaded resume object not found. Upload the file before creating the candidate lead.");
    }
  }

  const persistenceInput = buildCandidateLeadPersistenceInput(input, parsedObjectKey);

  try {
    return await createCandidateLeadRepository(persistenceInput);
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }

    return createCandidateLeadFallbackRecord(persistenceInput);
  }
}

export async function listCandidateLeadsService() {
  const fallbackItems = await listCandidateLeadFallbackRecords();

  try {
    const primaryItems = await listCandidateLeadsRepository();
    return mergeCandidateLeads(primaryItems, fallbackItems);
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }

    return fallbackItems;
  }
}

export async function getCandidateLeadByIdService(id: string) {
  return getPersistedCandidateLeadById(id);
}

export async function markCandidateLeadAsReadService(id: string) {
  try {
    const existing = await getCandidateLeadByIdRepository(id);

    if (existing) {
      if (existing.isRead) {
        return existing;
      }

      return markCandidateLeadAsReadRepository(id);
    }
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }
  }

  const fallbackRecord = await getCandidateLeadFallbackRecordById(id);

  if (!fallbackRecord) {
    return null;
  }

  if (fallbackRecord.isRead) {
    return fallbackRecord;
  }

  return markCandidateLeadFallbackRecordAsRead(id);
}

export async function getCandidateLeadResumeByIdService(id: string): Promise<CandidateLeadResumeAccessResult> {
  const lead = await getPersistedCandidateLeadById(id);

  if (!lead) {
    throw new AppError(404, "Candidate lead not found.");
  }

  if (!lead.resume) {
    throw new AppError(404, "Candidate lead has no resume.");
  }

  const object = await getR2Object(lead.resume.objectKey);

  if (!object) {
    throw new AppError(404, "Resume object not found.");
  }

  return {
    lead,
    object,
  };
}
