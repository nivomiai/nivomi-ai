import { describe, expect, it } from 'vitest';
import { SimulatedOtpProvider } from './otp-provider.js';

describe('SimulatedOtpProvider', () => {
  it('issues a code, lands it in the tray, verifies it, and refuses a replay', async () => {
    const p = new SimulatedOtpProvider();
    const { requestId } = await p.send({
      phoneE164: '+919000000001',
      purpose: 'telecom_verify',
      locale: 'en',
      codeDigits: 6,
    });
    const trayEntry = p.tray.find((e) => e.requestId === requestId);
    expect(trayEntry).toBeDefined();
    const ok = await p.verify({ requestId, code: trayEntry!.code });
    expect(ok.ok).toBe(true);
    const replay = await p.verify({ requestId, code: trayEntry!.code });
    expect(replay.ok).toBe(false);
  });

  it('rejects wrong codes without consuming the request', async () => {
    const p = new SimulatedOtpProvider();
    const { requestId } = await p.send({
      phoneE164: '+919000000002',
      purpose: 'mfa_step_up',
      locale: 'en',
      codeDigits: 6,
    });
    const bad = await p.verify({ requestId, code: '000000' });
    expect(bad.ok).toBe(false);
    const trayEntry = p.tray.find((e) => e.requestId === requestId);
    const good = await p.verify({ requestId, code: trayEntry!.code });
    expect(good.ok).toBe(true);
  });

  it('fails send when failNext > 0', async () => {
    const p = new SimulatedOtpProvider();
    p.failNext = 1;
    await expect(
      p.send({
        phoneE164: '+919000000003',
        purpose: 'login_otp',
        locale: 'en',
        codeDigits: 4,
      }),
    ).rejects.toThrow(/Simulated OTP failure/);
  });
});
