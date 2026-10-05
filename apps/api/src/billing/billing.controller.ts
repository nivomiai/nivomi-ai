import { Controller, Get } from '@nestjs/common';
import { CurrentTenant, RequirePermission, type TenantPrincipal } from '../auth/principal.js';
import { BillingService } from './billing.service.js';

/** Customer-facing billing (ADR-027). Plan + usage + invoices for the active tenant. */
@Controller({ path: 'billing' })
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @RequirePermission('billing.read')
  @Get('plan')
  async plan(@CurrentTenant() tenant: TenantPrincipal) {
    const plan = await this.svc.currentPlan(tenant);
    const usage = await this.svc.usageSummary(tenant);
    return { plan, usage };
  }

  @RequirePermission('billing.read')
  @Get('invoices')
  invoices(@CurrentTenant() tenant: TenantPrincipal) {
    return this.svc.listInvoices(tenant);
  }
}
