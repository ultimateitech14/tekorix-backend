import { randomUUID } from "crypto";

import { env } from "../config/env.js";
import { getPool } from "../database/pool.js";
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

export type NotificationTemplateMappings = {
  contactSubmissionAcknowledgementTemplateId: string;
  jobApplicationAcknowledgementTemplateId: string;
};

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
  notificationTemplateMappings: NotificationTemplateMappings;
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

type SiteSettingsRow = {
  settings_key: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_google_map_link: string;
  careers_domain: string;
  careers_headline: string;
  careers_subtitle: string;
  careers_published: boolean;
  careers_show_team_photos: boolean;
  careers_auto_publish_jobs: boolean;
  careers_team_members: unknown;
  talent_profiles_eyebrow: string;
  talent_profiles_headline: string;
  talent_profiles_description: string;
  talent_profiles: unknown;
  notification_email_provider: string;
  notification_email_api_key: string;
  notification_from_email: string;
  notification_template_mappings: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type AdminLogRow = {
  id: string;
  category: string;
  module: string;
  action: string;
  actor: string;
  target: string;
  created_at: Date | string;
};

const DEFAULT_ADMIN_ACTOR = env.ADMIN_NAME?.trim() || toDisplayNameFromEmail(env.ADMIN_EMAIL);
const siteSettingsFileName = "site-settings.json";
const auditTrailFileName = "admin-audit-trail.json";
const jobsFileName = "jobs.json";
const SITE_SETTINGS_KEY = "default";

let siteSettingsSeedAttempted = false;
let adminLogsSeedAttempted = false;

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

function toIsoString(value: Date | string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback;
  }

  return typeof value === "string" ? value : value.toISOString();
}

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

function normalizeNotificationTemplateMappings(
  value: Partial<NotificationTemplateMappings> | null | undefined,
): NotificationTemplateMappings {
  return {
    contactSubmissionAcknowledgementTemplateId: trimToString(value?.contactSubmissionAcknowledgementTemplateId),
    jobApplicationAcknowledgementTemplateId: trimToString(value?.jobApplicationAcknowledgementTemplateId),
  };
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
    notificationTemplateMappings: {
      contactSubmissionAcknowledgementTemplateId: "",
      jobApplicationAcknowledgementTemplateId: "",
    },
  };
}

function normalizeSiteSettingsRecord(raw: Partial<SiteSettingsRecord> | null | undefined, defaults = getDefaultSiteSettings()): SiteSettingsRecord {
  return {
    companyName: trimToString(raw?.companyName) || defaults.companyName,
    companyEmail: trimToString(raw?.companyEmail) || defaults.companyEmail,
    companyPhone: trimToString(raw?.companyPhone) || defaults.companyPhone,
    companyAddress: trimToString(raw?.companyAddress),
    companyGoogleMapLink: trimToString(raw?.companyGoogleMapLink),
    careersDomain: trimToString(raw?.careersDomain) || defaults.careersDomain,
    careersHeadline: trimToString(raw?.careersHeadline) || defaults.careersHeadline,
    careersSubtitle: trimToString(raw?.careersSubtitle) || defaults.careersSubtitle,
    careersPublished: typeof raw?.careersPublished === "boolean" ? raw.careersPublished : defaults.careersPublished,
    careersShowTeamPhotos:
      typeof raw?.careersShowTeamPhotos === "boolean"
        ? raw.careersShowTeamPhotos
        : defaults.careersShowTeamPhotos,
    careersAutoPublishJobs:
      typeof raw?.careersAutoPublishJobs === "boolean"
        ? raw.careersAutoPublishJobs
        : defaults.careersAutoPublishJobs,
    careersTeamMembers: normalizeTeamMembers(raw?.careersTeamMembers),
    talentProfilesEyebrow: trimToString(raw?.talentProfilesEyebrow) || defaults.talentProfilesEyebrow,
    talentProfilesHeadline: trimToString(raw?.talentProfilesHeadline) || defaults.talentProfilesHeadline,
    talentProfilesDescription:
      trimToString(raw?.talentProfilesDescription) || defaults.talentProfilesDescription,
    talentProfiles: normalizeTalentProfiles(raw?.talentProfiles),
    notificationEmailProvider: trimToString(raw?.notificationEmailProvider),
    notificationEmailApiKey: trimToString(raw?.notificationEmailApiKey),
    notificationFromEmail: trimToString(raw?.notificationFromEmail),
    notificationTemplateMappings: normalizeNotificationTemplateMappings(raw?.notificationTemplateMappings),
  };
}

