import express, { Router } from "express";

import { asyncHandler } from "../../lib/async-handler.js";
import { requireAdminAuth } from "../../middleware/auth.middleware.js";
import {
  createCandidateLeadController,
  createCandidateLeadUploadUrlController,
  getCandidateLeadResumeController,
  getCandidateLeadByIdController,
  listCandidateLeadsController,
  markCandidateLeadAsReadController,
  uploadCandidateLeadResumeController,
} from "./candidate-leads.controller.js";
import { candidateLeadResumeMaxSizeInBytes } from "./candidate-leads.types.js";

const candidateLeadRoutes = Router();

candidateLeadRoutes.post(
  "/api/v1/candidate-leads/upload-url",
  asyncHandler(createCandidateLeadUploadUrlController),
);

candidateLeadRoutes.put(
  "/api/v1/candidate-leads/upload",
  express.raw({
    type: "*/*",
    limit: `${candidateLeadResumeMaxSizeInBytes}b`,
  }),
  asyncHandler(uploadCandidateLeadResumeController),
);

candidateLeadRoutes.post("/api/v1/candidate-leads", asyncHandler(createCandidateLeadController));

candidateLeadRoutes.get(
  "/api/v1/admin/candidate-leads",
  requireAdminAuth(),
  asyncHandler(listCandidateLeadsController),
);

candidateLeadRoutes.get(
  "/api/v1/admin/candidate-leads/:id",
  requireAdminAuth(),
  asyncHandler(getCandidateLeadByIdController),
);

candidateLeadRoutes.patch(
  "/api/v1/admin/candidate-leads/:id/read",
  requireAdminAuth(),
  asyncHandler(markCandidateLeadAsReadController),
);

candidateLeadRoutes.get(
  "/api/v1/admin/candidate-leads/:id/resume",
  requireAdminAuth(),
  asyncHandler(getCandidateLeadResumeController),
);

export { candidateLeadRoutes };
