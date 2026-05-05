import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalStringSchema = z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());
const optionalUrlSchema = z.preprocess(emptyStringToUndefined, z.string().trim().url().optional());

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
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
