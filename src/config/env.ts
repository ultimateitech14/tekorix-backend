import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalStringSchema = z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());
const optionalUrlSchema = z.preprocess(emptyStringToUndefined, z.string().trim().url().optional());
const placeholderValues = new Set(["host", "user", "username", "password", "dbname", "database"]);

const databaseUrlSchema = z.string().trim().min(1, "DATABASE_URL is required.").superRefine((value, ctx) => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL must be a valid PostgreSQL connection string.",
    });
    return;
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL must start with postgres:// or postgresql://.",
    });
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  const username = parsedUrl.username.trim().toLowerCase();
  const password = decodeURIComponent(parsedUrl.password).trim().toLowerCase();
  const databaseName = parsedUrl.pathname.replace(/^\/+/, "").trim().toLowerCase();

  if (placeholderValues.has(hostname)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL still contains a placeholder host. Replace HOST with the real database hostname.",
    });
  }

  if (placeholderValues.has(username)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL still contains a placeholder username. Replace USER with the real database user.",
    });
  }

  if (placeholderValues.has(password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL still contains a placeholder password. Replace PASSWORD with the real database password.",
    });
  }

  if (placeholderValues.has(databaseName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DATABASE_URL still contains a placeholder database name. Replace DBNAME with the real database name.",
    });
  }
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: databaseUrlSchema,
  JWT_SECRET: z
    .string()
    .trim()
    .min(16, "JWT_SECRET must be at least 16 characters long."),
  ADMIN_EMAIL: z.string().trim().email("ADMIN_EMAIL must be a valid email address."),
  ADMIN_NAME: optionalStringSchema,
  ADMIN_PASSWORD: z.string().trim().min(8, "ADMIN_PASSWORD must be at least 8 characters long."),
  R2_ACCOUNT_ID: optionalStringSchema,
  R2_ACCESS_KEY_ID: optionalStringSchema,
  R2_SECRET_ACCESS_KEY: optionalStringSchema,
  R2_BUCKET_NAME: optionalStringSchema,
  R2_PUBLIC_BASE_URL: optionalUrlSchema,
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
}

export const env = {
  ...parsedEnv.data,
  ADMIN_EMAIL: parsedEnv.data.ADMIN_EMAIL.toLowerCase(),
} as const;

export type AppEnv = typeof env;
