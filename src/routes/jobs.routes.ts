import { Router, type Request } from "express";
import { z } from "zod";

import {
  createAdminJob,
  deleteAdminJob,
  getAdminJobById,
  getAdminJobsMetadata,
  getPublicJobBySlug,
  listAdminJobs,
  listPublicJobs,
  publishAdminJob,
  updateAdminJob,
} from "../lib/admin-jobs-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const jobsRoutes = Router();

const jobTypeSchema = z.enum(["full-time", "part-time", "contract"]);
const jobStatusSchema = z.enum(["draft", "published", "closed"]);

const jobPayloadSchema = z.object({
  title: z.string().trim().min(3, "Title is required."),
  department: z.string().trim().min(2, "Department is required."),
  country: z.string().trim().min(2, "Country is required."),
  city: z.string().trim().min(2, "City is required."),
  location: z.string().trim().min(2, "Location is required."),
  experience: z.string().trim().min(2, "Experience is required."),
  type: jobTypeSchema,
  salaryRange: z.string().trim().max(80, "Salary range is too long.").optional().default(""),
  skills: z.array(z.string().trim().min(1, "Skill cannot be empty.")).max(20).optional().default([]),
  description: z.string().trim().min(20, "Description should be at least 20 characters."),
  status: z.enum(["draft", "published"]).optional().default("draft"),
});

const publishPayloadSchema = z.object({
  status: jobStatusSchema.optional().default("published"),
});

const jobsListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: jobStatusSchema.optional(),
  type: jobTypeSchema.optional(),
  country: z.string().trim().max(80).optional(),
  location: z.string().trim().max(160).optional(),
  department: z.string().trim().max(80).optional(),
  remoteOnly: z
    .preprocess((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (normalized === "true" || normalized === "1") {
          return true;
        }

        if (normalized === "false" || normalized === "0" || normalized === "") {
          return false;
        }
      }

      return value;
    }, z.boolean().optional().default(false)),
  page: z.preprocess((value) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return Math.max(1, Math.trunc(parsed));
  }, z.number().int().optional().default(1)),
  pageSize: z.preprocess((value) => {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return Math.min(100, Math.max(1, Math.trunc(parsed)));
  }, z.number().int().optional().default(10)),
});

function getRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function getJobsListQuery(request: Request, options: { includeStatus: boolean }) {
  const parsed = jobsListQuerySchema.safeParse({
    search: typeof request.query.search === "string" ? request.query.search : undefined,
    status: options.includeStatus && typeof request.query.status === "string" ? request.query.status : undefined,
    type: typeof request.query.type === "string" ? request.query.type : undefined,
    country: typeof request.query.country === "string" ? request.query.country : undefined,
    location: typeof request.query.location === "string" ? request.query.location : undefined,
    department: typeof request.query.department === "string" ? request.query.department : undefined,
    remoteOnly: typeof request.query.remoteOnly === "string" ? request.query.remoteOnly : request.query.remoteOnly,
    page: typeof request.query.page === "string" ? request.query.page : request.query.page,
    pageSize: typeof request.query.pageSize === "string" ? request.query.pageSize : request.query.pageSize,
  });

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid jobs query.");
  }

  return parsed.data;
}

jobsRoutes.get(
  "/api/v1/jobs",
  asyncHandler(async (request, response) => {
    const data = await listPublicJobs(getJobsListQuery(request, { includeStatus: false }));

    sendSuccess(response, {
      message: "Jobs fetched successfully.",
      data,
    });
  }),
);

jobsRoutes.get(
  "/api/v1/jobs/:slug",
  asyncHandler(async (request, response) => {
    const slug = getRouteParam(request.params.slug);

    if (!slug) {
      throw new AppError(400, "Invalid job slug.");
    }

    const data = await getPublicJobBySlug(slug);

    if (!data) {
      throw new AppError(404, "Job not found.");
    }

    sendSuccess(response, {
      message: "Job fetched successfully.",
      data,
    });
  }),
);

jobsRoutes.get(
  "/api/v1/admin/jobs",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const data = await listAdminJobs(getJobsListQuery(request, { includeStatus: true }));

    sendSuccess(response, {
      message: "Jobs fetched successfully.",
      data,
    });
  }),
);

jobsRoutes.get(
  "/api/v1/admin/jobs/meta",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const data = await getAdminJobsMetadata();

    sendSuccess(response, {
      message: "Job metadata fetched successfully.",
      data,
    });
  }),
);

jobsRoutes.post(
  "/api/v1/admin/jobs",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const parsed = jobPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const data = await createAdminJob(parsed.data);
    await createAdminAuditEntry({
      category: "activity",
      module: "Jobs",
      action: "Created Job",
      target: `${data.id} - ${data.title}`,
    });

    sendSuccess(response, {
      status: 201,
      message: "Job created successfully.",
      data,
    });
  }),
);

jobsRoutes.get(
  "/api/v1/admin/jobs/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const data = await getAdminJobById(id);

    if (!data) {
      throw new AppError(404, "Job not found.");
    }

    sendSuccess(response, {
      message: "Job fetched successfully.",
      data,
    });
  }),
);

jobsRoutes.put(
  "/api/v1/admin/jobs/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const parsed = jobPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const data = await updateAdminJob(id, parsed.data);

    if (!data) {
      throw new AppError(404, "Job not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Jobs",
      action: "Updated Job",
      target: `${data.id} - ${data.title}`,
    });

    sendSuccess(response, {
      message: "Job updated successfully.",
      data,
    });
  }),
);

jobsRoutes.delete(
  "/api/v1/admin/jobs/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const existing = await getAdminJobById(id);
    const deleted = await deleteAdminJob(id);

    if (!deleted) {
      throw new AppError(404, "Job not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Jobs",
      action: "Deleted Job",
      target: `${id} - ${existing?.title ?? "Unknown"}`,
    });

    sendSuccess(response, {
      message: "Job deleted successfully.",
      data: null,
    });
  }),
);

jobsRoutes.patch(
  "/api/v1/admin/jobs/:id/publish",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const parsed = publishPayloadSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const data = await publishAdminJob(id, parsed.data.status);

    if (!data) {
      throw new AppError(404, "Job not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Jobs",
      action: parsed.data.status === "published" ? "Published Job" : parsed.data.status === "draft" ? "Moved Job To Draft" : "Closed Job",
      target: `${data.id} - ${data.title}`,
    });

    sendSuccess(response, {
      message:
        parsed.data.status === "published"
          ? "Job published successfully."
          : parsed.data.status === "draft"
            ? "Job moved to draft successfully."
            : "Job closed successfully.",
      data,
    });
  }),
);

export { jobsRoutes };
