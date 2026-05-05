export const companyLeadNeedValues = [
  "on-roll-consultants",
  "dedicated-product-team",
  "permanent-hire",
  "contractual-hire",
  "hourly-hire",
  "bench-resources",
  "team-restructure-support",
  "mixed-requirement",
] as const;

export const companyLeadSourcePageValues = ["contact", "find-talent", "unknown"] as const;

export type CompanyLeadNeed = (typeof companyLeadNeedValues)[number];
export type CompanyLeadSourcePage = (typeof companyLeadSourcePageValues)[number];

export type CreateCompanyLeadInput = {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  need: CompanyLeadNeed;
  message: string;
  sourcePage: CompanyLeadSourcePage;
};

export type CompanyLeadRecord = {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  need: CompanyLeadNeed;
  message: string;
  sourcePage: CompanyLeadSourcePage;
  status: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanyLeadRow = {
  id: string;
  name: string;
  company_name: string;
  email: string;
  phone: string;
  need: string;
  message: string;
  source_page: string;
  status: string;
  is_read: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};
