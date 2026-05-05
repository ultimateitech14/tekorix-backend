import { Router } from "express";

import { asyncHandler } from "../../lib/async-handler.js";
import { requireAdminAuth } from "../../middleware/auth.middleware.js";
import {
  createCompanyLeadController,
  getCompanyLeadByIdController,
  listCompanyLeadsController,
  markCompanyLeadAsReadController,
} from "./company-leads.controller.js";

const companyLeadRoutes = Router();

companyLeadRoutes.post("/api/v1/company-leads", asyncHandler(createCompanyLeadController));

companyLeadRoutes.get(
  "/api/v1/admin/company-leads",
  requireAdminAuth(),
  asyncHandler(listCompanyLeadsController),
);

companyLeadRoutes.get(
  "/api/v1/admin/company-leads/:id",
  requireAdminAuth(),
  asyncHandler(getCompanyLeadByIdController),
);

companyLeadRoutes.patch(
  "/api/v1/admin/company-leads/:id/read",
  requireAdminAuth(),
  asyncHandler(markCompanyLeadAsReadController),
);

export { companyLeadRoutes };