function mapSiteSettingsRow(row: SiteSettingsRow): SiteSettingsRecord {
  return normalizeSiteSettingsRecord({
    companyName: row.company_name,
    companyEmail: row.company_email,
    companyPhone: row.company_phone,
    companyAddress: row.company_address,
    companyGoogleMapLink: row.company_google_map_link,
    careersDomain: row.careers_domain,
    careersHeadline: row.careers_headline,
    careersSubtitle: row.careers_subtitle,
    careersPublished: row.careers_published,
    careersShowTeamPhotos: row.careers_show_team_photos,
    careersAutoPublishJobs: row.careers_auto_publish_jobs,
    careersTeamMembers: row.careers_team_members as unknown as SiteSettingsRecord["careersTeamMembers"],
    talentProfilesEyebrow: row.talent_profiles_eyebrow,
    talentProfilesHeadline: row.talent_profiles_headline,
    talentProfilesDescription: row.talent_profiles_description,
    talentProfiles: row.talent_profiles as unknown as SiteSettingsRecord["talentProfiles"],
    notificationEmailProvider: row.notification_email_provider,
    notificationEmailApiKey: row.notification_email_api_key,
    notificationFromEmail: row.notification_from_email,
    notificationTemplateMappings: row.notification_template_mappings as NotificationTemplateMappings,
  });
}

function mapAdminLogRow(row: AdminLogRow): AdminAuditEntry {
  return {
    id: row.id,
    category: normalizeAdminCategory(row.category),
    module: normalizeAdminModule(row.module) ?? inferModule(row.action, row.target),
    action: trimToString(row.action),
    actor: trimToString(row.actor) || DEFAULT_ADMIN_ACTOR,
    target: trimToString(row.target),
    createdAt: normalizeTimestamp(toIsoString(row.created_at)),
  };
}

async function ensureSiteSettingsSeeded() {
  if (siteSettingsSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM site_settings");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    siteSettingsSeedAttempted = true;
    return;
  }

  const defaults = getDefaultSiteSettings();
  const raw = await readJsonFile<Partial<SiteSettingsRecord>>(siteSettingsFileName, defaults);
  const seed = normalizeSiteSettingsRecord(raw, defaults);

  await pool.query(
    `
      INSERT INTO site_settings (
        settings_key,
        company_name,
        company_email,
        company_phone,
        company_address,
        company_google_map_link,
        careers_domain,
        careers_headline,
        careers_subtitle,
        careers_published,
        careers_show_team_photos,
        careers_auto_publish_jobs,
        careers_team_members,
        talent_profiles_eyebrow,
        talent_profiles_headline,
        talent_profiles_description,
        talent_profiles,
        notification_email_provider,
        notification_email_api_key,
        notification_from_email,
        notification_template_mappings
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb, $18, $19, $20, $21::jsonb
      )
      ON CONFLICT (settings_key) DO NOTHING
    `,
    [
      SITE_SETTINGS_KEY,
      seed.companyName,
      seed.companyEmail,
      seed.companyPhone,
      seed.companyAddress,
      seed.companyGoogleMapLink,
      seed.careersDomain,
      seed.careersHeadline,
      seed.careersSubtitle,
      seed.careersPublished,
      seed.careersShowTeamPhotos,
      seed.careersAutoPublishJobs,
      JSON.stringify(seed.careersTeamMembers),
      seed.talentProfilesEyebrow,
      seed.talentProfilesHeadline,
      seed.talentProfilesDescription,
      JSON.stringify(seed.talentProfiles),
      seed.notificationEmailProvider,
      seed.notificationEmailApiKey,
      seed.notificationFromEmail,
      JSON.stringify(seed.notificationTemplateMappings),
    ],
  );

  siteSettingsSeedAttempted = true;
}

