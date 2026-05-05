import { Router } from "express";

import {
  clearResumeBankEntries,
  getResumeBankEntries,
  removeResumeBankEntriesByApplicationIds,
  removeResumeBankEntryByApplicationId,
} from "../lib/admin-resume-bank-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const resumeBankRoutes = Router();

resumeBankRoutes.get(
  "/api/admin/resume-bank",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const items = await getResumeBankEntries();

    sendSuccess(response, {
      message: "Resume bank fetched successfully.",
      data: {
        items,
      },
    });
  }),
);

resumeBankRoutes.delete(
  "/api/admin/resume-bank",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const deleteAll = Boolean(request.body?.deleteAll);

    if (deleteAll) {
      await clearResumeBankEntries();
      await createAdminAuditEntry({
        category: "activity",
        module: "Candidates",
        action: "Cleared Resume Bank",
        target: "All resume bank entries",
      });

      return sendSuccess(response, {
        message: "Resume bank cleared.",
        data: {
          deletedCount: "all",
        },
      });
    }

    const applicationIds = Array.isArray(request.body?.applicationIds)
      ? request.body.applicationIds
          .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];

    if (applicationIds.length > 0) {
      const removed = await removeResumeBankEntriesByApplicationIds(applicationIds);

      if (removed > 0) {
        await createAdminAuditEntry({
          category: "activity",
          module: "Candidates",
          action: "Deleted Selected Resume Bank Entries",
          target: `${removed} record(s) removed`,
        });
      }

      return sendSuccess(response, {
        message: removed > 0 ? "Selected resume entries deleted." : "No resume entries were removed.",
        data: {
          deletedCount: removed,
        },
      });
    }

    const applicationId = typeof request.body?.applicationId === "string" ? request.body.applicationId.trim() : "";

    if (!applicationId) {
      throw new AppError(400, "applicationId or applicationIds or deleteAll is required.");
    }

    const removed = await removeResumeBankEntryByApplicationId(applicationId);

    if (!removed) {
      throw new AppError(404, "Resume bank entry not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Candidates",
      action: "Deleted Resume Bank Entry",
      target: applicationId,
    });

    return sendSuccess(response, {
      message: "Resume entry deleted.",
      data: {
        deletedCount: 1,
      },
    });
  }),
);

export { resumeBankRoutes };
