// One live call: Exotel media stream ⇄ Sarvam STT → LLM → Sarvam TTS ⇄ Exotel.
//
// Per-turn timestamps (ms since epoch) are logged so `npm run report` can compute:
//   stt_final_ms   = transcript.final − vad.speech_end
//   llm_first_ms   = first LLM token − LLM request sent
//   tts_first_ms   = first TTS audio − first text sent to TTS
//   server_turn_ms = first media frame sent to Exotel − vad.speech_end   (≈ perceived latency
//                    minus Exotel/network playout, which must be judged on the handset)
import { PcmFramer, stripWavHeader } from './audio.js';
import { SentenceChunker, parseControl, streamChat, systemPrompt } from './llm.js';
import { openStt, openTts } from './sarvam.js';

const OPENING_INSTRUCTION =
  'The call has just been answered. Greet the caller, say you are an AI assistant calling from Nivomi for a short test call, and ask for their name.';

export class CallSession {
  /**
   * @param {import('ws').WebSocket} ws Exotel media socket
   * @param {{ language: string, mode: 'direct' | 'flow', cfg: any, sarvamClient: any, log: any }} opts
   */
  constructor(ws, { language, mode, cfg, sarvamClient, log }) {
    this.ws = ws;
    this.language = language;
    this.mode = mode;
    this.cfg = cfg;
    this.client = sarvamClient;
    this.log = log;
    this.streamSid = null;
    this.stt = null;
    this.tts = null;
    this.sttReady = null; // Promise<STT socket>
    this.ttsReady = null; // Promise<TTS socket>; replaced on barge-in
    this.endingReason = null;
    this.framer = new PcmFramer();
    this.history = [{ role: 'system', content: systemPrompt(language) }];
    this.turn = 0;
    this.turnState = null; // { id, llmAbort, sentFrames, marksSent, marksPlayed, llmDone, action }
    this.lastSpeechEndAt = null;
    this.closed = false;
    this.maxTimer = setTimeout(() => this.#hangUp('max_call_seconds'), cfg.maxCallSeconds * 1000);

    ws.on('message', (raw) => this.#onExotel(raw));
    ws.on('close', () => this.#cleanup('exotel_closed'));
    ws.on('error', (err) => this.log.write('exotel_ws_error', { message: err.message }));
  }

  // ── Exotel → spike ────────────────────────────────────────────────────
  async #onExotel(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.event) {
      case 'connected':
        this.log.write('exotel_connected');
        break;
      case 'start':
        this.streamSid = msg.stream_sid ?? msg.start?.stream_sid;
        this.log.write('exotel_start', {
          call_sid: msg.start?.call_sid,
          media_format: msg.start?.media_format,
          language: this.language,
          mode: this.mode,
        });
        await this.#startProviders();
        break;
      case 'media':
        if (this.stt?.readyState === 1 && msg.media?.payload) {
          this.stt.sendRealtimeAudioInput({ event: 'audio_input', audio: msg.media.payload });
        }
        break;
      case 'mark':
        this.#onMark(msg.mark?.name);
        break;
      case 'dtmf':
        this.log.write('dtmf', { digit: msg.dtmf?.digit });
        break;
      case 'stop':
        this.log.write('exotel_stop', { reason: msg.stop?.reason });
        this.#cleanup('exotel_stop');
        break;
      default:
        break;
    }
  }

  async #startProviders() {
    const t0 = Date.now();
    try {
      this.sttReady = openStt(this.client, this.cfg.sarvam, this.language, (m) => this.#onStt(m));
      this.ttsReady = this.#openTts();
      [this.stt, this.tts] = await Promise.all([this.sttReady, this.ttsReady]);
      this.log.write('providers_ready', { ms: Date.now() - t0 });
      await this.#respond(null); // opening turn
    } catch (err) {
      this.log.write('provider_start_failed', { message: String(err?.message ?? err) });
      this.#hangUp('provider_start_failed');
    }
  }

  #openTts() {
    return openTts(this.client, this.cfg.sarvam, this.language, (m) => this.#onTts(m));
  }

  // ── STT ───────────────────────────────────────────────────────────────
  #onStt(m) {
    switch (m?.event) {
      case 'session.begin':
        this.log.write('stt_session', { request_id: m.request_id, config: m.config });
        break;
      case 'vad.speech_start':
        this.log.write('vad_speech_start', { utterance: m.utterance_idx });
        if (this.#botActive()) this.#bargeIn();
        break;
      case 'vad.speech_end':
        this.lastSpeechEndAt = Date.now();
        this.log.write('vad_speech_end', { utterance: m.utterance_idx });
        break;
      case 'transcript.partial':
        break;
      case 'transcript.final':
        this.log.write('stt_final', {
          utterance: m.utterance_idx,
          text: m.text,
          speech_end_at: this.lastSpeechEndAt,
        });
        if (m.text?.trim()) void this.#respond(m.text.trim());
        break;
      case 'error':
        this.log.write('stt_error', { code: m.code, fatal: m.is_fatal, message: m.message });
        if (m.is_fatal) this.#hangUp('stt_fatal');
        break;
      default:
        break;
    }
  }

  // ── Turn: LLM → TTS ───────────────────────────────────────────────────
  async #respond(userText) {
    this.turnState?.llmAbort.abort();
    const turn = {
      id: ++this.turn,
      llmAbort: new AbortController(),
      marksSent: 0,
      marksPlayed: 0,
      llmDone: false,
      action: null,
      firstMediaAt: null,
      firstTtsTextAt: null,
      firstTtsAudioAt: null,
      speechEndAt: userText ? this.lastSpeechEndAt : null,
    };
    this.turnState = turn;
    this.history.push({ role: 'user', content: userText ?? OPENING_INSTRUCTION });

    const chunker = new SentenceChunker();
    let head = '';
    let decided = false;
    let reply = '';
    let llmStart = null;
    let firstTokenAt = null;

    try {
      const tts = await this.ttsReady;
      const speak = (text) => {
        if (!text || turn !== this.turnState) return;
        turn.firstTtsTextAt ??= Date.now();
        tts.convert(text);
      };
      llmStart = Date.now();
      for await (const delta of streamChat(this.cfg.llm, this.history, turn.llmAbort.signal)) {
        firstTokenAt ??= Date.now();
        if (!decided) {
          head += delta;
          const control = parseControl(head);
          if (!control.decided) continue;
          decided = true;
          turn.action = control.action;
          reply += control.rest;
          chunker.push(control.rest).forEach(speak);
          continue;
        }
        reply += delta;
        chunker.push(delta).forEach(speak);
      }
      if (!decided) {
        reply += head; // short reply that never resolved a control token
        chunker.push(head).forEach(speak);
      }
      speak(chunker.flush());
      if (turn === this.turnState) tts.flush();
      turn.llmDone = true;
      this.history.push({ role: 'assistant', content: reply.trim() });
      this.log.write('turn_llm', {
        turn: turn.id,
        user: userText,
        reply: reply.trim(),
        action: turn.action,
        speech_end_at: turn.speechEndAt,
        llm_start_at: llmStart,
        llm_first_token_at: firstTokenAt,
        llm_done_at: Date.now(),
        first_tts_text_at: turn.firstTtsTextAt,
      });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      this.log.write('turn_error', { turn: turn.id, message: String(err?.message ?? err) });
      turn.llmDone = true;
    }
  }

