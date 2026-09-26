import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { isDatabaseUnavailable } from './database-errors.js';
import { AppError, codeForStatus, isRetryable, type ErrorCode } from './errors.js';

/** Error body returned by every API endpoint. Documented in docs/API.md. */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: string[];
  };
}

const INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again.';
const UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again shortly.';

/**
 * Converts every exception into the standard {@link ErrorResponse} envelope. Server errors are
 * logged with their stack but answered with a generic message, so internals never reach the
 * client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    // resolveRequestId always assigns a string; pino-http types it more loosely.
    const requestId = typeof request.id === 'string' ? request.id : 'unknown';

    const { status, code, message, details, retryAfterSeconds } = describe(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, code }, 'Request failed');
    }
    if (retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    const body: ErrorResponse = {
      success: false,
      error: { code, message, retryable: isRetryable(code), requestId },
    };
    if (details?.length) {
      body.error.details = [...details];
    }
    response.status(status).json(body);
  }
}

interface Described {
  status: number;
  code: ErrorCode;
  message: string;
  details?: readonly string[] | undefined;
  retryAfterSeconds?: number | undefined;
}

function describe(exception: unknown): Described {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      // AppError messages are written to be user-safe, including for dependency failures.
      message: exception.message,
      details: exception.options.details,
      retryAfterSeconds: exception.options.retryAfterSeconds,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = codeForStatus(status);
    if (status >= 500) {
      return { status, code, message: genericFor(code) };
    }
    return { status, code, ...describeHttpException(exception) };
  }
  if (isExposableClientError(exception)) {
    return {
      status: exception.status,
      code: codeForStatus(exception.status),
      message: exception.message,
    };
  }
  if (isDatabaseUnavailable(exception)) {
    return {
      status: 503,
      code: 'DATABASE_ERROR',
      message: genericFor('DATABASE_ERROR'),
      retryAfterSeconds: 5,
    };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: genericFor('INTERNAL_ERROR') };
}

function genericFor(code: ErrorCode): string {
  return code === 'INTERNAL_ERROR' ? INTERNAL_MESSAGE : UNAVAILABLE_MESSAGE;
}

/**
 * Errors raised by Express middleware (e.g. body-parser's 413 and malformed JSON 400) follow the
 * `http-errors` convention rather than extending HttpException. `expose` marks messages that are
 * safe to show the client.
 */
interface ExposableClientError {
  status: number;
  message: string;
  expose: true;
}

function isExposableClientError(exception: unknown): exception is ExposableClientError {
  if (!(exception instanceof Error)) {
    return false;
  }
  const { status, expose } = exception as Partial<ExposableClientError>;
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}

function describeHttpException(exception: HttpException): {
  message: string;
  details?: string[];
} {
  const payload = exception.getResponse();
  if (typeof payload === 'string') {
    return { message: payload };
  }
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return { message: exception.message, details: message.map(String) };
  }
  return { message: typeof message === 'string' ? message : exception.message };
}
