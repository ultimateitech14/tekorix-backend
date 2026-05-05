import { pipeline } from "node:stream/promises";
import type { RequestHandler } from "express";

import { sendError, sendSuccess } from "../../lib/api-response.js";
import { AppError } from "../../lib/app-error.js";
import {
  createCandidateLeadService,
  createCandidateLeadUploadUrlService,
  getCandidateLeadResumeByIdService,
  getCandidateLeadByIdService,
  listCandidateLeadsService,
  markCandidateLeadAsReadService,
  uploadCandidateLeadResumeLocallyService,
} from "./candidate-leads.service.js";
import {
  candidateLeadIdParamsSchema,
  createCandidateLeadSchema,
  createCandidateLeadUploadUrlSchema,
} from "./candidate-leads.validation.js";

function sanitizeAsciiFileName(fileName: string) {
  const normalized = fileName
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/["\\]/g, "")
    .trim();

  return normalized.length > 0 ? normalized : "resume";
}

function encodeContentDispositionFileName(fileName: string) {
  return encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildContentDisposition(fileName: string, dispositionType: "inline" | "attachment") {
  const asciiFileName = sanitizeAsciiFileName(fileName);
  const utf8FileName = encodeContentDispositionFileName(fileName);

  return `${dispositionType}; filename="${asciiFileName}"; filename*=UTF-8''${utf8FileName}`;
}

function getValidatedId(id: string) {
  const parsed = candidateLeadIdParamsSchema.safeParse({ id });

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid candidate lead id.");
  }

  return parsed.data.id;
}

function getRequestParamId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getRequestQueryText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return "";
}

export const createCandidateLeadUploadUrlController: RequestHandler = async (request, response) => {
  const parsed = createCandidateLeadUploadUrlSchema.safeParse(request.body);

  if (!parsed.success) {
    sendError(response, {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    });
    return;
  }

  const data = await createCandidateLeadUploadUrlService(parsed.data);
  const requestOrigin = `${request.protocol}://${request.get("host") ?? "localhost"}`;
  const uploadUrl = data.uploadUrl.startsWith("/") ? `${requestOrigin}${data.uploadUrl}` : data.uploadUrl;

  sendSuccess(response, {
    message: "Candidate lead upload URL generated successfully.",
    data: {
      ...data,
      uploadUrl,
    },
  });
};

export const uploadCandidateLeadResumeController: RequestHandler = async (request, response) => {
  const objectKey = getRequestQueryText(request.query.objectKey);
  const contentType = request.header("Content-Type") ?? "";
  const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);

  await uploadCandidateLeadResumeLocallyService({
    objectKey,
    contentType,
    body,
  });

  response.status(204).send();
};

export const createCandidateLeadController: RequestHandler = async (request, response) => {
  const contentType = request.header("Content-Type") ?? "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    sendError(response, {
      status: 501,
      message:
        "Multipart resume upload is not implemented for candidate leads. Use the upload-url endpoint and then send resume_object_key metadata.",
    });
    return;
  }

  const parsed = createCandidateLeadSchema.safeParse(request.body);

  if (!parsed.success) {
    sendError(response, {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid request.",
    });
    return;
  }

  const data = await createCandidateLeadService(parsed.data);

  sendSuccess(response, {
    status: 201,
    message: "Candidate lead created successfully.",
    data,
  });
};

export const listCandidateLeadsController: RequestHandler = async (_request, response) => {
  const data = await listCandidateLeadsService();

  sendSuccess(response, {
    message: "Candidate leads fetched successfully.",
    data,
  });
};

export const getCandidateLeadByIdController: RequestHandler = async (request, response) => {
  const id = getValidatedId(getRequestParamId(request.params.id));
  const data = await getCandidateLeadByIdService(id);

  if (!data) {
    sendError(response, {
      status: 404,
      message: "Candidate lead not found.",
    });
    return;
  }

  sendSuccess(response, {
    message: "Candidate lead fetched successfully.",
    data,
  });
};

export const markCandidateLeadAsReadController: RequestHandler = async (request, response) => {
  const id = getValidatedId(getRequestParamId(request.params.id));
  const data = await markCandidateLeadAsReadService(id);

  if (!data) {
    sendError(response, {
      status: 404,
      message: "Candidate lead not found.",
    });
    return;
  }

  sendSuccess(response, {
    message: "Candidate lead marked as read.",
    data,
  });
};

export const getCandidateLeadResumeController: RequestHandler = async (request, response) => {
  const id = getValidatedId(getRequestParamId(request.params.id));
  const { lead, object } = await getCandidateLeadResumeByIdService(id);
  const contentType = lead.resume?.contentType ?? object.contentType ?? "application/octet-stream";
  const fileName = lead.resume?.fileName ?? "resume";
  const dispositionType = contentType === "application/pdf" ? "inline" : "attachment";

  response.status(200);
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Disposition", buildContentDisposition(fileName, dispositionType));
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (typeof object.contentLength === "number" && Number.isFinite(object.contentLength)) {
    response.setHeader("Content-Length", String(object.contentLength));
  }

  await pipeline(object.body, response);
};
