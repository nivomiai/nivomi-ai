import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/** Error body returned by every API endpoint. Documented in docs/API.md. */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: string[];
  };
}

/**
 * Converts every exception into the standard {@link ErrorResponse} envelope.
 * Server errors are logged with their stack but answered with a generic
 * message, so internals never reach the client.
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

    const status = resolveStatus(exception);
    // Non-standard statuses have no enum name.
    const code = HttpStatus[status] ?? 'ERROR';
    // resolveRequestId always assigns a string; pino-http types it more loosely.
    const requestId = typeof request.id === 'string' ? request.id : 'unknown';
    const body: ErrorResponse = {
      error: { code, message: 'Internal server error', requestId },
    };

    if (status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    } else if (exception instanceof HttpException) {
      const { message, details } = describeHttpException(exception);
      body.error.message = message;
      if (details) {
        body.error.details = details;
      }
    } else if (isExposableClientError(exception)) {
      body.error.message = exception.message;
    }

    response.status(status).json(body);
  }
}

/**
 * Errors raised by Express middleware (e.g. body-parser's 413 and malformed
 * JSON 400) follow the `http-errors` convention rather than extending
 * HttpException. `expose` marks messages that are safe to show the client.
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

function resolveStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (isExposableClientError(exception)) {
    return exception.status;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function describeHttpException(exception: HttpException): { message: string; details?: string[] } {
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
