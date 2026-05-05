import { Router } from "express";

import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import {
  clearAdminAuditEntries,
  clearAdminAuditEntriesByIds,
  listAdminAuditEntries,
  type AdminAuditEntry,
} from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const logsRoutes = Router();

type LogsTab = "activity" | "audit" | "notifications";

function parseTab(value: unknown): LogsTab | null {
  if (value === "activity" || value === "audit" || value === "notifications") {
    return value;
  }

  return null;
}

function isAuditLike(item: Pick<AdminAuditEntry, "category" | "module" | "action">) {
  if (item.category === "notification") {
    return false;
  }

  if (item.category === "audit") {
    return true;
  }

  const moduleName = item.module.toLowerCase();
  const action = item.action.toLowerCase();

  if (moduleName === "settings") {
    return true;
  }

  if (action.includes("template") || action.includes("provider")) {
    return true;
  }

  return false;
}

logsRoutes.get(
  "/api/admin/logs",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const all = await listAdminAuditEntries();
    const activity = all.filter((item) => item.category === "activity" && !isAuditLike(item));
    const audit = all.filter((item) => isAuditLike(item));
    const notifications = all.filter((item) => item.category === "notification");

    sendSuccess(response, {
      message: "Logs fetched successfully.",
      data: {
        activity,
        audit,
        notifications,
      },
    });
  }),
);

logsRoutes.delete(
  "/api/admin/logs",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const tab = parseTab(request.body?.tab);

    if (tab === "activity") {
      const all = await listAdminAuditEntries();
      const ids = all.filter((item) => item.category === "activity" && !isAuditLike(item)).map((item) => item.id);
      await clearAdminAuditEntriesByIds(ids);

      return sendSuccess(response, {
        message: "Activity logs cleared.",
      });
    }

    if (tab === "audit") {
      const all = await listAdminAuditEntries();
      const ids = all.filter((item) => isAuditLike(item)).map((item) => item.id);
      await clearAdminAuditEntriesByIds(ids);

      return sendSuccess(response, {
        message: "Audit trail cleared.",
      });
    }

    if (tab === "notifications") {
      await clearAdminAuditEntries({ categories: ["notification"] });

      return sendSuccess(response, {
        message: "Notification logs cleared.",
      });
    }

    await clearAdminAuditEntries();

    return sendSuccess(response, {
      message: "Logs cleared.",
    });
  }),
);

export { logsRoutes };
