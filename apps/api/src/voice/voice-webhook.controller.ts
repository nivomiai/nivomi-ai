import { All, Controller, HttpCode, Logger, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/principal.js';
import { AiConversationService } from './ai-conversation.service.js';
import { renderExoML } from './exoml.js';
import { parseInboundContext, parseStatusContext, parseTurnContext } from './exotel-params.js';
import { ExotelWebhookGuard } from './exotel-webhook.guard.js';
import { InboundCallService, maskPhone } from './inbound-call.service.js';

/**
 * Webhooks called by Exotel's Flow (Passthru applet) and status-callback machinery when a caller
 * dials one of our ExoPhones. The endpoints are `@Public()` (no Nivomi JWT) because Exotel
 * cannot carry one; integrity is enforced by `ExotelWebhookGuard` (HMAC) before any state
 * change. See ADR-024 (inbound calls, Phase 5) and ADR-011 (voice pipeline).
 *
 * Response contract with Exotel: always 200 + ExoML, even on reject — Exotel's retry policy
 * assumes non-2xx means the applet crashed, which would duplicate call events.
 */
@Controller({ path: 'webhooks/exotel' })
@UseGuards(ExotelWebhookGuard)
export class VoiceWebhookController {
  private readonly logger = new Logger(VoiceWebhookController.name);

  constructor(
    private readonly inbound: InboundCallService,
    private readonly ai: AiConversationService,
  ) {}

  @Public()
  @All('inbound')
  @HttpCode(200)
  async handleInbound(@Req() req: Request, @Res() res: Response): Promise<void> {
    const context = parseInboundContext(req, this.inbound.now());
    if (!context) {
      this.logger.warn(
        { event: 'exotel.inbound.unparseable' },
        'Inbound webhook did not include a usable From/To; returning a safe hangup.',
      );
      res.type('application/xml');
      res.status(200).send(
        renderExoML({
          action: 'reject',
          reason: 'misconfigured',
          prompt: 'We could not route this call. Please contact support.',
          voice: 'female',
        }),
      );
      return;
    }
    const decision = await this.inbound.handleInbound(context);
    res.type('application/xml');
    res.status(200).send(renderExoML(decision));
  }

  /**
   * Continuation webhook called by Exotel after each `<Record>` completes. Returns the next
   * `<Say>` + `<Record>` (or a terminal `<Say>` + `<Hangup/>` when the loop ends). Replays with
   * the same `CallSid` + `turn` are idempotent in the service.
   */
  @Public()
  @All('inbound/turn')
  @HttpCode(200)
  async handleTurn(@Req() req: Request, @Res() res: Response): Promise<void> {
    const context = parseTurnContext(req, this.ai.now());
    if (!context) {
      this.logger.warn(
        { event: 'exotel.turn.unparseable' },
        'Turn callback missing CallSid; ending the call gracefully.',
      );
      res.type('application/xml');
      res.status(200).send(
        renderExoML({
          action: 'ai_end',
          prompt: 'We lost the call. Please call back.',
          voice: 'female',
        }),
      );
      return;
    }
    const plan = await this.ai.handleTurn(context);
    res.type('application/xml');
    res.status(200).send(renderExoML(plan.decision));
  }

  @Public()
  @All('status')
  @HttpCode(200)
  async handleStatus(@Req() req: Request, @Res() res: Response): Promise<void> {
    const context = parseStatusContext(req, this.inbound.now());
    this.logger.log(
      {
        event: 'exotel.status',
        callSid: context.providerCallSid,
        status: context.callStatus,
        duration: context.durationSeconds,
        from: maskPhone(context.fromE164),
        to: maskPhone(context.toE164),
      },
      'Exotel status callback.',
    );
    await this.inbound.handleStatus(context);
    res.status(200).send('OK');
  }
}
