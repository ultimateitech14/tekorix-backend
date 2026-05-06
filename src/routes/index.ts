import { Router } from "express";

import { adminAccessRoutes } from "./admin-access.routes.js";
import { adminMediaRoutes } from "./admin-media.routes.js";
import { candidateLeadRoutes } from "../modules/candidate-leads/candidate-leads.routes.js";
import { companyLeadRoutes } from "../modules/company-leads/company-leads.routes.js";
import { authRoutes } from "./auth.routes.js";
import { blogPostsRoutes } from "./blog-posts.routes.js";
import { contactSubmissionsRoutes } from "./contact-submissions.routes.js";
import { dashboardRoutes } from "./dashboard.routes.js";
import { emailTemplatesRoutes } from "./email-templates.routes.js";
import { healthRoutes } from "./health.routes.js";
import { jobApplicationsRoutes } from "./job-applications.routes.js";
import { jobsRoutes } from "./jobs.routes.js";
import { logsRoutes } from "./logs.routes.js";
import { notificationSettingsRoutes } from "./notification-settings.routes.js";
import { resumeBankRoutes } from "./resume-bank.routes.js";
import { siteSettingsRoutes } from "./site-settings.routes.js";
import { uploadsRoutes } from "./uploads.routes.js";

const router = Router();

router.use(healthRoutes);
router.use(uploadsRoutes);
router.use(authRoutes);
router.use(adminAccessRoutes);
router.use(adminMediaRoutes);
router.use(blogPostsRoutes);
router.use(jobsRoutes);
router.use(dashboardRoutes);
router.use(siteSettingsRoutes);
router.use(notificationSettingsRoutes);
router.use(jobApplicationsRoutes);
router.use(resumeBankRoutes);
router.use(contactSubmissionsRoutes);
router.use(emailTemplatesRoutes);
router.use(logsRoutes);
router.use(companyLeadRoutes);
router.use(candidateLeadRoutes);

export { router };