  #onTts(m) {
    const turn = this.turnState;
    if (!turn) return;
    if (m?.type === 'audio') {
      turn.firstTtsAudioAt ??= Date.now();
      const pcm = stripWavHeader(Buffer.from(m.data.audio, 'base64'));
      for (const frame of this.framer.push(pcm)) this.#sendMedia(turn, frame);
    } else if (m?.type === 'event' && m.data?.event_type === 'final') {
      const tail = this.framer.flush();
      if (tail) this.#sendMedia(turn, tail);
      this.#sendMark(turn);
    } else if (m?.type === 'error') {
      this.log.write('tts_error', { turn: turn.id, data: m.data });
    }
  }

  #sendMedia(turn, frame) {
    if (this.closed || !this.streamSid) return;
    if (!turn.firstMediaAt) {
      turn.firstMediaAt = Date.now();
      this.log.write('turn_first_media', {
        turn: turn.id,
        speech_end_at: turn.speechEndAt,
        first_tts_text_at: turn.firstTtsTextAt,
        first_tts_audio_at: turn.firstTtsAudioAt,
        first_media_at: turn.firstMediaAt,
      });
    }
    this.ws.send(
      JSON.stringify({
        event: 'media',
        stream_sid: this.streamSid,
        media: { payload: frame.toString('base64') },
      }),
    );
  }

  #sendMark(turn) {
    turn.marksSent += 1;
    this.ws.send(
      JSON.stringify({
        event: 'mark',
        stream_sid: this.streamSid,
        mark: { name: `turn-${turn.id}` },
      }),
    );
  }

  #onMark(name) {
    const turn = this.turnState;
    if (!turn || name !== `turn-${turn.id}`) return;
    turn.marksPlayed += 1;
    if (turn.llmDone && turn.marksPlayed >= turn.marksSent) {
      this.log.write('turn_played', { turn: turn.id });
      if (turn.action === 'transfer') this.#handOff();
      if (turn.action === 'end') this.#hangUp('assistant_end');
    }
  }

  #botActive() {
    const turn = this.turnState;
    return Boolean(turn && (!turn.llmDone || turn.marksPlayed < turn.marksSent));
  }

  // ── Barge-in ──────────────────────────────────────────────────────────
  #bargeIn() {
    const turn = this.turnState;
    const detectedAt = Date.now();
    this.ws.send(JSON.stringify({ event: 'clear', stream_sid: this.streamSid }));
    turn?.llmAbort.abort();
    this.turnState = null; // late TTS audio for the interrupted turn is dropped
    this.framer.reset();
    // TTS cannot cancel queued synthesis, so replace the socket while the caller is speaking.
    const old = this.tts;
    this.tts = null;
    old?.close();
    this.ttsReady = this.#openTts();
    this.ttsReady
      .then((socket) => {
        this.tts = socket;
      })
      .catch((err) => {
        this.log.write('tts_reopen_failed', { message: String(err?.message ?? err) });
        this.#hangUp('tts_reopen_failed');
      });
    this.log.write('barge_in', { turn: turn?.id, detected_at: detectedAt, cleared_at: Date.now() });
  }

  // ── Ending ────────────────────────────────────────────────────────────
  #handOff() {
    // In flow mode, closing the stream lets the Exotel flow continue to its next applet
    // (Connect → phone B). In direct mode there is no next applet, so the call ends.
    this.log.write('handoff', { mode: this.mode, at: Date.now() });
    this.ws.close(1000, 'handoff');
  }

  #hangUp(reason) {
    if (this.closed || this.endingReason) return;
    if (this.mode === 'flow' && reason === 'assistant_end') {
      // Closing would trigger the flow's Connect applet; let the caller hang up instead.
      this.log.write('end_requested_flow_mode');
      return;
    }
    this.endingReason = reason;
    this.log.write('hangup', { reason });
    this.ws.close(1000, reason);
  }

  #cleanup(reason) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.maxTimer);
    this.turnState?.llmAbort.abort();
    try {
      if (this.stt?.readyState === 1) this.stt.sendRealtimeEnd({ event: 'end' });
    } catch {
      // socket closed between the check and the send
    }
    // Close sockets even if they finished opening after a failed start.
    const close = (ready) => ready?.then((socket) => socket.close()).catch(() => {});
    close(this.sttReady);
    close(this.ttsReady);
    this.log.write('session_closed', { reason });
  }
}
