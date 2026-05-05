import { z } from "zod";

import {
  candidateLeadExperienceValues,
  candidateLeadResumeAllowedContentTypes,
  candidateLeadResumeAllowedExtensions,
  candidateLeadSourcePageValues,
  candidateLeadSubmissionTypeValues,
  isAllowedCandidateLeadResumeContentType,
  parseCandidateLeadResumeObjectKey,
} from "./candidate-leads.types.js";

const publicPhonePrefixValues = ["+91", "+1", "+44", "+61", "+49", "+33", "+65", "+971"] as const;
const supportedPhonePrefixes = [...publicPhonePrefixValues].sort((left, right) => right.length - left.length);
const phoneValuePattern = /^(\+\d{1,4})\s(\d{6,14})$/;
const linkedInPathPattern = /^\/(?:in|pub|company)\//i;
const personNamePattern = /^(?=.*[A-Za-z])[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const rolePattern = /^(?=.*[A-Za-z])[A-Za-z0-9&.,'()\/ +#-]+$/;
const locationPattern = /^(?=.*[A-Za-z])[A-Za-z0-9&.,'()\/ -]+$/;
const salaryPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9&.,'()\/ +#%-]+$/;
const skillsPattern = /^(?=.*[A-Za-z])[A-Za-z0-9&.,'()\/ +#-]+$/;

const publicPhoneMetadata: Record<
  (typeof publicPhonePrefixValues)[number],
  {
    minLength: number;
    maxLength: number;
  }
> = {
  "+91": { minLength: 10, maxLength: 10 },
  "+1": { minLength: 10, maxLength: 10 },
  "+44": { minLength: 10, maxLength: 10 },
  "+61": { minLength: 9, maxLength: 9 },
  "+49": { minLength: 10, maxLength: 11 },
  "+33": { minLength: 9, maxLength: 9 },
  "+65": { minLength: 8, maxLength: 8 },
  "+971": { minLength: 9, maxLength: 9 },
};

function trimAndCollapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function emptyStringIfNullish(value: unknown) {
  return typeof value === "string" ? value : "";
}

function baseTextField(label: string, minimum: number, maximum: number) {
  return z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(z.string().min(minimum, `${label} is required.`).max(maximum, `${label} is too long.`));
}

function optionalTextField(maximum: number) {
  return z.preprocess(
    emptyStringIfNullish,
    z
      .string()
      .transform(trimAndCollapseWhitespace)
      .pipe(z.string().max(maximum, `Value must be ${maximum} characters or less.`)),
  );
}

function nullableTrimmedTextField(maximum: number) {
  return z.preprocess(
    emptyStringIfNullish,
    z
      .string()
      .transform(trimAndCollapseWhitespace)
      .pipe(z.string().max(maximum, `Value must be ${maximum} characters or less.`)),
  );
}

function normalizePublicPhonePrefix(value: string) {
  const normalized = value.trim();
  return (publicPhonePrefixValues as readonly string[]).includes(normalized)
    ? (normalized as (typeof publicPhonePrefixValues)[number])
    : null;
}

function publicPhoneField(label = "Phone number") {
  return z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(z.string().min(1, `${label} is required.`).max(20, `${label} is too long.`))
    .superRefine((value, context) => {
      const match = value.match(phoneValuePattern);

      if (!match) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Please enter ${label.toLowerCase()} with a valid country code and number.`,
        });
        return;
      }

      const [, prefix, digits] = match;
      const normalizedPrefix = normalizePublicPhonePrefix(prefix);

      if (!normalizedPrefix || !supportedPhonePrefixes.includes(normalizedPrefix)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} uses an unsupported country code.`,
        });
        return;
      }

      const metadata = publicPhoneMetadata[normalizedPrefix];

      if (digits.length < metadata.minLength || digits.length > metadata.maxLength) {
        const lengthLabel =
          metadata.minLength === metadata.maxLength
            ? `${metadata.maxLength} digits`
            : `${metadata.minLength}-${metadata.maxLength} digits`;

        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be ${lengthLabel} for ${normalizedPrefix}.`,
        });
      }
    });
}

function isValidLinkedInUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    if (!hostname.endsWith("linkedin.com")) {
      return false;
    }

    return linkedInPathPattern.test(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedResumeFileName(fileName: string) {
  const trimmed = fileName.trim();
  const extensionStart = trimmed.lastIndexOf(".");

  if (extensionStart <= 0 || extensionStart === trimmed.length - 1) {
    return false;
  }

  const extension = trimmed.slice(extensionStart).toLowerCase();

  if (!(candidateLeadResumeAllowedExtensions as readonly string[]).includes(extension)) {
    return false;
  }

  const baseName = trimmed.slice(0, extensionStart);

  return /^[A-Za-z0-9][A-Za-z0-9 ._()-]*$/.test(baseName);
}

function resumeFileNameField(label: string) {
  return z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(z.string().min(1, `${label} is required.`).max(255, `${label} is too long.`))
    .refine(isAllowedResumeFileName, {
      message: `${label} must be a PDF, DOC, or DOCX file with a valid file name.`,
    });
}

function resumeContentTypeField(label: string) {
  return z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(z.string().min(1, `${label} is required.`).max(120, `${label} is too long.`))
    .refine((value) => isAllowedCandidateLeadResumeContentType(value), {
      message: `${label} must be PDF, DOC, or DOCX content.`,
    });
}

export const createCandidateLeadUploadUrlSchema = z.object({
  fileName: resumeFileNameField("Resume file name"),
  contentType: resumeContentTypeField("Resume content type"),
  submissionType: z.enum(candidateLeadSubmissionTypeValues),
});

const rawCreateCandidateLeadSchema = z
  .object({
    fullName: baseTextField("Full name", 2, 80).refine((value) => personNamePattern.test(value), {
      message: "Full name must use letters and standard name punctuation only.",
    }),
    email: z
      .string()
      .trim()
      .email("Please enter a valid email address.")
      .max(160, "Email is too long."),
    phone: publicPhoneField(),
    role: baseTextField("Role", 2, 120).refine((value) => rolePattern.test(value), {
      message: "Role must look like a valid job title.",
    }),
    experience: optionalTextField(40),
    linkedInUrl: optionalTextField(240).refine((value) => !value || isValidLinkedInUrl(value), {
      message: "Please enter a valid LinkedIn URL.",
    }),
    desiredLocation: optionalTextField(120),
    desiredSalaryRange: optionalTextField(120),
    skills: optionalTextField(300),
    submissionType: z.enum(candidateLeadSubmissionTypeValues).optional().default("contact-candidate"),
    sourcePage: z.enum(candidateLeadSourcePageValues).optional().default("unknown"),
    resume_object_key: nullableTrimmedTextField(400),
    resume_file_name: nullableTrimmedTextField(255),
    resume_content_type: nullableTrimmedTextField(120),
  })
  .superRefine((value, context) => {
    const hasExperience = Boolean(value.experience);
    const isKnownExperience = (candidateLeadExperienceValues as readonly string[]).includes(value.experience);
    const hasResumeReference = Boolean(value.resume_object_key || value.resume_file_name || value.resume_content_type);
    const parsedResumeObjectKey = value.resume_object_key
      ? parseCandidateLeadResumeObjectKey(value.resume_object_key)
      : null;

    if (value.submissionType !== "market-resume" && !hasExperience) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["experience"],
        message: "Please select your experience range.",
      });
      return;
    }

    if (hasExperience && !isKnownExperience) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["experience"],
        message: "Please select your experience range.",
      });
    }

    if (value.desiredLocation && !locationPattern.test(value.desiredLocation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["desiredLocation"],
        message: "Please enter a valid desired location.",
      });
    }

    if (value.desiredSalaryRange && !salaryPattern.test(value.desiredSalaryRange)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["desiredSalaryRange"],
        message: "Please enter a valid desired salary range.",
      });
    }

    if (value.skills && !skillsPattern.test(value.skills)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skills"],
        message: "Please enter readable skills or technologies.",
      });
    }

    if (hasResumeReference) {
      if (!value.resume_object_key) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resume_object_key"],
          message: "Resume object key is required when resume metadata is provided.",
        });
      }

      if (!value.resume_file_name) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resume_file_name"],
          message: "Resume file name is required when resume metadata is provided.",
        });
      }

      if (!value.resume_content_type) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resume_content_type"],
          message: "Resume content type is required when resume metadata is provided.",
        });
      }
    }

    if (value.resume_object_key && !parsedResumeObjectKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resume_object_key"],
        message: "Resume object key must match the candidate lead upload path pattern.",
      });
    }

    if (value.resume_file_name && !isAllowedResumeFileName(value.resume_file_name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resume_file_name"],
        message: "Resume file name must be a PDF, DOC, or DOCX file with a valid file name.",
      });
    }

    if (value.resume_content_type && !isAllowedCandidateLeadResumeContentType(value.resume_content_type)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resume_content_type"],
        message: "Resume content type must be PDF, DOC, or DOCX content.",
      });
    }

    if (parsedResumeObjectKey && parsedResumeObjectKey.submissionType !== value.submissionType) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resume_object_key"],
        message: "Resume object key does not match the submission type.",
      });
    }

    if (parsedResumeObjectKey && value.resume_file_name) {
      const objectKeyExtension = parsedResumeObjectKey.storedFileName.slice(
        parsedResumeObjectKey.storedFileName.lastIndexOf("."),
      );
      const fileNameExtension = value.resume_file_name
        .slice(value.resume_file_name.lastIndexOf("."))
        .toLowerCase();

      if (objectKeyExtension !== fileNameExtension) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resume_file_name"],
          message: "Resume file name extension must match the uploaded object key.",
        });
      }
    }

    if (value.submissionType === "contact-candidate" && !value.linkedInUrl && !value.resume_object_key) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resume_object_key"],
        message: "Please provide either a LinkedIn URL or a resume upload.",
      });
    }

    if (
      (value.submissionType === "resume-submission" || value.submissionType === "market-resume") &&
      !value.resume_object_key
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resume_object_key"],
        message: "Resume metadata is required for this submission type.",
      });
    }

    if (value.submissionType === "market-resume") {
      if (!value.desiredLocation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["desiredLocation"],
          message: "Please enter your desired location.",
        });
      }

      if (!value.desiredSalaryRange) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["desiredSalaryRange"],
          message: "Please enter your desired salary range.",
        });
      }

      if (!value.skills) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["skills"],
          message: "Please enter your core skills or technologies.",
        });
      }
    }
  });

export const createCandidateLeadSchema = rawCreateCandidateLeadSchema.transform((value) => ({
  fullName: value.fullName,
  email: value.email,
  phone: value.phone,
  role: value.role,
  experience: value.experience,
  linkedInUrl: value.linkedInUrl,
  desiredLocation: value.desiredLocation,
  desiredSalaryRange: value.desiredSalaryRange,
  skills: value.skills,
  submissionType: value.submissionType,
  sourcePage: value.sourcePage,
  resume: value.resume_object_key
    ? {
        objectKey: value.resume_object_key,
        fileName: value.resume_file_name!,
        contentType: value.resume_content_type as (typeof candidateLeadResumeAllowedContentTypes)[number],
      }
    : null,
}));

export const candidateLeadIdParamsSchema = z.object({
  id: z.string().trim().min(1, "Candidate lead id is required."),
});
