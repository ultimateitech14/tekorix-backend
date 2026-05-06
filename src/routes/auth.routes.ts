import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import {
  changeStoredAdminPassword,
  createAdminPasswordResetToken,
  getAdminPasswordMetadata,
  resetStoredAdminPasswordWithToken,
  verifyConfiguredAdminPassword,
} from "../lib/admin-credentials-store.js";
import { markAdminUserSignedIn } from "../lib/admin-access-store.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry, readSiteSettings } from "../lib/shared-admin-store.js";
import { getAuthenticatedAdmin, requireAdminAuth } from "../middleware/auth.middleware.js";
import { getConfiguredAdminCredentials, signAdminToken } from "../services/jwt.service.js";
import { sendAdminEmail } from "../services/admin-mailer.service.js";

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

const adminForgotPasswordSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
});

const adminResetPasswordSchema = z
  .object({
    token: z.string().trim().min(20, "Reset token is invalid."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
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

    try {
      await markAdminUserSignedIn(admin.id);
    } catch {
      // Keep login available even if access metadata cannot be synced right now.
    }

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

authRoutes.post(
  "/api/auth/admin/forgot-password",
  asyncHandler(async (request, response) => {
    const parsedBody = adminForgotPasswordSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(400, parsedBody.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const adminCredentials = getConfiguredAdminCredentials();
    const normalizedEmail = parsedBody.data.email.trim().toLowerCase();
    const genericMessage = "If the account exists, a password reset link has been issued.";

    if (normalizedEmail !== adminCredentials.email) {
      return sendSuccess(response, {
        message: genericMessage,
      });
    }

    const resetToken = await createAdminPasswordResetToken(adminCredentials.id);
    const requestOrigin = `${request.protocol}://${request.get("host") ?? "localhost:3000"}`;
    const resetUrl = `${requestOrigin}/admin/reset-password?token=${encodeURIComponent(resetToken.token)}`;
    const settings = await readSiteSettings();
    const fromEmail =
      settings.notificationFromEmail.trim() || settings.companyEmail.trim() || adminCredentials.email;
    const emailResult = await sendAdminEmail({
      settings,
      toEmail: adminCredentials.email,
      fromEmail,
      subject: "Admin password reset",
      message: `Use this secure link to reset your admin password:\n\n${resetUrl}\n\nThis link expires at ${resetToken.expiresAt}.`,
    });

    if (!emailResult.sent) {
      console.log(`[admin-password-reset] ${resetUrl}`);
    }

    await createAdminAuditEntry({
      category: "audit",
      module: "Settings",
      action: emailResult.sent ? "Issued Password Reset Email" : "Issued Password Reset Link",
      target: adminCredentials.id,
    });

    return sendSuccess(response, {
      message: emailResult.sent
        ? "Password reset instructions have been sent to the admin email."
        : "Password reset link generated. Check the server logs or configure SMTP for email delivery.",
      data:
        process.env.NODE_ENV === "production"
          ? {
              expiresAt: resetToken.expiresAt,
            }
          : {
              resetUrl,
              expiresAt: resetToken.expiresAt,
            },
    });
  }),
);

authRoutes.post(
  "/api/auth/admin/reset-password",
  asyncHandler(async (request, response) => {
    const parsedBody = adminResetPasswordSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(400, parsedBody.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const updated = await resetStoredAdminPasswordWithToken(parsedBody.data.token, parsedBody.data.password);

    await createAdminAuditEntry({
      category: "audit",
      module: "Settings",
      action: "Reset Admin Password",
      target: "admin-1",
    });

    sendSuccess(response, {
      message: "Password reset successfully. Use the new password to sign in.",
      data: {
        passwordUpdatedAt: updated.passwordUpdatedAt,
      },
    });
  }),
);

export { authRoutes };
