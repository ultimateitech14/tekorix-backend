import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";

const DEFAULT_PRESIGNED_UPLOAD_TTL_SECONDS = 900;
const MAX_PRESIGNED_UPLOAD_TTL_SECONDS = 60 * 60;
const R2_REGION = "auto";
const testStorageRootDir = path.resolve(process.cwd(), ".test-r2-storage");

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

export type PutR2ObjectInput = {
  objectKey: string;
  contentType: string;
  body: Buffer;
  cacheControl?: string;
};

export type R2ObjectResult = {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
  cacheControl: string | null;
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

function normalizeObjectKey(objectKey: string) {
  const normalized = objectKey
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");

  if (!normalized) {
    throw new AppError(400, "Media object key is required.");
  }

  const segments = normalized.split("/");

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new AppError(400, "Media object key is invalid.");
  }

  return normalized;
}

function isTestObjectStorageEnabled() {
  return env.NODE_ENV === "test";
}

function resolveTestStoragePaths(objectKey: string) {
  const normalizedObjectKey = normalizeObjectKey(objectKey);
  const filePath = path.resolve(testStorageRootDir, normalizedObjectKey);
  const relativePath = path.relative(testStorageRootDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new AppError(400, "Media object key is invalid.");
  }

  return {
    normalizedObjectKey,
    filePath,
    metadataPath: `${filePath}.meta.json`,
  };
}

async function readTestObjectMetadata(metadataPath: string) {
  try {
    const raw = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<{
      contentType: unknown;
      cacheControl: unknown;
    }>;

    return {
      contentType: typeof parsed.contentType === "string" ? parsed.contentType : null,
      cacheControl: typeof parsed.cacheControl === "string" ? parsed.cacheControl : null,
    };
  } catch {
    return {
      contentType: null,
      cacheControl: null,
    };
  }
}

async function writeTestObjectMetadata(
  metadataPath: string,
  metadata: {
    contentType: string;
    cacheControl: string | null;
  },
) {
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        contentType: metadata.contentType,
        cacheControl: metadata.cacheControl,
      },
      null,
      2,
    ),
    "utf8",
  );
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

export function hasManagedMediaStorage() {
  return isR2Configured() || isTestObjectStorageEnabled();
}

export function assertManagedMediaStorageConfigured(message = "Cloudflare R2 media storage is not configured.") {
  if (!hasManagedMediaStorage()) {
    throw new AppError(500, message);
  }
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
  const normalizedObjectKey = normalizeObjectKey(input.objectKey);
  const storageConfig = getR2StorageConfig();
  const command = new PutObjectCommand({
    Bucket: storageConfig.bucketName,
    Key: normalizedObjectKey,
    ContentType: input.contentType,
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: normalizePresignedUploadExpiresInSeconds(input.expiresInSeconds),
  });
}

export async function putR2Object(input: PutR2ObjectInput) {
  const normalizedObjectKey = normalizeObjectKey(input.objectKey);

  if (isR2Configured()) {
    const storageConfig = getR2StorageConfig();

    try {
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: storageConfig.bucketName,
          Key: normalizedObjectKey,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
          Body: input.body,
        }),
      );

      return;
    } catch {
      throw new AppError(500, "Unable to store media object in R2.");
    }
  }

  if (!isTestObjectStorageEnabled()) {
    throw new AppError(500, "Cloudflare R2 media storage is not configured.");
  }

  const { filePath, metadataPath } = resolveTestStoragePaths(normalizedObjectKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.body);
  await writeTestObjectMetadata(metadataPath, {
    contentType: input.contentType,
    cacheControl: input.cacheControl ?? null,
  });
}

export async function r2ObjectExists(objectKey: string) {
  const normalizedObjectKey = normalizeObjectKey(objectKey);

  if (!isR2Configured()) {
    if (!isTestObjectStorageEnabled()) {
      throw new AppError(500, "Cloudflare R2 media storage is not configured.");
    }

    const { filePath } = resolveTestStoragePaths(normalizedObjectKey);

    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  const storageConfig = getR2StorageConfig();

  try {
    await getR2Client().send(
      new HeadObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: normalizedObjectKey,
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
  const normalizedObjectKey = normalizeObjectKey(objectKey);

  if (!isR2Configured()) {
    if (!isTestObjectStorageEnabled()) {
      throw new AppError(500, "Cloudflare R2 media storage is not configured.");
    }

    const { filePath, metadataPath } = resolveTestStoragePaths(normalizedObjectKey);

    try {
      const fileInfo = await stat(filePath);
      const metadata = await readTestObjectMetadata(metadataPath);

      return {
        body: createReadStream(filePath),
        contentType: metadata.contentType,
        contentLength: fileInfo.size,
        cacheControl: metadata.cacheControl,
      };
    } catch {
      return null;
    }
  }

  const storageConfig = getR2StorageConfig();

  try {
    const result = await getR2Client().send(
      new GetObjectCommand({
        Bucket: storageConfig.bucketName,
        Key: normalizedObjectKey,
      }),
    );

    if (!result.Body) {
      throw new AppError(500, "R2 object body is unavailable.");
    }

    return {
      body: toNodeReadable(result.Body),
      contentType: result.ContentType ?? null,
      contentLength: typeof result.ContentLength === "number" ? result.ContentLength : null,
      cacheControl: result.CacheControl ?? null,
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

export async function deleteR2Object(objectKey: string) {
  const normalizedObjectKey = normalizeObjectKey(objectKey);

  if (isR2Configured()) {
    const storageConfig = getR2StorageConfig();

    try {
      await getR2Client().send(
        new DeleteObjectCommand({
          Bucket: storageConfig.bucketName,
          Key: normalizedObjectKey,
        }),
      );
      return;
    } catch {
      throw new AppError(500, "Unable to delete stored media object.");
    }
  }

  if (!isTestObjectStorageEnabled()) {
    throw new AppError(500, "Cloudflare R2 media storage is not configured.");
  }

  const { filePath, metadataPath } = resolveTestStoragePaths(normalizedObjectKey);

  await Promise.all(
    [filePath, metadataPath].map(async (targetPath) => {
      try {
        await unlink(targetPath);
      } catch {
        // Ignore missing files during cleanup.
      }
    }),
  );
}
