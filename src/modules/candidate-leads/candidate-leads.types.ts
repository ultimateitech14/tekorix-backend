export const candidateLeadExperienceValues = ["0-2 years", "3-5 years", "6-9 years", "10+ years"] as const;

export const candidateLeadSubmissionTypeValues = [
  "contact-candidate",
  "resume-submission",
  "market-resume",
] as const;

export const candidateLeadSourcePageValues = ["contact", "find-job", "unknown"] as const;
export const candidateLeadResumeAllowedExtensions = [".pdf", ".doc", ".docx"] as const;
export const candidateLeadResumeAllowedContentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const candidateLeadResumeMaxSizeInBytes = 5 * 1024 * 1024;

export type CandidateLeadExperience = (typeof candidateLeadExperienceValues)[number];
export type CandidateLeadSubmissionType = (typeof candidateLeadSubmissionTypeValues)[number];
export type CandidateLeadSourcePage = (typeof candidateLeadSourcePageValues)[number];
export type CandidateLeadResumeContentType = (typeof candidateLeadResumeAllowedContentTypes)[number];

export type CandidateLeadResumeUploadInput = {
  fileName: string;
  contentType: CandidateLeadResumeContentType;
  submissionType: CandidateLeadSubmissionType;
};

export type CandidateLeadResumeUploadResult = {
  uploadUrl: string;
  objectKey: string;
};

export type CandidateLeadResumeReferenceInput = {
  objectKey: string;
  fileName: string;
  contentType: CandidateLeadResumeContentType;
};

export type CreateCandidateLeadInput = {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  linkedInUrl: string;
  desiredLocation: string;
  desiredSalaryRange: string;
  skills: string;
  submissionType: CandidateLeadSubmissionType;
  sourcePage: CandidateLeadSourcePage;
  resume: CandidateLeadResumeReferenceInput | null;
};

export type CreateCandidateLeadRepositoryInput = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  linkedInUrl: string | null;
  desiredLocation: string | null;
  desiredSalaryRange: string | null;
  skills: string | null;
  submissionType: CandidateLeadSubmissionType;
  sourcePage: CandidateLeadSourcePage;
  resume: CandidateLeadResumeReferenceInput | null;
};

export type CandidateLeadResumeRecord = {
  objectKey: string;
  fileName: string;
  contentType: CandidateLeadResumeContentType;
};

export type CandidateLeadRecord = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  linkedInUrl: string | null;
  desiredLocation: string | null;
  desiredSalaryRange: string | null;
  skills: string | null;
  submissionType: CandidateLeadSubmissionType;
  sourcePage: CandidateLeadSourcePage;
  status: string;
  isRead: boolean;
  resume: CandidateLeadResumeRecord | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateLeadRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  experience: string;
  linked_in_url: string | null;
  desired_location: string | null;
  desired_salary_range: string | null;
  skills: string | null;
  submission_type: string;
  source_page: string;
  status: string;
  is_read: boolean;
  resume_object_key: string | null;
  resume_file_name: string | null;
  resume_content_type: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toSafeObjectSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isAllowedCandidateLeadResumeContentType(value: string): value is CandidateLeadResumeContentType {
  return (candidateLeadResumeAllowedContentTypes as readonly string[]).includes(value);
}

export function inferCandidateLeadResumeContentType(fileName: string, contentType?: string | null) {
  if (contentType && isAllowedCandidateLeadResumeContentType(contentType)) {
    return contentType;
  }

  const normalizedFileName = fileName.trim().toLowerCase();

  if (normalizedFileName.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (normalizedFileName.endsWith(".doc")) {
    return "application/msword";
  }

  if (normalizedFileName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return null;
}

export function buildCandidateLeadResumeObjectKey(input: {
  leadId: string;
  submissionType: CandidateLeadSubmissionType;
  createdAt: string;
  fileName: string;
}) {
  const trimmedFileName = input.fileName.trim();
  const extensionStart = trimmedFileName.lastIndexOf(".");
  const hasExtension = extensionStart > 0 && extensionStart < trimmedFileName.length - 1;
  const fileExtension = hasExtension ? trimmedFileName.slice(extensionStart).toLowerCase() : "";
  const fileBaseName = hasExtension ? trimmedFileName.slice(0, extensionStart) : trimmedFileName;
  const safeFileBaseName = toSafeObjectSegment(fileBaseName) || "resume";
  const safeSubmissionType = toSafeObjectSegment(input.submissionType) || "candidate";
  const yearMonth = input.createdAt.slice(0, 7);

  return `candidate-leads/${safeSubmissionType}/${yearMonth}/${input.leadId}/${safeFileBaseName}${fileExtension}`;
}

const candidateLeadResumeObjectKeyPattern = new RegExp(
  `^candidate-leads/(${candidateLeadSubmissionTypeValues.map((value) => escapeRegex(value)).join("|")})/(\\d{4}-\\d{2})/([0-9a-fA-F-]{36})/([a-z0-9][a-z0-9-]{0,79}(?:${candidateLeadResumeAllowedExtensions.map((value) => escapeRegex(value)).join("|")}))$`,
);

export function parseCandidateLeadResumeObjectKey(objectKey: string) {
  const normalized = objectKey.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const match = normalized.match(candidateLeadResumeObjectKeyPattern);

  if (!match) {
    return null;
  }

  return {
    objectKey: normalized,
    submissionType: match[1] as CandidateLeadSubmissionType,
    yearMonth: match[2],
    leadId: match[3].toLowerCase(),
    storedFileName: match[4],
  };
}
