import { Router } from "express";
import { z } from "zod";

import {
  createAdminBlogPost,
  deleteAdminBlogPost,
  getAdminBlogPostById,
  getPublicBlogPostBySlug,
  listAdminBlogPosts,
  listPublicBlogPosts,
  publishAdminBlogPost,
  updateAdminBlogPost,
} from "../lib/admin-blog-posts-store.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { createAdminAuditEntry } from "../lib/shared-admin-store.js";
import { requireAdminAuth } from "../middleware/auth.middleware.js";

const blogPostsRoutes = Router();

const blogPostSectionSchema = z.object({
  heading: z.string().trim().min(2, "Section heading is required."),
  paragraphs: z.array(z.string().trim().min(1, "Paragraph cannot be empty.")).min(1, "Add at least one paragraph."),
  bullets: z.array(z.string().trim().min(1, "Bullet cannot be empty.")).optional().default([]),
});

const blogPostPayloadSchema = z.object({
  slug: z.string().trim().min(3, "Slug is required."),
  category: z.string().trim().min(2, "Category is required."),
  date: z.string().trim().min(3, "Date label is required."),
  readTime: z.string().trim().min(3, "Read time is required."),
  title: z.string().trim().min(8, "Title is required."),
  description: z.string().trim().min(12, "Description is required."),
  coverImage: z.string().trim().min(1, "Cover image is required."),
  coverAlt: z.string().trim().min(3, "Cover alt text is required."),
  intro: z.string().trim().min(20, "Intro should be at least 20 characters."),
  sections: z.array(blogPostSectionSchema).min(1, "Add at least one section."),
  isPublished: z.boolean().optional().default(false),
});

const publishPayloadSchema = z.object({
  isPublished: z.boolean(),
});

function getRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

blogPostsRoutes.get(
  "/api/v1/blog-posts",
  asyncHandler(async (_request, response) => {
    const data = await listPublicBlogPosts();

    sendSuccess(response, {
      message: "Blog posts fetched successfully.",
      data,
    });
  }),
);

blogPostsRoutes.get(
  "/api/v1/blog-posts/:slug",
  asyncHandler(async (request, response) => {
    const slug = getRouteParam(request.params.slug);

    if (!slug) {
      throw new AppError(400, "Invalid blog slug.");
    }

    const data = await getPublicBlogPostBySlug(slug);

    if (!data) {
      throw new AppError(404, "Blog post not found.");
    }

    sendSuccess(response, {
      message: "Blog post fetched successfully.",
      data,
    });
  }),
);

blogPostsRoutes.get(
  "/api/v1/admin/blog-posts",
  requireAdminAuth(),
  asyncHandler(async (_request, response) => {
    const data = await listAdminBlogPosts();

    sendSuccess(response, {
      message: "Blog posts fetched successfully.",
      data,
    });
  }),
);

blogPostsRoutes.post(
  "/api/v1/admin/blog-posts",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const parsed = blogPostPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const data = await createAdminBlogPost(parsed.data);
    await createAdminAuditEntry({
      category: "activity",
      module: "System",
      action: "Created Blog Post",
      target: `${data.id} - ${data.title}`,
    });

    sendSuccess(response, {
      status: 201,
      message: "Blog post created successfully.",
      data,
    });
  }),
);

blogPostsRoutes.get(
  "/api/v1/admin/blog-posts/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const data = await getAdminBlogPostById(id);

    if (!data) {
      throw new AppError(404, "Blog post not found.");
    }

    sendSuccess(response, {
      message: "Blog post fetched successfully.",
      data,
    });
  }),
);

blogPostsRoutes.put(
  "/api/v1/admin/blog-posts/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const parsed = blogPostPayloadSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const data = await updateAdminBlogPost(id, parsed.data);

    if (!data) {
      throw new AppError(404, "Blog post not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "System",
      action: "Updated Blog Post",
      target: `${data.id} - ${data.title}`,
    });

    sendSuccess(response, {
      message: "Blog post updated successfully.",
      data,
    });
  }),
);

blogPostsRoutes.delete(
  "/api/v1/admin/blog-posts/:id",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const existing = await getAdminBlogPostById(id);
    const deleted = await deleteAdminBlogPost(id);

    if (!deleted) {
      throw new AppError(404, "Blog post not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "System",
      action: "Deleted Blog Post",
      target: `${id} - ${existing?.title ?? "Unknown"}`,
    });

    sendSuccess(response, {
      message: "Blog post deleted successfully.",
      data: null,
    });
  }),
);

blogPostsRoutes.patch(
  "/api/v1/admin/blog-posts/:id/publish",
  requireAdminAuth(),
  asyncHandler(async (request, response) => {
    const id = getRouteParam(request.params.id);
    const parsed = publishPayloadSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
    }

    const data = await publishAdminBlogPost(id, parsed.data.isPublished);

    if (!data) {
      throw new AppError(404, "Blog post not found.");
    }

    await createAdminAuditEntry({
      category: "activity",
      module: "System",
      action: parsed.data.isPublished ? "Published Blog Post" : "Moved Blog Post To Draft",
      target: `${data.id} - ${data.title}`,
    });

    sendSuccess(response, {
      message: parsed.data.isPublished ? "Blog post published successfully." : "Blog post moved to draft successfully.",
      data,
    });
  }),
);

export { blogPostsRoutes };
