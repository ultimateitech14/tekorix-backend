import { randomUUID } from "crypto";

import { env } from "../config/env.js";
import {
  normalizeTimestamp,
  readJsonFile,
  trimToString,
  writeJsonFile,
} from "./shared-admin-files.js";

export type AdminLogCategory = "activity" | "audit" | "notification";
export type AdminLogModule =
  | "Applications"
  | "Candidates"
  | "Jobs"
  | "Email & Notifications"
  | "Settings"
  | "System";

export type SiteSettingsRecord = {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  companyGoogleMapLink: string;
  careersDomain: string;
  careersHeadline: string;
  careersSubtitle: string;
  careersPublished: boolean;
  careersShowTeamPhotos: boolean;
  careersAutoPublishJobs: boolean;
  careersTeamMembers: Array<{
    id: string;
    name: string;
    role: string;
    photo: string;
    blurb: string;
  }>;
  talentProfilesEyebrow: string;
  talentProfilesHeadline: string;
  talentProfilesDescription: string;
  talentProfiles: Array<{
    id: string;
    name: string;
    role: string;
    yearsOfExperience: number;
    rating: number;
    summary: string;
    detailedSummary: string;
    expertise: string[];
    avatar: string;
    resumeCtaLabel: string;
  }>;
  notificationEmailProvider: string;
  notificationEmailApiKey: string;
  notificationFromEmail: string;
};

export type JobRecord = {
  id: string;
  status: string;
};

export type AdminAuditEntry = {
  id: string;
  category: AdminLogCategory;
  module: AdminLogModule;
  action: string;
  actor: string;
  target: string;
  createdAt: string;
};

function toDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`);

  return normalized.join(" ") || "Admin User";
}

function toCompanyNameFromEmail(email: string) {
  const domain = email.split("@")[1] ?? "";
  const namePart = domain.split(".")[0] ?? "";
  const normalized = namePart
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`);

  return normalized.join(" ") || "Company";
}

function toCareersDomain(email: string) {
  const domain = email.split("@")[1] ?? "";
  return domain ? `careers.${domain}` : "";
}

const DEFAULT_ADMIN_ACTOR = env.ADMIN_NAME?.trim() || toDisplayNameFromEmail(env.ADMIN_EMAIL);
const siteSettingsFileName = "site-settings.json";
const auditTrailFileName = "admin-audit-trail.json";
const jobsFileName = "jobs.json";

function normalizeAdminCategory(value: unknown): AdminLogCategory {
  if (value === "activity" || value === "audit" || value === "notification") {
    return value;
  }

  return "activity";
}

function normalizeAdminModule(value: unknown): AdminLogModule | null {
  if (
    value === "Applications" ||
    value === "Candidates" ||
    value === "Jobs" ||
    value === "Email & Notifications" ||
    value === "Settings" ||
    value === "System"
  ) {
    return value;
  }

  return null;
}

function inferModule(action: string, target: string): AdminLogModule {
  const text = `${action} ${target}`.toLowerCase();

  if (text.includes("application")) {
    return "Applications";
  }

  if (text.includes("resume") || text.includes("candidate")) {
    return "Candidates";
  }

  if (text.includes("job")) {
    return "Jobs";
  }

  if (text.includes("contact submission") || text.includes("notification") || text.includes("provider")) {
    return "Email & Notifications";
  }

  if (text.includes("settings")) {
    return "Settings";
  }

  return "System";
}

function normalizeAuditEntry(value: unknown): AdminAuditEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<AdminAuditEntry>;
  const id = trimToString(item.id) || randomUUID();
  const action = trimToString(item.action);
  const actor = trimToString(item.actor) || DEFAULT_ADMIN_ACTOR;
  const target = trimToString(item.target);

  if (!action) {
    return null;
  }

  return {
    id,
    category: normalizeAdminCategory(item.category),
    module: normalizeAdminModule(item.module) ?? inferModule(action, target),
    action,
    actor,
    target,
    createdAt: normalizeTimestamp(item.createdAt),
  };
}

function normalizeTeamMembers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const entry = item && typeof item === "object" ? item : {};
    return {
      id: trimToString((entry as { id?: unknown }).id) || `team-${String(index + 1).padStart(2, "0")}`,
      name: trimToString((entry as { name?: unknown }).name),
      role: trimToString((entry as { role?: unknown }).role),
      photo: trimToString((entry as { photo?: unknown }).photo),
      blurb: trimToString((entry as { blurb?: unknown }).blurb),
    };
  });
}

function normalizeTalentProfiles(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const entry = item && typeof item === "object" ? item : {};
    return {
      id: trimToString((entry as { id?: unknown }).id) || `profile-${index + 1}`,
      name: trimToString((entry as { name?: unknown }).name),
      role: trimToString((entry as { role?: unknown }).role),
      yearsOfExperience:
        typeof (entry as { yearsOfExperience?: unknown }).yearsOfExperience === "number"
          ? (entry as { yearsOfExperience: number }).yearsOfExperience
          : 1,
      rating:
        typeof (entry as { rating?: unknown }).rating === "number"
          ? (entry as { rating: number }).rating
          : 1,
      summary: trimToString((entry as { summary?: unknown }).summary),
      detailedSummary: trimToString((entry as { detailedSummary?: unknown }).detailedSummary),
      expertise: Array.isArray((entry as { expertise?: unknown[] }).expertise)
        ? (entry as { expertise: unknown[] }).expertise.map((skill) => trimToString(skill)).filter(Boolean)
        : [],
      avatar: trimToString((entry as { avatar?: unknown }).avatar),
      resumeCtaLabel: trimToString((entry as { resumeCtaLabel?: unknown }).resumeCtaLabel),
    };
  });
}

