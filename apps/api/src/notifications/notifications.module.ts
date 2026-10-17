import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { OTP_PROVIDER, SimulatedOtpProvider } from './otp-provider.js';

/** Notifications pipe + OTP seam (ADR-028, Phase 9). */
@Module({
  providers: [
    NotificationsService,
    { provide: OTP_PROVIDER, useFactory: () => new SimulatedOtpProvider() },
  ],
  exports: [NotificationsService, OTP_PROVIDER],
})
export class NotificationsModule {}
