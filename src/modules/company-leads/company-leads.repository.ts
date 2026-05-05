import { getPool } from "../../database/pool.js";

import type { CompanyLeadRecord, CompanyLeadRow, CreateCompanyLeadInput } from "./company-leads.types.js";

function toIsoString(value: Date | string) {
  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function mapCompanyLeadRow(row: CompanyLeadRow): CompanyLeadRecord {
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    email: row.email,
    phone: row.phone,
    need: row.need as CompanyLeadRecord["need"],
    message: row.message,
    sourcePage: row.source_page as CompanyLeadRecord["sourcePage"],
    status: row.status,
    isRead: row.is_read,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const baseSelect = `
  SELECT
    id,
    name,
    company_name,
    email,
    phone,
    need,
    message,
    source_page,
    status,
    is_read,
    created_at,
    updated_at
  FROM company_leads
`;

export async function createCompanyLeadRepository(input: CreateCompanyLeadInput) {
  const pool = getPool();
  const id = crypto.randomUUID();

  const result = await pool.query<CompanyLeadRow>(
    `
      INSERT INTO company_leads (
        id,
        name,
        company_name,
        email,
        phone,
        need,
        message,
        source_page,
        status,
        is_read
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', false)
      RETURNING
        id,
        name,
        company_name,
        email,
        phone,
        need,
        message,
        source_page,
        status,
        is_read,
        created_at,
        updated_at
    `,
    [id, input.name, input.companyName, input.email, input.phone, input.need, input.message, input.sourcePage],
  );

  return mapCompanyLeadRow(result.rows[0]);
}

export async function listCompanyLeadsRepository() {
  const result = await getPool().query<CompanyLeadRow>(
    `
      ${baseSelect}
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map((row) => mapCompanyLeadRow(row));
}

export async function getCompanyLeadByIdRepository(id: string) {
  const result = await getPool().query<CompanyLeadRow>(
    `
      ${baseSelect}
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapCompanyLeadRow(row) : null;
}

export async function markCompanyLeadAsReadRepository(id: string) {
  const result = await getPool().query<CompanyLeadRow>(
    `
      UPDATE company_leads
      SET
        is_read = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        name,
        company_name,
        email,
        phone,
        need,
        message,
        source_page,
        status,
        is_read,
        created_at,
        updated_at
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapCompanyLeadRow(row) : null;
}
