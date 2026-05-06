import path from "node:path";
import { randomUUID } from "node:crypto";

import { AppError } from "../lib/app-error.js";
import { assertManagedMediaStorageConfigured, putR2Object } from "./r2-storage.service.js";

export type AdminImageUploadFolder = "blog" | "team" | "profiles";

const MAX_ADMIN_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getFolderSegment(folder: AdminImageUploadFolder) {
  if (folder === "team") {
    return "team";
  }

  if (folder === "profiles") {
    return "profiles";
  }

  return "blog";
}

function parseImageDataUrl(dataUrl: string) {
  const normalized = dataUrl.trim();
  const match = normalized.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);

  if (!match) {
    throw new AppError(400, "Invalid image payload.");
  }

  const contentType = match[1].toLowerCase();
  const base64Data = match[2].replace(/\s+/g, "");
  const extension = SUPPORTED_IMAGE_TYPES.get(contentType);

  if (!extension) {
    throw new AppError(400, "Only JPG, PNG, WEBP, GIF, and AVIF images are supported.");
  }

  const fileBuffer = Buffer.from(base64Data, "base64");

  if (!fileBuffer.length) {
    throw new AppError(400, "Uploaded image is empty.");
  }

  if (fileBuffer.length > MAX_ADMIN_IMAGE_BYTES) {
    throw new AppError(400, "Image must be 5MB or smaller.");
  }

  return {
    contentType,
    extension,
    fileBuffer,
  };
}

export async function saveAdminImageUpload(input: {
  folder: AdminImageUploadFolder;
  fileName: string;
  dataUrl: string;
}) {
  assertManagedMediaStorageConfigured("Cloudflare R2 media storage is not configured for admin images.");

  const { contentType, extension, fileBuffer } = parseImageDataUrl(input.dataUrl);
  const folderSegment = getFolderSegment(input.folder);
  const originalStem = path.parse(input.fileName).name;
  const safeStem = slugify(originalStem) || folderSegment;
  const storedFileName = `${Date.now()}-${safeStem}-${randomUUID().slice(0, 8)}${extension}`;
  const objectKey = path.posix.join("uploads", "admin", folderSegment, storedFileName);

  await putR2Object({
    objectKey,
    contentType,
    body: fileBuffer,
    cacheControl: "public, max-age=31536000, immutable",
  });

  return {
    path: `/${objectKey}`,
  };
}