function getDefaultSiteSettings(): SiteSettingsRecord {
  return {
    companyName: toCompanyNameFromEmail(env.ADMIN_EMAIL),
    companyEmail: env.ADMIN_EMAIL,
    companyPhone: "",
    companyAddress: "",
    companyGoogleMapLink: "",
    careersDomain: toCareersDomain(env.ADMIN_EMAIL),
    careersHeadline: "Build products that help teams hire better.",
    careersSubtitle:
      "We are hiring across product, engineering, and operations. Join us to shape the future of recruiting.",
    careersPublished: true,
    careersShowTeamPhotos: true,
    careersAutoPublishJobs: false,
    careersTeamMembers: [],
    talentProfilesEyebrow: "Representative profiles",
    talentProfilesHeadline: "Illustrative specialist profiles aligned to modern delivery needs.",
    talentProfilesDescription:
      "Expert profiles designed to match evolving project needs, combining the right skills and experience for modern digital delivery.",
    talentProfiles: [],
    notificationEmailProvider: "",
    notificationEmailApiKey: "",
    notificationFromEmail: "",
  };
}

export async function readSiteSettings() {
  const defaults = getDefaultSiteSettings();
  const raw = await readJsonFile<Partial<SiteSettingsRecord>>(siteSettingsFileName, defaults);

  return {
    companyName: trimToString(raw.companyName) || defaults.companyName,
    companyEmail: trimToString(raw.companyEmail) || defaults.companyEmail,
    companyPhone: trimToString(raw.companyPhone) || defaults.companyPhone,
    companyAddress: trimToString(raw.companyAddress),
    companyGoogleMapLink: trimToString(raw.companyGoogleMapLink),
    careersDomain: trimToString(raw.careersDomain) || defaults.careersDomain,
    careersHeadline: trimToString(raw.careersHeadline) || defaults.careersHeadline,
    careersSubtitle: trimToString(raw.careersSubtitle) || defaults.careersSubtitle,
    careersPublished: typeof raw.careersPublished === "boolean" ? raw.careersPublished : defaults.careersPublished,
    careersShowTeamPhotos:
      typeof raw.careersShowTeamPhotos === "boolean" ? raw.careersShowTeamPhotos : defaults.careersShowTeamPhotos,
    careersAutoPublishJobs:
      typeof raw.careersAutoPublishJobs === "boolean" ? raw.careersAutoPublishJobs : defaults.careersAutoPublishJobs,
    careersTeamMembers: normalizeTeamMembers(raw.careersTeamMembers),
    talentProfilesEyebrow: trimToString(raw.talentProfilesEyebrow) || defaults.talentProfilesEyebrow,
    talentProfilesHeadline: trimToString(raw.talentProfilesHeadline) || defaults.talentProfilesHeadline,
    talentProfilesDescription:
      trimToString(raw.talentProfilesDescription) || defaults.talentProfilesDescription,
    talentProfiles: normalizeTalentProfiles(raw.talentProfiles),
    notificationEmailProvider: trimToString(raw.notificationEmailProvider),
    notificationEmailApiKey: trimToString(raw.notificationEmailApiKey),
    notificationFromEmail: trimToString(raw.notificationFromEmail),
  };
}

export async function writeSiteSettings(settings: SiteSettingsRecord) {
  await writeJsonFile(siteSettingsFileName, settings);
  return settings;
}

export async function readJobs() {
  const parsed = await readJsonFile<unknown[]>(jobsFileName, []);

  return parsed
    .filter((item): item is { id?: unknown; status?: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: trimToString(item.id) || randomUUID(),
      status: trimToString(item.status),
    }));
}

async function readAuditTrailFile() {
  const parsed = await readJsonFile<unknown[]>(auditTrailFileName, []);

  return parsed
    .map((item) => normalizeAuditEntry(item))
    .filter((item): item is AdminAuditEntry => Boolean(item))
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

async function writeAuditTrailFile(items: AdminAuditEntry[]) {
  await writeJsonFile(auditTrailFileName, items);
}

export async function listAdminAuditEntries(options: { category?: AdminLogCategory } = {}) {
  const items = await readAuditTrailFile();

  if (!options.category) {
    return items;
  }

  return items.filter((item) => item.category === options.category);
}

export async function createAdminAuditEntry(input: {
  category?: AdminLogCategory;
  module?: AdminLogModule;
  action: string;
  actor?: string;
  target?: string;
}) {
  const items = await readAuditTrailFile();
  const next: AdminAuditEntry = {
    id: randomUUID(),
    category: input.category ?? "activity",
    module: input.module ?? inferModule(input.action, input.target ?? ""),
    action: input.action.trim(),
    actor: input.actor?.trim() || DEFAULT_ADMIN_ACTOR,
    target: input.target?.trim() || "",
    createdAt: new Date().toISOString(),
  };

  if (!next.action) {
    return null;
  }

  items.unshift(next);
  await writeAuditTrailFile(items);
  return next;
}

export async function clearAdminAuditEntries(options: { categories?: AdminLogCategory[] } = {}) {
  if (!options.categories?.length) {
    await writeAuditTrailFile([]);
    return true;
  }

  const blocked = new Set(options.categories);
  const items = await readAuditTrailFile();
  const next = items.filter((item) => !blocked.has(item.category));
  await writeAuditTrailFile(next);
  return true;
}

export async function clearAdminAuditEntriesByIds(ids: string[]) {
  if (!ids.length) {
    return true;
  }

  const blocked = new Set(ids);
  const items = await readAuditTrailFile();
  const next = items.filter((item) => !blocked.has(item.id));
  await writeAuditTrailFile(next);
  return true;
}
