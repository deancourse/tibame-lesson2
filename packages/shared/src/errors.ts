export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "FORBIDDEN"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_INACTIVE"
  | "ACCOUNT_LOCKED"
  | "CSRF_TOKEN_MISSING"
  | "CSRF_TOKEN_INVALID"
  | "VALIDATION_ERROR"
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_PLATE_CONFLICT"
  | "INVALID_OWNER"
  | "EMPLOYEE_NOT_FOUND"
  | "EMPLOYEE_CONFLICT"
  | "CANNOT_DEMOTE_SELF"
  | "AUDIT_LOG_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): ApiErrorBody {
  const body: ApiErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return body;
}