async function readPersistedSiteSettings() {
  await ensureSiteSettingsSeeded();
  const result = await getPool().query<SiteSettingsRow>(
    `
      SELECT
        settings_key,
        company_name,
        company_email,
        company_phone,
        company_address,
        company_google_map_link,
        careers_domain,
        careers_headline,
        careers_subtitle,
        careers_published,
        careers_show_team_photos,
        careers_auto_publish_jobs,
        careers_team_members,
        talent_profiles_eyebrow,
        talent_profiles_headline,
        talent_profiles_description,
        talent_profiles,
        notification_email_provider,
        notification_email_api_key,
        notification_from_email,
        notification_template_mappings,
        created_at,
        updated_at
      FROM site_settings
      WHERE settings_key = $1
      LIMIT 1
    `,
    [SITE_SETTINGS_KEY],
  );

  if (!result.rows[0]) {
    const defaults = getDefaultSiteSettings();
    await writeSiteSettings(defaults);
    return defaults;
  }

  return mapSiteSettingsRow(result.rows[0]);
}

async function readSiteSettingsFileFallback() {
  const defaults = getDefaultSiteSettings();
  const raw = await readJsonFile<Partial<SiteSettingsRecord>>(siteSettingsFileName, defaults);
  return normalizeSiteSettingsRecord(raw, defaults);
}

