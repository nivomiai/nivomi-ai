import { describe, expect, it } from 'vitest';
import { SimulatedPaymentProvider } from './payment-provider.js';

describe('SimulatedPaymentProvider', () => {
  const request = {
    organizationId: 'org-1',
    amountPaise: 100_000,
    currency: 'INR' as const,
    description: 'Plan subscription',
    idempotencyKey: 'ik-1',
  };

  it('returns a deterministic session id and records the checkout', async () => {
    const p = new SimulatedPaymentProvider();
    const { providerSessionId, redirectUrl } = await p.createCheckout(request);
    expect(providerSessionId).toBe('sim-session-ik-1');
    expect(redirectUrl).toContain('ik-1');
    expect(p.checkouts).toHaveLength(1);
  });

  it('verifies webhook payloads and throws on invalid JSON', () => {
    const p = new SimulatedPaymentProvider();
    const event = p.verifyWebhook(
      {},
      Buffer.from(
        JSON.stringify({
          providerEventId: 'evt-1',
          kind: 'payment.captured',
          providerSessionId: 'sim-session-ik-1',
          amountPaise: 100_000,
        }),
      ),
    );
    expect(event.kind).toBe('payment.captured');
    expect(() => p.verifyWebhook({}, Buffer.from('{bad'))).toThrow();
  });

  it('fails checkout when failNext > 0 then succeeds', async () => {
    const p = new SimulatedPaymentProvider();
    p.failNext = 1;
    await expect(p.createCheckout(request)).rejects.toThrow(/Simulated/);
    await expect(p.createCheckout(request)).resolves.toBeTruthy();
  });

  it('refuses untrusted webhooks when trustAllWebhooks is false', () => {
    const p = new SimulatedPaymentProvider();
    p.trustAllWebhooks = false;
    expect(() =>
      p.verifyWebhook(
        {},
        Buffer.from(
          JSON.stringify({
            providerEventId: 'e',
            kind: 'payment.captured',
            providerSessionId: 's',
          }),
        ),
      ),
    ).toThrow(/missing simulated signature/);
  });
});
