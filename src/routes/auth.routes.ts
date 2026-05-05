import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { changeStoredAdminPassword, getAdminPasswordMetadata, verifyConfiguredAdminPassword } from "../lib/admin-credentials-store.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry } from "../lib/shared-admin-store.js";
import { getAuthenticatedAdmin, requireAdminAuth } from "../middleware/auth.middleware.js";
import { getConfiguredAdminCredentials, signAdminToken } from "../services/jwt.service.js";

const authRoutes = Router();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or less.");

const adminLoginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: passwordSchema,
});

const adminChangePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from current password.",
  });

authRoutes.post(
  "/api/auth/admin/login",
  asyncHandler(async (request, response) => {
    const parsedBody = adminLoginSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(400, parsedBody.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const adminCredentials = getConfiguredAdminCredentials();
    const normalizedEmail = parsedBody.data.email.trim().toLowerCase();
    const hasValidPassword = await verifyConfiguredAdminPassword(
      adminCredentials.id,
      parsedBody.data.password,
      adminCredentials.password,
    );

    if (normalizedEmail !== adminCredentials.email || !hasValidPassword) {
      throw new AppError(401, "Invalid email or password.");
    }

    const admin = {
      id: adminCredentials.id,
      name: adminCredentials.name,
      email: adminCredentials.email,
      role: adminCredentials.role,
    };

    sendSuccess(response, {
      message: "Signed in successfully.",
      data: {
        token: signAdminToken(admin),
        admin,
      },
    });
  }),
);

authRoutes.get(
  "/api/admin/me",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const admin = getAuthenticatedAdmin(request);
    const passwordMetadata = await getAdminPasswordMetadata(admin.userId);

    sendSuccess(response, {
      message: "Admin profile fetched successfully.",
      data: {
        id: admin.userId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        passwordUpdatedAt: passwordMetadata.passwordUpdatedAt,
      },
    });
  }),
);

authRoutes.post(
  "/api/auth/admin/change-password",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const parsedBody = adminChangePasswordSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(400, parsedBody.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const admin = getAuthenticatedAdmin(request);
    const adminCredentials = getConfiguredAdminCredentials();
    const result = await changeStoredAdminPassword(
      admin.userId,
      parsedBody.data.currentPassword,
      parsedBody.data.newPassword,
      adminCredentials.password,
    );

    await createAdminAuditEntry({
      category: "audit",
      module: "Settings",
      action: "Changed Admin Password",
      target: admin.userId,
    });

    sendSuccess(response, {
      message: "Password updated successfully. Use the new password next time you sign in.",
      data: {
        passwordUpdatedAt: result.passwordUpdatedAt,
      },
    });
  }),
);

export { authRoutes };
