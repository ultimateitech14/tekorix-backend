import type { SiteSettingsRecord } from "../lib/shared-admin-store.js";

type SendAdminEmailInput = {
  toEmail: string;
  fromEmail: string;
  subject: string;
  message: string;
  settings?: Pick<SiteSettingsRecord, "notificationEmailProvider" | "notificationEmailApiKey"> | null;
};

type MailerTransport =
  | string
  | {
      host: string;
      port: number;
      secure: boolean;
      auth?: {
        user: string;
        pass: string;
      };
    };

type NodemailerTransport = {
  sendMail: (options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo: string;
  }) => Promise<unknown>;
};

type NodemailerRuntime = {
  createTransport: (config: MailerTransport) => NodemailerTransport;
};

function parseSmtpPort(value: string | undefined) {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return 587;
}

function parseSmtpSecure(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function buildHtml(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");

  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">${escaped}</div>`;
}

function parseCredentialPair(value: string) {
  const separator = value.includes("|") ? "|" : ":";
  const parts = value.split(separator);

  if (parts.length < 2) {
    return null;
  }

  const user = parts.shift()?.trim() ?? "";
  const pass = parts.join(separator).trim();

  if (!user || !pass) {
    return null;
  }

  return {
    user,
    pass,
  };
}

function getEnvTransport() {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port: parseSmtpPort(process.env.SMTP_PORT),
    secure: parseSmtpSecure(process.env.SMTP_SECURE),
    auth: {
      user,
      pass,
    },
  } satisfies MailerTransport;
}

function buildTransportFromSettings(input: SendAdminEmailInput): MailerTransport | null {
  const provider = input.settings?.notificationEmailProvider?.trim() ?? "";
  const credential = input.settings?.notificationEmailApiKey?.trim() ?? "";
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider.startsWith("smtp://") || normalizedProvider.startsWith("smtps://")) {
    return provider;
  }

  if (!provider || !credential) {
    return null;
  }

  const credentialPair = parseCredentialPair(credential);

  if (normalizedProvider === "sendgrid") {
    return {
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: credential,
      },
    };
  }

  if (normalizedProvider === "resend") {
    return {
      host: "smtp.resend.com",
      port: 587,
      secure: false,
      auth: {
        user: "resend",
        pass: credential,
      },
    };
  }

  const mappedHost =
    normalizedProvider === "gmail" || normalizedProvider === "google"
      ? "smtp.gmail.com"
      : normalizedProvider === "outlook" ||
          normalizedProvider === "office365" ||
          normalizedProvider === "microsoft"
        ? "smtp.office365.com"
        : normalizedProvider === "brevo" || normalizedProvider === "sendinblue"
          ? "smtp-relay.brevo.com"
          : provider.includes(".")
            ? provider
            : "";

  if (!mappedHost) {
    return null;
  }

  return {
    host: mappedHost,
    port: mappedHost === "smtp.gmail.com" ? 465 : 587,
    secure: mappedHost === "smtp.gmail.com",
    auth: credentialPair ?? {
      user: input.fromEmail.trim(),
      pass: credential,
    },
  };
}

async function loadNodemailerRuntime() {
  try {
    const moduleName = "nodemailer";
    const runtime = (await import(moduleName)) as {
      default?: NodemailerRuntime;
      createTransport?: NodemailerRuntime["createTransport"];
    };

    if (runtime.default?.createTransport) {
      return runtime.default;
    }

    if (runtime.createTransport) {
      return runtime as NodemailerRuntime;
    }

    return null;
  } catch {
    return null;
  }
}

export async function sendAdminEmail(input: SendAdminEmailInput) {
  const transportConfig = getEnvTransport() ?? buildTransportFromSettings(input);

  if (!transportConfig) {
    return {
      sent: false,
      error:
        "SMTP is not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS or save supported provider credentials in admin settings.",
    } as const;
  }

  const nodemailer = await loadNodemailerRuntime();

  if (!nodemailer) {
    return {
      sent: false,
      error: "Nodemailer runtime is not available for express-api.",
    } as const;
  }

  try {
    const transport = nodemailer.createTransport(transportConfig);

    await transport.sendMail({
      from: input.fromEmail,
      to: input.toEmail,
      subject: input.subject,
      text: input.message,
      html: buildHtml(input.message),
      replyTo: input.fromEmail,
    });

    return {
      sent: true,
      error: null,
    } as const;
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Failed to send email.",
    } as const;
  }
}
