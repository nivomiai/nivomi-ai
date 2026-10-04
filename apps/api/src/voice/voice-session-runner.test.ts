import { describe, expect, it } from 'vitest';
import { starterDefinition } from '../agents/agent-definition.js';
import { SimulatedLLMProvider } from '../agents/llm-provider.js';
import { SimulatedSTTProvider } from './stt-provider.js';
import { SimulatedTTSProvider } from './tts-provider.js';
import { VoiceSessionRunner } from './voice-session-runner.js';

function definition(options?: { recording?: boolean }) {
  const d = starterDefinition({ companyName: 'Lotus Realty' });
  return { ...d, recordingEnabled: options?.recording ?? true };
}

function pushText(stt: SimulatedSTTProvider, runner: VoiceSessionRunner, text: string) {
  const bytes = new TextEncoder().encode(text);
  return runner.pushAudio(bytes, 16_000);
}

describe('VoiceSessionRunner', () => {
  it('speaks the opening (AI disclosure + recording notice) before the first caller turn', async () => {
    const stt = new SimulatedSTTProvider();
    const tts = new SimulatedTTSProvider();
    const runner = new VoiceSessionRunner(
      { definition: definition(), obligations: { aiDisclosure: true, recordingNotice: true } },
      new SimulatedLLMProvider(),
      stt,
      tts,
    );
    await runner.start();
    const openingSpoken = tts.spoken.map((t) => t.text).join(' ');
    expect(openingSpoken).toMatch(/AI assistant/i);
    expect(openingSpoken).toMatch(/recorded for quality/i);
  });

  it('refuses to start when compliance requires a recording notice but the agent is not configured to speak one', async () => {
    const runner = new VoiceSessionRunner(
      {
        definition: definition({ recording: false }),
        obligations: { aiDisclosure: true, recordingNotice: true },
      },
      new SimulatedLLMProvider(),
      new SimulatedSTTProvider(),
      new SimulatedTTSProvider(),
    );
    await expect(runner.start()).rejects.toThrow(/recording notice/);
  });

  it('maps a NOT_INTERESTED conversation outcome to a NOT_INTERESTED CallOutcome', async () => {
    const stt = new SimulatedSTTProvider();
    const runner = new VoiceSessionRunner(
      { definition: definition(), obligations: { aiDisclosure: true, recordingNotice: true } },
      new SimulatedLLMProvider(),
      stt,
      new SimulatedTTSProvider(),
    );
    await runner.start();
    await pushText(stt, runner, 'no thanks');
    await runner.endCallerTurn();
    const result = await runner.close('hangup');
    expect(result.outcome).toBe('NOT_INTERESTED');
  });

  it('maps an in-call opt-out to OPTED_OUT', async () => {
    const stt = new SimulatedSTTProvider();
    const runner = new VoiceSessionRunner(
      { definition: definition(), obligations: { aiDisclosure: true, recordingNotice: true } },
      new SimulatedLLMProvider(),
      stt,
      new SimulatedTTSProvider(),
    );
    await runner.start();
    await pushText(stt, runner, 'do not call me again');
    await runner.endCallerTurn();
    const result = await runner.close('hangup');
    expect(result.outcome).toBe('OPTED_OUT');
    // the transcript carries the opt-out acknowledgement so audit review can find it
    const spoken = result.transcript.filter((t) => t.role === 'agent').map((t) => t.text).join('\n');
    expect(spoken).toMatch(/not call you again/i);
  });

  it('reports PROVIDER_ERROR when closed from a provider failure', async () => {
    const runner = new VoiceSessionRunner(
      { definition: definition(), obligations: { aiDisclosure: true, recordingNotice: true } },
      new SimulatedLLMProvider(),
      new SimulatedSTTProvider(),
      new SimulatedTTSProvider(),
    );
    await runner.start();
    const result = await runner.close('provider_failure');
    expect(result.outcome).toBe('PROVIDER_ERROR');
  });

  it('hangs up after repeated silent caller turns', async () => {
    const stt = new SimulatedSTTProvider();
    const runner = new VoiceSessionRunner(
      {
        definition: definition(),
        obligations: { aiDisclosure: true, recordingNotice: true },
        silenceTurnsBeforeHangup: 2,
      },
      new SimulatedLLMProvider(),
      stt,
      new SimulatedTTSProvider(),
    );
    await runner.start();
    await runner.endCallerTurn(); // empty 1
    await runner.endCallerTurn(); // empty 2 -> auto-close
    const result = await runner.close('hangup');
    // after auto-close no engine outcome was set, so default CONNECTED applies
    expect(result.outcome).toBe('CONNECTED');
  });

  it('records tokens used across turns in the usage summary', async () => {
    const stt = new SimulatedSTTProvider();
    const runner = new VoiceSessionRunner(
      { definition: definition(), obligations: { aiDisclosure: true, recordingNotice: true } },
      new SimulatedLLMProvider(),
      stt,
      new SimulatedTTSProvider(),
    );
    await runner.start();
    await pushText(stt, runner, 'yes');
    await runner.endCallerTurn();
    const result = await runner.close('hangup');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });
});
