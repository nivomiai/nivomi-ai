import { All, Controller, HttpCode, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/principal.js';

/**
 * Webhooks called by Exotel's Flow (Passthru applet) and status-callback
 * machinery when a caller dials one of our ExoPhones. The endpoints are
 * public (no Nivomi JWT) because Exotel cannot carry one; integrity will be
 * enforced by HMAC signature verification once the production Flow is
 * configured with `EXOTEL_WEBHOOK_SECRET` (TECH_DEBT).
 *
 * See ADR-024 (inbound calls, Phase 5) and ADR-011 (voice pipeline).
 */
@Controller({ path: 'webhooks/exotel' })
export class VoiceWebhookController {
  private readonly logger = new Logger(VoiceWebhookController.name);

  @Public()
  @All('inbound')
  @HttpCode(200)
  inbound(@Req() req: Request, @Res() res: Response): void {
    const params = this.collectParams(req);
    this.logger.log(
      {
        event: 'exotel.inbound',
        callSid: params.CallSid ?? null,
        from: params.From ?? params.CallFrom ?? null,
        to: params.To ?? params.CallTo ?? null,
        direction: params.Direction ?? null,
      },
      'Exotel inbound call received',
    );
    const xml = this.inboundResponseXml();
    res.type('application/xml');
    res.status(200).send(xml);
  }

  @Public()
  @All('status')
  @HttpCode(200)
  status(@Req() req: Request, @Res() res: Response): void {
    const params = this.collectParams(req);
    this.logger.log(
      {
        event: 'exotel.status',
        callSid: params.CallSid ?? null,
        status: params.CallStatus ?? params.Status ?? null,
        duration: params.DialCallDuration ?? params.Duration ?? null,
      },
      'Exotel status callback',
    );
    res.status(200).send('OK');
  }

  private collectParams(req: Request): Record<string, string> {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) if (typeof v === 'string') out[k] = v;
    for (const [k, v] of Object.entries(b)) if (typeof v === 'string') out[k] = v;
    return out;
  }

  private inboundResponseXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="female">Hi, I am Nivomi. Your test is successful.</Say>
  <Hangup/>
</Response>`;
  }
}
