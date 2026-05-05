import { Router } from "express";

import { asyncHandler } from "../lib/async-handler.js";
import { sendError, sendSuccess } from "../lib/api-response.js";
import { createAdminAuditEntry, readSiteSettings } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import { sendAdminEmail } from "../services/admin-mailer.service.js";

const notificationSettingsRoutes = Router();

notificationSettingsRoutes.post(
  "/api/admin/notification-settings/test",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const settings = await readSiteSettings();
    const provider = settings.notificationEmailProvider.trim();
    const fromEmail = settings.notificationFromEmail.trim();

    if (!provider) {
      return sendError(response, {
        status: 400,
        message: "Save an email provider before sending a test message.",
      });
    }

    if (!fromEmail || !fromEmail.includes("@")) {
      return sendError(response, {
        status: 400,
        message: "Save a valid from email before sending a test message.",
      });
    }

    const emailResult = await sendAdminEmail({
      settings,
      toEmail: fromEmail,
      fromEmail,
      subject: `${provider} provider test`,
      message: `Provider test message sent on ${new Date().toISOString()}.`,
    });

    await createAdminAuditEntry({
      category: "notification",
      module: "Email & Notifications",
      action: emailResult.sent ? "Sent Provider Test Email" : "Failed Provider Test Email",
      target: `${provider} -> ${fromEmail} -> ${emailResult.sent ? "sent" : "failed"}`,
    });

    if (!emailResult.sent) {
      return sendError(response, {
        status: 502,
        message: emailResult.error ?? "Unable to send test email.",
      });
    }

    return sendSuccess(response, {
      message: "Test email sent successfully.",
      data: {
        emailSent: true,
        emailError: null,
      },
    });
  }),
);

export { notificationSettingsRoutes };
