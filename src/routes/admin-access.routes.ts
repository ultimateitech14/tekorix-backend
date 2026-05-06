import { Router } from "express";

import { sendSuccess } from "../lib/api-response.js";
import { asyncHandler } from "../lib/async-handler.js";
import { listAdminRoles, listAdminUsers } from "../lib/admin-access-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const adminAccessRoutes = Router();

adminAccessRoutes.get(
  "/api/admin/users",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const data = await listAdminUsers();

    sendSuccess(response, {
      message: "Admin users fetched successfully.",
      data,
    });
  }),
);

adminAccessRoutes.get(
  "/api/admin/roles",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const data = await listAdminRoles();

    sendSuccess(response, {
      message: "Admin roles fetched successfully.",
      data,
    });
  }),
);

export { adminAccessRoutes };
