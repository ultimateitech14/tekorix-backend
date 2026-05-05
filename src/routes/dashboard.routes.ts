import { Router } from "express";

import { listCandidateLeadsService } from "../modules/candidate-leads/candidate-leads.service.js";
import { listCompanyLeadsService } from "../modules/company-leads/company-leads.service.js";
import { readContactSubmissions } from "../lib/admin-contact-submissions-store.js";
import { readJobApplications } from "../lib/admin-job-applications-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { readJobs } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const dashboardRoutes = Router();

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
});

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildApplicationsByDay(createdAtValues: string[]) {
  const counts = new Map<string, number>();
  const days: Array<{ day: string; dateKey: string }> = [];
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(now.getDate() - offset);
    const dateKey = toDayKey(date);
    days.push({
      day: dayFormatter.format(date),
      dateKey,
    });
    counts.set(dateKey, 0);
  }

  for (const createdAt of createdAtValues) {
    const parsed = new Date(createdAt);

    if (Number.isNaN(parsed.getTime())) {
      continue;
    }

    const dayKey = toDayKey(parsed);

    if (!counts.has(dayKey)) {
      continue;
    }

    counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
  }

  return days.map((item) => ({
    day: item.day,
    count: counts.get(item.dateKey) ?? 0,
  }));
}

dashboardRoutes.get(
  "/api/admin/dashboard",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const [jobs, applications, contactSubmissions, companyLeadsResult, candidateLeadsResult] = await Promise.all([
      readJobs(),
      readJobApplications(),
      readContactSubmissions(),
      listCompanyLeadsService().then(
        (data) => ({ ok: true as const, data }),
        (error) => ({ ok: false as const, error }),
      ),
      listCandidateLeadsService().then(
        (data) => ({ ok: true as const, data }),
        (error) => ({ ok: false as const, error }),
      ),
    ]);

    const statusCounts = {
      "pending review": applications.filter((item) => item.status === "pending review").length,
      shortlisted: applications.filter((item) => item.status === "shortlisted").length,
      rejected: applications.filter((item) => item.status === "rejected").length,
      interview: applications.filter((item) => item.status === "interview").length,
    };

    const workerErrors = [
      companyLeadsResult.ok ? null : "company-leads",
      candidateLeadsResult.ok ? null : "candidate-leads",
    ].filter((item): item is string => Boolean(item));

    sendSuccess(response, {
      message: "Dashboard data fetched successfully.",
      data: {
        kpis: {
          totalJobs: jobs.length,
          publishedJobs: jobs.filter((item) => item.status === "published").length,
          draftJobs: jobs.filter((item) => item.status === "draft").length,
          closedJobs: jobs.filter((item) => item.status === "closed").length,
          totalApplications: applications.length,
          unreadApplications: applications.filter((item) => !item.isRead).length,
          shortlistedApplications: statusCounts.shortlisted,
          pendingApplications: statusCounts["pending review"],
          totalCompanyLeads: companyLeadsResult.ok ? companyLeadsResult.data.length : 0,
          totalCandidateLeads: candidateLeadsResult.ok ? candidateLeadsResult.data.length : 0,
          totalContactSubmissions: contactSubmissions.length,
          unreadContactSubmissions: contactSubmissions.filter((item) => !item.isRead).length,
        },
        applicationsByDay: buildApplicationsByDay(applications.map((item) => item.createdAt)),
        statusDistribution: [
          { name: "Pending Review", value: statusCounts["pending review"], color: "#7dd3fc" },
          { name: "Shortlisted", value: statusCounts.shortlisted, color: "#fcd34d" },
          { name: "Rejected", value: statusCounts.rejected, color: "#fda4af" },
          { name: "Interview", value: statusCounts.interview, color: "#c4b5fd" },
        ],
        recentApplications: applications.slice(0, 5).map((item) => ({
          id: item.id,
          candidate: item.fullName,
          job: item.jobTitle,
          status: item.status,
          date: item.createdAt,
          hasResume: Boolean(item.resume?.storedName),
        })),
        workerSync: {
          connected: workerErrors.length === 0,
          errors: workerErrors,
        },
      },
    });
  }),
);

export { dashboardRoutes };
