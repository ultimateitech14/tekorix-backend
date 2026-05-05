import { Router } from "express";

import {
  createEmailTemplate,
  deleteAllEmailTemplates,
  deleteEmailTemplate,
  getEmailTemplateById,
  listEmailTemplates,
  updateEmailTemplate,
} from "../lib/admin-email-templates-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendError, sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry, readSiteSettings } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import { sendAdminEmail } from "../services/admin-mailer.service.js";

const emailTemplatesRoutes = Router();

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }

    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }

  return null;
}

function parseNonEmptyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

emailTemplatesRoutes.get(
  "/api/admin/email-templates",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const items = await listEmailTemplates();

    sendSuccess(response, {
      message: "Email templates fetched successfully.",
      data: {
        items,
      },
    });
  }),
);

emailTemplatesRoutes.post(
  "/api/admin/email-templates",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const name = parseNonEmptyString(request.body?.name);
    const subject = parseNonEmptyString(request.body?.subject);
    const body = parseNonEmptyString(request.body?.body);
    const isActive = parseBoolean(request.body?.isActive);

    if (name.length < 2) {
      throw new AppError(400, "Template name is required.");
    }

    if (subject.length < 2) {
      throw new AppError(400, "Email subject is required.");
    }

    if (body.length < 2) {
      throw new AppError(400, "Email body is required.");
    }

    const item = await createEmailTemplate({
      name,
      subject,
      body,
      isActive: isActive !== null ? isActive : true,
    });

    await createAdminAuditEntry({
      category: "audit",
      module: "Email & Notifications",
      action: "Created Email Template",
      target: `${item.id} - ${item.name}`,
    });

    sendSuccess(response, {
      status: 201,
      message: "Template created successfully.",
      data: item,
    });
  }),
);

emailTemplatesRoutes.patch(
  "/api/admin/email-templates",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = parseNonEmptyString(request.body?.id);

    if (!id) {
      throw new AppError(400, "Template id is required.");
    }

    const hasName = typeof request.body?.name !== "undefined";
    const hasSubject = typeof request.body?.subject !== "undefined";
    const hasBody = typeof request.body?.body !== "undefined";
    const hasIsActive = typeof request.body?.isActive !== "undefined";

    if (!hasName && !hasSubject && !hasBody && !hasIsActive) {
      throw new AppError(400, "No fields to update.");
    }

    const name = parseNonEmptyString(request.body?.name);
    const subject = parseNonEmptyString(request.body?.subject);
    const body = parseNonEmptyString(request.body?.body);
    const isActive = parseBoolean(request.body?.isActive);

    if (hasName && name.length < 2) {
      throw new AppError(400, "Template name is required.");
    }

    if (hasSubject && subject.length < 2) {
      throw new AppError(400, "Email subject is required.");
    }

    if (hasBody && body.length < 2) {
      throw new AppError(400, "Email body is required.");
    }

    if (hasIsActive && isActive === null) {
      throw new AppError(400, "Invalid active flag.");
    }

    const item = await updateEmailTemplate(id, {
      ...(hasName ? { name } : {}),
      ...(hasSubject ? { subject } : {}),
      ...(hasBody ? { body } : {}),
      ...(hasIsActive && isActive !== null ? { isActive } : {}),
    });

    if (!item) {
      throw new AppError(404, "Template not found.");
    }

    await createAdminAuditEntry({
      category: "audit",
      module: "Email & Notifications",
      action: "Updated Email Template",
      target: `${item.id} - ${item.name}`,
    });

    sendSuccess(response, {
      message: "Template updated successfully.",
      data: item,
    });
  }),
);

emailTemplatesRoutes.delete(
  "/api/admin/email-templates",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const deleteAll = Boolean(request.body?.deleteAll);

    if (deleteAll) {
      await deleteAllEmailTemplates();
      await createAdminAuditEntry({
        category: "audit",
        module: "Email & Notifications",
        action: "Deleted All Email Templates",
        target: "All templates",
      });

      return sendSuccess(response, {
        message: "All templates deleted.",
      });
    }

    const id = parseNonEmptyString(request.body?.id);

    if (!id) {
      throw new AppError(400, "Template id is required.");
    }

    const deleted = await deleteEmailTemplate(id);

    if (!deleted) {
      throw new AppError(404, "Template not found.");
    }

    await createAdminAuditEntry({
      category: "audit",
      module: "Email & Notifications",
      action: "Deleted Email Template",
      target: id,
    });

    return sendSuccess(response, {
      message: "Template deleted.",
    });
  }),
);

emailTemplatesRoutes.post(
  "/api/admin/email-templates/send",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const templateId = parseNonEmptyString(request.body?.templateId);
    const toEmail = parseNonEmptyString(request.body?.toEmail);
    const fromEmail = parseNonEmptyString(request.body?.fromEmail);
    const subjectOverride = parseNonEmptyString(request.body?.subject);
    const bodyOverride = parseNonEmptyString(request.body?.body);

    if (!templateId) {
      throw new AppError(400, "Template id is required.");
    }

    if (!toEmail || !toEmail.includes("@")) {
      throw new AppError(400, "Valid recipient email is required.");
    }

    if (!fromEmail || !fromEmail.includes("@")) {
      throw new AppError(400, "Valid sender email is required.");
    }

    const template = await getEmailTemplateById(templateId);

    if (!template) {
      throw new AppError(404, "Template not found.");
    }

    if (!template.isActive) {
      throw new AppError(400, "Template is inactive. Please activate first.");
    }

    const settings = await readSiteSettings();
    const subject = subjectOverride || template.subject;
    const message = bodyOverride || template.body;
    const emailResult = await sendAdminEmail({
      settings,
      toEmail,
      fromEmail,
      subject,
      message,
    });

    await createAdminAuditEntry({
      category: "notification",
      module: "Email & Notifications",
      action: emailResult.sent ? "Sent Template Email" : "Failed Template Email",
      target: `${template.id} - ${template.name} -> ${toEmail} -> ${emailResult.sent ? "sent" : "failed"}`,
    });

    if (!emailResult.sent) {
      return sendError(response, {
        status: 502,
        message: emailResult.error ?? "Unable to send email.",
        data: {
          emailSent: false,
          emailError: emailResult.error,
        },
      });
    }

    return sendSuccess(response, {
      message: "Email sent successfully.",
      data: {
        emailSent: true,
        emailError: null,
      },
    });
  }),
);

export { emailTemplatesRoutes };
