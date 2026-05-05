import type { Response } from "express";

export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T | null;
};

type SuccessOptions<T> = {
  status?: number;
  message: string;
  data?: T | null;
};

type ErrorOptions = {
  status: number;
  message: string;
  data?: unknown;
};

export function sendSuccess<T>(response: Response, options: SuccessOptions<T>) {
  const body: ApiEnvelope<T> = {
    success: true,
    message: options.message,
    data: options.data ?? null,
  };

  return response.status(options.status ?? 200).json(body);
}

export function sendError(response: Response, options: ErrorOptions) {
  const body: ApiEnvelope<unknown> = {
    success: false,
    message: options.message,
    data: options.data ?? null,
  };

  return response.status(options.status).json(body);
}
