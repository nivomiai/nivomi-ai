import { Module } from '@nestjs/common';
import { VoiceWebhookController } from './voice-webhook.controller.js';

/**
 * Telephony webhooks and voice-session helpers. Grows into the home of the
 * Exotel adapter, STT/TTS providers, and VoiceSessionRunner wiring (Phase 4b).
 */
@Module({
  controllers: [VoiceWebhookController],
})
export class VoiceModule {}
