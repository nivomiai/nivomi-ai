// Summarises runs/*.jsonl into per-language latency percentiles (markdown to stdout).
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RUNS_DIR } from './runlog.js';

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/** @param {Array<Record<string, any>>} events one call's log */
export function turnMetrics(events) {
  const start = events.find((e) => e.type === 'exotel_start');
  const language = start?.language ?? 'unknown';
  const llm = new Map(events.filter((e) => e.type === 'turn_llm').map((e) => [e.turn, e]));
  const out = [];
  for (const media of events.filter((e) => e.type === 'turn_first_media')) {
    const l = llm.get(media.turn);
    const stt = events.find(
      (e) =>
        e.type === 'stt_final' && e.speech_end_at === media.speech_end_at && media.speech_end_at,
    );
    out.push({
      language,
      opening: media.speech_end_at == null,
      stt_final_ms: stt && media.speech_end_at ? stt.t - media.speech_end_at : null,
      llm_first_ms:
        l?.llm_first_token_at && l?.llm_start_at ? l.llm_first_token_at - l.llm_start_at : null,
      tts_first_ms:
        media.first_tts_audio_at && media.first_tts_text_at
          ? media.first_tts_audio_at - media.first_tts_text_at
          : null,
      server_turn_ms: media.speech_end_at ? media.first_media_at - media.speech_end_at : null,
      answer_to_speech_ms:
        media.speech_end_at == null && start ? media.first_media_at - start.t : null,
    });
  }
  return out;
}

function main() {
  let files;
  try {
    files = readdirSync(RUNS_DIR).filter((f) => f.includes('-call-') && f.endsWith('.jsonl'));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.log('No call logs in runs/ yet.');
    return;
  }
  const rows = files.flatMap((f) =>
    turnMetrics(
      readFileSync(`${RUNS_DIR}${f}`, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    ),
  );
  const metrics = ['stt_final_ms', 'llm_first_ms', 'tts_first_ms', 'server_turn_ms'];
  console.log(`| language | turns | ${metrics.map((m) => `${m} p50 / p90`).join(' | ')} |`);
  console.log(`| --- | --- | ${metrics.map(() => '---').join(' | ')} |`);
  for (const language of [...new Set(rows.map((r) => r.language))]) {
    const turns = rows.filter((r) => r.language === language && !r.opening);
    const cells = metrics.map((m) => {
      const v = turns.map((r) => r[m]).filter((x) => typeof x === 'number');
      return `${percentile(v, 50) ?? '–'} / ${percentile(v, 90) ?? '–'}`;
    });
    console.log(`| ${language} | ${turns.length} | ${cells.join(' | ')} |`);
  }
  const openings = rows.map((r) => r.answer_to_speech_ms).filter((x) => typeof x === 'number');
  console.log(
    `
answer → first bot audio (server side), p50 / p90: ${percentile(openings, 50) ?? '–'} / ${percentile(openings, 90) ?? '–'} ms`,
  );
  const barges = files.reduce(
    (n, f) =>
      n + (readFileSync(`${RUNS_DIR}${f}`, 'utf8').match(/"type":"barge_in"/g)?.length ?? 0),
    0,
  );
  console.log(`\nbarge-ins logged: ${barges}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
