import { z } from "zod";

import { companyLeadNeedValues, companyLeadSourcePageValues } from "./company-leads.types.js";

const publicPhonePrefixValues = ["+91", "+1", "+44", "+61", "+49", "+33", "+65", "+971"] as const;
const supportedPhonePrefixes = [...publicPhonePrefixValues].sort((left, right) => right.length - left.length);

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

const personNamePattern = /^(?=.*[A-Za-z])[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const companyNamePattern = /^(?=.*[A-Za-z])[A-Za-z&.,'()\/ -]+$/;
const phoneValuePattern = /^(\+\d{1,4})\s(\d{6,14})$/;

function trimAndCollapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function baseTextField(label: string, minimum: number, maximum: number) {
  return z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(z.string().min(minimum, `${label} is required.`).max(maximum, `${label} is too long.`));
}

function normalizePublicPhonePrefix(value: string) {
  const normalized = value.trim();
  return (publicPhonePrefixValues as readonly string[]).includes(normalized)
    ? (normalized as (typeof publicPhonePrefixValues)[number])
    : null;
}

function personNameField(label: string, minimum = 2, maximum = 80) {
  return baseTextField(label, minimum, maximum).refine((value) => personNamePattern.test(value), {
    message: `${label} must use letters and standard name punctuation only.`,
  });
}

function companyNameField(label: string, minimum = 2, maximum = 120) {
  return baseTextField(label, minimum, maximum).refine((value) => companyNamePattern.test(value), {
    message: `${label} must look like a valid company name.`,
  });
}

function optionField<TValues extends readonly string[]>(values: TValues, message: string) {
  return z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(z.string().min(1, message))
    .refine((value): value is TValues[number] => (values as readonly string[]).includes(value), {
      message,
    });
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

export const createCompanyLeadSchema = z.object({
  name: personNameField("Full name", 2, 80),
  companyName: companyNameField("Company name", 2, 120),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .max(160, "Email is too long."),
  phone: publicPhoneField(),
  need: optionField(companyLeadNeedValues, "Please select what you need."),
  message: z
    .string()
    .transform(trimAndCollapseWhitespace)
    .pipe(
      z
        .string()
        .min(20, "Please enter at least 20 characters in your message.")
        .max(700, "Message must be 700 characters or less."),
    )
    .refine((value) => /[A-Za-z]/.test(value), {
      message: "Message must include clear text, not only numbers or symbols.",
    }),
  sourcePage: z.enum(companyLeadSourcePageValues).optional().default("unknown"),
});

export const companyLeadIdParamsSchema = z.object({
  id: z.string().trim().min(1, "Company lead id is required."),
});
