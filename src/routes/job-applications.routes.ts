import { readFile } from "fs/promises";

import { Router } from "express";
import { z } from "zod";

import {
  deleteAllJobApplications,
  deleteJobApplicationById,
  getJobApplicationById,
  getJobApplicationResumeById,
  markAllJobApplicationsAsRead,
  markJobApplicationAsRead,
  readJobApplications,
  updateJobApplicationAdminNotes,
  updateJobApplicationStatus,
  type JobApplicationStatus,
} from "../lib/admin-job-applications-store.js";
import {
  clearResumeBankEntries,
  removeResumeBankEntryByApplicationId,
  upsertResumeBankEntryFromApplication,
} from "../lib/admin-resume-bank-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendError, sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const jobApplicationsRoutes = Router();

const jobApplicationStatusSchema = z.enum(["pending review", "shortlisted", "rejected", "interview"]);

function parseScope(value: unknown) {
  return value === "candidates" ? "candidates" : "applications";
}

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function sanitizeDownloadName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function formatStatusLabel(status: JobApplicationStatus) {
  if (status === "pending review") {
    return "Pending Review";
  }

  if (status === "shortlisted") {
    return "Shortlisted";
  }

  if (status === "rejected") {
    return "Rejected";
  }

  return "Interview";
}

jobApplicationsRoutes.get(
  "/api/admin/job-applications",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const items = await readJobApplications();

    sendSuccess(response, {
      message: "Applications fetched successfully.",
      data: {
        items,
        unreadCount: items.filter((item) => !item.isRead).length,
      },
    });
  }),
);

jobApplicationsRoutes.get(
  "/api/admin/job-applications/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getParamId(request.params.id);
    const item = await getJobApplicationById(id);

    if (!item) {
      throw new AppError(404, "Application not found.");
    }

    sendSuccess(response, {
      message: "Application fetched successfully.",
      data: item,
    });
  }),
);

jobApplicationsRoutes.patch(
  "/api/admin/job-applications",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const markAll = Boolean(request.body?.markAll);

    if (markAll) {
      await markAllJobApplicationsAsRead();
      await createAdminAuditEntry({
        category: "activity",
        module: "Applications",
        action: "Marked All Applications As Read",
        target: "All applications",
      });

      return sendSuccess(response, {
        message: "All applications marked as read.",
      });
    }

    const id = typeof request.body?.id === "string" ? request.body.id.trim() : "";

    if (!id) {
      throw new AppError(400, "Application id is required.");
    }

    const statusValue = typeof request.body?.status === "string" ? request.body.status.trim() : "";
    const hasAdminNotes = typeof request.body?.adminNotes === "string";

    if (statusValue) {
      const parsedStatus = jobApplicationStatusSchema.safeParse(statusValue);

      if (!parsedStatus.success) {
        throw new AppError(400, "Invalid status value.");
      }

      const updated = await updateJobApplicationStatus(id, parsedStatus.data);

      if (!updated) {
        throw new AppError(404, "Application not found.");
      }

      await createAdminAuditEntry({
        category: "activity",
        module: "Applications",
        action: "Updated Application Status",
        target: `${id} - ${parsedStatus.data}`,
      });

      return sendSuccess(response, {
        message: `Application marked as ${formatStatusLabel(parsedStatus.data)}.`,
        data: updated,
      });
    }

    const updated = await markJobApplicationAsRead(id);

    if (!updated) {
      throw new AppError(404, "Application not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Applications",
      action: "Marked Application As Read",
      target: id,
    });

    return sendSuccess(response, {
      message: "Application marked as read.",
      data: updated,
    });
  }),
);

