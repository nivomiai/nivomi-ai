import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { PAYMENT_PROVIDER, SimulatedPaymentProvider } from './payment-provider.js';
import { QuotaService } from './quota.service.js';
import { UsageMeter } from './usage-meter.service.js';

/** Metering, quotas, plan + invoice read API, payment provider seam (ADR-027, Phase 8). */
@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    UsageMeter,
    QuotaService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => new SimulatedPaymentProvider(),
    },
  ],
  exports: [UsageMeter, QuotaService, BillingService, PAYMENT_PROVIDER],
})
export class BillingModule {}
