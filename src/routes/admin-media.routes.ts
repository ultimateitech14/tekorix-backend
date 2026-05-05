import { Router } from "express";
import { z } from "zod";

import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";
import { saveAdminImageUpload } from "../services/admin-image-storage.service.js";

const adminMediaRoutes = Router();

const imageUploadPayloadSchema = z.object({
  folder: z.enum(["blog", "team", "profiles"]),
  fileName: z.string().trim().min(1, "File name is required.").max(240, "File name is too long."),
  dataUrl: z.string().trim().min(1, "Image payload is required."),
});

adminMediaRoutes.post(
  "/api/admin/media/images",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const parsed = imageUploadPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid image upload request.");
    }

    const data = await saveAdminImageUpload(parsed.data);

    sendSuccess(response, {
      status: 201,
      message: "Image uploaded successfully.",
      data,
    });
  }),
);

export { adminMediaRoutes };
