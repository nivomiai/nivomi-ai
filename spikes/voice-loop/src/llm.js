// Minimal streaming client for an OpenAI-compatible Chat Completions endpoint.
// The spike is provider-neutral: LLM_BASE_URL + LLM_MODEL pick the candidate.

/**
 * Parses a Server-Sent Events body into `data:` payloads.
 * @param {ReadableStream<Uint8Array>} body
 */
export async function* sseData(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

/**
 * Streams assistant text deltas.
 * @param {{ baseUrl: string, apiKey: string, model: string }} llm
 * @param {Array<{ role: string, content: string }>} messages
 * @param {AbortSignal} signal
 */
export async function* streamChat(llm, messages, signal) {
  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llm.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: llm.model,
      messages,
      stream: true,
      max_tokens: 160,
      temperature: 0.3,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  for await (const data of sseData(res.body)) {
    if (data === '[DONE]') return;
    const delta = JSON.parse(data).choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/**
 * Splits streamed text into speakable pieces at sentence boundaries (Latin and Indic danda),
 * so TTS can start before the LLM finishes.
 */
export class SentenceChunker {
  #buffer = '';

  /** @param {string} text @returns {string[]} */
  push(text) {
    this.#buffer += text;
    const out = [];
    const boundary = /[.!?।॥]+["')\]]*\s/g;
    let last = 0;
    for (const match of this.#buffer.matchAll(boundary)) {
      const end = match.index + match[0].length;
      const piece = this.#buffer.slice(last, end).trim();
      if (piece) out.push(piece);
      last = end;
    }
    this.#buffer = this.#buffer.slice(last);
    return out;
  }

  /** @returns {string | null} */
  flush() {
    const rest = this.#buffer.trim();
    this.#buffer = '';
    return rest || null;
  }
}

export const CONTROL_TOKENS = /** @type {const} */ (['[TRANSFER]', '[END]']);

/**
 * Detects a leading control token in the first characters of a reply.
 * @param {string} head accumulated reply start
 * @returns {{ decided: boolean, action: 'transfer' | 'end' | null, rest: string }}
 */
export function parseControl(head) {
  const trimmed = head.trimStart();
  for (const token of CONTROL_TOKENS) {
    if (trimmed.startsWith(token)) {
      return {
        decided: true,
        action: token === '[TRANSFER]' ? 'transfer' : 'end',
        rest: trimmed.slice(token.length),
      };
    }
    if (token.startsWith(trimmed)) return { decided: false, action: null, rest: '' }; // could still become a token
  }
  return { decided: true, action: null, rest: head };
}

/** @param {string} language BCP-47 code */
export function systemPrompt(language) {
  return [
    'You are a test voice assistant for Nivomi, an Indian sales-assistance platform, on a live phone call.',
    `Speak only in the language with BCP-47 code ${language}; understand code-mixed speech.`,
    'Replies are spoken aloud: 1–2 short sentences, no lists, no markdown, no emojis.',
    'You are an AI and must say so if asked; never claim to be human.',
    'You are testing a call: ask the caller their name, which city they are in, and what product interests them.',
    'If the caller asks for a human, or asks something you cannot answer, begin your reply with [TRANSFER] then say you are connecting them.',
    'If the caller wants to end the call, begin your reply with [END] then say a short goodbye.',
  ].join(' ');
}
