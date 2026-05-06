import { Router } from "express";
import { z } from "zod";

import {
  addContactSubmissionReply,
  createContactSubmission,
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
import { sendTemplateDrivenEmail } from "../services/admin-template-email.service.js";

const contactSubmissionsRoutes = Router();
const defaultFromEmail = env.ADMIN_EMAIL;
const publicContactSubmissionSchema = z.object({
  inquiryType: z.string().trim().min(1, "Please select who you are."),
  firstName: z.string().trim().min(2, "First name is required.").max(40, "First name is too long."),
  lastName: z.string().trim().min(2, "Last name is required.").max(40, "Last name is too long."),
  email: z.string().trim().email("Please enter a valid email address."),
  country: z.string().trim().min(1, "Please select a country."),
  industry: z.string().trim().min(1, "Please select an industry."),
  company: z.string().trim().min(2, "Company is required.").max(80, "Company is too long."),
  position: z.string().trim().min(2, "Position is required.").max(60, "Position is too long."),
  phonePrefix: z.string().trim().min(1, "Please select a phone prefix."),
  phoneNumber: z.string().trim().min(6, "Phone number is required.").max(14, "Phone number is too long."),
  message: z.string().trim().min(15, "Please enter at least 15 characters in your message.").max(500, "Message must be 500 characters or less."),
});

contactSubmissionsRoutes.post(
  "/api/v1/contact-submissions",
  asyncHandler(async (request, response) => {
    const parsed = publicContactSubmissionSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const item = await createContactSubmission(parsed.data);
    try {
      const settings = await readSiteSettings();
      const fromEmail = settings.notificationFromEmail.trim() || settings.companyEmail.trim() || defaultFromEmail;
      const autoReply = await sendTemplateDrivenEmail({
        templateId: settings.notificationTemplateMappings.contactSubmissionAcknowledgementTemplateId,
        settings,
        toEmail: item.email,
        fromEmail,
        replacements: {
          candidate_name: item.firstName,
          first_name: item.firstName,
          last_name: item.lastName,
          full_name: `${item.firstName} ${item.lastName}`.trim(),
          inquiry_type: item.inquiryType,
          company_name: settings.companyName,
          company_email: settings.companyEmail,
          recruiter_name: env.ADMIN_NAME?.trim() || `${settings.companyName} Team`.trim(),
        },
      });

      if (!autoReply.skipped) {
        await createAdminAuditEntry({
          category: "notification",
          module: "Email & Notifications",
          action: autoReply.sent ? "Sent Contact Submission Auto Reply" : "Failed Contact Submission Auto Reply",
          target: `${item.id} - ${autoReply.template.id} -> ${item.email} -> ${autoReply.sent ? "sent" : "failed"}`,
        });
      }
    } catch {
      // Do not block public form submissions if the acknowledgement email fails unexpectedly.
    }

    sendSuccess(response, {
      status: 201,
      message: "Thanks. Your request has been received and our team will follow up shortly.",
      data: {
        id: item.id,
      },
    });
  }),
);

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
