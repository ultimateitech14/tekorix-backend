export class AppError extends Error {
  public readonly statusCode: number;
  public readonly data: unknown;

  constructor(statusCode: number, message: string, data: unknown = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.data = data;
  }
}