async function ensureAdminLogsSeeded() {
  if (adminLogsSeedAttempted) {
    return;
  }

  const pool = getPool();
  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_logs");

  if (Number(countResult.rows[0]?.count ?? "0") > 0) {
    adminLogsSeedAttempted = true;
    return;
  }

  const seedItems = (await readJsonFile<unknown[]>(auditTrailFileName, []))
    .map((item) => normalizeAuditEntry(item))
    .filter((item): item is AdminAuditEntry => Boolean(item));

  if (!seedItems.length) {
    adminLogsSeedAttempted = true;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of seedItems) {
      await client.query(
        `
          INSERT INTO admin_logs (id, category, module, action, actor, target, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `,
        [item.id, item.category, item.module, item.action, item.actor, item.target, item.createdAt],
      );
    }

    await client.query("COMMIT");
    adminLogsSeedAttempted = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

async function readPersistedAdminLogs() {
  await ensureAdminLogsSeeded();
  const result = await getPool().query<AdminLogRow>(
    `
      SELECT id, category, module, action, actor, target, created_at
      FROM admin_logs
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapAdminLogRow(row));
}

export async function readSiteSettings() {
  try {
    return await readPersistedSiteSettings();
  } catch {
    return readSiteSettingsFileFallback();
  }
}

export async function writeSiteSettings(settings: SiteSettingsRecord) {
  const normalized = normalizeSiteSettingsRecord(settings, getDefaultSiteSettings());

  try {
    await ensureSiteSettingsSeeded();
    await getPool().query(
      `
        INSERT INTO site_settings (
          settings_key,
          company_name,
          company_email,
          company_phone,
          company_address,
          company_google_map_link,
          careers_domain,
          careers_headline,
          careers_subtitle,
          careers_published,
          careers_show_team_photos,
          careers_auto_publish_jobs,
          careers_team_members,
          talent_profiles_eyebrow,
          talent_profiles_headline,
          talent_profiles_description,
          talent_profiles,
          notification_email_provider,
          notification_email_api_key,
          notification_from_email,
          notification_template_mappings,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb, $18, $19, $20, $21::jsonb, NOW()
        )
        ON CONFLICT (settings_key)
        DO UPDATE SET
          company_name = EXCLUDED.company_name,
          company_email = EXCLUDED.company_email,
          company_phone = EXCLUDED.company_phone,
          company_address = EXCLUDED.company_address,
          company_google_map_link = EXCLUDED.company_google_map_link,
          careers_domain = EXCLUDED.careers_domain,
          careers_headline = EXCLUDED.careers_headline,
          careers_subtitle = EXCLUDED.careers_subtitle,
          careers_published = EXCLUDED.careers_published,
          careers_show_team_photos = EXCLUDED.careers_show_team_photos,
          careers_auto_publish_jobs = EXCLUDED.careers_auto_publish_jobs,
          careers_team_members = EXCLUDED.careers_team_members,
          talent_profiles_eyebrow = EXCLUDED.talent_profiles_eyebrow,
          talent_profiles_headline = EXCLUDED.talent_profiles_headline,
          talent_profiles_description = EXCLUDED.talent_profiles_description,
          talent_profiles = EXCLUDED.talent_profiles,
          notification_email_provider = EXCLUDED.notification_email_provider,
          notification_email_api_key = EXCLUDED.notification_email_api_key,
          notification_from_email = EXCLUDED.notification_from_email,
          notification_template_mappings = EXCLUDED.notification_template_mappings,
          updated_at = NOW()
      `,
      [
        SITE_SETTINGS_KEY,
        normalized.companyName,
        normalized.companyEmail,
        normalized.companyPhone,
        normalized.companyAddress,
        normalized.companyGoogleMapLink,
        normalized.careersDomain,
        normalized.careersHeadline,
        normalized.careersSubtitle,
        normalized.careersPublished,
        normalized.careersShowTeamPhotos,
        normalized.careersAutoPublishJobs,
        JSON.stringify(normalized.careersTeamMembers),
        normalized.talentProfilesEyebrow,
        normalized.talentProfilesHeadline,
        normalized.talentProfilesDescription,
        JSON.stringify(normalized.talentProfiles),
        normalized.notificationEmailProvider,
        normalized.notificationEmailApiKey,
        normalized.notificationFromEmail,
        JSON.stringify(normalized.notificationTemplateMappings),
      ],
    );

    return normalized;
  } catch {
    await writeJsonFile(siteSettingsFileName, normalized);
    return normalized;
  }
}

export async function readJobs() {
  try {
    const result = await getPool().query<{ id: string; status: string }>(
      `
        SELECT id, status
        FROM jobs
        ORDER BY updated_at DESC
      `,
    );

    return result.rows.map((row) => ({
      id: trimToString(row.id) || randomUUID(),
      status: trimToString(row.status),
    }));
  } catch {
    const parsed = await readJsonFile<unknown[]>(jobsFileName, []);

    return parsed
      .filter((item): item is { id?: unknown; status?: unknown } => Boolean(item) && typeof item === "object")
      .map((item) => ({
        id: trimToString(item.id) || randomUUID(),
        status: trimToString(item.status),
      }));
  }
}

export async function listAdminAuditEntries(options: { category?: AdminLogCategory } = {}) {
  const items = await (async () => {
    try {
      return await readPersistedAdminLogs();
    } catch {
      return readAuditTrailFile();
    }
  })();

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

  try {
    await ensureAdminLogsSeeded();
    await getPool().query(
      `
        INSERT INTO admin_logs (id, category, module, action, actor, target, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [next.id, next.category, next.module, next.action, next.actor, next.target, next.createdAt],
    );

    return next;
  } catch {
    const items = await readAuditTrailFile();
    items.unshift(next);
    await writeAuditTrailFile(items);
    return next;
  }
}

export async function clearAdminAuditEntries(options: { categories?: AdminLogCategory[] } = {}) {
  try {
    await ensureAdminLogsSeeded();

    if (!options.categories?.length) {
      await getPool().query("DELETE FROM admin_logs");
      return true;
    }

    await getPool().query("DELETE FROM admin_logs WHERE category = ANY($1::text[])", [options.categories]);
    return true;
  } catch {
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
}

export async function clearAdminAuditEntriesByIds(ids: string[]) {
  if (!ids.length) {
    return true;
  }

  try {
    await ensureAdminLogsSeeded();
    await getPool().query("DELETE FROM admin_logs WHERE id = ANY($1::text[])", [ids]);
    return true;
  } catch {
    const blocked = new Set(ids);
    const items = await readAuditTrailFile();
    const next = items.filter((item) => !blocked.has(item.id));
    await writeAuditTrailFile(next);
    return true;
  }
}
