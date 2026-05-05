import type { RequestHandler } from "express";

import { sendError, sendSuccess } from "../../lib/api-response.js";
import { AppError } from "../../lib/app-error.js";
import {
  createCompanyLeadService,
  getCompanyLeadByIdService,
  listCompanyLeadsService,
  markCompanyLeadAsReadService,
} from "./company-leads.service.js";
import { companyLeadIdParamsSchema, createCompanyLeadSchema } from "./company-leads.validation.js";

function getValidatedId(id: string) {
  const parsed = companyLeadIdParamsSchema.safeParse({ id });

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid company lead id.");
  }

  return parsed.data.id;
}

function getRequestParamId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const createCompanyLeadController: RequestHandler = async (request, response) => {
  const parsed = createCompanyLeadSchema.safeParse(request.body);

  if (!parsed.success) {
    sendError(response, {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    });
    return;
  }

  const data = await createCompanyLeadService(parsed.data);

  sendSuccess(response, {
    status: 201,
    message: "Thanks. Your team request has been received and Tekorix will follow up shortly.",
    data,
  });
};

export const listCompanyLeadsController: RequestHandler = async (_request, response) => {
  const data = await listCompanyLeadsService();

  sendSuccess(response, {
    message: "Company leads fetched successfully.",
    data,
  });
};

export const getCompanyLeadByIdController: RequestHandler = async (request, response) => {
  const id = getValidatedId(getRequestParamId(request.params.id));
  const data = await getCompanyLeadByIdService(id);

  if (!data) {
    sendError(response, {
      status: 404,
      message: "Company lead not found.",
    });
    return;
  }

  sendSuccess(response, {
    message: "Company lead fetched successfully.",
    data,
  });
};

export const markCompanyLeadAsReadController: RequestHandler = async (request, response) => {
  const id = getValidatedId(getRequestParamId(request.params.id));
  const data = await markCompanyLeadAsReadService(id);

  if (!data) {
    sendError(response, {
      status: 404,
      message: "Company lead not found.",
    });
    return;
  }

  sendSuccess(response, {
    message: "Company lead marked as read.",
    data,
  });
};
