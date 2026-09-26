// Sarvam streaming STT (saaras realtime) and TTS (bulbul) through the official `sarvamai` SDK.
import { SarvamAIClient } from 'sarvamai';
import { WebSocket as WsWebSocket } from 'ws';

// The SDK prefers `globalThis.WebSocket`. Node 22's built-in WebSocket ignores custom headers,
// which would drop the `Api-Subscription-Key` header, so the spike points the global at `ws`.
globalThis.WebSocket = /** @type {any} */ (WsWebSocket);

/** @param {{ apiKey: string }} sarvam */
export function createClient(sarvam) {
  return new SarvamAIClient({ apiSubscriptionKey: sarvam.apiKey });
}

/**
 * Opens a realtime STT socket for 8 kHz linear16 audio (Exotel's native format).
 * @param {SarvamAIClient} client
 * @param {{ apiKey: string, sttModel: string, sttMode: string }} sarvam
 * @param {string} language
 * @param {(message: any) => void} onMessage
 */
export async function openStt(client, sarvam, language, onMessage) {
  const socket = await client.speechToTextRealtimeStreaming.connect({
    language_code: /** @type {any} */ (language),
    model: /** @type {any} */ (sarvam.sttModel),
    mode: /** @type {any} */ (sarvam.sttMode),
    stream_type: 'fast',
    endpointing: 'vad',
    encoding: 'linear16',
    sample_rate: '8000',
    'Api-Subscription-Key': sarvam.apiKey,
    reconnectAttempts: 1,
  });
  socket.on('message', onMessage);
  await socket.waitForOpen();
  return socket;
}

/**
 * Opens a TTS socket configured for 8 kHz linear16 output.
 * @param {SarvamAIClient} client
 * @param {{ apiKey: string, ttsModel: string, ttsSpeaker: string }} sarvam
 * @param {string} language
 * @param {(message: any) => void} onMessage
 */
export async function openTts(client, sarvam, language, onMessage) {
  const socket = await client.textToSpeechStreaming.connect({
    model: /** @type {any} */ (sarvam.ttsModel),
    send_completion_event: 'true',
    'Api-Subscription-Key': sarvam.apiKey,
    reconnectAttempts: 1,
  });
  socket.on('message', onMessage);
  await socket.waitForOpen();
  socket.configureConnection({
    type: 'config',
    data: {
      language_code: /** @type {any} */ (language),
      speaker: /** @type {any} */ (sarvam.ttsSpeaker),
      speech_sample_rate: 8000,
      output_audio_codec: 'linear16',
      min_buffer_size: 30,
      max_chunk_length: 150,
    },
  });
  return socket;
}
