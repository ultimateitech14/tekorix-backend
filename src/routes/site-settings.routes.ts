import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import {
  createAdminAuditEntry,
  readSiteSettings,
  writeSiteSettings,
} from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const siteSettingsRoutes = Router();

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      return value.trim();
    },
    z.string().max(max).optional(),
  );

const teamMemberSchema = z.object({
  id: optionalTrimmedString(120),
  name: optionalTrimmedString(160),
  role: optionalTrimmedString(200),
  photo: optionalTrimmedString(4_000_000),
  blurb: optionalTrimmedString(2_000),
});

const talentProfileSchema = z.object({
  id: optionalTrimmedString(160),
  name: optionalTrimmedString(160),
  role: optionalTrimmedString(200),
  yearsOfExperience: z.number().int().min(1).max(40).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  summary: optionalTrimmedString(500),
  detailedSummary: optionalTrimmedString(2_000),
  expertise: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  avatar: optionalTrimmedString(4_000_000),
  resumeCtaLabel: optionalTrimmedString(120),
});

const siteSettingsUpdateSchema = z
  .object({
    companyName: optionalTrimmedString(300),
    companyEmail: optionalTrimmedString(320),
    companyPhone: optionalTrimmedString(100),
    companyAddress: optionalTrimmedString(600),
    companyGoogleMapLink: optionalTrimmedString(2_000),
    careersDomain: optionalTrimmedString(300),
    careersHeadline: optionalTrimmedString(500),
    careersSubtitle: optionalTrimmedString(4_000),
    careersPublished: z.boolean().optional(),
    careersShowTeamPhotos: z.boolean().optional(),
    careersAutoPublishJobs: z.boolean().optional(),
    careersTeamMembers: z.array(teamMemberSchema).max(8).optional(),
    talentProfilesEyebrow: optionalTrimmedString(160),
    talentProfilesHeadline: optionalTrimmedString(500),
    talentProfilesDescription: optionalTrimmedString(2_000),
    talentProfiles: z.array(talentProfileSchema).max(20).optional(),
    notificationEmailProvider: optionalTrimmedString(160),
    notificationEmailApiKey: optionalTrimmedString(2_000),
    notificationFromEmail: optionalTrimmedString(320),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one setting is required.",
  });

function normalizeText(value: string | undefined, fallback = "") {
  return value?.trim() ?? fallback;
}

function normalizeTeamMembers(
  value:
    | Array<{
        id?: string | undefined;
        name?: string | undefined;
        role?: string | undefined;
        photo?: string | undefined;
        blurb?: string | undefined;
      }>
    | undefined,
) {
  return (value ?? []).map((item, index) => ({
    id: normalizeText(item.id, `team-${String(index + 1).padStart(2, "0")}`),
    name: normalizeText(item.name),
    role: normalizeText(item.role),
    photo: normalizeText(item.photo),
    blurb: normalizeText(item.blurb),
  }));
}

function normalizeTalentProfiles(
  value:
    | Array<{
        id?: string | undefined;
        name?: string | undefined;
        role?: string | undefined;
        yearsOfExperience?: number | undefined;
        rating?: number | undefined;
        summary?: string | undefined;
        detailedSummary?: string | undefined;
        expertise?: string[] | undefined;
        avatar?: string | undefined;
        resumeCtaLabel?: string | undefined;
      }>
    | undefined,
) {
  return (value ?? []).map((item, index) => ({
    id: normalizeText(item.id, `profile-${index + 1}`),
    name: normalizeText(item.name),
    role: normalizeText(item.role),
    yearsOfExperience: item.yearsOfExperience ?? 1,
    rating: item.rating ?? 1,
    summary: normalizeText(item.summary),
    detailedSummary: normalizeText(item.detailedSummary),
    expertise: item.expertise?.map((entry) => entry.trim()).filter(Boolean) ?? [],
    avatar: normalizeText(item.avatar),
    resumeCtaLabel: normalizeText(item.resumeCtaLabel),
  }));
}

function toPublicSiteSettings(settings: Awaited<ReturnType<typeof readSiteSettings>>) {
  return {
    companyName: settings.companyName,
    companyEmail: settings.companyEmail,
    companyPhone: settings.companyPhone,
    companyAddress: settings.companyAddress,
    companyGoogleMapLink: settings.companyGoogleMapLink,
    careersDomain: settings.careersDomain,
    careersHeadline: settings.careersHeadline,
    careersSubtitle: settings.careersSubtitle,
    careersPublished: settings.careersPublished,
    careersShowTeamPhotos: settings.careersShowTeamPhotos,
    careersAutoPublishJobs: settings.careersAutoPublishJobs,
    careersTeamMembers: settings.careersTeamMembers,
    talentProfilesEyebrow: settings.talentProfilesEyebrow,
    talentProfilesHeadline: settings.talentProfilesHeadline,
    talentProfilesDescription: settings.talentProfilesDescription,
    talentProfiles: settings.talentProfiles,
  };
}

siteSettingsRoutes.get(
  "/api/v1/site-settings",
  asyncHandler(async (_request, response) => {
    const settings = await readSiteSettings();

    sendSuccess(response, {
      message: "Public site settings fetched successfully.",
      data: toPublicSiteSettings(settings),
    });
  }),
);

siteSettingsRoutes.get(
  "/api/admin/site-settings",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const settings = await readSiteSettings();

    sendSuccess(response, {
      message: "Site settings fetched successfully.",
      data: settings,
    });
  }),
);

siteSettingsRoutes.put(
  "/api/admin/site-settings",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const parsed = siteSettingsUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const current = await readSiteSettings();
    const next = {
      ...current,
      ...parsed.data,
      careersTeamMembers:
        typeof parsed.data.careersTeamMembers === "undefined"
          ? current.careersTeamMembers
          : normalizeTeamMembers(parsed.data.careersTeamMembers),
      talentProfiles:
        typeof parsed.data.talentProfiles === "undefined"
          ? current.talentProfiles
          : normalizeTalentProfiles(parsed.data.talentProfiles),
    };

    await writeSiteSettings(next);

    await createAdminAuditEntry({
      category: "audit",
      module: "Settings",
      action: "Updated Site Settings",
      target: Object.keys(parsed.data).join(", ") || "General settings",
    });

    sendSuccess(response, {
      message: "Site settings updated successfully.",
      data: next,
    });
  }),
);

export { siteSettingsRoutes };
