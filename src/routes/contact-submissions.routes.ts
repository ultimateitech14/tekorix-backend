import { Router } from "express";

import {
  addContactSubmissionReply,
  deleteAllContactSubmissions,
  deleteContactSubmission,
  getContactSubmissionById,
  markAllContactSubmissionsAsRead,
  markContactSubmissionAsRead,
  readContactSubmissions,
} from "../lib/admin-contact-submissions-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry, readSiteSettings } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import { env } from "../config/env.js";
import { sendAdminEmail } from "../services/admin-mailer.service.js";

const contactSubmissionsRoutes = Router();
const defaultFromEmail = env.ADMIN_EMAIL;

contactSubmissionsRoutes.get(
  "/api/admin/contact-submissions",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const items = await readContactSubmissions();

    sendSuccess(response, {
      message: "Contact submissions fetched successfully.",
      data: {
        items,
        unreadCount: items.filter((item) => !item.isRead).length,
      },
    });
  }),
);

contactSubmissionsRoutes.patch(
  "/api/admin/contact-submissions",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const markAll = Boolean(request.body?.markAll);

    if (markAll) {
      await markAllContactSubmissionsAsRead();
      await createAdminAuditEntry({
        category: "activity",
        module: "Email & Notifications",
        action: "Marked All Contact Submissions As Read",
        target: "All contact submissions",
      });

      return sendSuccess(response, {
        message: "All contact submissions marked as read.",
      });
    }

    const id = typeof request.body?.id === "string" ? request.body.id.trim() : "";

    if (!id) {
      throw new AppError(400, "Submission id is required.");
    }

    const replyMessage = typeof request.body?.replyMessage === "string" ? request.body.replyMessage.trim() : "";
    const settings = await readSiteSettings();

    if (replyMessage) {
      const submission = await getContactSubmissionById(id);

      if (!submission) {
        throw new AppError(404, "Submission not found.");
      }

      const replyFromEmail =
        (typeof request.body?.replyFromEmail === "string" ? request.body.replyFromEmail.trim() : "") ||
        settings.notificationFromEmail.trim() ||
        settings.companyEmail.trim() ||
        defaultFromEmail;
      const subject = `Re: ${submission.inquiryType} inquiry from ${submission.firstName} ${submission.lastName}`;
      const emailResult = await sendAdminEmail({
        settings,
        toEmail: submission.email,
        fromEmail: replyFromEmail,
        subject,
        message: replyMessage,
      });

      const updated = await addContactSubmissionReply(id, replyMessage, {
        fromEmail: replyFromEmail,
        toEmail: submission.email,
        deliveryStatus: emailResult.sent ? "sent" : "failed",
        deliveryError: emailResult.error,
      });

      if (!updated) {
        throw new AppError(404, "Submission not found.");
      }

      await createAdminAuditEntry({
        category: "activity",
        module: "Email & Notifications",
        action: "Sent Contact Submission Reply",
        target: `${id} - ${emailResult.sent ? "sent" : "failed"}`,
      });

      return sendSuccess(response, {
        message: emailResult.sent ? "Reply sent successfully." : "Reply saved, but email could not be sent.",
        data: {
          item: updated,
          emailSent: emailResult.sent,
          emailError: emailResult.error,
        },
      });
    }

    const updated = await markContactSubmissionAsRead(id);

    if (!updated) {
      throw new AppError(404, "Submission not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Email & Notifications",
      action: "Marked Contact Submission As Read",
      target: id,
    });

    return sendSuccess(response, {
      message: "Submission marked as read.",
      data: updated,
    });
  }),
);

contactSubmissionsRoutes.delete(
  "/api/admin/contact-submissions",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const deleteAll = Boolean(request.body?.deleteAll);

    if (deleteAll) {
      await deleteAllContactSubmissions();
      await createAdminAuditEntry({
        category: "activity",
        module: "Email & Notifications",
        action: "Deleted All Contact Submissions",
        target: "All contact submissions",
      });

      return sendSuccess(response, {
        message: "All submissions deleted.",
      });
    }

    const id = typeof request.body?.id === "string" ? request.body.id.trim() : "";

    if (!id) {
      throw new AppError(400, "Submission id is required.");
    }

    const deleted = await deleteContactSubmission(id);

    if (!deleted) {
      throw new AppError(404, "Submission not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "Email & Notifications",
      action: "Deleted Contact Submission",
      target: id,
    });

    return sendSuccess(response, {
      message: "Submission deleted.",
    });
  }),
);

export { contactSubmissionsRoutes };
