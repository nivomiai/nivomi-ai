import { Module } from '@nestjs/common';
import { Clock } from '../compliance/clock.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AiConversationService } from './ai-conversation.service.js';
import { ExotelWebhookGuard } from './exotel-webhook.guard.js';
import { InboundBindingsController } from './inbound-bindings.controller.js';
import { InboundBindingsService } from './inbound-bindings.service.js';
import { InboundCallService } from './inbound-call.service.js';
import { SARVAM_PROVIDER, SarvamProvider } from './sarvam-provider.js';
import { VoiceWebhookController } from './voice-webhook.controller.js';

/**
 * Telephony webhooks and voice-session helpers. Owns the inbound-call resolver, the Exotel
 * webhook guard, and the turn-based conversational AI (ADR-024). The streaming adapter
 * (ADR-023) will add the `<Stream>` session runner once Exotel Streaming is on the plan.
 *
 * `SARVAM_PROVIDER` is bound to a real client when `SARVAM_API_KEY` is set and to `null`
 * otherwise; `AiConversationService.isAvailable()` is how the inbound resolver decides whether
 * to enter the AI loop or fall back to the terminal greeting.
 */
@Module({
  controllers: [VoiceWebhookController, InboundBindingsController],
  providers: [
    InboundCallService,
    AiConversationService,
    InboundBindingsService,
    ExotelWebhookGuard,
    Clock,
    {
      provide: SARVAM_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): SarvamProvider | null =>
        env.SARVAM_API_KEY
          ? new SarvamProvider(env.SARVAM_API_KEY, env.SARVAM_CHAT_MODEL)
          : null,
    },
  ],
})
export class VoiceModule {}
