import { randomUUID } from "node:crypto";

import { z } from "zod";

import { query } from "../config/db.js";
import { sendSuccess } from "../lib/api-response.js";
import { AppError } from "../lib/app-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import type { CreateProjectInput, ProjectRecord, ProjectRow } from "../types/project.types.js";

const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Project name is required.").max(120, "Project name is too long."),
  description: z.string().trim().min(10, "Description should be at least 10 characters long.").max(2000),
  ownerName: z.string().trim().min(2, "Owner name is required.").max(120, "Owner name is too long."),
  ownerEmail: z.string().trim().email("Owner email must be valid.").max(160, "Owner email is too long."),
  status: z.enum(["planned", "active", "completed"]).default("planned"),
});

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function listProjects(): Promise<ProjectRecord[]> {
  const result = await query<ProjectRow>(
    `
      SELECT
        id,
        name,
        description,
        owner_name,
        owner_email,
        status,
        created_at,
        updated_at
      FROM projects
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapProjectRow(row));
}

async function createProject(input: CreateProjectInput): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const result = await query<ProjectRow>(
    `
      INSERT INTO projects (
        id,
        name,
        description,
        owner_name,
        owner_email,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        name,
        description,
        owner_name,
        owner_email,
        status,
        created_at,
        updated_at
    `,
    [
      randomUUID(),
      input.name.trim(),
      input.description.trim(),
      input.ownerName.trim(),
      input.ownerEmail.trim().toLowerCase(),
      input.status,
      now,
      now,
    ],
  );

  const created = result.rows[0];

  if (!created) {
    throw new AppError(500, "Failed to create project.");
  }

  return mapProjectRow(created);
}

export const getProjectsController = asyncHandler(async (_request, response) => {
  const data = await listProjects();

  sendSuccess(response, {
    message: "Projects fetched successfully.",
    data,
  });
});

export const createProjectController = asyncHandler(async (request, response) => {
  const parsed = createProjectSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request payload.");
  }

  const data = await createProject(parsed.data);

  sendSuccess(response, {
    status: 201,
    message: "Project created successfully.",
    data,
  });
});
