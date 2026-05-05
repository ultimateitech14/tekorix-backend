import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const frontendDataDir = path.resolve(process.cwd(), "..", "..", "frontend", "data");
const frontendResumeDir = path.join(frontendDataDir, "job-application-resumes");

function getDataFilePath(fileName: string) {
  return path.join(frontendDataDir, fileName);
}

export function getFrontendResumeDirPath() {
  return frontendResumeDir;
}

export function getFrontendDataFilePath(fileName: string) {
  return getDataFilePath(fileName);
}

export async function ensureFrontendDataDir() {
  await mkdir(frontendDataDir, { recursive: true });
}

export async function ensureFrontendResumeDir() {
  await mkdir(frontendResumeDir, { recursive: true });
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(getDataFilePath(fileName), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(fileName: string, value: unknown) {
  await ensureFrontendDataDir();
  await writeFile(getDataFilePath(fileName), JSON.stringify(value, null, 2), "utf8");
}

export function normalizeTimestamp(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) {
    return value;
  }

  return fallback;
}

export function trimToString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
