import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";

const DEFAULT_PRESIGNED_UPLOAD_TTL_SECONDS = 900;
const MAX_PRESIGNED_UPLOAD_TTL_SECONDS = 60 * 60;
const R2_REGION = "auto";

export type R2StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string | null;
  endpoint: string;
};

export type PresignedR2UploadInput = {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
};

export type R2ObjectResult = {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
};

let r2Client: S3Client | null = null;

function requireValue(value: string | undefined, message: string) {
  if (!value) {
    throw new AppError(500, message);
  }

  return value;
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: {
      httpStatusCode?: number;
    };
  };

  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NotFound" ||
    candidate.Code === "NoSuchKey" ||
    candidate.code === "NotFound" ||
    candidate.code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function normalizePresignedUploadExpiresInSeconds(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_PRESIGNED_UPLOAD_TTL_SECONDS;
  }

  const normalized = Math.floor(value);

  if (normalized < 1) {
    return DEFAULT_PRESIGNED_UPLOAD_TTL_SECONDS;
  }

  return Math.min(normalized, MAX_PRESIGNED_UPLOAD_TTL_SECONDS);
}

function toNodeReadable(body: unknown) {
  if (body instanceof Readable) {
    return body;
  }

  if (body && typeof body === "object" && "transformToWebStream" in body) {
    const transformToWebStream = (body as { transformToWebStream?: () => WebReadableStream }).transformToWebStream;

    if (typeof transformToWebStream === "function") {
      return Readable.fromWeb(transformToWebStream.call(body));
    }
  }

  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }

  throw new AppError(500, "R2 object body is unavailable.");
}

export function getR2StorageConfig(): R2StorageConfig {
  const accountId = requireValue(env.R2_ACCOUNT_ID, "R2 account ID is not configured.");
  const accessKeyId = requireValue(env.R2_ACCESS_KEY_ID, "R2 access key ID is not configured.");
  const secretAccessKey = requireValue(env.R2_SECRET_ACCESS_KEY, "R2 secret access key is not configured.");
  const bucketName = requireValue(env.R2_BUCKET_NAME, "R2 bucket name is not configured.");

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? null,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

export function isR2Configured() {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME,
  );
}

export function buildR2PublicUrl(objectKey: string) {
  const { publicBaseUrl } = getR2StorageConfig();

  if (!publicBaseUrl) {
    throw new AppError(500, "R2 public base URL is not configured.");
  }

  const normalizedBaseUrl = publicBaseUrl.replace(/\/+$/, "");
  const normalizedObjectKey = objectKey.replace(/^\/+/, "");

  return `${normalizedBaseUrl}/${normalizedObjectKey}`;
}

function getR2Client() {
  if (r2Client) {
    return r2Client;
  }

  const storageConfig = getR2StorageConfig();

  r2Client = new S3Client({
    region: R2_REGION,
    endpoint: storageConfig.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey,
    },
  });

  return r2Client;
}

export async function createPresignedR2UploadUrl(input: PresignedR2UploadInput) {
  const storageConfig = getR2StorageConfig();
  const command = new PutObjectCommand({
    Bucket: storageConfig.bucketName,
    Key: input.objectKey,
    ContentType: input.contentType,
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: normalizePresignedUploadExpiresInSeconds(input.expiresInSeconds),
  });
}

export async function r2ObjectExists(objectKey: string) {
  const storageConfig = getR2StorageConfig();

  try {
    await getR2Client().send(
      new HeadObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: objectKey,
      }),
    );

    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw new AppError(500, "Unable to verify uploaded resume object.");
  }
}

export async function getR2Object(objectKey: string): Promise<R2ObjectResult | null> {
  const storageConfig = getR2StorageConfig();

  try {
    const result = await getR2Client().send(
      new GetObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: objectKey,
      }),
    );

    if (!result.Body) {
      throw new AppError(500, "R2 object body is unavailable.");
    }

    return {
      body: toNodeReadable(result.Body),
      contentType: result.ContentType ?? null,
      contentLength: typeof result.ContentLength === "number" ? result.ContentLength : null,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(500, "Unable to load resume object.");
  }
}