jobApplicationsRoutes.patch(
  "/api/admin/job-applications/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const applicationId = getParamId(request.params.id);
    const statusValue = typeof request.body?.status === "string" ? request.body.status.trim() : "";
    const hasAdminNotes = typeof request.body?.adminNotes === "string";

    if (statusValue) {
      const parsedStatus = jobApplicationStatusSchema.safeParse(statusValue);

      if (!parsedStatus.success) {
        throw new AppError(400, "Invalid status value.");
      }

      const updated = await updateJobApplicationStatus(applicationId, parsedStatus.data);

      if (!updated) {
        throw new AppError(404, "Application not found.");
      }

      await createAdminAuditEntry({
        category: "activity",
        module: "Applications",
        action: "Updated Application Status",
        target: `${applicationId} - ${parsedStatus.data}`,
      });

      return sendSuccess(response, {
        message: `Application marked as ${formatStatusLabel(parsedStatus.data)}.`,
        data: updated,
      });
    }

    if (hasAdminNotes) {
      const updated = await updateJobApplicationAdminNotes(applicationId, request.body.adminNotes.trim());

      if (!updated) {
        throw new AppError(404, "Application not found.");
      }

      await createAdminAuditEntry({
        category: "activity",
        module: "Applications",
        action: "Updated Application Notes",
        target: applicationId,
      });

      return sendSuccess(response, {
        message: "Application notes saved.",
        data: updated,
      });
    }

    const updated = await markJobApplicationAsRead(applicationId);

    if (!updated) {
      throw new AppError(404, "Application not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Applications",
      action: "Marked Application As Read",
      target: applicationId,
    });

    return sendSuccess(response, {
      message: "Application marked as read.",
      data: updated,
    });
  }),
);

jobApplicationsRoutes.delete(
  "/api/admin/job-applications",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const scope = parseScope(request.body?.scope);
    const moduleName = scope === "candidates" ? "Candidates" : "Applications";
    const deleteAll = Boolean(request.body?.deleteAll);

    if (deleteAll) {
      const deletedCount = await deleteAllJobApplications();
      await clearResumeBankEntries();

      await createAdminAuditEntry({
        category: "activity",
        module: moduleName,
        action: scope === "candidates" ? "Cleared Candidate Directory" : "Deleted All Applications",
        target: `${deletedCount} record(s) removed`,
      });

      return sendSuccess(response, {
        message: scope === "candidates" ? "Candidate directory cleared." : "Applications deleted successfully.",
        data: {
          deletedCount,
        },
      });
    }

    const id = typeof request.body?.id === "string" ? request.body.id.trim() : "";

    if (!id) {
      throw new AppError(400, "Application id is required.");
    }

    const deleted = await deleteJobApplicationById(id);

    if (!deleted) {
      throw new AppError(404, "Application not found.");
    }

    await removeResumeBankEntryByApplicationId(id);
    await createAdminAuditEntry({
      category: "activity",
      module: moduleName,
      action: scope === "candidates" ? "Deleted Candidate" : "Deleted Application",
      target: `${id} - ${deleted.fullName}`,
    });

    return sendSuccess(response, {
      message: scope === "candidates" ? "Candidate deleted." : "Application deleted.",
      data: deleted,
    });
  }),
);

jobApplicationsRoutes.get(
  "/api/admin/job-applications/:id/resume",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const result = await getJobApplicationResumeById(getParamId(request.params.id));

    if (!result) {
      return sendError(response, {
        status: 404,
        message: "Resume not found.",
      });
    }

    try {
      await upsertResumeBankEntryFromApplication(result.application);
      await createAdminAuditEntry({
        category: "activity",
        module: "Candidates",
        action: "Added Resume To Resume Bank",
        target: `${result.application.id} - ${result.application.fullName} (${result.application.jobTitle})`,
      });
    } catch {
      // Do not block download if resume bank sync fails.
    }

    const file = await readFile(result.absolutePath);
    const contentType = result.application.resume.contentType || "application/octet-stream";
    const fileName = sanitizeDownloadName(result.application.resume.originalName);

    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.status(200).send(file);
  }),
);

export { jobApplicationsRoutes };
