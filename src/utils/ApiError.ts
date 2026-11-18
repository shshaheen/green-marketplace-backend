export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  message: string;
}

/** An expected, client-facing error. Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: ErrorDetail[]): ApiError {
    return new ApiError(400, ErrorCode.BAD_REQUEST, message, details);
  }

  static validation(details: ErrorDetail[]): ApiError {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = 'You do not have access to this resource'): ApiError {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, ErrorCode.NOT_FOUND, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, ErrorCode.CONFLICT, message);
  }
}
