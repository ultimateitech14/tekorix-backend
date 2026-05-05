export type ProjectStatus = "planned" | "active" | "completed";

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  status: ProjectStatus;
};

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  owner_name: string;
  owner_email: string;
  status: ProjectStatus;
  created_at: Date | string;
  updated_at: Date | string;
};
