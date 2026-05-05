import { randomUUID } from "crypto";

import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "../../lib/shared-admin-files.js";
import {
  companyLeadNeedValues,
  companyLeadSourcePageValues,
  type CompanyLeadNeed,
  type CompanyLeadRecord,
  type CompanyLeadSourcePage,
  type CreateCompanyLeadInput,
} from "./company-leads.types.js";

const storageFileName = "company-leads.json";
const validNeeds = new Set<string>(companyLeadNeedValues);
const validSourcePages = new Set<string>(companyLeadSourcePageValues);

function normalizeNeed(value: unknown): CompanyLeadNeed {
  if (typeof value === "string" && validNeeds.has(value)) {
    return value as CompanyLeadNeed;
  }

  return "mixed-requirement";
}

function normalizeSourcePage(value: unknown): CompanyLeadSourcePage {
  if (typeof value === "string" && validSourcePages.has(value)) {
    return value as CompanyLeadSourcePage;
  }

  return "unknown";
}

function sortByCreatedAtDesc(items: CompanyLeadRecord[]) {
  return [...items].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

function normalizeRecord(value: unknown): CompanyLeadRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<CompanyLeadRecord>;
  const id = trimToString(item.id);
  const name = trimToString(item.name);
  const companyName = trimToString(item.companyName);
  const email = trimToString(item.email);
  const phone = trimToString(item.phone);
  const message = trimToString(item.message);

  if (!id || !name || !companyName || !email || !phone || !message) {
    return null;
  }

  return {
    id,
    name,
    companyName,
    email,
    phone,
    need: normalizeNeed(item.need),
    message,
    sourcePage: normalizeSourcePage(item.sourcePage),
    status: trimToString(item.status) || "new",
    isRead: Boolean(item.isRead),
    createdAt: normalizeTimestamp(item.createdAt),
    updatedAt: normalizeTimestamp(item.updatedAt),
  };
}

async function readCompanyLeadsFile() {
  const parsed = await readJsonFile<unknown[]>(storageFileName, []);

  return sortByCreatedAtDesc(
    parsed.map((item) => normalizeRecord(item)).filter((item): item is CompanyLeadRecord => Boolean(item)),
  );
}

async function writeCompanyLeadsFile(items: CompanyLeadRecord[]) {
  await writeJsonFile(storageFileName, sortByCreatedAtDesc(items));
}

export async function createCompanyLeadFallbackRecord(input: CreateCompanyLeadInput) {
  const items = await readCompanyLeadsFile();
  const timestamp = new Date().toISOString();
  const record: CompanyLeadRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    companyName: input.companyName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    need: input.need,
    message: input.message.trim(),
    sourcePage: input.sourcePage,
    status: "new",
    isRead: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  items.unshift(record);
  await writeCompanyLeadsFile(items);
  return record;
}

export async function listCompanyLeadFallbackRecords() {
  return readCompanyLeadsFile();
}

export async function getCompanyLeadFallbackRecordById(id: string) {
  const items = await readCompanyLeadsFile();
  return items.find((item) => item.id === id) ?? null;
}

export async function markCompanyLeadFallbackRecordAsRead(id: string) {
  const items = await readCompanyLeadsFile();
  let updated: CompanyLeadRecord | null = null;

  const next = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    updated = {
      ...item,
      isRead: true,
      updatedAt: new Date().toISOString(),
    };

    return updated;
  });

  if (!updated) {
    return null;
  }

  await writeCompanyLeadsFile(next);
  return updated;
}
