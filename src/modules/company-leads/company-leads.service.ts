import { AppError } from "../../lib/app-error.js";
import {
  createCompanyLeadRepository,
  getCompanyLeadByIdRepository,
  listCompanyLeadsRepository,
  markCompanyLeadAsReadRepository,
} from "./company-leads.repository.js";
import {
  createCompanyLeadFallbackRecord,
  getCompanyLeadFallbackRecordById,
  listCompanyLeadFallbackRecords,
  markCompanyLeadFallbackRecordAsRead,
} from "./company-leads.fallback-store.js";
import type { CreateCompanyLeadInput } from "./company-leads.types.js";

function isFallbackablePersistenceError(error: unknown) {
  if (error instanceof AppError && error.statusCode < 500) {
    return false;
  }

  return true;
}

function mergeCompanyLeads(primaryItems: Awaited<ReturnType<typeof listCompanyLeadsRepository>>, fallbackItems: Awaited<ReturnType<typeof listCompanyLeadFallbackRecords>>) {
  const seen = new Set<string>();

  return [...primaryItems, ...fallbackItems]
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    })
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

export async function createCompanyLeadService(input: CreateCompanyLeadInput) {
  try {
    return await createCompanyLeadRepository(input);
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }

    return createCompanyLeadFallbackRecord(input);
  }
}

export async function listCompanyLeadsService() {
  const fallbackItems = await listCompanyLeadFallbackRecords();

  try {
    const primaryItems = await listCompanyLeadsRepository();
    return mergeCompanyLeads(primaryItems, fallbackItems);
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }

    return fallbackItems;
  }
}

export async function getCompanyLeadByIdService(id: string) {
  try {
    const primaryItem = await getCompanyLeadByIdRepository(id);

    if (primaryItem) {
      return primaryItem;
    }
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }
  }

  return getCompanyLeadFallbackRecordById(id);
}

export async function markCompanyLeadAsReadService(id: string) {
  try {
    const existing = await getCompanyLeadByIdRepository(id);

    if (existing) {
      if (existing.isRead) {
        return existing;
      }

      return markCompanyLeadAsReadRepository(id);
    }
  } catch (error) {
    if (!isFallbackablePersistenceError(error)) {
      throw error;
    }
  }

  const fallbackRecord = await getCompanyLeadFallbackRecordById(id);

  if (!fallbackRecord) {
    return null;
  }

  if (fallbackRecord.isRead) {
    return fallbackRecord;
  }

  return markCompanyLeadFallbackRecordAsRead(id);
}
