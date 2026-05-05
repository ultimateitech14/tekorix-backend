import { getPool } from "../../database/pool.js";

import {
  inferCandidateLeadResumeContentType,
  type CandidateLeadRecord,
  type CandidateLeadRow,
  type CreateCandidateLeadRepositoryInput,
} from "./candidate-leads.types.js";

function toIsoString(value: Date | string) {
  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function mapCandidateLeadRow(row: CandidateLeadRow): CandidateLeadRecord {
  const resumeContentType = row.resume_file_name
    ? inferCandidateLeadResumeContentType(row.resume_file_name, row.resume_content_type)
    : null;

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    experience: row.experience,
    linkedInUrl: row.linked_in_url,
    desiredLocation: row.desired_location,
    desiredSalaryRange: row.desired_salary_range,
    skills: row.skills,
    submissionType: row.submission_type as CandidateLeadRecord["submissionType"],
    sourcePage: row.source_page as CandidateLeadRecord["sourcePage"],
    status: row.status,
    isRead: row.is_read,
    resume:
      row.resume_object_key && row.resume_file_name && resumeContentType
        ? {
            objectKey: row.resume_object_key,
            fileName: row.resume_file_name,
            contentType: resumeContentType,
          }
        : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const baseSelect = `
  SELECT
    id,
    full_name,
    email,
    phone,
    role,
    experience,
    linked_in_url,
    desired_location,
    desired_salary_range,
    skills,
    submission_type,
    source_page,
    status,
    is_read,
    resume_object_key,
    resume_file_name,
    resume_content_type,
    created_at,
    updated_at
  FROM candidate_leads
`;

export async function createCandidateLeadRepository(input: CreateCandidateLeadRepositoryInput) {
  const result = await getPool().query<CandidateLeadRow>(
    `
      INSERT INTO candidate_leads (
        id,
        full_name,
        email,
        phone,
        role,
        experience,
        linked_in_url,
        desired_location,
        desired_salary_range,
        skills,
        submission_type,
        source_page,
        status,
        is_read,
        resume_object_key,
        resume_file_name,
        resume_content_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'new', false, $13, $14, $15)
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        experience,
        linked_in_url,
        desired_location,
        desired_salary_range,
        skills,
        submission_type,
        source_page,
        status,
        is_read,
        resume_object_key,
        resume_file_name,
        resume_content_type,
        created_at,
        updated_at
    `,
    [
      input.id,
      input.fullName,
      input.email,
      input.phone,
      input.role,
      input.experience,
      input.linkedInUrl,
      input.desiredLocation,
      input.desiredSalaryRange,
      input.skills,
      input.submissionType,
      input.sourcePage,
      input.resume?.objectKey ?? null,
      input.resume?.fileName ?? null,
      input.resume?.contentType ?? null,
    ],
  );

  return mapCandidateLeadRow(result.rows[0]);
}

export async function listCandidateLeadsRepository() {
  const result = await getPool().query<CandidateLeadRow>(
    `
      ${baseSelect}
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapCandidateLeadRow(row));
}

export async function getCandidateLeadByIdRepository(id: string) {
  const result = await getPool().query<CandidateLeadRow>(
    `
      ${baseSelect}
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapCandidateLeadRow(row) : null;
}

export async function markCandidateLeadAsReadRepository(id: string) {
  const result = await getPool().query<CandidateLeadRow>(
    `
      UPDATE candidate_leads
      SET
        is_read = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        experience,
        linked_in_url,
        desired_location,
        desired_salary_range,
        skills,
        submission_type,
        source_page,
        status,
        is_read,
        resume_object_key,
        resume_file_name,
        resume_content_type,
        created_at,
        updated_at
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapCandidateLeadRow(row) : null;
}
