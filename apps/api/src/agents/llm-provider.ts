/**
 * Language models behind one interface (ADR-011 `LLMProvider`, ADR-022 §4). Business logic never
 * calls a vendor SDK; the vendor is chosen later and lands as an adapter.
 */
export interface LlmMessage {
  readonly role: 'assistant' | 'user';
  readonly content: string;
}

export interface LlmRequest {
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  readonly maxTokens: number;
}

export interface LlmResponse {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  /** For metering (Phase 8). */
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export class LlmProviderError extends Error {
  override readonly name = 'LlmProviderError';
}

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * Development and test stand-in: no network, deterministic. It answers from the current step's
 * instructions so a workflow can be exercised end to end. Refused in production (env validation).
 */
export class SimulatedLLMProvider implements LLMProvider {
  readonly name = 'simulated';
  /** The next N requests fail (provider-failure tests). */
  failNext = 0;

  complete(request: LlmRequest): Promise<LlmResponse> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new LlmProviderError('Simulated model failure'));
    }
    const step = /Current step: (.+)/.exec(request.system)?.[1] ?? 'continue the conversation';
    const firstSentence = step.split(/(?<=[.!?])\s/)[0] ?? step;
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const text = lastUser
      ? `(Simulated AI) Thanks for that. ${firstSentence}`
      : `(Simulated AI) ${firstSentence}`;
    const input = request.system + request.messages.map((m) => m.content).join(' ');
    return Promise.resolve({
      text,
      provider: this.name,
      model: 'simulated-1',
      inputTokens: estimateTokens(input),
      outputTokens: estimateTokens(text),
    });
  }
}
