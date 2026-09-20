export class CoachError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, httpStatus = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "CoachError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function publicError(error: unknown) {
  if (error instanceof CoachError) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  return { code: "INTERNAL_ERROR", message: "内部错误；输入没有被替换为演示答案。" };
}
