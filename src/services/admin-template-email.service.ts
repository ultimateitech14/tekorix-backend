import type { EmailTemplateRecord } from "../lib/admin-email-templates-store.js";
import { getEmailTemplateById } from "../lib/admin-email-templates-store.js";
import type { SiteSettingsRecord } from "../lib/shared-admin-store.js";
import { sendAdminEmail } from "./admin-mailer.service.js";

type TemplateReplacementMap = Record<string, string | number | null | undefined>;

type SendTemplateEmailInput = {
  templateId: string;
  settings: SiteSettingsRecord;
  toEmail: string;
  fromEmail: string;
  replacements: TemplateReplacementMap;
};

type SendTemplateEmailResult =
  | {
      skipped: true;
      template: EmailTemplateRecord | null;
      sent: false;
      error: string | null;
      subject: string;
      message: string;
    }
  | {
      skipped: false;
      template: EmailTemplateRecord;
      sent: boolean;
      error: string | null;
      subject: string;
      message: string;
    };

function applyTemplateReplacements(value: string, replacements: TemplateReplacementMap) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const resolved = replacements[key];
    return typeof resolved === "undefined" || resolved === null ? "" : String(resolved);
  });
}

export async function sendTemplateDrivenEmail(input: SendTemplateEmailInput): Promise<SendTemplateEmailResult> {
  const templateId = input.templateId.trim();

  if (!templateId) {
    return {
      skipped: true,
      template: null,
      sent: false,
      error: null,
      subject: "",
      message: "",
    };
  }

  const template = await getEmailTemplateById(templateId);

  if (!template) {
    return {
      skipped: true,
      template: null,
      sent: false,
      error: "Mapped template was not found.",
      subject: "",
      message: "",
    };
  }

  if (!template.isActive) {
    return {
      skipped: true,
      template,
      sent: false,
      error: "Mapped template is inactive.",
      subject: "",
      message: "",
    };
  }

  const subject = applyTemplateReplacements(template.subject, input.replacements).trim();
  const message = applyTemplateReplacements(template.body, input.replacements).trim();

  if (!subject || !message) {
    return {
      skipped: true,
      template,
      sent: false,
      error: "Mapped template did not produce a valid subject and message.",
      subject,
      message,
    };
  }

  const emailResult = await sendAdminEmail({
    settings: input.settings,
    toEmail: input.toEmail,
    fromEmail: input.fromEmail,
    subject,
    message,
  });

  return {
    skipped: false,
    template,
    sent: emailResult.sent,
    error: emailResult.error,
    subject,
    message,
  };
}
