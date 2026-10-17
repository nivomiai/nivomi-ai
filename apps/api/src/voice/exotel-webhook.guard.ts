import {
  Inject,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/errors.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { parseExotelSignatureHeader, verifyExotelSignature } from './exotel-signature.js';

const SIGNATURE_HEADER = 'x-exotel-signature';

/** Captured by the raw-body `verify` callback in `app.factory.ts`. */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Verifies Exotel's HMAC on inbound webhooks. Behavior:
 *
 * - Production (NODE_ENV=production): the secret must be configured and every request must
 *   carry a valid signature. Missing header or bad digest → 403. This is enforced per-request
 *   rather than at boot so a late-configured secret still works, but a missing secret in
 *   production is logged at ERROR on every webhook.
 * - Development / test: if the secret is unset, requests pass (noted at DEBUG). If the secret is
 *   set and a signature header is present, it must verify; this lets you exercise the real path
 *   locally. If the header is missing while the secret is set, we warn but allow — Exotel's
 *   free-trial dashboard does not always sign webhooks.
 *
 * The signed payload is the raw request body for POST (captured by `express.urlencoded`'s
 * `verify` hook) or the query string for GET (no body present).
 */
@Injectable()
export class ExotelWebhookGuard implements CanActivate {
  private readonly logger = new Logger(ExotelWebhookGuard.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const secret = this.env.EXOTEL_WEBHOOK_SECRET;
    const isProduction = this.env.NODE_ENV === 'production';

    if (!secret) {
      if (isProduction) {
        this.logger.error(
          { event: 'exotel.signature.secret_missing', path: request.originalUrl },
          'EXOTEL_WEBHOOK_SECRET is not set; refusing to process a signed webhook in production.',
        );
        throw new AppError(
          'SERVICE_UNAVAILABLE',
          'Voice webhooks are not configured on this environment.',
        );
      }
      return true;
    }

    const header = parseExotelSignatureHeader(
      request.header(SIGNATURE_HEADER) ?? request.header('X-Exotel-Signature'),
    );
    const payload = this.payloadFor(request);

    if (!header) {
      if (isProduction) {
        this.logger.warn(
          { event: 'exotel.signature.header_missing', path: request.originalUrl },
          'Exotel webhook arrived without X-Exotel-Signature; refusing.',
        );
        throw new AppError('AUTHORIZATION_ERROR', 'This request is not signed.');
      }
      this.logger.debug(
        { event: 'exotel.signature.header_missing_dev', path: request.originalUrl },
        'Allowing unsigned Exotel webhook in non-production environment.',
      );
      return true;
    }

    if (!verifyExotelSignature(secret, payload, header)) {
      this.logger.warn(
        { event: 'exotel.signature.mismatch', path: request.originalUrl },
        'Exotel webhook signature mismatch; refusing.',
      );
      throw new AppError('AUTHORIZATION_ERROR', 'This request signature is invalid.');
    }
    return true;
  }

  private payloadFor(request: RawBodyRequest): string {
    if (request.method === 'POST' && request.rawBody) {
      return request.rawBody.toString('utf8');
    }
    // GET or empty body: sign the exact query string, no leading '?'.
    const q = request.originalUrl.indexOf('?');
    return q === -1 ? '' : request.originalUrl.slice(q + 1);
  }
}
