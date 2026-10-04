/**
 * OTP provider (ADR-028 §2). The real adapter is `Msg91OtpProvider`, deferred to the on-hold
 * list. In development the simulated provider echoes codes back through a tray.
 */

export interface OtpSendRequest {
  readonly phoneE164: string;
  readonly purpose: 'telecom_verify' | 'mfa_step_up' | 'login_otp';
  readonly locale: string;
  readonly codeDigits: 4 | 6;
}

export interface OtpProvider {
  readonly name: string;
  readonly configured: boolean;
  send(request: OtpSendRequest): Promise<{ requestId: string }>;
  verify(request: { requestId: string; code: string }): Promise<{ ok: boolean }>;
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export class OtpProviderError extends Error {
  override readonly name = 'OtpProviderError';
}

/**
 * Development stand-in: generates and tracks codes in memory. `tray` is readable by the dev
 * OTP tray UI (behind a Super Admin flag in prod code paths). Refused in production.
 */
export class SimulatedOtpProvider implements OtpProvider {
  readonly name = 'simulated';
  readonly configured = true;
  readonly tray: Array<{ requestId: string; phoneE164: string; code: string; createdAt: Date }> = [];
  private readonly byId = new Map<string, { phoneE164: string; code: string }>();
  failNext = 0;

  send(request: OtpSendRequest): Promise<{ requestId: string }> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new OtpProviderError('Simulated OTP failure'));
    }
    const requestId = `otp-${crypto.randomUUID()}`;
    const code = String(Math.floor(Math.random() * 10 ** request.codeDigits)).padStart(
      request.codeDigits,
      '0',
    );
    this.byId.set(requestId, { phoneE164: request.phoneE164, code });
    this.tray.push({ requestId, phoneE164: request.phoneE164, code, createdAt: new Date() });
    return Promise.resolve({ requestId });
  }

  verify(request: { requestId: string; code: string }): Promise<{ ok: boolean }> {
    const entry = this.byId.get(request.requestId);
    if (!entry) return Promise.resolve({ ok: false });
    const ok = entry.code === request.code;
    if (ok) this.byId.delete(request.requestId);
    return Promise.resolve({ ok });
  }
}
