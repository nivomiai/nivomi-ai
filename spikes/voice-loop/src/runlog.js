// Append-only JSONL log per call under runs/ (git-ignored: contains test-call transcripts).
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUNS_DIR = fileURLToPath(new URL('../runs/', import.meta.url));

export function createRunLog(name) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const file = `${RUNS_DIR}${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.jsonl`;
  return {
    file,
    /** @param {string} type @param {Record<string, unknown>} [data] */
    write(type, data = {}) {
      appendFileSync(file, `${JSON.stringify({ t: Date.now(), type, ...data })}\n`);
    },
  };
}
