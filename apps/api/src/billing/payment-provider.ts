/**
 * Payment provider (ADR-027 §4). Business logic depends on this interface; the Razorpay adapter
 * replaces the simulated one once Razorpay credentials are provisioned (TECH_DEBT, on hold).
 */

export interface CheckoutRequest {
  readonly organizationId: string;
  readonly amountPaise: number;
  readonly currency: 'INR';
  readonly description: string;
  readonly idempotencyKey: string;
}

export interface CheckoutResult {
  readonly redirectUrl: string;
  readonly providerSessionId: string;
}

export interface PaymentEvent {
  readonly providerEventId: string;
  readonly kind: 'payment.captured' | 'payment.failed' | 'subscription.cancelled';
  readonly providerSessionId: string;
  readonly amountPaise?: number;
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook(headers: Record<string, string>, raw: Buffer): PaymentEvent;
  createSubscription(request: {
    organizationId: string;
    planCode: string;
    cycle: 'MONTHLY' | 'YEARLY';
  }): Promise<{ subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  issueRefund(
    paymentId: string,
    amountPaise: number,
    reason: string,
  ): Promise<{ refundId: string }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export class PaymentProviderError extends Error {
  override readonly name = 'PaymentProviderError';
}

/**
 * Development stand-in: deterministic ids; always "pays"; the webhook verifier accepts anything
 * when `trustAll` is set (tests). Refused in production (env validation).
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'simulated';
  readonly configured = true;
  readonly checkouts: CheckoutRequest[] = [];
  readonly refunds: Array<{ paymentId: string; amountPaise: number; reason: string }> = [];
  readonly subscriptions: Array<{ id: string; organizationId: string; planCode: string }> = [];
  readonly cancelled: string[] = [];
  failNext = 0;
  trustAllWebhooks = true;

  createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new PaymentProviderError('Simulated checkout failure'));
    }
    this.checkouts.push(request);
    return Promise.resolve({
      redirectUrl: `https://simulated.nivomi/pay/${request.idempotencyKey}`,
      providerSessionId: `sim-session-${request.idempotencyKey}`,
    });
  }

  verifyWebhook(headers: Record<string, string>, raw: Buffer): PaymentEvent {
    if (!this.trustAllWebhooks && !headers['x-sim-signature'])
      throw new PaymentProviderError('missing simulated signature');
    const parsed = JSON.parse(raw.toString('utf8')) as PaymentEvent;
    if (!parsed.providerEventId || !parsed.kind)
      throw new PaymentProviderError('invalid payment event');
    return parsed;
  }

  createSubscription(request: {
    organizationId: string;
    planCode: string;
    cycle: 'MONTHLY' | 'YEARLY';
  }): Promise<{ subscriptionId: string }> {
    const id = `sim-sub-${request.organizationId}-${request.planCode}`;
    this.subscriptions.push({
      id,
      organizationId: request.organizationId,
      planCode: request.planCode,
    });
    return Promise.resolve({ subscriptionId: id });
  }

  cancelSubscription(subscriptionId: string): Promise<void> {
    this.cancelled.push(subscriptionId);
    return Promise.resolve();
  }

  issueRefund(
    paymentId: string,
    amountPaise: number,
    reason: string,
  ): Promise<{ refundId: string }> {
    this.refunds.push({ paymentId, amountPaise, reason });
    return Promise.resolve({ refundId: `sim-refund-${paymentId}` });
  }
}
