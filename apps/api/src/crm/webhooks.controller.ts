import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  RawBody,
  UnauthorizedException,
} from '@nestjs/common';
import { crmWebhookEvents, type Database } from '@nivomi/database';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { Public } from '../auth/principal.js';
import { DATABASE } from '../database/database.module.js';

/**
 * HubSpot webhook endpoint (ADR-026 §3). Verifies the v3 signature over the raw body before any
 * parsing; events are written to `crm_webhook_events` with (install_id, provider_event_id)
 * uniqueness so a replay is a no-op. Processing is deferred to a worker.
 */

const MAX_SKEW_MS = 5 * 60 * 1_000; // 5 min

interface HubspotEvent {
  readonly eventId: string;
  readonly subscriptionType: string;
  readonly portalId: number;
  readonly occurredAt?: number;
}

@Controller({ path: 'webhooks/hubspot' })
export class HubspotWebhookController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Headers('x-hubspot-signature-v3') signature: string | undefined,
    @Headers('x-hubspot-request-timestamp') timestamp: string | undefined,
    @Headers('x-hubspot-request-uri') uri: string | undefined,
    @RawBody() body: Buffer | undefined,
  ): Promise<{ accepted: number }> {
    if (!signature || !timestamp || !uri || !body)
      throw new BadRequestException('missing signature headers or body');

    const skew = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(skew) || skew > MAX_SKEW_MS)
      throw new UnauthorizedException('request timestamp out of window');

    const secret = this.env.HUBSPOT_CLIENT_SECRET;
    if (!secret) throw new UnauthorizedException('hubspot client secret not configured');

    // v3 signing string: METHOD + URI + body + timestamp
    const payload = `POST${uri}${body.toString('utf8')}${timestamp}`;
    const expected = createHmac('sha256', secret).update(payload).digest('base64');
    if (!safeEqualBase64(signature, expected)) throw new UnauthorizedException('invalid signature');

    let events: HubspotEvent[];
    try {
      const parsed = JSON.parse(body.toString('utf8')) as unknown;
      events = Array.isArray(parsed) ? (parsed as HubspotEvent[]) : [parsed as HubspotEvent];
    } catch {
      throw new BadRequestException('invalid JSON');
    }

    let accepted = 0;
    for (const event of events) {
      if (!event.eventId || !event.subscriptionType || !event.portalId) continue;
      const result = await this.db
        .insert(crmWebhookEvents)
        .values({
          installId: String(event.portalId),
          providerEventId: String(event.eventId),
          subscriptionType: event.subscriptionType,
          rawJsonb: event as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning({ id: crmWebhookEvents.id });
      if (result.length > 0) accepted += 1;
    }
    return { accepted };
  }
}

function safeEqualBase64(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'base64');
  const bBuf = Buffer.from(b, 'base64');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
